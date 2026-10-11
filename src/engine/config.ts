/** Constantes de balanceamento do motor. Mexer só aqui, nunca espalhado pelo código. */

/** Multiplicador da força de um jogador conforme a posição em que joga. */
export const POSITION_FIT = {
  /** Posição secundária: penalidade pequena. */
  secondary: 0.93,
  /** Posição que não é a principal nem secundária. */
  outOfPosition: 0.75,
  /** Goleiro na linha ou jogador de linha no gol. */
  goalkeeperMismatch: 0.3,
} as const

/** Quantos reservas entram no banco ao montar a escalação automática. */
export const BENCH_SIZE = 7
