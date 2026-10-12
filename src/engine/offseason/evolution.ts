/**
 * Envelhecimento e evolução dos jogadores na virada de temporada.
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
function stochasticRound(rng: Rng, value: number): number {
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

const PHYSICAL_PACE: readonly AttributeName[] = ['pace', 'stamina']
const MENTAL: readonly AttributeName[] = ['vision', 'positioning', 'decisions', 'determination']
const TECHNICAL: readonly AttributeName[] = ['passing', 'finishing', 'dribbling', 'crossing', 'tackling', 'heading', 'ballControl']

/**
 * Um ano a mais: idade, atributos (crescimento ou declínio) e zeragem da condição e das estatísticas.
 * `minutesShare` (0 a 1) é a fração dos minutos possíveis que ele jogou na temporada: quem joga evolui mais.
 */
export function evolvePlayer(rng: Rng, player: Player, minutesShare: number): Player {
  const age = player.age
  const overall = playerOverall(player)
  const potential = player.hidden.potential
  let gain = yearlyGain(age, overall, potential) + rng.normal(0, E.playerNoise)
  if (gain > 0) {
    const development = E.minutesBase + E.minutesWeight * clamp(minutesShare, 0, 1)
    const professionalism = 1 + E.professionalismWeight * ((player.hidden.professionalism - 60) / 40)
    gain = Math.min(gain * development * professionalism, Math.max(0, potential - overall))
  }

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
    seasonStats: { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 },
  }
  const now = playerOverall(evolved)
  return { ...evolved, hidden: { ...player.hidden, potential: clamp(Math.max(potential, Math.round(now)), ATTRIBUTE_MIN, ATTRIBUTE_MAX) } }
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
