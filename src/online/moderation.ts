/**
 * Moderação (Fase 6, B9; proposta, seções 6.2 e 6.3). Puro: o armazenamento (D1), o relógio e o resto entram por parâmetro, então roda em teste sem nuvem.
 *
 * - **Denunciar** um apelido ou uma liga (`fileReport`): uma denúncia por pessoa e alvo. **3 pessoas diferentes** tiram o apelido (volta a "Técnico 4821")
 *   ou escondem a liga do diretório até alguém olhar.
 * - **Painel** (`/admin`, só com o segredo `ADMIN_TOKEN`): ver denúncias abertas, dispensar, trocar o apelido à força, banir e desbanir uma identidade,
 *   esconder, mostrar ou fechar uma liga. Banir = bloquear a chave: a identidade deixa de passar em qualquer pedido e sai das ligas.
 */
import type { IdentityStore } from './identityApi'
import type { LeagueStore } from './leagueApi'

export const REPORTS_TO_ACT = 3
export const REPORT_REASONS = ['offensive', 'impersonation', 'spam', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]
export type ReportKind = 'nickname' | 'league'
export type ReportStatus = 'open' | 'actioned' | 'dismissed'

export interface ReportRow {
  id: string
  kind: ReportKind
  /** `playerId` (apelido) ou id da liga. */
  target: string
  reporter: string
  reason: ReportReason
  createdAt: number
  status: ReportStatus
}

export interface BanRow {
  playerId: string
  reason: string
  bannedAt: number
}

export interface ModerationStore {
  /** `false` se esta pessoa já denunciou este alvo e a denúncia ainda está aberta. */
  addReport(r: Omit<ReportRow, 'status'>): Promise<boolean>
  /** Quantas pessoas diferentes têm denúncia aberta contra o alvo. */
  openReporters(kind: ReportKind, target: string): Promise<number>
  setStatus(kind: ReportKind, target: string, status: ReportStatus): Promise<void>
  list(status: ReportStatus, limit: number): Promise<ReportRow[]>
  ban(row: BanRow): Promise<void>
  unban(playerId: string): Promise<boolean>
  listBans(limit: number): Promise<BanRow[]>
  /** Números do painel. */
  counts(): Promise<{ openReports: number; bans: number }>
}

export interface ModerationDeps {
  identities: IdentityStore
  leagues: LeagueStore
  mod: ModerationStore
  now: () => number
  randomId: () => string
  /** Tira a identidade de todas as ligas (cada clube volta à IA). */
  leaveAll: (playerId: string) => Promise<void>
}

export type ModError = 'bad-body' | 'not-found' | 'self-report' | 'duplicate' | 'not-member' | 'unauthorized'
export type ModResult<T> = { ok: true; body: T } | { ok: false; error: ModError }

/** Apelido pronto de quem teve o próprio apelido tirado: "Técnico 4821", estável por identidade. */
export function autoNickname(playerId: string): string {
  let h = 2166136261
  for (let i = 0; i < playerId.length; i++) {
    h ^= playerId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `Técnico ${1000 + ((h >>> 0) % 9000)}`
}

export interface ReportBody {
  kind: ReportKind
  target: string
  reason: ReportReason
}

const ID = /^[A-Za-z0-9_.:-]{1,64}$/

/** Corpo de uma denúncia, conferido campo a campo (`undefined` = inválido). */
export function parseReport(o: Record<string, unknown> | undefined, kind?: ReportKind): ReportBody | undefined {
  if (!o) return undefined
  const k = kind ?? o.kind
  if (k !== 'nickname' && k !== 'league') return undefined
  const allowed = kind ? ['target', 'reason'] : ['kind', 'target', 'reason']
  if (Object.keys(o).some((x) => !allowed.includes(x))) return undefined
  if (typeof o.target !== 'string' || !ID.test(o.target)) return undefined
  if (!(REPORT_REASONS as readonly unknown[]).includes(o.reason)) return undefined
  return { kind: k, target: o.target, reason: o.reason as ReportReason }
}

/**
 * Registra a denúncia de `reporter`. Alcançado o limite de pessoas diferentes, age sozinho: apelido volta ao pronto (denúncias viram "atendidas"); a liga
 * some do diretório (as denúncias ficam abertas até o painel decidir).
 */
export async function fileReport(deps: ModerationDeps, reporter: string, body: ReportBody): Promise<ModResult<{ acted: boolean }>> {
  if (body.kind === 'nickname') {
    if (body.target === reporter) return { ok: false, error: 'self-report' }
    const target = await deps.identities.get(body.target)
    if (!target?.nickname) return { ok: false, error: 'not-found' }
  } else {
    const league = await deps.leagues.get(body.target)
    if (!league || league.status === 'closed') return { ok: false, error: 'not-found' }
    // Só quem está na liga denuncia: contas de fora não escondem ligas dos outros.
    if (!(await deps.leagues.members(body.target)).some((m) => m.playerId === reporter)) return { ok: false, error: 'not-member' }
  }
  const added = await deps.mod.addReport({ id: deps.randomId(), kind: body.kind, target: body.target, reporter, reason: body.reason, createdAt: deps.now() })
  if (!added) return { ok: false, error: 'duplicate' }
  if ((await deps.mod.openReporters(body.kind, body.target)) < REPORTS_TO_ACT) return { ok: true, body: { acted: false } }
  if (body.kind === 'nickname') {
    await deps.identities.setNickname(body.target, autoNickname(body.target))
    await deps.mod.setStatus('nickname', body.target, 'actioned')
  } else {
    await deps.leagues.update(body.target, { hidden: true })
  }
  return { ok: true, body: { acted: true } }
}

// --------------------------------------------------------------------- painel

export type AdminAction =
  | { type: 'dismiss'; kind: ReportKind; target: string }
  | { type: 'reset-nickname'; playerId: string }
  | { type: 'ban'; playerId: string; reason: string }
  | { type: 'unban'; playerId: string }
  | { type: 'hide-league'; leagueId: string }
  | { type: 'show-league'; leagueId: string }
  | { type: 'close-league'; leagueId: string }

export function parseAdminAction(o: Record<string, unknown> | undefined): AdminAction | undefined {
  if (!o) return undefined
  const only = (keys: string[]) => Object.keys(o).every((k) => ['type', ...keys].includes(k))
  const id = (v: unknown): v is string => typeof v === 'string' && ID.test(v)
  switch (o.type) {
    case 'dismiss':
      return only(['kind', 'target']) && (o.kind === 'nickname' || o.kind === 'league') && id(o.target) ? { type: 'dismiss', kind: o.kind, target: o.target } : undefined
    case 'reset-nickname':
    case 'unban':
      return only(['playerId']) && id(o.playerId) ? { type: o.type, playerId: o.playerId } : undefined
    case 'ban':
      return only(['playerId', 'reason']) && id(o.playerId) && typeof o.reason === 'string' && o.reason.length <= 200 ? { type: 'ban', playerId: o.playerId, reason: o.reason } : undefined
    case 'hide-league':
    case 'show-league':
    case 'close-league':
      return only(['leagueId']) && id(o.leagueId) ? { type: o.type, leagueId: o.leagueId } : undefined
    default:
      return undefined
  }
}

export async function runAdminAction(deps: ModerationDeps, a: AdminAction): Promise<ModResult<Record<string, never>>> {
  const done: ModResult<Record<string, never>> = { ok: true, body: {} }
  switch (a.type) {
    case 'dismiss':
      await deps.mod.setStatus(a.kind, a.target, 'dismissed')
      // Liga escondida por denúncias volta ao diretório quando o painel dispensa.
      if (a.kind === 'league' && (await deps.leagues.get(a.target))) await deps.leagues.update(a.target, { hidden: false })
      return done
    case 'reset-nickname': {
      if (!(await deps.identities.get(a.playerId))) return { ok: false, error: 'not-found' }
      await deps.identities.setNickname(a.playerId, autoNickname(a.playerId))
      await deps.mod.setStatus('nickname', a.playerId, 'actioned')
      return done
    }
    case 'ban': {
      if (!(await deps.identities.get(a.playerId))) return { ok: false, error: 'not-found' }
      await deps.mod.ban({ playerId: a.playerId, reason: a.reason, bannedAt: deps.now() })
      await deps.identities.setNickname(a.playerId, autoNickname(a.playerId))
      await deps.leaveAll(a.playerId)
      await deps.mod.setStatus('nickname', a.playerId, 'actioned')
      return done
    }
    case 'unban':
      return (await deps.mod.unban(a.playerId)) ? done : { ok: false, error: 'not-found' }
    case 'hide-league':
    case 'show-league': {
      if (!(await deps.leagues.get(a.leagueId))) return { ok: false, error: 'not-found' }
      await deps.leagues.update(a.leagueId, { hidden: a.type === 'hide-league' })
      return done
    }
    case 'close-league': {
      if (!(await deps.leagues.get(a.leagueId))) return { ok: false, error: 'not-found' }
      await deps.leagues.update(a.leagueId, { status: 'closed', hidden: true })
      await deps.mod.setStatus('league', a.leagueId, 'actioned')
      return done
    }
  }
}

/** Compara o segredo sem parar no primeiro byte diferente. `expected` vazio = painel desligado (ninguém entra). */
export function adminAuthorized(header: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || expected.length < 16) return false
  const given = (header ?? '').replace(/^Bearer\s+/i, '')
  let diff = given.length ^ expected.length
  const n = Math.max(given.length, expected.length)
  for (let i = 0; i < n; i++) diff |= (given.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0)
  return diff === 0
}

/** Armazenamento em memória, para testes. */
export class MemoryModerationStore implements ModerationStore {
  reports: ReportRow[] = []
  bans = new Map<string, BanRow>()
  async addReport(r: Omit<ReportRow, 'status'>) {
    if (this.reports.some((x) => x.kind === r.kind && x.target === r.target && x.reporter === r.reporter && x.status === 'open')) return false
    this.reports.push({ ...r, status: 'open' })
    return true
  }
  async openReporters(kind: ReportKind, target: string) {
    return new Set(this.reports.filter((x) => x.kind === kind && x.target === target && x.status === 'open').map((x) => x.reporter)).size
  }
  async setStatus(kind: ReportKind, target: string, status: ReportStatus) {
    for (const r of this.reports) if (r.kind === kind && r.target === target && r.status === 'open') r.status = status
  }
  async list(status: ReportStatus, limit: number) {
    return this.reports.filter((x) => x.status === status).slice(-limit).reverse()
  }
  async ban(row: BanRow) {
    this.bans.set(row.playerId, row)
  }
  async unban(playerId: string) {
    return this.bans.delete(playerId)
  }
  async listBans(limit: number) {
    return [...this.bans.values()].slice(-limit).reverse()
  }
  async counts() {
    return { openReports: this.reports.filter((r) => r.status === 'open').length, bans: this.bans.size }
  }
}
