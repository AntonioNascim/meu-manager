import type { IsoDate } from './common'

/** Situação do técnico perante a diretoria (rótulos em `labels.ts`). */
export type BoardStatus = 'safe' | 'warning' | 'danger'

/** Por que o técnico foi demitido (rótulos em `labels.ts`). */
export type DismissalReason = 'results' | 'finances'

export interface BoardEvaluation {
  /** Confiança da diretoria no técnico, de 0 a 100. */
  confidence: number
  status: BoardStatus
  /** Pontos por jogo até agora e o que a meta pede (para a tela explicar). */
  pointsPerGame: number
  targetPointsPerGame: number
  /** Preenchido quando a diretoria demitiria o técnico agora. */
  dismissal?: DismissalReason
}

export interface Dismissal {
  date: IsoDate
  reason: DismissalReason
  confidence: number
  /** Posição na liga no dia da demissão. */
  position: number
}
