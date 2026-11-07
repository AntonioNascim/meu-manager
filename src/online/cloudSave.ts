/**
 * Saves na nuvem (Fase 6, B4), lado do servidor. Lógica pura: o armazenamento (R2) entra por `BlobStore`, então tudo roda em teste sem nuvem.
 *
 * Desenho (proposta 4.2): cada pedaço do save é guardado pelo **hash do conteúdo** (`u/<jogador>/<espaço>/b/<hash>`), e o **manifesto**
 * (`u/<jogador>/<espaço>/m.json`) lista os pedaços e leva uma revisão (`rev`). Gravar o manifesto é um "compare-and-swap": só vale se a
 * `rev` que o aparelho conhecia ainda é a atual (e o R2 confere o etag na hora de gravar, então dois aparelhos ao mesmo tempo não se
 * sobrescrevem às cegas). Nunca mescla: quem perde a disputa recebe o resumo do outro e escolhe.
 *
 * "Usar este" (`force`) guarda o manifesto anterior como cópia por 7 dias (e os pedaços dele ficam). Pedaços que nenhum manifesto usa e
 * têm mais de 10 minutos saem a cada gravação do manifesto (10 minutos para não apagar o que outro aparelho está enviando agora).
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { fromBase64Url } from './identity'

export const SAVE_SLOTS = 3
/** Cota por espaço: soma dos pedaços já comprimidos (proposta 4.2: 3 espaços × 5 MB). */
export const QUOTA_BYTES_PER_SLOT = 5 * 1024 * 1024
export const MAX_BLOB_BYTES = 2 * 1024 * 1024
export const MAX_PARTS = 400
export const MAX_MANIFEST_BYTES = 64 * 1024
export const BACKUP_KEEP_MS = 7 * 24 * 3_600_000
export const ORPHAN_GRACE_MS = 10 * 60_000
/** Sem acesso por 12 meses, a conta e os saves são apagados (proposta 4.2). */
export const RETENTION_MS = 365 * 24 * 3_600_000

export interface StoredInfo {
  size: number
  etag: string
  uploaded: number
}
export interface StoredObject extends StoredInfo {
  bytes: Uint8Array
}
export interface ListedObject {
  key: string
  size: number
  uploaded: number
}

/** O pedaço do R2 que usamos. `put` com `ifMatch`/`ifAbsent` devolve `false` quando a condição falha (nada é gravado). */
export interface BlobStore {
  get(key: string): Promise<StoredObject | null>
  put(key: string, bytes: Uint8Array, cond?: { ifMatch?: string; ifAbsent?: boolean }): Promise<boolean>
  delete(keys: string[]): Promise<void>
  list(prefix: string): Promise<ListedObject[]>
}

export interface CloudDeps {
  blobs: BlobStore
  now: () => number
}

export interface ManifestPart {
  hash: string
  size: number
  enc: 'gzip' | 'json'
}

/** Resumo do save para mostrar sem baixar nada (os mesmos campos do `SaveSummary` do aparelho que importam na tela). */
export interface CloudSummary {
  teamName: string
  abbreviation: string
  colors: [string, string]
  tier: number
  league?: string
  year: number
  label?: string
  date: string
  seasonsPlayed: number
}

export interface CloudManifest {
  rev: number
  /** Hora de gravação no aparelho (ISO) e hora em que o servidor aceitou. */
  savedAt: string
  updatedAt: number
  /** Versão do formato do save (`SAVE_VERSION`). */
  version: number
  /** Qual aparelho gravou (sorteado no aparelho; serve só para dizer "outro aparelho"). */
  deviceId: string
  summary: CloudSummary
  parts: Record<string, ManifestPart>
}

export interface StoredBackup {
  backupAt: number
  manifest: CloudManifest
}

export type CloudError =
  | { error: 'bad-request'; detail: string }
  | { error: 'hash-mismatch' }
  | { error: 'too-large' }
  | { error: 'not-found' }
  | { error: 'quota'; limit: number; used: number }
  | { error: 'missing'; hashes: string[] }
  | { error: 'conflict'; current: CloudManifest | null }

export type CloudResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409 | 413 | 422; body: CloudError }

const fail = <T>(status: 400 | 404 | 409 | 413 | 422, body: CloudError): CloudResult<T> => ({ ok: false, status, body })
const ok = <T>(value: T): CloudResult<T> => ({ ok: true, value })

const HASH = /^[0-9a-f]{64}$/
const PART_NAME = /^[A-Za-z0-9:_-]{1,64}$/
const dec = new TextDecoder()
const enc = new TextEncoder()

export const hashHex = (bytes: Uint8Array): string => bytesToHex(sha256(bytes))
export const validPlayerId = (id: string): boolean => id.length === 43 && fromBase64Url(id) !== undefined

const root = (playerId: string) => `u/${playerId}/`
const slotRoot = (playerId: string, slot: number) => `${root(playerId)}${slot}/`
const manifestKey = (playerId: string, slot: number) => `${slotRoot(playerId, slot)}m.json`
const backupKey = (playerId: string, slot: number) => `${slotRoot(playerId, slot)}backup.json`
const blobPrefix = (playerId: string, slot: number) => `${slotRoot(playerId, slot)}b/`
const blobKey = (playerId: string, slot: number, hash: string) => `${blobPrefix(playerId, slot)}${hash}`

export const validSlot = (slot: number): boolean => Number.isInteger(slot) && slot >= 1 && slot <= SAVE_SLOTS

function slotCheck(slot: number): CloudResult<never> | undefined {
  return validSlot(slot) ? undefined : fail(400, { error: 'bad-request', detail: 'slot' })
}

// ---------------------------------------------------------------- leitura do manifesto

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(dec.decode(bytes))
  } catch {
    return undefined
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Confere o formato de um manifesto vindo do aparelho. `rev` e `updatedAt` são do servidor e ficam de fora. */
export function parseManifestInput(raw: unknown): { ok: true; value: Omit<CloudManifest, 'rev' | 'updatedAt'> } | { ok: false; detail: string } {
  if (!isRecord(raw)) return { ok: false, detail: 'manifest' }
  const { savedAt, version, deviceId, summary, parts } = raw
  if (typeof savedAt !== 'string' || savedAt.length > 40 || Number.isNaN(Date.parse(savedAt))) return { ok: false, detail: 'savedAt' }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > 10_000) return { ok: false, detail: 'version' }
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(deviceId)) return { ok: false, detail: 'deviceId' }
  if (!isRecord(summary)) return { ok: false, detail: 'summary' }
  const s = summary
  const text = (v: unknown, max = 80) => typeof v === 'string' && v.length <= max
  const colors = s.colors
  if (!text(s.teamName) || !text(s.abbreviation, 8) || !text(s.date, 10) || (s.league !== undefined && !text(s.league)) || (s.label !== undefined && !text(s.label, 20))) return { ok: false, detail: 'summary' }
  if (!Array.isArray(colors) || colors.length !== 2 || !colors.every((c) => typeof c === 'string' && c.length <= 20)) return { ok: false, detail: 'summary' }
  if (![s.tier, s.year, s.seasonsPlayed].every((n) => typeof n === 'number' && Number.isFinite(n))) return { ok: false, detail: 'summary' }
  if (!isRecord(parts)) return { ok: false, detail: 'parts' }
  const names = Object.keys(parts)
  if (names.length === 0 || names.length > MAX_PARTS) return { ok: false, detail: 'parts' }
  const outParts: Record<string, ManifestPart> = {}
  for (const name of names) {
    const p = parts[name]
    if (!PART_NAME.test(name) || !isRecord(p) || typeof p.hash !== 'string' || !HASH.test(p.hash) || typeof p.size !== 'number' || !Number.isInteger(p.size) || p.size < 1 || p.size > MAX_BLOB_BYTES) return { ok: false, detail: `part:${name}` }
    if (p.enc !== 'gzip' && p.enc !== 'json') return { ok: false, detail: `part:${name}` }
    outParts[name] = { hash: p.hash, size: p.size, enc: p.enc }
  }
  return {
    ok: true,
    value: {
      savedAt,
      version,
      deviceId,
      summary: {
        teamName: s.teamName as string,
        abbreviation: s.abbreviation as string,
        colors: [colors[0] as string, colors[1] as string],
        tier: s.tier as number,
        league: s.league as string | undefined,
        year: s.year as number,
        label: s.label as string | undefined,
        date: s.date as string,
        seasonsPlayed: s.seasonsPlayed as number,
      },
      parts: outParts,
    },
  }
}

async function readManifest(deps: CloudDeps, key: string): Promise<{ manifest: CloudManifest; etag: string } | null> {
  const object = await deps.blobs.get(key)
  if (!object) return null
  const raw = parseJson(object.bytes)
  if (!isRecord(raw) || typeof raw.rev !== 'number') return null
  const parsed = parseManifestInput(raw)
  if (!parsed.ok) return null
  return { manifest: { ...parsed.value, rev: raw.rev, updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0 }, etag: object.etag }
}

async function readBackup(deps: CloudDeps, playerId: string, slot: number): Promise<StoredBackup | null> {
  const object = await deps.blobs.get(backupKey(playerId, slot))
  if (!object) return null
  const raw = parseJson(object.bytes)
  if (!isRecord(raw) || typeof raw.backupAt !== 'number') return null
  const parsed = parseManifestInput(raw.manifest)
  if (!parsed.ok || !isRecord(raw.manifest)) return null
  const m = raw.manifest
  return { backupAt: raw.backupAt, manifest: { ...parsed.value, rev: typeof m.rev === 'number' ? m.rev : 0, updatedAt: typeof m.updatedAt === 'number' ? m.updatedAt : 0 } }
}

// ---------------------------------------------------------------- operações

export async function getManifest(deps: CloudDeps, playerId: string, slot: number): Promise<CloudResult<CloudManifest | null>> {
  const bad = slotCheck(slot)
  if (bad) return bad
  return ok((await readManifest(deps, manifestKey(playerId, slot)))?.manifest ?? null)
}

export interface SlotListing {
  slot: number
  manifest: CloudManifest | null
  /** A cópia guardada quando alguém escolheu "usar este" (some em 7 dias). */
  backup: StoredBackup | null
}

export async function listSaves(deps: CloudDeps, playerId: string): Promise<SlotListing[]> {
  return Promise.all(
    Array.from({ length: SAVE_SLOTS }, async (_, i) => {
      const slot = i + 1
      const [read, backup] = await Promise.all([readManifest(deps, manifestKey(playerId, slot)), readBackup(deps, playerId, slot)])
      return { slot, manifest: read?.manifest ?? null, backup: backup && deps.now() - backup.backupAt < BACKUP_KEEP_MS ? backup : null }
    }),
  )
}

/** Quais destes pedaços o servidor ainda não tem (assim o aparelho envia só esses). */
export async function missingBlobs(deps: CloudDeps, playerId: string, slot: number, hashes: unknown): Promise<CloudResult<string[]>> {
  const bad = slotCheck(slot)
  if (bad) return bad
  if (!Array.isArray(hashes) || hashes.length > MAX_PARTS || !hashes.every((h) => typeof h === 'string' && HASH.test(h))) return fail(400, { error: 'bad-request', detail: 'hashes' })
  const have = new Set((await deps.blobs.list(blobPrefix(playerId, slot))).map((o) => o.key.slice(blobPrefix(playerId, slot).length)))
  return ok([...new Set(hashes as string[])].filter((h) => !have.has(h)))
}

export async function putBlob(deps: CloudDeps, playerId: string, slot: number, hash: string, bytes: Uint8Array): Promise<CloudResult<{ stored: boolean }>> {
  const bad = slotCheck(slot)
  if (bad) return bad
  if (!HASH.test(hash)) return fail(400, { error: 'bad-request', detail: 'hash' })
  if (bytes.length === 0) return fail(400, { error: 'bad-request', detail: 'empty' })
  if (bytes.length > MAX_BLOB_BYTES) return fail(413, { error: 'too-large' })
  // O servidor confere: o nome do pedaço é o hash do que chegou, então ninguém grava um conteúdo com o nome de outro.
  if (hashHex(bytes) !== hash) return fail(400, { error: 'hash-mismatch' })
  const stored = await deps.blobs.put(blobKey(playerId, slot, hash), bytes, { ifAbsent: true })
  return ok({ stored })
}

export async function getBlob(deps: CloudDeps, playerId: string, slot: number, hash: string): Promise<CloudResult<Uint8Array>> {
  const bad = slotCheck(slot)
  if (bad) return bad
  if (!HASH.test(hash)) return fail(400, { error: 'bad-request', detail: 'hash' })
  const object = await deps.blobs.get(blobKey(playerId, slot, hash))
  return object ? ok(object.bytes) : fail(404, { error: 'not-found' })
}

export interface CommitInput {
  /** A revisão que o aparelho conhecia (0 = ainda não há save na nuvem). */
  expectedRev: unknown
  manifest: unknown
  /** "Usar este": grava por cima do que está na nuvem, guardando o anterior como cópia por 7 dias. */
  force?: unknown
}

export function parseCommit(text: string): { ok: true; value: { expectedRev: number; manifest: Omit<CloudManifest, 'rev' | 'updatedAt'>; force: boolean } } | { ok: false; detail: string } {
  if (text.length > MAX_MANIFEST_BYTES) return { ok: false, detail: 'too-large' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, detail: 'json' }
  }
  if (!isRecord(raw) || Object.keys(raw).some((k) => k !== 'expectedRev' && k !== 'manifest' && k !== 'force')) return { ok: false, detail: 'fields' }
  if (typeof raw.expectedRev !== 'number' || !Number.isInteger(raw.expectedRev) || raw.expectedRev < 0) return { ok: false, detail: 'expectedRev' }
  if (raw.force !== undefined && typeof raw.force !== 'boolean') return { ok: false, detail: 'force' }
  const manifest = parseManifestInput(raw.manifest)
  if (!manifest.ok) return manifest
  return { ok: true, value: { expectedRev: raw.expectedRev, manifest: manifest.value, force: raw.force === true } }
}

/**
 * Troca o manifesto do espaço. Só vale se `expectedRev` é a revisão atual (ou `force`), se todos os pedaços listados já estão no servidor
 * e se cabe na cota. A gravação em si é condicional no etag: se outro aparelho gravou entre a leitura e a escrita, volta `conflict`.
 */
export async function commitManifest(deps: CloudDeps, playerId: string, slot: number, text: string): Promise<CloudResult<{ rev: number; updatedAt: number }>> {
  const bad = slotCheck(slot)
  if (bad) return bad
  const parsed = parseCommit(text)
  if (!parsed.ok) return fail(400, { error: 'bad-request', detail: parsed.detail })
  const { expectedRev, manifest, force } = parsed.value

  const key = manifestKey(playerId, slot)
  const [current, listedNow, backupBefore] = await Promise.all([readManifest(deps, key), deps.blobs.list(blobPrefix(playerId, slot)), readBackup(deps, playerId, slot)])
  const currentRev = current?.manifest.rev ?? 0
  if (currentRev !== expectedRev && !force) return fail(409, { error: 'conflict', current: current?.manifest ?? null })

  // Os pedaços precisam existir (e o tamanho que o servidor vê é o que conta para a cota, não o que o aparelho diz).
  const listed = new Map(listedNow.map((o) => [o.key.slice(blobPrefix(playerId, slot).length), o]))
  const missing = Object.values(manifest.parts).filter((p) => !listed.has(p.hash)).map((p) => p.hash)
  if (missing.length > 0) return fail(422, { error: 'missing', hashes: [...new Set(missing)] })
  let used = 0
  for (const p of Object.values(manifest.parts)) {
    const real = listed.get(p.hash)!
    if (real.size !== p.size) return fail(400, { error: 'bad-request', detail: 'size' })
    used += real.size
  }
  if (used > QUOTA_BYTES_PER_SLOT) return fail(413, { error: 'quota', limit: QUOTA_BYTES_PER_SLOT, used })

  const now = deps.now()
  const next: CloudManifest = { ...manifest, rev: currentRev + 1, updatedAt: now }
  if (force && current) {
    // O que estava na nuvem vira cópia por 7 dias, antes de ser trocado.
    await deps.blobs.put(backupKey(playerId, slot), enc.encode(JSON.stringify({ backupAt: now, manifest: current.manifest })))
  }
  const written = await deps.blobs.put(key, enc.encode(JSON.stringify(next)), current ? { ifMatch: current.etag } : { ifAbsent: true })
  if (!written) {
    const latest = await readManifest(deps, key)
    return fail(409, { error: 'conflict', current: latest?.manifest ?? null })
  }

  // Limpeza: pedaços que nenhum manifesto (nem a cópia ainda válida) usa e que não são recentes.
  const backup = force && current ? { backupAt: now, manifest: current.manifest } : backupBefore
  const backupValid = backup !== null && now - backup.backupAt < BACKUP_KEEP_MS
  const keep = new Set(Object.values(next.parts).map((p) => p.hash))
  if (backupValid) for (const p of Object.values(backup.manifest.parts)) keep.add(p.hash)
  const prefix = blobPrefix(playerId, slot)
  const stale = [...listed.values()].filter((o) => !keep.has(o.key.slice(prefix.length)) && now - o.uploaded > ORPHAN_GRACE_MS).map((o) => o.key)
  if (!backupValid && backup) stale.push(backupKey(playerId, slot))
  if (stale.length > 0) await deps.blobs.delete(stale)
  return ok({ rev: next.rev, updatedAt: now })
}

export async function deleteSlotData(deps: CloudDeps, playerId: string, slot: number): Promise<CloudResult<{ deleted: number }>> {
  const bad = slotCheck(slot)
  if (bad) return bad
  const keys = (await deps.blobs.list(slotRoot(playerId, slot))).map((o) => o.key)
  if (keys.length > 0) await deps.blobs.delete(keys)
  return ok({ deleted: keys.length })
}

/** Apaga tudo que a identidade tem no R2 (o cadastro no banco é apagado por quem chama). */
export async function deleteAccountData(deps: CloudDeps, playerId: string): Promise<number> {
  const keys = (await deps.blobs.list(root(playerId))).map((o) => o.key)
  if (keys.length > 0) await deps.blobs.delete(keys)
  return keys.length
}

export interface AccountExport {
  exportedAt: string
  playerId: string
  createdAt: number
  lastSeen: number
  nickname: string | null
  /** Faixa de idade informada na criação (nunca a data de nascimento); null em conta antiga. */
  ageBand: string | null
  /** Quando a conta seria apagada por falta de uso. */
  expiresAt: number
  saves: { slot: number; manifest: CloudManifest; usedBytes: number }[]
}

/** "Exportar meus dados": tudo que guardamos da pessoa (identidade e a lista dos saves; os pedaços saem pela rota de leitura). */
export async function exportAccount(deps: CloudDeps, record: { playerId: string; createdAt: number; lastSeen: number; nickname?: string; ageBand?: string }): Promise<AccountExport> {
  const listing = await listSaves(deps, record.playerId)
  return {
    exportedAt: new Date(deps.now()).toISOString(),
    playerId: record.playerId,
    createdAt: record.createdAt,
    lastSeen: record.lastSeen,
    nickname: record.nickname ?? null,
    ageBand: record.ageBand ?? null,
    expiresAt: record.lastSeen + RETENTION_MS,
    saves: listing.filter((s) => s.manifest).map((s) => ({ slot: s.slot, manifest: s.manifest!, usedBytes: Object.values(s.manifest!.parts).reduce((n, p) => n + p.size, 0) })),
  }
}

// ---------------------------------------------------------------- armazenamento em memória (testes)

export class MemoryBlobStore implements BlobStore {
  private rows = new Map<string, { bytes: Uint8Array; etag: string; uploaded: number }>()
  private counter = 0
  /** Relógio dos testes (o `uploaded` de cada objeto). */
  clock: () => number = Date.now
  /** Só para teste: roda no meio de `put` condicional, depois de ler o etag e antes de gravar (simula um segundo aparelho). */
  beforeConditionalPut?: (key: string) => void

  async get(key: string): Promise<StoredObject | null> {
    const row = this.rows.get(key)
    return row ? { bytes: row.bytes.slice(), etag: row.etag, size: row.bytes.length, uploaded: row.uploaded } : null
  }

  async put(key: string, bytes: Uint8Array, cond?: { ifMatch?: string; ifAbsent?: boolean }): Promise<boolean> {
    if (cond) this.beforeConditionalPut?.(key)
    const row = this.rows.get(key)
    if (cond?.ifAbsent && row) return false
    if (cond?.ifMatch !== undefined && row?.etag !== cond.ifMatch) return false
    this.rows.set(key, { bytes: bytes.slice(), etag: `e${++this.counter}`, uploaded: this.clock() })
    return true
  }

  async delete(keys: string[]): Promise<void> {
    for (const k of keys) this.rows.delete(k)
  }

  async list(prefix: string): Promise<ListedObject[]> {
    return [...this.rows].filter(([k]) => k.startsWith(prefix)).map(([key, r]) => ({ key, size: r.bytes.length, uploaded: r.uploaded }))
  }

  keys(): string[] {
    return [...this.rows.keys()]
  }
}
