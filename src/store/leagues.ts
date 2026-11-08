/**
 * Ligas online no aparelho (Fase 6, B8.3): liga o cliente do servidor (`leagueClient`) à conta do aparelho e carrega o mundo da liga (os clubes) para
 * a tela de escolha. O mundo da liga é sempre o mesmo para quem entra: o fictício nasce da semente da liga; o real, do pacote da versão fixada nela.
 */
import { useEffect, useState } from 'react'
import { ONLINE_CONFIG } from '../online/config'
import * as client from '../online/leagueClient'
import type { Answer, CreateLeagueInput } from '../online/leagueClient'
import type { AdminAction, ControlAction, LeagueDetail, LeagueSummary } from '../online/leagueApi'
import type { PaceId } from '../engine/league/pace'
import { loadWorld } from '../data/package/defaultPackage'
import type { CompetitionSetup } from '../engine/season/calendar'
import type { Team } from '../engine/types'
import { loadRealPackage } from '../data/package/realPackage'
import { LiveSession, type SocketLike } from '../online/liveSession'
import { getAccount } from './onlineAccount'

const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n))
const deps = () => ({ base: ONLINE_CONFIG.apiBase, fetchFn: (...args: Parameters<typeof fetch>) => fetch(...args), now: Date.now, randomBytes })

/** Roda um pedido com a identidade do aparelho (sem conta, devolve `unknown-identity`). */
async function withIdentity<T>(call: (identity: NonNullable<ReturnType<typeof getAccount>['account']>['identity']) => Promise<Answer<T>>): Promise<Answer<T>> {
  const account = getAccount().account
  if (!account) return { ok: false, error: 'unknown-identity' }
  return call(account.identity)
}

export const leagueApi = {
  create: (input: CreateLeagueInput) => withIdentity((id) => client.createLeague(deps(), id, input)),
  listOpen: (before?: number) => withIdentity((id) => client.listOpenLeagues(deps(), id, before)),
  mine: () => withIdentity((id) => client.myLeagues(deps(), id)),
  get: (leagueId: string) => withIdentity((id) => client.getLeague(deps(), id, leagueId)),
  resolveCode: (code: string) => withIdentity((id) => client.resolveInviteCode(deps(), id, code)),
  join: (leagueId: string, teamId: string, code?: string) => withIdentity((id) => client.joinLeague(deps(), id, leagueId, teamId, code)),
  leave: (leagueId: string) => withIdentity((id) => client.leaveLeague(deps(), id, leagueId)),
  admin: (leagueId: string, action: AdminAction, playerId?: string) => withIdentity((id) => client.adminLeague(deps(), id, leagueId, action, playerId)),
  state: (leagueId: string) => withIdentity((id) => client.leagueState(deps(), id, leagueId)),
  ready: (leagueId: string, ready: boolean) => withIdentity((id) => client.sendReady(deps(), id, leagueId, ready)),
  control: (leagueId: string, action: ControlAction) => withIdentity((id) => client.controlLeague(deps(), id, leagueId, action)),
  pace: (leagueId: string, pace: PaceId) => withIdentity((id) => client.changePace(deps(), id, leagueId, pace)),
  report: (body: Parameters<typeof client.sendReport>[2]) => withIdentity((id) => client.sendReport(deps(), id, body)),
  tradeBody: (leagueId: string) => withIdentity((id) => client.tradeBody(deps(), id, leagueId)),
  tradeSquad: (leagueId: string, teamId: string) => withIdentity((id) => client.tradeSquad(deps(), id, leagueId, teamId)),
  tradeOffer: (leagueId: string, o: Parameters<typeof client.tradeOffer>[3]) => withIdentity((id) => client.tradeOffer(deps(), id, leagueId, o)),
  tradeRespond: (leagueId: string, offerId: string, type: 'accept' | 'decline' | 'counter', fee?: number) => withIdentity((id) => client.tradeRespond(deps(), id, leagueId, offerId, type, fee)),
  tradeWithdraw: (leagueId: string, offerId: string) => withIdentity((id) => client.tradeWithdraw(deps(), id, leagueId, offerId)),
  tradeReport: (leagueId: string, recordId: string, reason: Parameters<typeof client.tradeReport>[4]) => withIdentity((id) => client.tradeReport(deps(), id, leagueId, recordId, reason)),
  vacancies: (leagueId: string) => withIdentity((id) => client.vacancyList(deps(), id, leagueId)),
  vacancyCreate: (leagueId: string, teamId: string) => withIdentity((id) => client.vacancyCreate(deps(), id, leagueId, teamId)),
  vacancyCancel: (leagueId: string, code: string) => withIdentity((id) => client.vacancyCancel(deps(), id, leagueId, code)),
  liveTicket: (leagueId: string) => withIdentity((id) => client.requestLiveTicket(deps(), id, leagueId)),
}

/** Abre a sessão da partida ao vivo da liga (B8.5): pede um ticket novo a cada conexão e reconecta sozinha. */
export function openLiveSession(leagueId: string): LiveSession {
  return new LiveSession({
    getTicket: async () => {
      const r = await leagueApi.liveTicket(leagueId)
      return r.ok ? { ok: true, ticket: r.ticket } : { ok: false, error: r.error }
    },
    openSocket: (ticket) => new WebSocket(client.liveSocketUrl(ONLINE_CONFIG.apiBase, leagueId, ticket)) as unknown as SocketLike,
    now: Date.now,
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (h) => window.clearTimeout(h as number),
    randomId: () => Array.from(randomBytes(4), (b) => b.toString(16).padStart(2, '0')).join(''),
  })
}

/** Um clube do mundo da liga, com o nome da liga em que joga. */
export interface LeagueTeam {
  team: Team
  competition: string
  tier: number
}

export interface LeagueTeams {
  teams: LeagueTeam[]
  byId: Map<string, LeagueTeam>
}

const cache = new Map<string, LeagueTeams>()

/** Os clubes do mundo da liga. O mundo real baixa o pacote na primeira vez (ou usa a cópia embutida). */
export async function loadLeagueTeams(league: Pick<LeagueSummary, 'id' | 'world' | 'seed'>): Promise<LeagueTeams> {
  const key = `${league.id}`
  const hit = cache.get(key)
  if (hit) return hit
  const world = league.world.source === 'real' ? loadWorld(league.seed, await loadRealPackage()) : loadWorld(league.seed)
  const competitions: CompetitionSetup[] = world.competitions ?? []
  const teams: LeagueTeam[] = []
  if (competitions.length > 0) {
    for (const c of competitions) for (const team of c.teams) teams.push({ team, competition: c.name, tier: c.tier })
  } else {
    for (const team of world.teams) teams.push({ team, competition: team.tier === 1 ? 'Série A' : team.tier === 2 ? 'Série B' : 'Série C', tier: team.tier ?? 1 })
  }
  const out = { teams, byId: new Map(teams.map((t) => [t.team.id, t])) }
  cache.set(key, out)
  return out
}

/** Hook: carrega os clubes da liga uma vez. */
export function useLeagueTeams(league: Pick<LeagueSummary, 'id' | 'world' | 'seed'> | undefined): { data?: LeagueTeams; error?: string } {
  const [state, setState] = useState<{ data?: LeagueTeams; error?: string }>({})
  const id = league?.id
  useEffect(() => {
    if (!league) return
    let alive = true
    loadLeagueTeams(league)
      .then((data) => alive && setState({ data }))
      .catch(() => alive && setState({ error: 'Não foi possível carregar os clubes deste mundo. Confira a internet.' }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  return state
}

export type { LeagueDetail, LeagueSummary }
