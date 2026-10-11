/** Constantes de balanceamento do motor. Mexer só aqui, nunca espalhado pelo código. */

/** Escala dos atributos visíveis, ocultos e da força geral (inteiros). A reputação dos times continua de 1 a 20. */
export const ATTRIBUTE_MIN = 1
export const ATTRIBUTE_MAX = 100

/**
 * Multiplicador da força de um jogador conforme a posição em que joga.
 * São proporções, então valem em qualquer escala (ex.: 80 de força vira 60 improvisado).
 */
export const POSITION_FIT = {
  /** Posição secundária: penalidade pequena (80 vira ~74). */
  secondary: 0.93,
  /** Posição que não é a principal nem secundária (80 vira 60). */
  outOfPosition: 0.75,
  /** Goleiro na linha ou jogador de linha no gol (80 vira 24). */
  goalkeeperMismatch: 0.3,
} as const

/** Quantos reservas entram no banco ao montar a escalação automática. */
export const BENCH_SIZE = 7

/**
 * Escalação automática: formações com pontuação até esta fração abaixo da melhor
 * são consideradas equivalentes (a IA sorteia entre elas para variar).
 */
export const FORMATION_TIE_TOLERANCE = 0.005
