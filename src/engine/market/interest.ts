/**
 * Interesse de um jogador em vir para o time do jogador, pelas mesmas regras de aceitação das propostas
 * (`playerDecision`): quanto salário ele precisaria receber em relação ao que a força dele espera.
 */
import { MARKET } from '../config'
import type { SeasonState } from '../season/calendar'
import type { OfferKind, Player, Team, TeamId } from '../types'
import { playerDecision } from './decision'
import { expectedSalary } from './value'

export type InterestLevel = 'none' | 'low' | 'medium' | 'high'

export interface InterestContext {
  buyer: Team
  buyerSquad: Player[]
  teams: Map<TeamId, Team>
  squads: Map<TeamId, Player[]>
}

/** Agrupa times e elencos uma vez, para avaliar o interesse de muitos jogadores. */
export function interestContext(state: Pick<SeasonState, 'teams' | 'players'>, buyerId: TeamId): InterestContext {
  const squads = new Map<TeamId, Player[]>()
  for (const p of state.players) {
    if (!p.teamId) continue
    const list = squads.get(p.teamId)
    if (list) list.push(p)
    else squads.set(p.teamId, [p])
  }
  const teams = new Map(state.teams.map((t) => [t.id, t]))
  return { buyer: teams.get(buyerId) as Team, buyerSquad: squads.get(buyerId) ?? [], teams, squads }
}

export interface Interest {
  level: InterestLevel
  /** Salário mínimo que ele aceitaria (null: com salário nenhum). */
  minimumSalary: number | null
}

/** Quanto o jogador quer vir: nenhum (não vem nem com salário alto), baixo, médio ou alto. */
export function interestIn(ctx: InterestContext, player: Player, kind: OfferKind = 'purchase'): Interest {
  const from = player.teamId ? (ctx.teams.get(player.teamId) ?? null) : null
  const verdict = playerDecision({
    player,
    buyer: ctx.buyer,
    buyerSquad: ctx.buyerSquad,
    from,
    ...(player.teamId ? { fromSquad: ctx.squads.get(player.teamId) ?? [] } : {}),
    salary: expectedSalary(player),
    kind,
  })
  if (verdict.minimumSalary === null) return { level: 'none', minimumSalary: null }
  const ratio = verdict.minimumSalary / expectedSalary(player)
  const t = MARKET.interest
  const level: InterestLevel = ratio <= t.high ? 'high' : ratio <= t.medium ? 'medium' : ratio <= t.low ? 'low' : 'none'
  return { level, minimumSalary: verdict.minimumSalary }
}
