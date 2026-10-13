import type { IsoDate, PlayerId, TeamId } from './common'
import type { Position } from './player'

export const TRAINING_INTENSITIES = ['light', 'normal', 'intense'] as const
export type TrainingIntensity = (typeof TRAINING_INTENSITIES)[number]

export const TRAINING_FOCUSES = ['balanced', 'physical', 'technical', 'defensive', 'offensive'] as const
export type TrainingFocus = (typeof TRAINING_FOCUSES)[number]

/** Grupos de atributos que o treino individual pode acelerar (o de goleiro só vale para goleiros). */
export const TRAINING_GROUPS = ['technical', 'physical', 'mental', 'goalkeeper'] as const
export type TrainingGroup = (typeof TRAINING_GROUPS)[number]

/** Treino coletivo da semana: intensidade e foco. */
export interface TrainingPlan {
  intensity: TrainingIntensity
  focus: TrainingFocus
}

/** O que o treino individual busca: acelerar um grupo de atributos ou aprender uma posição secundária. */
export type IndividualGoal = { type: 'group'; group: TrainingGroup } | { type: 'position'; position: Position }

/** A vaga de treino individual de um time (um jogador por vez). */
export interface IndividualTraining {
  playerId: PlayerId
  goal: IndividualGoal
  startDate: IsoDate
  /** Dias que faltam e dias do treino inteiro. */
  daysLeft: number
  totalDays: number
}

/** Treino individual que acabou de terminar (fica guardado para a tela avisar). */
export interface FinishedTraining {
  playerId: PlayerId
  goal: IndividualGoal
  date: IsoDate
}

/** Força do jogador no começo de um mês: `[data, força]`. */
export type StrengthSnapshot = [date: IsoDate, overall: number]

/** Estado do treino na temporada (dado puro). */
export interface TrainingState {
  /** Plano de cada time que escolheu um; os demais usam a escolha automática da IA pelo calendário. */
  plans: Record<TeamId, TrainingPlan>
  /** Vaga de treino individual por time. */
  individual: Record<TeamId, IndividualTraining>
  finished: Record<TeamId, FinishedTraining>
  /** Histórico mensal da força dos jogadores do time do jogador. */
  history: Record<PlayerId, StrengthSnapshot[]>
}

export const emptyTraining = (): TrainingState => ({ plans: {}, individual: {}, finished: {}, history: {} })
