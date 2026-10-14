/**
 * Valor de mercado e preços: o valor depende da força, da idade, do potencial e do tempo de contrato.
 * O clube pede mais por quem é importante para ele.
 */
import { MARKET } from '../config'
import { overallAt, playerOverall } from '../overall'
import { daysBetween } from '../season/dates'
import type { IsoDate, Player } from '../types'

/** Salário mensal em R$: cresce exponencialmente com a força geral (de 1 a 100). */
export function salaryForOverall(overall: number): number {
  const raw = 8000 * Math.pow(1.33, overall / 5 - 5)
  return Math.max(5000, Math.round(raw / 500) * 500)
}

/** Salário que o jogador espera receber, pela força dele. */
export const expectedSalary = (player: Player): number => salaryForOverall(playerOverall(player))

/** Anos de contrato que faltam na data (0 se já terminou). */
export const yearsLeft = (player: Pick<Player, 'contract'>, date: IsoDate): number => Math.max(0, daysBetween(date, player.contract.endDate) / 365)

function ageFactor(age: number): number {
  for (const [maxAge, factor] of MARKET.value.ageFactors) if (age <= maxAge) return factor
  return MARKET.value.olderFactor
}

const VALUE_CACHE = new WeakMap<Player, { date: IsoDate; value: number }>()

/** Valor de mercado em R$ (arredondado em 10 mil). Guardado por jogador e data: o jogador é imutável, então só muda se virar outro objeto. */
export function marketValue(player: Player, date: IsoDate): number {
  const cached = VALUE_CACHE.get(player)
  if (cached && cached.date === date) return cached.value
  const value = computeMarketValue(player, date)
  VALUE_CACHE.set(player, { date, value })
  return value
}

function computeMarketValue(player: Player, date: IsoDate): number {
  const v = MARKET.value
  const overall = playerOverall(player)
  // Jovem vale pelo que pode vir a ser: o potencial entra com peso que some até os ~27 anos.
  const youth = Math.min(1, Math.max(0, (v.youthUntil + v.youthSpan - player.age) / v.youthSpan))
  const effective = overall + v.potentialWeight * youth * Math.max(0, player.hidden.potential - overall)
  const contract = v.contract.shortestFactor + (1 - v.contract.shortestFactor) * Math.min(1, yearsLeft(player, date) / v.contract.fullYears)
  const raw = v.base * Math.exp(v.perPoint * (effective - v.referenceOverall)) * ageFactor(player.age) * contract
  return Math.max(v.minimum, Math.round(raw / 10_000) * 10_000)
}

export type SquadRole = 'key' | 'starter' | 'rotation' | 'surplus'

/**
 * Importância do jogador no elenco do clube: entre os 3 melhores é peça-chave; entre os 11 melhores
 * é titular; até o 18º, rodízio; depois, sobra.
 */
export function squadRole(player: Player, squad: readonly Player[]): SquadRole {
  const strength = playerOverall(player)
  const better = squad.filter((q) => q.id !== player.id && playerOverall(q) > strength).length
  return better < 3 ? 'key' : better < 11 ? 'starter' : better < 18 ? 'rotation' : 'surplus'
}

/** Mesma regra de `squadRole`, a partir das forças do elenco já em ordem decrescente (para avaliar muitos jogadores do mesmo clube). */
export function squadRoleIn(strength: number, sortedStrengths: readonly number[]): SquadRole {
  // Quantos do elenco são mais fortes que ele (ele mesmo nunca conta).
  let low = 0
  let high = sortedStrengths.length
  while (low < high) {
    const mid = (low + high) >> 1
    if ((sortedStrengths[mid] as number) > strength) low = mid + 1
    else high = mid
  }
  return low < 3 ? 'key' : low < 11 ? 'starter' : low < 18 ? 'rotation' : 'surplus'
}

/** Preço mínimo que o clube pede por um jogador na função `role` do elenco dele. */
export const askingPriceAs = (player: Player, role: SquadRole, date: IsoDate): number => Math.round((marketValue(player, date) * MARKET.ask[role]) / 10_000) * 10_000

/** Preço mínimo que o clube aceita pela venda. */
export function askingPrice(player: Player, squad: readonly Player[], date: IsoDate): number {
  return askingPriceAs(player, squadRole(player, squad), date)
}

/** Taxa de empréstimo até o fim do contrato/empréstimo. */
export const loanFee = (player: Player, date: IsoDate): number => Math.round((marketValue(player, date) * MARKET.loanFeeShare) / 10_000) * 10_000

/** Força efetiva do jogador na posição dele no time (para comparar com os titulares do comprador). */
export const strengthAt = (player: Player): number => overallAt(player, player.position)
