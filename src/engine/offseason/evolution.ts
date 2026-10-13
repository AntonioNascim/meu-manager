/**
 * Envelhecimento e evolução dos jogadores. O crescimento vem aos poucos pelo treino da temporada (`engine/training`); a virada cuida do envelhecimento e do declínio.
 *
 * A curva média é a mesma que a geração do mundo usa (jovens ganham ~2 pontos por ano até os 22, o auge
 * é plano, o físico cai depois dos 30 e a leitura de jogo sobe até os ~32), para o nível do campeonato
 * não subir nem descer com os anos. O potencial separa quem cresce mais do que a média de quem cresce menos.
 */
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN, OFFSEASON } from '../config'
import { playerOverall } from '../overall'
import type { Rng } from '../rng'
import { ATTRIBUTE_NAMES } from '../types'
import type { AttributeName, Attributes, Player } from '../types'

const E = OFFSEASON.evolution
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Arredonda sorteando para cima com a probabilidade da parte fracionária (mantém a média). */
export function stochasticRound(rng: Rng, value: number): number {
  const floor = Math.floor(value)
  return floor + (rng.chance(value - floor) ? 1 : 0)
}

/** Ganho médio do jogador de `age` anos neste ano, em pontos em todos os atributos (antes do ruído). */
export function yearlyGain(age: number, overall: number, potential: number): number {
  if (age >= E.growthUntil) return 0
  const base = age < E.youthUntil ? E.youthGain : 0
  // Quem tem mais potencial do que o jogador médio da idade cresce além da curva média; quem tem menos, fica abaixo.
  const H = E.highPotential
  const matureGap = E.maturePotentialGap * clamp((H.top - potential) / (H.top - H.from), H.minShare, 1)
  const averageGap = matureGap + E.youthGain * Math.max(0, E.youthUntil - age)
  const bonus = (E.potentialPull * (potential - overall - averageGap)) / (E.growthUntil + 1 - age)
  return Math.max(0, base + bonus)
}

export const PHYSICAL_PACE: readonly AttributeName[] = ['pace', 'stamina']
const MENTAL: readonly AttributeName[] = ['vision', 'positioning', 'decisions', 'determination']
const TECHNICAL: readonly AttributeName[] = ['passing', 'finishing', 'dribbling', 'crossing', 'tackling', 'heading', 'ballControl']

/** Fator de desenvolvimento de quem joga mais: 0,8 + 0,4 × fração dos minutos, ajustado pelo profissionalismo (±10%). */
export function developmentFactor(player: Player, minutesShare: number): number {
  const development = E.minutesBase + E.minutesWeight * clamp(minutesShare, 0, 1)
  const professionalism = 1 + E.professionalismWeight * ((player.hidden.professionalism - 60) / 40)
  return development * professionalism
}

/** Ganho médio por ano em todos os atributos, sem ruído: é o ritmo de evolução da temporada (o treino reparte isso pelos dias). */
export function growthPerYear(player: Player, minutesShare: number): number {
  const gain = yearlyGain(player.age, playerOverall(player), player.hidden.potential)
  return gain > 0 ? Math.min(gain * developmentFactor(player, minutesShare), Math.max(0, player.hidden.potential - playerOverall(player))) : 0
}

/**
 * Ganho do ano em uma tacada só (o que a virada fazia antes do treino semanal). O jogo não usa mais isto na virada;
 * serve de referência de quanto o treino Normal precisa render por temporada.
 */
export function annualGain(rng: Rng, player: Player, minutesShare: number): number {
  const overall = playerOverall(player)
  const potential = player.hidden.potential
  const gain = yearlyGain(player.age, overall, potential) + rng.normal(0, E.playerNoise)
  return gain > 0 ? Math.min(gain * developmentFactor(player, minutesShare), Math.max(0, potential - overall)) : gain
}

/**
 * Um ano a mais: idade, declínio dos veteranos, ruído dos atributos e zeragem da condição e das estatísticas.
 * `gain` é o ganho de crescimento a aplicar agora em todos os atributos: na virada do jogo é 0, porque o
 * crescimento já veio aos poucos pelo treino da temporada.
 */
export function ageOneYear(rng: Rng, player: Player, gain: number): Player {
  const age = player.age
  const potential = player.hidden.potential
  const attributes = { ...player.attributes } as Attributes
  for (const name of ATTRIBUTE_NAMES) {
    if ((name === 'reflexes' || name === 'rushingOut') && player.position !== 'GK') continue
    let delta = gain + rng.normal(0, E.attributeNoise)
    if (age >= E.declineStartAge) {
      if (PHYSICAL_PACE.includes(name)) delta -= E.paceStaminaDecline
      if (name === 'strength') delta -= E.strengthDecline
    }
    if (MENTAL.includes(name) && age >= E.mentalGainFrom && age < E.mentalGainUntil) delta += E.mentalGainPerYear
    if (TECHNICAL.includes(name) && age >= E.technicalDeclineFrom) delta -= E.technicalDecline
    attributes[name] = clamp(player.attributes[name] + stochasticRound(rng, delta), ATTRIBUTE_MIN, ATTRIBUTE_MAX)
  }

  const evolved: Player = {
    ...player,
    age: age + 1,
    attributes,
    condition: { fitness: 100, morale: 70, form: 0, recentRatings: [], injuryDaysLeft: 0, yellowCards: 0, redCards: 0, suspensionGames: 0 },
    seasonStats: { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, ratingSum: 0, ratedGames: 0, homeGoals: 0, awayGoals: 0, passAssists: 0, crossAssists: 0 },
  }
  const now = playerOverall(evolved)
  return { ...evolved, hidden: { ...player.hidden, potential: clamp(Math.max(potential, Math.round(now)), ATTRIBUTE_MIN, ATTRIBUTE_MAX) } }
}

/** Evolução do ano inteiro de uma vez (crescimento + envelhecimento). Referência para testes; o jogo reparte o crescimento pelo treino. */
export function evolvePlayer(rng: Rng, player: Player, minutesShare: number): Player {
  return ageOneYear(rng, player, annualGain(rng, player, minutesShare))
}

/** O jogador (já com a idade nova) para de jogar? */
export function retires(rng: Rng, player: Player): boolean {
  const r = OFFSEASON.retirement
  if (player.age >= r.forcedAge) return true
  if (player.age <= r.from) return false
  let chance = Math.min(1, (player.age - r.from) * r.perYear)
  if (playerOverall(player) >= r.strongOverall) chance /= 2
  return rng.chance(chance)
}
