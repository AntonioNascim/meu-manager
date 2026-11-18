/**
 * Olheiro do clube. Funções puras: recebem o clube e devolvem outro. O nível 0 é o de sempre (sem custo nem informação extra); os níveis 1 a 3
 * custam uma parcela da receita mensal esperada (`SCOUT.costShare`), cobrada no fechamento do mês, e a troca de nível só vale a partir daí.
 */
import { SCOUT } from './config'
import { expectedAnnualRevenue } from './finance'
import type { ScoutLevel, Team } from './types'

export const SCOUT_LEVELS: readonly ScoutLevel[] = [0, 1, 2, 3]

export const isScoutLevel = (v: unknown): v is ScoutLevel => v === 0 || v === 1 || v === 2 || v === 3

/** Nível em vigor hoje (ausente = 0). */
export const scoutLevelOf = (team: Pick<Team, 'scouting'> | undefined): ScoutLevel => team?.scouting?.level ?? 0

/** Nível escolhido para o próximo mês. */
export const scoutNextOf = (team: Pick<Team, 'scouting'> | undefined): ScoutLevel => team?.scouting?.next ?? 0

/** Custo mensal do nível: parcela da receita mensal esperada do clube, arredondada a R$ 1.000. */
export function scoutCost(team: Team, level: ScoutLevel): number {
  const share = SCOUT.costShare[level] ?? 0
  return share === 0 ? 0 : Math.round((expectedAnnualRevenue(team) / 12 * share) / 1_000) * 1_000
}

/** Escolhe o nível do próximo mês (o de hoje não muda até o fechamento do mês). */
export function setScoutingLevel(team: Team, level: ScoutLevel): Team {
  if (!isScoutLevel(level)) throw new Error('Nível de olheiro inválido')
  const current = scoutLevelOf(team)
  if (level === 0 && current === 0) {
    const { scouting: _drop, ...rest } = team
    void _drop
    return rest
  }
  return { ...team, scouting: { level: current, next: level } }
}

/** Fechamento do mês: o nível escolhido passa a valer. Devolve o clube e o custo do mês (0 sem olheiro). */
export function applyScouting(team: Team): { team: Team; cost: number; level: ScoutLevel } {
  if (!team.scouting) return { team, cost: 0, level: 0 }
  const level = team.scouting.next
  if (level === 0) {
    const { scouting: _drop, ...rest } = team
    void _drop
    return { team: rest, cost: 0, level: 0 }
  }
  return { team: { ...team, scouting: { level, next: level } }, cost: scoutCost(team, level), level }
}
