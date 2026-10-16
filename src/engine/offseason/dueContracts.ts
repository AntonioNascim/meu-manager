/**
 * Contratos que terminam no meio da temporada: o contrato acaba no dia da data dele, não na virada. Quem assinou pré-contrato
 * com outro clube muda de clube nesse dia; o resto é renovado pela IA ou vira jogador livre (o do jogador sempre vira livre
 * e ele recebe um aviso). Os contratos que terminam no fim do ano do calendário (31/12 no brasileiro) continuam sendo
 * resolvidos na virada, junto com o resto do fim de temporada.
 */
import { applyPreContracts } from '../market/precontract'
import { createRng } from '../rng'
import type { SeasonState } from '../season/calendar'
import type { IsoDate, MarketNotice, Player, PlayerId, TeamId } from '../types'
import { expireContracts } from './contracts'

export interface DueContractsResult {
  state: SeasonState
  /** Jogadores do time do jogador cujo contrato acabou (já são jogadores livres). */
  notices: MarketNotice[]
  /** Quem trocou de clube por pré-contrato e quem virou livre, para quem quiser registrar. */
  moved: PlayerId[]
  freed: PlayerId[]
  renewed: number
}

/** O contrato acaba em (de, até]? Empréstimos não entram: eles voltam para casa na virada. */
const endsBetween = (from: IsoDate, to: IsoDate) => (p: Player) => p.teamId !== null && !p.contract.loanedFrom && p.contract.endDate > from && p.contract.endDate <= to

export function settleDueContracts(state: SeasonState, from: IsoDate, to: IsoDate, userTeamId?: TeamId): DueContractsResult {
  const due = endsBetween(from, to)
  const nothing: DueContractsResult = { state, notices: [], moved: [], freed: [], renewed: 0 }
  if (to <= from || !state.players.some(due)) return nothing

  const year = state.season.year
  const dueIds = new Set(state.players.filter(due).map((p) => p.id))

  // 1) Pré-contratos de quem vence hoje: o jogador chega ao clube novo com o contrato combinado.
  const pre = applyPreContracts(state.players, state.market.preContracts, year, due)
  const movedIds = new Set(pre.applied.map((a) => a.playerId))

  // 2) O resto: renovação da IA ou jogador livre.
  const rng = createRng(`${state.market.seed}:${to}:contracts`)
  const expired = expireContracts({ players: pre.players, teams: state.teams, year, rng, due: (p) => dueIds.has(p.id) && !movedIds.has(p.id), returnLoans: false, ...(userTeamId ? { userTeamId } : {}) })

  const freedIds = new Set(expired.released.map((r) => r.playerId))
  const squadOf = (teamId: TeamId) => expired.players.filter((p) => p.teamId === teamId).map((p) => p.id)
  const touched = new Set<TeamId>([...pre.applied.flatMap((a) => [a.fromTeamId, a.toTeamId]), ...expired.released.flatMap((r) => (r.teamId ? [r.teamId] : []))])
  const teams = state.teams.map((t) => (touched.has(t.id) ? { ...t, squad: squadOf(t.id) } : t))
  const gone = new Set([...movedIds, ...freedIds])
  const market = {
    ...state.market,
    preContracts: state.market.preContracts.filter((c) => !dueIds.has(c.playerId)),
    listings: state.market.listings.filter((l) => !gone.has(l.playerId)),
    history: [...state.market.history, ...pre.applied.map((a) => ({ date: to, playerId: a.playerId, fromTeamId: a.fromTeamId, toTeamId: a.toTeamId, kind: 'purchase' as const, fee: 0 }))],
  }
  const notices: MarketNotice[] = expired.released.filter((r) => r.teamId === userTeamId).map((r) => ({ type: 'contract-ended', playerId: r.playerId }))
  return { state: { ...state, players: expired.players, teams, market }, notices, moved: [...movedIds], freed: [...freedIds], renewed: expired.renewed }
}
