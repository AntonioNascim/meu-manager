/**
 * Ligas online: criar, listar, entrar, sair e administrar (Fase 6, B8.3; proposta, seções 2.1, 2.9 e 6.3). Lógica pura: o armazenamento (D1), a sala
 * da liga (Durable Object), o Turnstile, o relógio e o sorteio entram por `LeagueDeps`, então tudo roda em teste sem nuvem.
 *
 * Quem manda no estado das vagas é a sala (`RoomPort`); o armazenamento daqui é o índice para listar ("minhas ligas", diretório) e conferir limites.
 */
import type { PaceId, BandId } from '../engine/league/pace'
import { OPEN_LEAGUE_PACE, PACES } from '../engine/league/pace'
import type { SeatError } from '../engine/league/seats'
import type { LeagueView } from '../engine/league/view'
import { authenticate, requireIdentity, type ApiRequest, type ApiDeps, type IdentityStore } from './identityApi'
import { checkName, type NameIssue } from './nameFilter'

export const LEAGUE_LIMITS = {
  /** Ligas ativas que uma identidade administra (mesmo sem clube). */
  activeCreated: 3,
  /** Ligas em que uma identidade participa (criou ou entrou). */
  participating: 5,
  minHumans: 2,
  maxHumans: 20,
  nameMin: 3,
  nameMax: 30,
  directoryPage: 20,
} as const

export type WorldRef = { source: 'ficticio' } | { source: 'real'; version: string }
export type LeagueKind = 'open' | 'friends'
export type LeagueStatus = 'lobby' | 'running' | 'closed'
export type LeagueBand = Exclude<BandId, 'custom'>

export interface LeagueRecord {
  id: string
  name: string
  kind: LeagueKind
  /** Código de convite (8 caracteres): só ligas de amigos. */
  code?: string
  adminId: string
  pace: PaceId
  band: LeagueBand
  tzOffsetMin: number
  world: WorldRef
  /** Semente do mundo (o mundo fictício depende dela; todo mundo gera o mesmo). */
  seed: number
  maxHumans: number
  status: LeagueStatus
  entryClosed: boolean
  hidden: boolean
  directResult: boolean
  createdAt: number
}

export interface MemberRecord {
  leagueId: string
  playerId: string
  teamId: string
  joinedAt: number
}

export type LeagueRow = LeagueRecord & { humans: number }

export interface LeagueStore {
  create(league: LeagueRecord): Promise<boolean>
  get(id: string): Promise<LeagueRecord | undefined>
  findByCode(code: string): Promise<LeagueRecord | undefined>
  update(id: string, patch: Partial<Omit<LeagueRecord, 'id'>>): Promise<void>
  delete(id: string): Promise<void>
  /** Ligas abertas à vista no diretório: abertas, não escondidas, não fechadas, com entrada aberta e vaga; mais novas primeiro. */
  listOpen(limit: number, before?: number): Promise<LeagueRow[]>
  mine(playerId: string): Promise<LeagueRow[]>
  members(leagueId: string): Promise<MemberRecord[]>
  /** `false` se o clube ou o técnico já está na liga. */
  addMember(member: MemberRecord): Promise<boolean>
  removeMember(leagueId: string, playerId: string): Promise<void>
  countCreated(playerId: string): Promise<number>
  countMemberships(playerId: string): Promise<number>
}

export type RoomFailure = SeatError | 'not-found' | 'bad-world' | 'bad-state' | 'unavailable'

/** A sala da liga (Durable Object): dona das vagas e do mundo. */
export interface RoomPort {
  init(league: LeagueRecord): Promise<{ ok: true } | { ok: false; error: RoomFailure }>
  addSeat(leagueId: string, playerId: string, teamId: string): Promise<{ ok: true } | { ok: false; error: RoomFailure }>
  removeSeat(leagueId: string, playerId: string): Promise<{ ok: true } | { ok: false; error: RoomFailure }>
  start(leagueId: string): Promise<{ ok: true } | { ok: false; error: RoomFailure }>
  destroy(leagueId: string): Promise<void>
  /** A visão da liga para a tela (B8.4). */
  state(leagueId: string): Promise<{ ok: true; phase: 'lobby' | 'running'; view?: LeagueView } | { ok: false; error: RoomFailure }>
  ready(leagueId: string, playerId: string, ready: boolean): Promise<{ ok: true } | { ok: false; error: RoomFailure }>
  control(leagueId: string, action: ControlAction, by: string): Promise<{ ok: true } | { ok: false; error: RoomFailure }>
  setPace(leagueId: string, pace: PaceId): Promise<{ ok: true } | { ok: false; error: RoomFailure }>
  /** Ticket de uso único (30 s) para abrir o WebSocket da partida ao vivo (B8.5). */
  ticket(leagueId: string, playerId: string): Promise<{ ok: true; ticket: string; expiresInMs: number } | { ok: false; error: RoomFailure }>
}

export type ControlAction = 'advance' | 'pause' | 'resume'

export interface LeagueDeps extends ApiDeps {
  leagues: LeagueStore
  rooms: RoomPort
  identities: IdentityStore
  randomBytes: (n: number) => Uint8Array
}

export type LeagueError =
  | { error: 'rate-limited'; retryAfterMs: number }
  | { error: 'unauthorized'; reason: string }
  | { error: 'unknown-identity' }
  | { error: 'bad-body' }
  | { error: 'turnstile-failed' }
  | { error: 'bad-name'; issue: NameIssue }
  | { error: 'not-found' }
  | { error: 'forbidden' }
  | { error: 'too-many-created'; limit: number }
  | { error: 'too-many-joined'; limit: number }
  | { error: 'league-full' }
  | { error: 'entry-closed' }
  | { error: 'wrong-code' }
  | { error: 'already-member' }
  | { error: 'team-taken' }
  | { error: 'unknown-team' }
  | { error: 'room-failed'; detail: string }
  | { error: 'bad-state' }

export type LeagueResult<T> = { status: 200 | 201; body: T } | { status: 400 | 401 | 403 | 404 | 409 | 429 | 502; body: LeagueError }

const fail = <T>(status: 400 | 401 | 403 | 404 | 409 | 429 | 502, body: LeagueError): LeagueResult<T> => ({ status, body })

// ---------------------------------------------------------------- visões públicas

export interface LeagueSummary {
  id: string
  name: string
  kind: LeagueKind
  world: WorldRef
  seed: number
  pace: PaceId
  band: LeagueBand
  directResult: boolean
  maxHumans: number
  humans: number
  status: LeagueStatus
  entryClosed: boolean
  createdAt: number
  adminNickname?: string
}

export interface LeagueMember {
  playerId: string
  nickname?: string
  teamId: string
  isAdmin: boolean
  joinedAt: number
}

export interface LeagueDetail extends LeagueSummary {
  members: LeagueMember[]
  /** Só o ADM vê o código. */
  code?: string
  isAdmin: boolean
  myTeamId?: string
}

async function nicknameOf(deps: LeagueDeps, playerId: string): Promise<string | undefined> {
  return (await deps.identities.get(playerId))?.nickname
}

async function summaryOf(deps: LeagueDeps, row: LeagueRow): Promise<LeagueSummary> {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    world: row.world,
    seed: row.seed,
    pace: row.pace,
    band: row.band,
    directResult: row.directResult,
    maxHumans: row.maxHumans,
    humans: row.humans,
    status: row.status,
    entryClosed: row.entryClosed,
    createdAt: row.createdAt,
    adminNickname: await nicknameOf(deps, row.adminId),
  }
}

async function detailOf(deps: LeagueDeps, league: LeagueRecord, viewer: string): Promise<LeagueDetail> {
  const members = await deps.leagues.members(league.id)
  const summary = await summaryOf(deps, { ...league, humans: members.length })
  const me = members.find((m) => m.playerId === viewer)
  return {
    ...summary,
    members: await Promise.all(members.map(async (m): Promise<LeagueMember> => ({ playerId: m.playerId, nickname: await nicknameOf(deps, m.playerId), teamId: m.teamId, isAdmin: m.playerId === league.adminId, joinedAt: m.joinedAt }))),
    isAdmin: league.adminId === viewer,
    ...(me ? { myTeamId: me.teamId } : {}),
    ...(league.adminId === viewer && league.code ? { code: league.code } : {}),
  }
}

// ---------------------------------------------------------------- sorteios

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
/** 31 símbolos sem os que se confundem (0/O, 1/I/L): 8 caracteres dão ~8,5 × 10¹¹ códigos. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const CODE_LENGTH = 8

function pick(alphabet: string, n: number, randomBytes: (n: number) => Uint8Array): string {
  // Sorteio sem viés: descarta os bytes que sobram acima do maior múltiplo do alfabeto.
  const limit = 256 - (256 % alphabet.length)
  let out = ''
  while (out.length < n) {
    for (const b of randomBytes(n * 2)) {
      if (b < limit && out.length < n) out += alphabet[b % alphabet.length]
    }
  }
  return out
}
export const newLeagueId = (randomBytes: (n: number) => Uint8Array): string => pick(ID_ALPHABET, 12, randomBytes)
export const newInviteCode = (randomBytes: (n: number) => Uint8Array): string => pick(CODE_ALPHABET, CODE_LENGTH, randomBytes)

/** Lê o que a pessoa digitou como código: sem espaço nem hífen, maiúsculas. */
export const normalizeCode = (text: string): string => text.replace(/[\s-]/g, '').toUpperCase()

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---------------------------------------------------------------- corpo dos pedidos

function parseJson(body: ApiRequest['body'], max = 2048): Record<string, unknown> | undefined {
  const text = typeof body === 'string' ? body : new TextDecoder().decode(body)
  if (text.length > max) return undefined
  try {
    const raw: unknown = text === '' ? {} : JSON.parse(text)
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(o).every((k) => keys.includes(k))
const VERSION = /^\d{4}\.(0[1-9]|1[0-2])(\.\d{1,3})?$/
const TEAM_ID = /^[A-Za-z0-9_.:-]{1,64}$/
const BANDS: readonly LeagueBand[] = ['classic', 'night', 'weekend']

export interface CreateBody {
  turnstileToken: string
  name: string
  kind: LeagueKind
  world: WorldRef
  pace: PaceId
  band: LeagueBand
  tzOffsetMin: number
  maxHumans: number
  directResult: boolean
  /** O ADM já escolhe o clube dele ao criar. */
  teamId?: string
}

function parseCreate(body: ApiRequest['body']): CreateBody | undefined {
  const o = parseJson(body)
  if (!o || !onlyKeys(o, ['turnstileToken', 'name', 'kind', 'world', 'pace', 'band', 'tzOffsetMin', 'maxHumans', 'directResult', 'teamId'])) return undefined
  if (typeof o.turnstileToken !== 'string' || o.turnstileToken === '' || o.turnstileToken.length > 2048) return undefined
  if (typeof o.name !== 'string') return undefined
  if (o.kind !== 'open' && o.kind !== 'friends') return undefined
  const w = o.world as Record<string, unknown> | undefined
  let world: WorldRef
  if (w && w.source === 'ficticio' && onlyKeys(w, ['source'])) world = { source: 'ficticio' }
  else if (w && w.source === 'real' && typeof w.version === 'string' && VERSION.test(w.version) && onlyKeys(w, ['source', 'version'])) world = { source: 'real', version: w.version }
  else return undefined
  const pace = (o.pace ?? 'normal') as PaceId
  if (!(pace in PACES)) return undefined
  const band = (o.band ?? 'classic') as LeagueBand
  if (!BANDS.includes(band)) return undefined
  const tz = o.tzOffsetMin ?? -180
  if (typeof tz !== 'number' || !Number.isInteger(tz) || tz < -720 || tz > 840 || tz % 15 !== 0) return undefined
  const max = o.maxHumans ?? 8
  if (typeof max !== 'number' || !Number.isInteger(max) || max < LEAGUE_LIMITS.minHumans || max > LEAGUE_LIMITS.maxHumans) return undefined
  if (o.directResult !== undefined && typeof o.directResult !== 'boolean') return undefined
  if (o.teamId !== undefined && (typeof o.teamId !== 'string' || !TEAM_ID.test(o.teamId))) return undefined
  return { turnstileToken: o.turnstileToken, name: o.name, kind: o.kind, world, pace, band, tzOffsetMin: tz, maxHumans: max, directResult: o.directResult === true, ...(o.teamId ? { teamId: o.teamId as string } : {}) }
}

// ---------------------------------------------------------------- operações

const roomFailure = <T>(error: RoomFailure): LeagueResult<T> =>
  error === 'bad-state' ? fail(409, { error: 'bad-state' }) : error === 'team-taken' ? fail(409, { error: 'team-taken' }) : error === 'unknown-team' ? fail(400, { error: 'unknown-team' }) : error === 'already-seated' ? fail(409, { error: 'already-member' }) : fail(502, { error: 'room-failed', detail: error })

/** Cria a liga. Ligas abertas só usam o ritmo Normal; quem cria é o ADM e já pode escolher o clube. */
export async function createLeague(req: ApiRequest, deps: LeagueDeps): Promise<LeagueResult<LeagueDetail>> {
  const auth = await requireIdentity(req, 'createLeague', deps, 'createLeagueIp')
  if (!auth.ok) return auth.result as LeagueResult<never>
  const body = parseCreate(req.body)
  if (!body) return fail(400, { error: 'bad-body' })
  const name = checkName(body.name, { min: LEAGUE_LIMITS.nameMin, max: LEAGUE_LIMITS.nameMax })
  if (!name.ok) return fail(400, { error: 'bad-name', issue: name.issue })
  const me = auth.record.playerId
  if ((await deps.leagues.countCreated(me)) >= LEAGUE_LIMITS.activeCreated) return fail(409, { error: 'too-many-created', limit: LEAGUE_LIMITS.activeCreated })
  if ((await deps.leagues.countMemberships(me)) >= LEAGUE_LIMITS.participating) return fail(409, { error: 'too-many-joined', limit: LEAGUE_LIMITS.participating })
  if (!(await deps.turnstile.verify(body.turnstileToken, req.ip))) return fail(403, { error: 'turnstile-failed' })

  const bytes = deps.randomBytes(4)
  const league: LeagueRecord = {
    id: newLeagueId(deps.randomBytes),
    name: name.name,
    kind: body.kind,
    ...(body.kind === 'friends' ? { code: newInviteCode(deps.randomBytes) } : {}),
    adminId: me,
    pace: body.kind === 'open' ? OPEN_LEAGUE_PACE : body.pace,
    band: body.band,
    tzOffsetMin: body.tzOffsetMin,
    world: body.world,
    seed: ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 1,
    maxHumans: body.maxHumans,
    status: 'lobby',
    entryClosed: false,
    hidden: false,
    directResult: body.directResult,
    createdAt: deps.now(),
  }
  if (!(await deps.leagues.create(league))) return fail(409, { error: 'bad-state' })
  const room = await deps.rooms.init(league)
  if (!room.ok) {
    await deps.leagues.delete(league.id)
    return roomFailure(room.error)
  }
  if (body.teamId) {
    const joined = await joinChecked(deps, league, me, body.teamId)
    if (!joined.ok) {
      await deps.rooms.destroy(league.id)
      await deps.leagues.delete(league.id)
      return joined.result as LeagueResult<never>
    }
  }
  return { status: 201, body: await detailOf(deps, league, me) }
}

/** Diretório de ligas abertas (mais novas primeiro). `before` = `createdAt` da última da página anterior. */
export async function listOpenLeagues(req: ApiRequest, deps: LeagueDeps, before?: number): Promise<LeagueResult<{ leagues: LeagueSummary[]; next?: number }>> {
  const auth = await requireIdentity(req, 'read', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const rows = await deps.leagues.listOpen(LEAGUE_LIMITS.directoryPage + 1, before)
  const page = rows.slice(0, LEAGUE_LIMITS.directoryPage)
  return { status: 200, body: { leagues: await Promise.all(page.map((r) => summaryOf(deps, r))), ...(rows.length > page.length ? { next: page[page.length - 1]!.createdAt } : {}) } }
}

export async function myLeagues(req: ApiRequest, deps: LeagueDeps): Promise<LeagueResult<{ leagues: LeagueSummary[] }>> {
  const auth = await requireIdentity(req, 'read', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const rows = await deps.leagues.mine(auth.record.playerId)
  return { status: 200, body: { leagues: await Promise.all(rows.map((r) => summaryOf(deps, r))) } }
}

/** Detalhe de uma liga: aberta qualquer um vê; de amigos só quem é membro (ou quem tem o código, por `resolveCode`). */
export async function getLeague(req: ApiRequest, deps: LeagueDeps, id: string): Promise<LeagueResult<LeagueDetail>> {
  const auth = await requireIdentity(req, 'read', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const league = await deps.leagues.get(id)
  if (!league || league.status === 'closed') return fail(404, { error: 'not-found' })
  const members = await deps.leagues.members(id)
  // O ADM sempre vê a própria liga, mesmo antes de escolher um clube.
  const mine = members.some((m) => m.playerId === auth.record.playerId) || league.adminId === auth.record.playerId
  if (league.kind === 'friends' && !mine) return fail(404, { error: 'not-found' })
  if (league.hidden && !mine) return fail(404, { error: 'not-found' })
  return { status: 200, body: await detailOf(deps, league, auth.record.playerId) }
}

/** Convite por código: devolve a liga para a pessoa escolher o clube. Limitado a 10 tentativas por hora. */
export async function resolveCode(req: ApiRequest, deps: LeagueDeps, code: string): Promise<LeagueResult<LeagueDetail>> {
  const auth = await requireIdentity(req, 'joinByCode', deps, 'joinByCodeIp')
  if (!auth.ok) return auth.result as LeagueResult<never>
  const normalized = normalizeCode(code)
  if (normalized.length !== CODE_LENGTH || [...normalized].some((c) => !CODE_ALPHABET.includes(c))) return fail(404, { error: 'wrong-code' })
  const league = await deps.leagues.findByCode(normalized)
  if (!league || league.status === 'closed') return fail(404, { error: 'wrong-code' })
  return { status: 200, body: { ...(await detailOf(deps, league, auth.record.playerId)), code: undefined } }
}

async function joinChecked(deps: LeagueDeps, league: LeagueRecord, playerId: string, teamId: string): Promise<{ ok: true } | { ok: false; result: LeagueResult<never> }> {
  const members = await deps.leagues.members(league.id)
  if (members.some((m) => m.playerId === playerId)) return { ok: false, result: fail(409, { error: 'already-member' }) }
  if (members.length >= league.maxHumans) return { ok: false, result: fail(409, { error: 'league-full' }) }
  if ((await deps.leagues.countMemberships(playerId)) >= LEAGUE_LIMITS.participating) return { ok: false, result: fail(409, { error: 'too-many-joined', limit: LEAGUE_LIMITS.participating }) }
  if (members.some((m) => m.teamId === teamId)) return { ok: false, result: fail(409, { error: 'team-taken' }) }
  const seat = await deps.rooms.addSeat(league.id, playerId, teamId)
  if (!seat.ok) return { ok: false, result: roomFailure(seat.error) }
  const added = await deps.leagues.addMember({ leagueId: league.id, playerId, teamId, joinedAt: deps.now() })
  if (!added) {
    // Perdeu a corrida para outro técnico: devolve a vaga na sala.
    await deps.rooms.removeSeat(league.id, playerId)
    return { ok: false, result: fail(409, { error: 'team-taken' }) }
  }
  return { ok: true }
}

/** Entra na liga com um clube livre. Liga de amigos exige o código; liga com entrada fechada ou cheia recusa. */
export async function joinLeague(req: ApiRequest, deps: LeagueDeps, id: string): Promise<LeagueResult<LeagueDetail>> {
  const auth = await requireIdentity(req, 'write', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const o = parseJson(req.body)
  if (!o || !onlyKeys(o, ['teamId', 'code']) || typeof o.teamId !== 'string' || !TEAM_ID.test(o.teamId) || (o.code !== undefined && typeof o.code !== 'string')) return fail(400, { error: 'bad-body' })
  const league = await deps.leagues.get(id)
  if (!league || league.status === 'closed' || league.hidden) return fail(404, { error: 'not-found' })
  // Liga de amigos: o código vale; o ADM entra sem ele (a liga é dele).
  if (league.kind === 'friends' && league.adminId !== auth.record.playerId && !(typeof o.code === 'string' && league.code && sameText(normalizeCode(o.code), league.code))) {
    const hit = await deps.limiter.hit('joinByCode', `id:${auth.record.playerId}`, deps.now())
    if (!hit.allowed) return fail(429, { error: 'rate-limited', retryAfterMs: hit.retryAfterMs })
    return fail(403, { error: 'wrong-code' })
  }
  if (league.entryClosed) return fail(403, { error: 'entry-closed' })
  const joined = await joinChecked(deps, league, auth.record.playerId, o.teamId)
  if (!joined.ok) return joined.result as LeagueResult<never>
  return { status: 200, body: await detailOf(deps, league, auth.record.playerId) }
}

/** Passa o cargo de ADM ao humano mais antigo que sobrou (ou fecha a liga se não sobrou ninguém). */
async function afterMemberLeft(deps: LeagueDeps, league: LeagueRecord, leaver: string): Promise<void> {
  const members = await deps.leagues.members(league.id)
  if (members.length === 0) {
    await deps.leagues.update(league.id, { status: 'closed' })
    await deps.rooms.destroy(league.id)
    return
  }
  if (league.adminId === leaver) await deps.leagues.update(league.id, { adminId: [...members].sort((a, b) => a.joinedAt - b.joinedAt)[0]!.playerId })
}

/** Sai da liga (o clube volta à IA). Se o ADM sai, o humano mais antigo assume. */
export async function leaveLeague(req: ApiRequest, deps: LeagueDeps, id: string): Promise<LeagueResult<{ left: true }>> {
  const auth = await requireIdentity(req, 'write', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const league = await deps.leagues.get(id)
  const me = auth.record.playerId
  if (!league) return fail(404, { error: 'not-found' })
  if (!(await deps.leagues.members(id)).some((m) => m.playerId === me) && league.adminId !== me) return fail(404, { error: 'not-found' })
  await deps.rooms.removeSeat(id, me)
  await deps.leagues.removeMember(id, me)
  await afterMemberLeft(deps, league, me)
  return { status: 200, body: { left: true } }
}

export type AdminAction = 'kick' | 'close-entry' | 'open-entry' | 'rotate-code' | 'start' | 'make-admin'

/** Ações do ADM. `kick` e `make-admin` pedem `{ playerId }`. */
export async function adminAction(req: ApiRequest, deps: LeagueDeps, id: string, action: AdminAction): Promise<LeagueResult<LeagueDetail>> {
  const auth = await requireIdentity(req, 'write', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const o = parseJson(req.body)
  if (!o || !onlyKeys(o, ['playerId']) || (o.playerId !== undefined && (typeof o.playerId !== 'string' || o.playerId.length > 64))) return fail(400, { error: 'bad-body' })
  const league = await deps.leagues.get(id)
  if (!league || league.status === 'closed') return fail(404, { error: 'not-found' })
  const me = auth.record.playerId
  if (league.adminId !== me) return fail(403, { error: 'forbidden' })
  const target = o.playerId as string | undefined

  if (action === 'close-entry' || action === 'open-entry') {
    await deps.leagues.update(id, { entryClosed: action === 'close-entry' })
  } else if (action === 'rotate-code') {
    if (league.kind !== 'friends') return fail(400, { error: 'bad-state' })
    await deps.leagues.update(id, { code: newInviteCode(deps.randomBytes) })
  } else if (action === 'start') {
    if (league.status !== 'lobby') return fail(409, { error: 'bad-state' })
    const started = await deps.rooms.start(id)
    if (!started.ok) return roomFailure(started.error)
    await deps.leagues.update(id, { status: 'running' })
  } else if (action === 'kick') {
    if (!target || target === me) return fail(400, { error: 'bad-body' })
    if (!(await deps.leagues.members(id)).some((m) => m.playerId === target)) return fail(404, { error: 'not-found' })
    await deps.rooms.removeSeat(id, target)
    await deps.leagues.removeMember(id, target)
  } else if (action === 'make-admin') {
    if (!target || !(await deps.leagues.members(id)).some((m) => m.playerId === target)) return fail(404, { error: 'not-found' })
    await deps.leagues.update(id, { adminId: target })
  }
  return { status: 200, body: await detailOf(deps, (await deps.leagues.get(id)) as LeagueRecord, me) }
}

/** "Apagar minha conta": sai de todas as ligas (cada clube volta à IA; se era o ADM, o humano mais antigo assume). */
export async function leaveAllLeagues(deps: LeagueDeps, playerId: string): Promise<void> {
  for (const row of await deps.leagues.mine(playerId)) {
    const league = await deps.leagues.get(row.id)
    if (!league) continue
    await deps.rooms.removeSeat(row.id, playerId)
    await deps.leagues.removeMember(row.id, playerId)
    await afterMemberLeft(deps, league, playerId)
  }
}

// ---------------------------------------------------------------- andamento da liga (B8.4)

export interface LeagueStateBody {
  phase: 'lobby' | 'running'
  view?: LeagueView
  isAdmin: boolean
}

async function memberOrAdmin(deps: LeagueDeps, id: string, playerId: string): Promise<{ league: LeagueRecord; isAdmin: boolean } | undefined> {
  const league = await deps.leagues.get(id)
  if (!league || league.status === 'closed') return undefined
  const isAdmin = league.adminId === playerId
  const member = (await deps.leagues.members(id)).some((m) => m.playerId === playerId)
  return member || isAdmin ? { league, isAdmin } : undefined
}

/** O calendário, o Pronto de cada um e a pausa. Só quem está na liga (ou o ADM) vê; as sugestões de ausência só o ADM. */
export async function leagueState(req: ApiRequest, deps: LeagueDeps, id: string): Promise<LeagueResult<LeagueStateBody>> {
  const auth = await requireIdentity(req, 'read', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const who = await memberOrAdmin(deps, id, auth.record.playerId)
  if (!who) return fail(404, { error: 'not-found' })
  const room = await deps.rooms.state(id)
  if (!room.ok) return roomFailure(room.error)
  const view = room.view ? { ...room.view, suggestions: who.isAdmin ? room.view.suggestions : [] } : undefined
  return { status: 200, body: { phase: room.phase, ...(view ? { view } : {}), isAdmin: who.isAdmin } }
}

/** "Pronto" (ou desfazer) de um técnico com clube na liga em andamento. */
export async function setReady(req: ApiRequest, deps: LeagueDeps, id: string): Promise<LeagueResult<{ ready: boolean }>> {
  const auth = await requireIdentity(req, 'write', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const o = parseJson(req.body)
  if (!o || !onlyKeys(o, ['ready']) || typeof o.ready !== 'boolean') return fail(400, { error: 'bad-body' })
  const league = await deps.leagues.get(id)
  if (!league || league.status === 'closed') return fail(404, { error: 'not-found' })
  if (!(await deps.leagues.members(id)).some((m) => m.playerId === auth.record.playerId)) return fail(404, { error: 'not-found' })
  if (league.status !== 'running') return fail(409, { error: 'bad-state' })
  const r = await deps.rooms.ready(id, auth.record.playerId, o.ready)
  if (!r.ok) return roomFailure(r.error)
  return { status: 200, body: { ready: o.ready } }
}

/** Ticket para o técnico (com clube na liga em andamento) abrir o WebSocket da partida: vale 30 s e uma vez só. */
export async function liveTicket(req: ApiRequest, deps: LeagueDeps, id: string): Promise<LeagueResult<{ ticket: string; expiresInMs: number }>> {
  const auth = await requireIdentity(req, 'write', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const league = await deps.leagues.get(id)
  if (!league || league.status === 'closed') return fail(404, { error: 'not-found' })
  if (!(await deps.leagues.members(id)).some((m) => m.playerId === auth.record.playerId)) return fail(404, { error: 'not-found' })
  if (league.status !== 'running') return fail(409, { error: 'bad-state' })
  const r = await deps.rooms.ticket(id, auth.record.playerId)
  if (!r.ok) return roomFailure(r.error)
  return { status: 200, body: { ticket: r.ticket, expiresInMs: r.expiresInMs } }
}

/** Avançar, Pausar e Retomar: só o ADM. */
export async function controlLeague(req: ApiRequest, deps: LeagueDeps, id: string, action: ControlAction): Promise<LeagueResult<{ done: true }>> {
  const auth = await requireIdentity(req, 'write', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const league = await deps.leagues.get(id)
  if (!league || league.status === 'closed') return fail(404, { error: 'not-found' })
  if (league.adminId !== auth.record.playerId) return fail(403, { error: 'forbidden' })
  if (league.status !== 'running') return fail(409, { error: 'bad-state' })
  const r = await deps.rooms.control(id, action, auth.record.playerId)
  if (!r.ok) return roomFailure(r.error)
  return { status: 200, body: { done: true } }
}

/** Muda o ritmo (só o ADM, só em liga de amigos: a aberta é sempre Normal). */
export async function changePace(req: ApiRequest, deps: LeagueDeps, id: string): Promise<LeagueResult<{ pace: PaceId }>> {
  const auth = await requireIdentity(req, 'write', deps)
  if (!auth.ok) return auth.result as LeagueResult<never>
  const o = parseJson(req.body)
  if (!o || !onlyKeys(o, ['pace']) || typeof o.pace !== 'string' || !(o.pace in PACES)) return fail(400, { error: 'bad-body' })
  const league = await deps.leagues.get(id)
  if (!league || league.status === 'closed') return fail(404, { error: 'not-found' })
  if (league.adminId !== auth.record.playerId) return fail(403, { error: 'forbidden' })
  if (league.kind !== 'friends') return fail(409, { error: 'bad-state' })
  const pace = o.pace as PaceId
  const r = await deps.rooms.setPace(id, pace)
  if (!r.ok) return roomFailure(r.error)
  await deps.leagues.update(id, { pace })
  return { status: 200, body: { pace } }
}

export { authenticate }
