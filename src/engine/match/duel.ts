import { MATCH } from '../config'

/**
 * Fórmula do duelo: chance = 1 / (1 + e^(−k × (ataque − defesa))).
 * `offset` desloca a curva por tipo de jogada (calibragem): com ataque = defesa a chance é
 * 50% sem deslocamento, menos com deslocamento negativo.
 */
export function duelChance(attack: number, defense: number, offset = 0, k: number = MATCH.duelK): number {
  return 1 / (1 + Math.exp(-(k * (attack - defense) + offset)))
}
