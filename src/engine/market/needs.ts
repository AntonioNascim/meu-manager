/**
 * "Onde falta gente" (estudo do concorrente, Parte 9): para cada setor do elenco, se está coberto, no limite ou em falta, e por quê. Só leitura,
 * derivado do elenco e da escalação; **nada entra em conta do jogo**. Funções puras.
 */
import { playerOverall } from '../overall'
import type { PositionGroup } from './search'
import { POSITION_GROUPS } from './search'
import type { Player, Team } from '../types'

export type SectorNeed = 'covered' | 'thin' | 'missing'
export type NeedGroup = Exclude<PositionGroup, 'all'>

export const NEEDS = {
  /** Quantos jogadores o setor precisa ter (mínimo) para ser considerado coberto: goleiro, defesa, meio e ataque. */
  minimum: { GK: 2, DEF: 6, MID: 6, FWD: 4 } as Record<NeedGroup, number>,
  /** Titulares que o setor usa na formação típica (para ver se faltam reservas à altura). */
  starters: { GK: 1, DEF: 4, MID: 3, FWD: 3 } as Record<NeedGroup, number>,
  /** O reserva de um setor é "à altura" se tem força até esta distância da do pior titular dele. */
  reserveGap: 6,
} as const

export interface SectorStatus {
  group: NeedGroup
  need: SectorNeed
  /** Quantos disponíveis (sem lesão grave) e quantos no elenco. */
  available: number
  total: number
  /** Motivo: 'few' (poucos), 'injured' (lesionados cortam o setor), 'weak-bench' (sem reserva à altura). */
  reason?: 'few' | 'injured' | 'weak-bench'
}

export function squadNeeds(team: Pick<Team, 'tactic'>, squad: readonly Player[]): SectorStatus[] {
  const starters = new Set(team.tactic.startingXI)
  return (Object.keys(POSITION_GROUPS) as NeedGroup[]).map((group) => {
    const members = squad.filter((p) => POSITION_GROUPS[group].includes(p.position))
    const available = members.filter((p) => p.condition.injuryDaysLeft === 0 && p.condition.suspensionGames === 0)
    const min = NEEDS.minimum[group]
    const need = NEEDS.starters[group]
    let status: SectorNeed = 'covered'
    let reason: SectorStatus['reason']
    if (members.length < min) {
      status = members.length < min - 1 || (group === 'GK' && members.length < 2) ? 'missing' : 'thin'
      reason = 'few'
    } else if (available.length < need + 1) {
      status = available.length < need ? 'missing' : 'thin'
      reason = 'injured'
    } else {
      const xi = members.filter((p) => starters.has(p.id))
      const worst = Math.min(...(xi.length ? xi : members).map((p) => playerOverall(p)))
      const bench = available.filter((p) => !starters.has(p.id))
      const bestBench = Math.max(0, ...bench.map((p) => playerOverall(p)))
      if (bench.length > 0 && bestBench < worst - NEEDS.reserveGap) {
        status = 'thin'
        reason = 'weak-bench'
      }
    }
    return { group, need: status, available: available.length, total: members.length, ...(reason ? { reason } : {}) }
  })
}
