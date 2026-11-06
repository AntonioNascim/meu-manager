/**
 * Cliente das ligas online (Fase 6, B8.3). Puro: `fetch`, relógio e sorteio entram por parâmetro. Cada pedido é assinado com a identidade do aparelho.
 * Os erros do servidor chegam como `{ ok: false, error, ... }` com o mesmo código que `leagueApi.ts` usa (a tela traduz com `LEAGUE_ERROR_LABELS`).
 */
import type { Identity } from './identity'
import { signedCall, type IdentityClientDeps } from './identityClient'
import type { LeagueDetail, LeagueSummary, LeagueError, AdminAction, WorldRef, LeagueStateBody, ControlAction } from './leagueApi'
import type { PaceId } from '../engine/league/pace'
import type { ClubAction, ClubView } from '../engine/league/club'

export type LeagueClientDeps = IdentityClientDeps

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

/** O clube do técnico: meta, contratos que vencem e base (B8.7). */
export const clubState = (deps: LeagueClientDeps, identity: Identity, id: string) => ask<{ view: ClubView }>(deps, identity, 'GET', `/api/leagues/${id}/club`)

/** Renovar um contrato, promover ou dispensar um jovem da base (B8.7). */
export const clubDecision = (deps: LeagueClientDeps, identity: Identity, id: string, action: ClubAction) => ask<{ view: ClubView }>(deps, identity, 'POST', `/api/leagues/${id}/club`, action)
