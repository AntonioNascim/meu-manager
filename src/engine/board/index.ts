/**
 * Diretoria: avalia o técnico a partir da classificação (derivada), da meta e das finanças.
 * Nada daqui é guardado: a confiança é recalculada a cada consulta.
 */
import { BOARD } from '../config'
import type { BoardEvaluation, BoardObjective, BoardStatus, DismissalReason, StandingRow } from '../types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Pontos por jogo que se espera de quem termina na posição dada (1 = melhor). */
export function expectedPointsPerGame(position: number, teamCount: number): number {
  const { first, last } = BOARD.pointsPerGame
  const t = teamCount <= 1 ? 0 : clamp((position - 1) / (teamCount - 1), 0, 1)
  return first + (last - first) * t
}

export interface BoardInput {
  objective: BoardObjective
  /** Linha do time na classificação (indefinida antes de qualquer jogo). */
  row?: Pick<StandingRow, 'played' | 'points'> | undefined
  /** Posição atual na liga. */
  position: number
  teamCount: number
  /** Jogos da temporada inteira (para saber se acabou). */
  totalGames: number
  balance: number
  /** Folha + operação de um mês. */
  monthlyCost: number
}

const statusOf = (confidence: number): BoardStatus => (confidence < BOARD.dangerBelow ? 'danger' : confidence < BOARD.warningBelow ? 'warning' : 'safe')

export function evaluateBoard(input: BoardInput): BoardEvaluation {
  const { objective, row, position, teamCount, totalGames, balance, monthlyCost } = input
  const played = row?.played ?? 0
  const target = expectedPointsPerGame(objective.targetPosition, teamCount)
  const sacking = expectedPointsPerGame(objective.sackingPosition, teamCount)
  const ppg = played > 0 ? (row?.points ?? 0) / played : target

  // 0 no limite de demissão, 1 na meta; acima de 1, sobe até 100.
  const score = target > sacking ? (ppg - sacking) / (target - sacking) : 1
  let confidence = clamp(BOARD.atSacking + (BOARD.atTarget - BOARD.atSacking) * score, 0, 100)
  // Poucos jogos: a diretoria dá o benefício da dúvida.
  confidence = BOARD.atTarget + (confidence - BOARD.atTarget) * Math.min(1, played / BOARD.judgeAfterGames)
  if (balance < 0) confidence -= BOARD.debtPenaltyMax * Math.min(1, -balance / (BOARD.debtMonths * Math.max(1, monthlyCost)))
  confidence = Math.round(clamp(confidence, 0, 100) * 10) / 10

  let dismissal: DismissalReason | undefined
  if (balance < -BOARD.debtMonths * monthlyCost) dismissal = 'finances'
  else if (played >= BOARD.judgeAfterGames && confidence < BOARD.dismissBelow) dismissal = 'results'
  else if (played >= totalGames && position > objective.sackingPosition) dismissal = 'results'

  return { confidence, status: dismissal ? 'danger' : statusOf(confidence), pointsPerGame: ppg, targetPointsPerGame: target, ...(dismissal ? { dismissal } : {}) }
}
