/**
 * Cliente das ligas online (Fase 6, B8.3). Puro: `fetch`, relógio e sorteio entram por parâmetro. Cada pedido é assinado com a identidade do aparelho.
 * Os erros do servidor chegam como `{ ok: false, error, ... }` com o mesmo código que `leagueApi.ts` usa (a tela traduz com `LEAGUE_ERROR_LABELS`).
 */
import type { Identity } from './identity'
import { signedCall, type IdentityClientDeps } from './identityClient'
import type { LeagueDetail, LeagueSummary, LeagueError, AdminAction, WorldRef, LeagueStateBody, ControlAction } from './leagueApi'
import type { PaceId } from '../engine/league/pace'
import type { ClubAction, ClubView } from '../engine/league/club'
import type { TradeReply, TradeOp, VacancyRow } from './leagueApi'
import type { TradeReport } from '../engine/league/trade'
import type { AiSearchFilters } from '../engine/league/aimarket'
import type { CupsBody } from '../engine/league/cupsView'
import type { LeagueCommand } from '../engine/league/command'
import type { MirrorPayload } from '../engine/league/mirror'
import type { CareerRow, FreeClubRow, Prefs, TeamDetail } from '../engine/league/career'
import type { Dismissal } from '../engine/types'

export type LeagueClientDeps = IdentityClientDeps

export type DismissalRow = Dismissal & { teamId: string }

export type Answer<T> = ({ ok: true } & T) | { ok: false; error: LeagueError['error'] | 'offline' | 'server'; detail?: unknown; retryAfterMs?: number }

export interface CreateLeagueInput {
  turnstileToken: string
  name: string
  kind: 'open' | 'friends'
  world: WorldRef
  pace: PaceId
  band: 'classic' | 'night' | 'weekend'
  tzOffsetMin: number
  maxHumans: number
  directResult: boolean
  teamId?: string
}

async function ask<T>(deps: LeagueClientDeps, identity: Identity, method: string, path: string, body?: unknown): Promise<Answer<T>> {
  const res = await signedCall(deps, identity, method, path, body === undefined ? '' : JSON.stringify(body))
  if (res === 'offline') return { ok: false, error: 'offline' }
  if (res.status >= 200 && res.status < 300) return { ok: true, ...(res.json as T) }
  const error = typeof res.json.error === 'string' ? (res.json.error as LeagueError['error']) : 'server'
  return { ok: false, error: res.status >= 500 ? 'server' : error, detail: res.json, ...(typeof res.json.retryAfterMs === 'number' ? { retryAfterMs: res.json.retryAfterMs } : {}) }
}

/** O detalhe vem solto no corpo; devolve-o dentro de `league` para a tela. */
async function detail(deps: LeagueClientDeps, identity: Identity, method: string, path: string, body?: unknown): Promise<Answer<{ league: LeagueDetail }>> {
  const out = await ask<LeagueDetail>(deps, identity, method, path, body)
  if (!out.ok) return out
  const { ok: _ok, ...league } = out
  return { ok: true, league: league as unknown as LeagueDetail }
}

export const createLeague = (deps: LeagueClientDeps, identity: Identity, input: CreateLeagueInput) => detail(deps, identity, 'POST', '/api/leagues', input)
export const listOpenLeagues = (deps: LeagueClientDeps, identity: Identity, before?: number) => ask<{ leagues: LeagueSummary[]; next?: number }>(deps, identity, 'GET', `/api/leagues/open${before ? `?before=${before}` : ''}`)
export const myLeagues = (deps: LeagueClientDeps, identity: Identity) => ask<{ leagues: LeagueSummary[] }>(deps, identity, 'GET', '/api/leagues/mine')
export const getLeague = (deps: LeagueClientDeps, identity: Identity, id: string) => detail(deps, identity, 'GET', `/api/leagues/${id}`)
export const resolveInviteCode = (deps: LeagueClientDeps, identity: Identity, code: string) => detail(deps, identity, 'POST', '/api/leagues/code', { code })
export const joinLeague = (deps: LeagueClientDeps, identity: Identity, id: string, teamId: string, code?: string) => detail(deps, identity, 'POST', `/api/leagues/${id}/join`, { teamId, ...(code ? { code } : {}) })
export const leaveLeague = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<{ left: true }>(deps, identity, 'POST', `/api/leagues/${id}/leave`, {})
export const adminLeague = (deps: LeagueClientDeps, identity: Identity, id: string, action: AdminAction, playerId?: string) => detail(deps, identity, 'POST', `/api/leagues/${id}/${action}`, playerId ? { playerId } : {})
export const leagueState = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<LeagueStateBody>(deps, identity, 'GET', `/api/leagues/${id}/state`)
export const sendReady = (deps: LeagueClientDeps, identity: Identity, id: string, ready: boolean) => ask<{ ready: boolean }>(deps, identity, 'POST', `/api/leagues/${id}/ready`, { ready })
export const controlLeague = (deps: LeagueClientDeps, identity: Identity, id: string, action: ControlAction) => ask<{ done: true }>(deps, identity, 'POST', `/api/leagues/${id}/${action}`, {})
export const changePace = (deps: LeagueClientDeps, identity: Identity, id: string, pace: PaceId) => ask<{ pace: PaceId }>(deps, identity, 'POST', `/api/leagues/${id}/pace`, { pace })

/** Ticket de uso único (30 s) para abrir o WebSocket da partida ao vivo (B8.5). */
export const requestLiveTicket = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<{ ticket: string; expiresInMs: number }>(deps, identity, 'POST', `/api/leagues/${id}/live-ticket`, {})

/** Endereço do WebSocket da partida: o ticket vai na própria URL (o navegador não manda cabeçalhos no WebSocket). */
export const liveSocketUrl = (base: string, leagueId: string, ticket: string): string => `${base.replace(/^http/, 'ws')}/api/leagues/${leagueId}/live?ticket=${encodeURIComponent(ticket)}`

/** O espelho do mundo no aparelho (C2): a atualização desde `since` ou a carga completa, página a página. */
export const mirrorFetch = (deps: LeagueClientDeps, identity: Identity, id: string, since: number | null, page = 0) => ask<{ payload: MirrorPayload }>(deps, identity, 'GET', `/api/leagues/${id}/mirror?${since !== null ? `since=${since}&` : ''}page=${page}`)

/** Um comando do técnico (C2): o servidor valida, aplica e devolve a atualização do espelho. */
export const sendCommand = (deps: LeagueClientDeps, identity: Identity, id: string, command: LeagueCommand, since: number | null) => ask<{ payload: MirrorPayload; info?: Record<string, unknown> }>(deps, identity, 'POST', `/api/leagues/${id}/command`, { since, command })

/** Detalhe ao tocar (C6): a condição física e a moral reais do elenco de um clube e a tática salva dele. */
export const leagueDetail = (deps: LeagueClientDeps, identity: Identity, id: string, teamId: string) => ask<TeamDetail>(deps, identity, 'GET', `/api/leagues/${id}/detail?team=${encodeURIComponent(teamId)}`)
/** A carreira do técnico na liga (C6): cada passagem por um clube. */
export const leagueCareer = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<{ rows: CareerRow[] }>(deps, identity, 'GET', `/api/leagues/${id}/career`)
/** Demissão (C6): o registro (se foi demitido) e os clubes livres que ele pode assumir. */
export const leagueDismissal = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<{ dismissal?: DismissalRow; options?: FreeClubRow[] }>(deps, identity, 'GET', `/api/leagues/${id}/dismissal`)
export const leagueRechoose = (deps: LeagueClientDeps, identity: Identity, id: string, teamId: string) => ask<{ teamId: string }>(deps, identity, 'POST', `/api/leagues/${id}/rechoose`, { teamId })
/** Favoritos e escalações guardadas, por conta (C6). */
export const leaguePrefsGet = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<Prefs>(deps, identity, 'GET', `/api/leagues/${id}/prefs`)
export const leaguePrefsSet = (deps: LeagueClientDeps, identity: Identity, id: string, prefs: Prefs) => ask<Prefs>(deps, identity, 'PUT', `/api/leagues/${id}/prefs`, prefs)

/** Códigos de vaga do ADM: reservar um clube por 72 horas, listar e cancelar. */
export const vacancyList = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<{ vacancies: VacancyRow[] }>(deps, identity, 'GET', `/api/leagues/${id}/vacancies`)
export const vacancyCreate = (deps: LeagueClientDeps, identity: Identity, id: string, teamId: string) => ask<{ vacancies: VacancyRow[] }>(deps, identity, 'POST', `/api/leagues/${id}/vacancy`, { teamId })
export const vacancyCancel = (deps: LeagueClientDeps, identity: Identity, id: string, code: string) => ask<{ vacancies: VacancyRow[] }>(deps, identity, 'POST', `/api/leagues/${id}/vacancy-cancel`, { code })

/** O clube do técnico: meta, contratos que vencem e base (B8.7). */
export const clubState = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<{ view: ClubView }>(deps, identity, 'GET', `/api/leagues/${id}/club`)

/** Renovar um contrato, promover ou dispensar um jovem da base (B8.7). */
export const clubDecision = (deps: LeagueClientDeps, identity: Identity, id: string, action: ClubAction) => ask<{ view: ClubView }>(deps, identity, 'POST', `/api/leagues/${id}/club`, action)

/** Mercado entre técnicos (B8.6): consultas e decisões. A recusa vem como `trade-refused` com o motivo em `detail`. */
type TradeBodyOut = Omit<Extract<TradeReply, { ok: true }>, 'ok'>
export const tradeBody = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<TradeBodyOut>(deps, identity, 'GET', `/api/leagues/${id}/trade`)
export const tradeSquad = (deps: LeagueClientDeps, identity: Identity, id: string, teamId: string) => ask<TradeBodyOut>(deps, identity, 'GET', `/api/leagues/${id}/trade-squad?team=${encodeURIComponent(teamId)}`)
export const tradeFree = (deps: LeagueClientDeps, identity: Identity, id: string, position?: string) => ask<TradeBodyOut>(deps, identity, 'GET', `/api/leagues/${id}/trade-free${position ? `?pos=${encodeURIComponent(position)}` : ''}`)
export const tradeOffer = (deps: LeagueClientDeps, identity: Identity, id: string, o: { kind: 'purchase' | 'loan'; playerId: string; fee: number; salary: number; contractEnd: string }) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-offer`, o)
export const tradeRespond = (deps: LeagueClientDeps, identity: Identity, id: string, offerId: string, type: 'accept' | 'decline' | 'counter', fee?: number) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-respond`, { offerId, type, ...(fee !== undefined ? { fee } : {}) })
export const tradeWithdraw = (deps: LeagueClientDeps, identity: Identity, id: string, offerId: string) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-withdraw`, { offerId })
export const tradeSign = (deps: LeagueClientDeps, identity: Identity, id: string, o: { playerId: string; salary: number; contractEnd: string }) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-sign`, o)
export const tradeReport = (deps: LeagueClientDeps, identity: Identity, id: string, recordId: string, reason: TradeReport['reason']) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-report`, { recordId, reason })
export type { TradeOp }

/** Vender, anunciar e pré-contrato (pendências antes do lançamento). */
export const tradeMine = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<TradeBodyOut>(deps, identity, 'GET', `/api/leagues/${id}/trade-mine`)
export const tradeBuyers = (deps: LeagueClientDeps, identity: Identity, id: string, playerId: string, kind: 'purchase' | 'loan') => ask<TradeBodyOut>(deps, identity, 'GET', `/api/leagues/${id}/trade-buyers?player=${encodeURIComponent(playerId)}&kind=${kind}`)
export const tradePre = (deps: LeagueClientDeps, identity: Identity, id: string, f: { query?: string; position?: string }) => {
  const p = new URLSearchParams()
  if (f.query) p.set('q', f.query)
  if (f.position) p.set('pos', f.position)
  const q = p.toString()
  return ask<TradeBodyOut>(deps, identity, 'GET', `/api/leagues/${id}/trade-pre${q ? `?${q}` : ''}`)
}
export const tradeList = (deps: LeagueClientDeps, identity: Identity, id: string, o: { playerId: string; kind: 'transfer' | 'loan'; price: number }) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-list`, o)
export const tradeUnlist = (deps: LeagueClientDeps, identity: Identity, id: string, playerId: string) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-unlist`, { playerId })
export const tradeSell = (deps: LeagueClientDeps, identity: Identity, id: string, o: { playerId: string; buyerId: string; kind: 'purchase' | 'loan'; fee: number }) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-sell`, o)
export const tradePreOffer = (deps: LeagueClientDeps, identity: Identity, id: string, o: { playerId: string; salary: number; years: number }) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-pre-offer`, o)

/** Mercado com os clubes da IA (B8.6b): busca com filtros, anúncios, minhas propostas e as da IA. */
export const tradeSearch = (deps: LeagueClientDeps, identity: Identity, id: string, f: AiSearchFilters) => {
  const p = new URLSearchParams()
  if (f.query) p.set('q', f.query)
  if (f.group) p.set('group', f.group)
  if (f.position) p.set('pos', f.position)
  if (f.situation) p.set('sit', f.situation)
  if (f.tier) p.set('tier', String(f.tier))
  if (f.ageMax !== undefined) p.set('age', String(f.ageMax))
  if (f.valueMax !== undefined) p.set('value', String(f.valueMax))
  if (f.overallMin !== undefined) p.set('ovr', String(f.overallMin))
  if (f.quick && f.quick.length > 0) p.set('quick', f.quick.join(','))
  if (f.sort) p.set('sort', f.sort)
  const q = p.toString()
  return ask<TradeBodyOut>(deps, identity, 'GET', `/api/leagues/${id}/trade-search${q ? `?${q}` : ''}`)
}
export const tradeListings = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<TradeBodyOut>(deps, identity, 'GET', `/api/leagues/${id}/trade-listings`)
export const tradeAi = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<TradeBodyOut>(deps, identity, 'GET', `/api/leagues/${id}/trade-ai`)
export const tradeAiOffer = (deps: LeagueClientDeps, identity: Identity, id: string, o: { kind: 'purchase' | 'loan' | 'free'; playerId: string; fee: number; salary: number; contractEnd: string }) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-ai-offer`, o)
export const tradeAiRespond = (deps: LeagueClientDeps, identity: Identity, id: string, offerId: string, accept: boolean) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-ai-respond`, { offerId, accept })
export const tradeAiWithdraw = (deps: LeagueClientDeps, identity: Identity, id: string, offerId: string) => ask<TradeBodyOut>(deps, identity, 'POST', `/api/leagues/${id}/trade-ai-withdraw`, { offerId })

/** Denunciar um apelido ou uma liga (B9). */
export const sendReport = (deps: LeagueClientDeps, identity: Identity, body: { kind: 'nickname' | 'league'; target: string; reason: string }) => ask<{ ok: true }>(deps, identity, 'POST', '/api/report', body)

/** As copas do mundo da liga e o caminho do meu clube nelas (B8.8). */
export const cupsState = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<{ cups: CupsBody }>(deps, identity, 'GET', `/api/leagues/${id}/cups`)
