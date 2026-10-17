/**
 * Economia por liga (B5): o índice de receita da liga do clube (`Team.economy`, Brasil = 1) escala as receitas, os salários e
 * os preços de transferência. Sem `economy` o clube é brasileiro e nada muda em relação ao jogo de uma liga só.
 */
import { LEAGUE } from './config'
import type { LeagueEconomy, Team } from './types'

export const BRAZIL_ECONOMY: LeagueEconomy = { revenue: 1, level: 0 }

/** Só o que a economia lê do clube (sem série, vale a Série A). */
type EconomyTeam = Partial<Pick<Team, 'tier' | 'economy'>>

/** Índice de receita da liga do clube (Brasil = 1). */
export const leagueRevenue = (team: Pick<Team, 'economy'>): number => team.economy?.revenue ?? 1

/** Pontos de força que os jogadores da liga têm a mais (ou a menos) que os do Brasil. */
export const leagueLevel = (team: Pick<Team, 'economy'>): number => team.economy?.level ?? 0

/** Nível dos jogadores da divisão do clube em relação à Série A brasileira (liga + divisão). */
export const clubLevel = (team: EconomyTeam): number => leagueLevel(team) + (LEAGUE.tierLevel[team.tier ?? 1] ?? 0)

/** Quanto a mais o vendedor pede de um comprador de liga mais rica (1 = nada). */
export function exportPremium(seller: EconomyTeam, buyer: EconomyTeam): number {
  const ratio = leagueRevenue(buyer) / leagueRevenue(seller)
  return ratio > 1 ? 1 + LEAGUE.exportPremium * Math.log2(ratio) : 1
}

/** Receita da divisão do clube em relação à Série A brasileira: índice da liga × razão da divisão. */
export const divisionRevenue = (team: EconomyTeam): number => leagueRevenue(team) * (LEAGUE.tierRevenue[team.tier ?? 1] ?? 1)

/** Fator dos salários que o clube paga. */
export const salaryScale = (team: EconomyTeam): number => leagueRevenue(team) ** LEAGUE.salaryExponent * (LEAGUE.salaryTierScale[team.tier ?? 1] ?? 1)

/** Fator dos preços de transferência que o clube pede. */
export const valueScale = (team: EconomyTeam): number => divisionRevenue(team) ** LEAGUE.valueExponent
