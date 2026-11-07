/**
 * "Relatar problema" (teste fechado; Fase 6, B9). Puro: o armazenamento (D1 e R2), o relógio e o sorteio entram por `ProblemDeps`, então tudo roda em teste sem nuvem.
 *
 * O relato é anônimo: sem conta, sem IP gravado, sem identificador da pessoa. Leva uma categoria, uma descrição, as **informações técnicas** que a própria tela mostra
 * antes de enviar (lista fechada de campos, valores curtos) e, se a pessoa quiser, uma **imagem da tela** (JPEG pequeno). A descrição é texto livre: a tela avisa para não
 * escrever dados pessoais. Guardamos por 90 dias (`PROBLEM_RETENTION_MS`).
 */
import type { RateLimit } from './rateLimit'

export const PROBLEM_CATEGORIES = ['bug', 'match', 'online', 'idea', 'other'] as const
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number]
export type ProblemStatus = 'open' | 'done'

export const PROBLEM_LIMITS = {
  textMax: 1000,
  textMin: 5,
  /** Corpo inteiro do pedido (JSON com a imagem em base64). */
  bodyBytes: 300_000,
  /** Imagem já decodificada. */
  imageBytes: 200_000,
  techKeys: 40,
  techValue: 200,
  /** Teto de relatos por dia no servidor todo: protege o banco e o painel de uma enxurrada. */
  perDay: 300,
} as const

export const PROBLEM_RETENTION_MS = 90 * 24 * 3_600_000

/** Campos técnicos aceitos (o resto é recusado): nada que identifique a pessoa. */
export const TECH_KEYS = [
  'app', 'build', 'mode', 'screen', 'browser', 'os', 'device', 'viewport', 'pixelRatio', 'language', 'timezoneOffset', 'online', 'installed', 'connection', 'memoryMB',
  'worldSource', 'season', 'phase', 'league', 'leagueId', 'errors', 'serviceWorker', 'saveSlots', 'cloud',
] as const

export interface ProblemRow {
  id: string
  createdAt: number
  category: ProblemCategory
  text: string
  tech: Record<string, string | number | boolean>
  hasImage: boolean
  status: ProblemStatus
}

export interface ProblemStore {
  add(row: ProblemRow, image?: Uint8Array): Promise<void>
  list(status: ProblemStatus, limit: number): Promise<ProblemRow[]>
  get(id: string): Promise<{ row: ProblemRow; image?: Uint8Array } | undefined>
  setStatus(id: string, status: ProblemStatus): Promise<boolean>
  remove(id: string): Promise<boolean>
  countSince(since: number): Promise<number>
  /** Apaga relatos (e imagens) anteriores a `before`; devolve quantos. */
  purgeBefore(before: number): Promise<number>
}

export interface ProblemDeps {
  store: ProblemStore
  limiter: RateLimit
  now: () => number
  randomId: () => string
}

export type ProblemError = 'bad-body' | 'too-large' | 'rate-limited' | 'busy' | 'bad-image'
export type ProblemResult = { status: 201; body: { ok: true; id: string } } | { status: 400 | 413 | 429 | 503; body: { error: ProblemError; retryAfterMs?: number } }

const fail = (status: 400 | 413 | 429 | 503, error: ProblemError, retryAfterMs?: number): ProblemResult => ({ status, body: { error, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) } })

const clean = (s: string, max: number): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max)

function decodeBase64(b64: string): Uint8Array | undefined {
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return undefined
  }
}

/** Confere e normaliza o corpo. `undefined` = inválido. */
export function parseProblem(text: string): { category: ProblemCategory; text: string; tech: ProblemRow['tech']; image?: Uint8Array } | ProblemError {
  if (text.length > PROBLEM_LIMITS.bodyBytes) return 'too-large'
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return 'bad-body'
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'bad-body'
  const o = raw as Record<string, unknown>
  if (Object.keys(o).some((k) => !['category', 'text', 'tech', 'image'].includes(k))) return 'bad-body'
  if (!(PROBLEM_CATEGORIES as readonly unknown[]).includes(o.category)) return 'bad-body'
  if (typeof o.text !== 'string') return 'bad-body'
  const body = clean(o.text.trim(), PROBLEM_LIMITS.textMax)
  if (body.length < PROBLEM_LIMITS.textMin) return 'bad-body'
  const tech: ProblemRow['tech'] = {}
  if (o.tech !== undefined) {
    if (!o.tech || typeof o.tech !== 'object' || Array.isArray(o.tech)) return 'bad-body'
    const entries = Object.entries(o.tech as Record<string, unknown>)
    if (entries.length > PROBLEM_LIMITS.techKeys) return 'bad-body'
    for (const [k, v] of entries) {
      if (!(TECH_KEYS as readonly string[]).includes(k)) return 'bad-body'
      if (typeof v === 'string') tech[k] = clean(v, PROBLEM_LIMITS.techValue)
      else if (typeof v === 'number' && Number.isFinite(v)) tech[k] = v
      else if (typeof v === 'boolean') tech[k] = v
      else return 'bad-body'
    }
  }
  let image: Uint8Array | undefined
  if (o.image !== undefined) {
    if (typeof o.image !== 'string') return 'bad-image'
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(o.image)
    if (!m) return 'bad-image'
    image = decodeBase64(m[1] as string)
    // Só JPEG de verdade (os três primeiros bytes) e pequeno.
    if (!image || image.length > PROBLEM_LIMITS.imageBytes || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) return 'bad-image'
  }
  return { category: o.category as ProblemCategory, text: body, tech, ...(image ? { image } : {}) }
}

/** Recebe um relato. O limite por IP conta toda tentativa (inclusive as recusadas). */
export async function submitProblem(deps: ProblemDeps, ip: string, bodyText: string): Promise<ProblemResult> {
  const now = deps.now()
  const hit = await deps.limiter.hit('problemIp', `ip:${ip}`, now)
  if (!hit.allowed) return fail(429, 'rate-limited', hit.retryAfterMs)
  const parsed = parseProblem(bodyText)
  if (typeof parsed === 'string') return fail(parsed === 'too-large' ? 413 : 400, parsed)
  if ((await deps.store.countSince(now - 24 * 3_600_000)) >= PROBLEM_LIMITS.perDay) return fail(503, 'busy')
  const id = deps.randomId()
  await deps.store.add({ id, createdAt: now, category: parsed.category, text: parsed.text, tech: parsed.tech, hasImage: !!parsed.image, status: 'open' }, parsed.image)
  return { status: 201, body: { ok: true, id } }
}

/** Armazenamento em memória, para testes. */
export class MemoryProblemStore implements ProblemStore {
  rows = new Map<string, { row: ProblemRow; image?: Uint8Array }>()
  async add(row: ProblemRow, image?: Uint8Array) {
    this.rows.set(row.id, { row, ...(image ? { image } : {}) })
  }
  async list(status: ProblemStatus, limit: number) {
    return [...this.rows.values()].map((r) => r.row).filter((r) => r.status === status).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
  }
  async get(id: string) {
    return this.rows.get(id)
  }
  async setStatus(id: string, status: ProblemStatus) {
    const r = this.rows.get(id)
    if (!r) return false
    r.row = { ...r.row, status }
    return true
  }
  async remove(id: string) {
    return this.rows.delete(id)
  }
  async countSince(since: number) {
    return [...this.rows.values()].filter((r) => r.row.createdAt >= since).length
  }
  async purgeBefore(before: number) {
    let n = 0
    for (const [id, r] of this.rows) if (r.row.createdAt < before) (this.rows.delete(id), n++)
    return n
  }
}
