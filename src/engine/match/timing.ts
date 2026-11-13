/**
 * Câmera lenta e tempo de cada minuto da partida (Fase 6C, C5). As regras moravam na tela (`pitchModel.ts`); agora o servidor da liga online precisa
 * calcular a mesma espera para o relógio de cada partida, então elas vivem aqui, puras, e a tela as reexporta.
 */
import type { MatchEvent } from '../types'
import type { PlayTrace } from './state'

/** Duração (ms) da animação de cada tipo de lance; o relógio da partida espera esse tempo (`holdFor`). */
export const HOLD_MS = { goal: 3000, shot: 2000, card: 2000, setPiece: 1000, corner: 1500 } as const

/**
 * Duração de um minuto de jogo na velocidade 1x (ms): a mesma do jogo solo e da liga online. Era 700; passou a 1.600 (Fase 6D) para os lances do campo
 * 2D (vários passes curtos por momento) poderem ser vistos. Os outros ficam proporcionais: 2x = 800, 4x = 400, 8x = 200.
 */
export const BASE_MINUTE_MS = 1600
/** Cada passo da animação precisa disto para ser visto; se o tempo do lance não dá para todos, os do meio são omitidos (`fitBeats`). */
export const MIN_BEAT_MS = 260

/** Quanto o campo demora num momento: o gol e a finalização passam devagar; o resto segue o ritmo da velocidade. */
export const slowFor = (trace: PlayTrace): number => {
  if (!trace.shot) return 0
  // Pênalti e falta perigosa têm a preparação (barreira, marca) antes da cobrança: um segundo a mais.
  const extra = trace.shot.type === 'penalty' || trace.shot.type === 'freeKick' ? HOLD_MS.setPiece : 0
  return (trace.shot.result === 'goal' ? HOLD_MS.goal : HOLD_MS.shot) + extra
}

/** Quanto o relógio espera depois de um passo, pelos lances e eventos novos (0 quando nada pede câmera lenta). */
export function holdFor(traces: readonly PlayTrace[], events: readonly MatchEvent[]): number {
  let hold = 0
  for (const t of traces) hold = Math.max(hold, slowFor(t))
  for (const e of events) {
    if (e.type === 'goal' || e.type === 'own-goal') hold = Math.max(hold, HOLD_MS.goal)
    else if (e.type === 'yellow-card' || e.type === 'red-card') hold = Math.max(hold, HOLD_MS.card)
    else if (e.type === 'corner') hold = Math.max(hold, HOLD_MS.corner)
  }
  return hold
}
