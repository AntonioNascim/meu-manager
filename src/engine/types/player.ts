import type { IsoDate, PlayerId, TeamId } from './common'

export const POSITIONS = ['GK', 'RB', 'LB', 'CB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'] as const
export type Position = (typeof POSITIONS)[number]

export type Foot = 'right' | 'left' | 'both'

export const NATIONALITIES = [
  'Brazil',
  'Argentina',
  'Uruguay',
  'Paraguay',
  'Chile',
  'Colombia',
  'Peru',
  'Ecuador',
] as const
export type Nationality = (typeof NATIONALITIES)[number]

/** Atributos visíveis, escala de 1 a 20. */
export const TECHNICAL_ATTRIBUTES = [
  'passing',
  'finishing',
  'dribbling',
  'crossing',
  'tackling',
  'heading',
  'ballControl',
] as const
export const PHYSICAL_ATTRIBUTES = ['pace', 'stamina', 'strength'] as const
export const MENTAL_ATTRIBUTES = ['vision', 'positioning', 'decisions', 'determination'] as const
export const GOALKEEPER_ATTRIBUTES = ['reflexes', 'rushingOut'] as const

export type TechnicalAttribute = (typeof TECHNICAL_ATTRIBUTES)[number]
export type PhysicalAttribute = (typeof PHYSICAL_ATTRIBUTES)[number]
export type MentalAttribute = (typeof MENTAL_ATTRIBUTES)[number]
export type GoalkeeperAttribute = (typeof GOALKEEPER_ATTRIBUTES)[number]

export type AttributeName =
  | TechnicalAttribute
  | PhysicalAttribute
  | MentalAttribute
  | GoalkeeperAttribute

export const ATTRIBUTE_NAMES: readonly AttributeName[] = [
  ...TECHNICAL_ATTRIBUTES,
  ...PHYSICAL_ATTRIBUTES,
  ...MENTAL_ATTRIBUTES,
  ...GOALKEEPER_ATTRIBUTES,
]

/** Todo jogador tem todos os atributos; os de goleiro ficam baixos para jogadores de linha. */
export type Attributes = Record<AttributeName, number>

/** Atributos que o jogador não vê (apenas o motor e a IA usam). */
export interface HiddenAttributes {
  /** Teto de evolução (1 a 20). */
  potential: number
  /** Regularidade de desempenho (1 a 20). */
  consistency: number
  /** Propensão a lesão (1 a 20; maior = mais lesões). */
  injuryProneness: number
  /** Profissionalismo (1 a 20). */
  professionalism: number
}

export interface PlayerCondition {
  /** Condição física, 0 a 100. */
  fitness: number
  /** Moral, 0 a 100. */
  morale: number
  /** Média das últimas notas (0 a 10); 0 se ainda não jogou. */
  form: number
  /** Notas das últimas partidas, da mais recente para a mais antiga. */
  recentRatings: number[]
  /** Dias restantes de lesão; 0 = saudável. */
  injuryDaysLeft: number
  yellowCards: number
  redCards: number
  /** Jogos restantes de suspensão. */
  suspensionGames: number
}

export interface Contract {
  /** Salário por mês. */
  salary: number
  endDate: IsoDate
  /** Multa rescisória. */
  releaseClause: number
  /** Clube de origem, se emprestado. */
  loanedFrom?: TeamId
}

export interface PlayerSeasonStats {
  appearances: number
  minutes: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
}

export interface Player {
  id: PlayerId
  /** Nome completo. */
  name: string
  /** Apelido pelo qual o jogador é conhecido, quando tem um. */
  nickname?: string
  age: number
  nationality: Nationality
  foot: Foot
  position: Position
  /** Até 2 posições secundárias. */
  secondaryPositions: Position[]
  attributes: Attributes
  hidden: HiddenAttributes
  condition: PlayerCondition
  contract: Contract
  /** Clube atual; `null` = jogador livre no mercado. */
  teamId: TeamId | null
  /** Estatísticas da temporada corrente. */
  seasonStats: PlayerSeasonStats
}
