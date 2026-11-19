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

/** Grupos da biblioteca de exercícios do treino por dia. */
export const DRILL_GROUPS = ['games', 'build-up', 'press-block', 'attack', 'final-pass', 'set-pieces', 'body-mind'] as const
export type DrillGroup = (typeof DRILL_GROUPS)[number]

/** Exercícios do treino por dia (o catálogo com os números fica em `engine/training/drills.ts`). */
export const DRILL_IDS = [
  'full-match',
  'eight-a-side',
  'six-a-side',
  'five-a-side',
  'joker-possession',
  'three-a-side',
  'rondo',
  'build-from-back',
  'keeper-start',
  'midfield-pivot',
  'wide-exit',
  'high-press-trigger',
  'mid-block',
  'low-block',
  'counter-press',
  'overlap-crosses',
  'one-two-wall',
  'finishing-box',
  'counter-run',
  'through-balls',
  'cutback',
  'third-man',
  'long-diagonal',
  'corners-for',
  'corners-against',
  'free-kicks',
  'penalty-shootout',
  'conditioning-circuit',
  'speed-agility',
  'strength-circuit',
  'recovery-session',
  'video-session',
] as const
export type DrillId = (typeof DRILL_IDS)[number]

/** Temas que a semana ensaia (os medidores "o que foi ensaiado": só informam, não entram em nenhuma conta do jogo). */
export const DRILL_THEMES = ['build-up', 'press', 'block', 'attack', 'transitions', 'set-piece'] as const
export type DrillTheme = (typeof DRILL_THEMES)[number]

/** O que o time faz num dia de treino: um exercício (ou folga) com a intensidade escolhida. */
export interface TrainingSession {
  drill: DrillId | 'rest'
  intensity: TrainingIntensity
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
  /**
   * Agenda do treino por dia (time → data → sessão). Só times com técnico escolhem; um dia sem sessão segue o plano do time. Redistribui o
   * ganho já calibrado (nunca soma): sem agenda o treino é exatamente o de antes.
   */
  agenda?: Record<TeamId, Record<IsoDate, TrainingSession>>
  /** Times cujo técnico pediu "Delegar sempre": a comissão monta a semana sozinha quando o técnico não montou. */
  delegateAlways?: Record<TeamId, true>
}

export const emptyTraining = (): TrainingState => ({ plans: {}, individual: {}, finished: {}, history: {} })
