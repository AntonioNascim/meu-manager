/**
 * Lado do servidor da identidade (Fase 6, B2). Lógica pura: o armazenamento (D1), o Turnstile, o relógio e os limites entram por `ApiDeps`,
 * então tudo roda em teste sem nuvem. O Worker só liga estas peças a `Request`/`Response`.
 */
import { checkName, type NameIssue } from './nameFilter'
import { IP_ACTION, type LimitAction, type RateLimit } from './rateLimit'
import { verifyRequest, type NonceStore, type RequestParts, type VerifyError } from './signedRequest'

export interface IdentityRecord {
  playerId: string
  createdAt: number
  lastSeen: number
  /** Apelido que a pessoa escolheu para si (único por liga, não global: a liga confere). Sem ele vale o apelido pronto. */
  nickname?: string
  /** Banida pelo painel (B9): a identidade deixa de passar em qualquer pedido. */
  bannedAt?: number
}

export interface IdentityStore {
  get(playerId: string): Promise<IdentityRecord | undefined>
  /** `false` se já existe (não sobrescreve). */
  create(record: IdentityRecord): Promise<boolean>
  setLastSeen(playerId: string, at: number): Promise<void>
  /** Troca o apelido (Fase 6, B8.1). */
  setNickname(playerId: string, nickname: string): Promise<void>
  /** "Apagar minha conta" e a limpeza por falta de uso. */
  delete(playerId: string): Promise<void>
  /** Contas sem nenhum acesso desde `before` (limpeza de 12 meses). */
  listInactive(before: number, limit: number): Promise<string[]>
}

export interface TurnstileVerifier {
  verify(token: string, ip: string): Promise<boolean>
}

export interface ApiDeps {
  store: IdentityStore
  turnstile: TurnstileVerifier
  limiter: RateLimit
  nonces: NonceStore
  now: () => number
}

export interface ApiRequest extends RequestParts {
  /** Endereço de quem pediu, só para limitar abuso: nunca é gravado. */
  ip: string
  authorization: string | null | undefined
}

export type ApiError =
  | { error: 'rate-limited'; retryAfterMs: number }
  | { error: 'unauthorized'; reason: VerifyError }
  | { error: 'unknown-identity' }
  | { error: 'banned' }
  | { error: 'bad-body' }
  | { error: 'turnstile-failed' }
  | { error: 'bad-nickname'; issue: NameIssue }

export type ApiResult<T> = { status: 200 | 201; body: T } | { status: 400 | 401 | 403 | 404 | 429; body: ApiError }

export const MAX_BODY_BYTES = 1024
export const LAST_SEEN_EVERY_MS = 3_600_000

const fail = <T>(status: 400 | 401 | 403 | 404 | 429, body: ApiError): ApiResult<T> => ({ status, body })

/** Confere o limite por IP e a assinatura de um pedido. Devolve a identidade que assinou ou o erro pronto para responder. */
export async function authenticate(
  req: ApiRequest,
  action: LimitAction,
  deps: ApiDeps,
  ipAction: LimitAction = IP_ACTION[action] ?? action,
): Promise<{ ok: true; playerId: string } | { ok: false; result: ApiResult<never> }> {
  const now = deps.now()
  // O limite por IP e a conferência da assinatura (que gasta o código de uso único) não dependem um do outro: andam juntos, para não somar as idas ao servidor.
  const [byIp, verified] = await Promise.all([deps.limiter.hit(ipAction, `ip:${req.ip}`, now), verifyRequest(req.authorization, req, now, deps.nonces)])
  if (!byIp.allowed) return { ok: false, result: fail(429, { error: 'rate-limited', retryAfterMs: byIp.retryAfterMs }) }
  if (!verified.ok) return { ok: false, result: fail(401, { error: 'unauthorized', reason: verified.error }) }
  return { ok: true, playerId: verified.playerId }
}

export interface RegisterBody {
  turnstileToken: string
  nickname?: string
}

function parseRegisterBody(text: string): RegisterBody | undefined {
  if (text.length > MAX_BODY_BYTES) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  // Lista fechada de campos: o que sobra é recusado, não ignorado.
  if (Object.keys(o).some((k) => k !== 'turnstileToken' && k !== 'nickname')) return undefined
  if (typeof o.turnstileToken !== 'string' || o.turnstileToken.length === 0 || o.turnstileToken.length > 2048) return undefined
  if (o.nickname !== undefined && typeof o.nickname !== 'string') return undefined
  return { turnstileToken: o.turnstileToken, nickname: o.nickname as string | undefined }
}

/**
 * Cria a identidade (ou reconhece a que já existe, por exemplo ao digitar o código em outro aparelho).
 * O pedido é assinado com a chave nova: assim só quem tem a chave registra aquele `playerId`.
 */
export async function registerIdentity(req: ApiRequest, deps: ApiDeps): Promise<ApiResult<{ playerId: string; created: boolean; nickname?: string }>> {
  const auth = await authenticate(req, 'createIdentity', deps)
  if (!auth.ok) return auth.result
  const body = parseRegisterBody(typeof req.body === 'string' ? req.body : new TextDecoder().decode(req.body))
  if (!body) return fail(400, { error: 'bad-body' })
  let nickname: string | undefined
  if (body.nickname !== undefined) {
    const checked = checkName(body.nickname)
    if (!checked.ok) return fail(400, { error: 'bad-nickname', issue: checked.issue })
    nickname = checked.name
  }
  const now = deps.now()
  const existing = await deps.store.get(auth.playerId)
  if (existing?.bannedAt) return fail(403, { error: 'banned' })
  if (existing) {
    await deps.store.setLastSeen(auth.playerId, now)
    return { status: 200, body: { playerId: existing.playerId, created: false, nickname: existing.nickname } }
  }
  // O Turnstile só é gasto para identidades novas: quem volta com o código não resolve desafio de novo.
  if (!(await deps.turnstile.verify(body.turnstileToken, req.ip))) return fail(403, { error: 'turnstile-failed' })
  const created = await deps.store.create({ playerId: auth.playerId, createdAt: now, lastSeen: now, nickname })
  if (!created) {
    // Duas criações ao mesmo tempo: a outra venceu, e esta vira um "já existe".
    await deps.store.setLastSeen(auth.playerId, now)
    return { status: 200, body: { playerId: auth.playerId, created: false } }
  }
  return { status: 201, body: { playerId: auth.playerId, created: true, nickname } }
}

/** Um pedido comum de uma identidade que já existe: confere limite, assinatura e cadastro, e marca a última visita. */
export async function requireIdentity(req: ApiRequest, action: LimitAction, deps: ApiDeps, ipAction: LimitAction = IP_ACTION[action] ?? action): Promise<{ ok: true; record: IdentityRecord } | { ok: false; result: ApiResult<never> }> {
  const auth = await authenticate(req, action, deps, ipAction)
  if (!auth.ok) return auth
  // Cadastro e limite por identidade andam juntos (trocar de IP não livra do teto).
  const [record, byId] = await Promise.all([deps.store.get(auth.playerId), deps.limiter.hit(action, `id:${auth.playerId}`, deps.now())])
  if (!record) return { ok: false, result: fail(404, { error: 'unknown-identity' }) }
  if (record.bannedAt) return { ok: false, result: fail(403, { error: 'banned' }) }
  if (!byId.allowed) return { ok: false, result: fail(429, { error: 'rate-limited', retryAfterMs: byId.retryAfterMs }) }
  // A última visita só é regravada de hora em hora: cada gravação no banco custa.
  if (deps.now() - record.lastSeen > LAST_SEEN_EVERY_MS) await deps.store.setLastSeen(auth.playerId, deps.now())
  return { ok: true, record }
}

/**
 * Troca o apelido (B8.1): `PUT /api/me` com `{ nickname }`, assinado. Passa pelo mesmo filtro do cadastro; não gasta Turnstile.
 */
export async function changeNickname(req: ApiRequest, deps: ApiDeps): Promise<ApiResult<{ playerId: string; nickname: string }>> {
  const auth = await requireIdentity(req, 'write', deps)
  if (!auth.ok) return auth.result
  const text = typeof req.body === 'string' ? req.body : new TextDecoder().decode(req.body)
  let raw: unknown
  try {
    raw = text.length > MAX_BODY_BYTES ? undefined : JSON.parse(text)
  } catch {
    raw = undefined
  }
  const o = raw as Record<string, unknown> | undefined
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some((k) => k !== 'nickname') || typeof o.nickname !== 'string') return fail(400, { error: 'bad-body' })
  const checked = checkName(o.nickname)
  if (!checked.ok) return fail(400, { error: 'bad-nickname', issue: checked.issue })
  await deps.store.setNickname(auth.record.playerId, checked.name)
  return { status: 200, body: { playerId: auth.record.playerId, nickname: checked.name } }
}

/** Verificador do Turnstile do Cloudflare (`siteverify`). O segredo vem do ambiente do Worker, nunca do repositório. */
export function cloudflareTurnstile(secret: string, fetchFn: typeof fetch = fetch): TurnstileVerifier {
  return {
    async verify(token, ip) {
      try {
        const form = new URLSearchParams({ secret, response: token, remoteip: ip })
        const res = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
        if (!res.ok) return false
        const data = (await res.json()) as { success?: boolean }
        return data.success === true
      } catch {
        // Sem resposta do Cloudflare, ninguém passa: falha fechada.
        return false
      }
    },
  }
}

/** Armazenamento em memória, para testes. */
export class MemoryIdentityStore implements IdentityStore {
  private rows = new Map<string, IdentityRecord>()
  async get(playerId: string) {
    return this.rows.get(playerId)
  }
  async create(record: IdentityRecord) {
    if (this.rows.has(record.playerId)) return false
    this.rows.set(record.playerId, { ...record })
    return true
  }
  async setLastSeen(playerId: string, at: number) {
    const r = this.rows.get(playerId)
    if (r) r.lastSeen = at
  }
  async setNickname(playerId: string, nickname: string) {
    const r = this.rows.get(playerId)
    if (r) r.nickname = nickname
  }
  async delete(playerId: string) {
    this.rows.delete(playerId)
  }
  async listInactive(before: number, limit: number) {
    return [...this.rows.values()].filter((r) => r.lastSeen < before).slice(0, limit).map((r) => r.playerId)
  }
}
