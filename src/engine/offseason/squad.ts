/** Composição do elenco: núcleo mínimo por posição, desfalques e corte de folha da IA. */
import { FINANCE, MARKET } from '../config'
import { monthlyPayroll } from '../finance'
import { squadRole } from '../market/value'
import { playerOverall } from '../overall'
import { POSITIONS, SQUAD_MAX, SQUAD_MIN } from '../types'
import type { Player, Position } from '../types'

/** Elenco mínimo por posição que a base repõe (os 24 do núcleo do gerador de times). */
export const CORE_COUNTS: Record<Position, number> = { GK: 2, RB: 2, LB: 2, CB: 3, DM: 3, CM: 3, AM: 2, RW: 2, LW: 2, ST: 3 }

/** Elenco que a IA quer ter, pela reputação (24 a 30). */
export const desiredSquadSize = (reputation: number): number => Math.min(SQUAD_MAX, Math.max(24, Math.round(24 + ((reputation - 3) / 16) * 6)))

/** Posições em que o elenco tem menos jogadores que o núcleo mínimo. */
export function positionDeficits(squad: readonly Pick<Player, 'position'>[]): Position[] {
  const deficits: Position[] = []
  for (const position of POSITIONS) {
    const have = squad.filter((p) => p.position === position).length
    for (let i = have; i < CORE_COUNTS[position]; i++) deficits.push(position)
  }
  return deficits
}

/**
 * Jogadores que a IA libera para a folha voltar a caber na receita: os de maior salário por força entre
 * quem não é peça-chave nem titular, sem deixar posição descoberta nem o elenco abaixo do mínimo.
 */
export function payrollCuts(squad: readonly Player[], sustainable: number, balance: number): Player[] {
  const out: Player[] = []
  const remaining = [...squad]
  const limit = sustainable * FINANCE.payrollCutMargin
  // Clube com caixa folgado aguenta a folha acima da sustentável por muitos anos: só corta quem ficaria sem fôlego.
  const deficitPerYear = (monthlyPayroll(remaining) - sustainable) * 12
  if (deficitPerYear <= 0 || balance > deficitPerYear * FINANCE.cutRunwayYears) return out
  while (monthlyPayroll(remaining) > limit && remaining.length > SQUAD_MIN) {
    const counts = new Map<Position, number>()
    for (const p of remaining) counts.set(p.position, (counts.get(p.position) ?? 0) + 1)
    const candidate = remaining
      .filter((p) => {
        const role = squadRole(p, remaining)
        return (role === 'rotation' || role === 'surplus') && (counts.get(p.position) ?? 0) > Math.max(MARKET.minByPosition[p.position] ?? 1, 2)
      })
      .sort((a, b) => b.contract.salary / (playerOverall(b) ** 2) - a.contract.salary / (playerOverall(a) ** 2))[0]
    if (!candidate) break
    out.push(candidate)
    remaining.splice(remaining.indexOf(candidate), 1)
  }
  return out
}
