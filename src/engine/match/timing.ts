/**
 * Câmera lenta e tempo de cada minuto da partida (Fase 6C, C5). As regras moravam na tela (`pitchModel.ts`); agora o servidor da liga online precisa
 * calcular a mesma espera para o relógio de cada partida, então elas vivem aqui, puras, e a tela as reexporta.
 */
import type { MatchEvent } from '../types'
import type { PlayTrace } from './state'

/** Duração (ms) da animação de cada tipo de lance; o relógio da partida espera esse tempo (`holdFor`). */
export const HOLD_MS = { goal: 3000, shot: 2000, card: 2000, setPiece: 1000, corner: 2400, goalKick: 1800, restart: 1800, penalty: 1800 } as const

/** As cenas de bola parada (tiro de meta, pênalti, escanteio, saída depois do gol) ficam mais curtas no 2x. */
export const sceneScale = (speed: number): number => (speed >= 2 ? 0.5 : 1)

/**
 * Duração de um minuto de jogo na velocidade 1x (ms): a mesma do jogo solo e da liga online. Era 700; passou a 1.600 (Fase 6D) para os lances do campo
 * 2D (vários passes curtos por momento) poderem ser vistos. Os outros ficam proporcionais: 2x = 800, 4x = 400, 8x = 200.
 */
export const BASE_MINUTE_MS = 800
/** Cada passo da animação precisa disto para ser visto; se o tempo do lance não dá para todos, os do meio são omitidos (`fitBeats`). */
export const MIN_BEAT_MS = 260

/** Quanto o campo demora num momento: o gol e a finalização passam devagar; o resto segue o ritmo da velocidade. */
export const slowFor = (trace: PlayTrace, speed = 1, corner = false): number => {
  const scale = sceneScale(speed)
  if (!trace.shot) return corner ? HOLD_MS.corner * scale : 0
  const s = trace.shot
  // Pênalti (jogadores saem da área, bola na marca, goleiro na linha) e falta perigosa (barreira) têm a preparação antes da cobrança.
  const prep = s.type === 'penalty' ? HOLD_MS.penalty * scale : s.type === 'freeKick' ? HOLD_MS.setPiece : 0
  // Depois do chute: a saída de bola depois do gol, o tiro de meta depois de um chute para fora, o escanteio depois da defesa.
  const after = s.result === 'goal' ? HOLD_MS.restart * scale : s.result === 'off-target' ? HOLD_MS.goalKick * scale : corner ? HOLD_MS.corner * scale : 0
  return (s.result === 'goal' ? HOLD_MS.goal : HOLD_MS.shot) + prep + after
}

/** Quanto o relógio espera depois de um passo, pelos lances e eventos novos (0 quando nada pede câmera lenta). */
export function holdFor(traces: readonly PlayTrace[], events: readonly MatchEvent[], speed = 1): number {
  let hold = 0
  for (const t of traces) hold = Math.max(hold, slowFor(t, speed, events.some((e) => e.type === 'corner' && e.minute === t.minute)))
  for (const e of events) {
    if (e.type === 'goal' || e.type === 'own-goal') hold = Math.max(hold, HOLD_MS.goal)
    else if (e.type === 'yellow-card' || e.type === 'red-card') hold = Math.max(hold, HOLD_MS.card)
    else if (e.type === 'corner') hold = Math.max(hold, HOLD_MS.corner * sceneScale(speed))
  }
  return hold
}
