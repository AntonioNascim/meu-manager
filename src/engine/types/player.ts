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
  'England',
  'Spain',
  'Italy',
  'Germany',
  'France',
  'Portugal',
] as const
export type Nationality = (typeof NATIONALITIES)[number]

/** Atributos visíveis, inteiros de 1 a 100 (ver ATTRIBUTE_MIN/MAX em config.ts). */
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
  /** Teto de evolução (1 a 100, mesma escala da força geral). */
  potential: number
  /** Regularidade de desempenho (1 a 100). */
  consistency: number
  /** Propensão a lesão (1 a 100; maior = mais lesões). */
  injuryProneness: number
  /** Profissionalismo (1 a 100). */
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
  /** Contrato com o clube de origem, guardado enquanto o jogador está emprestado. */
  loanOriginal?: Omit<Contract, 'loanedFrom' | 'loanOriginal'>
}

export interface PlayerSeasonStats {
  appearances: number
  minutes: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  /** Soma das notas das partidas em que jogou o mínimo de minutos (a nota média é `ratingSum / ratedGames`). */
  ratingSum: number
  ratedGames: number
  /** Gols como mandante e como visitante, e assistências de passe e de cruzamento (contados desde a versão 8 do save). */
  homeGoals: number
  awayGoals: number
  passAssists: number
  crossAssists: number
  /** Força geral no começo da temporada, guardada pelo treino na primeira vez que passa: o ritmo de evolução da temporada parte dela. */
  startOverall?: number
}

export interface Player {
  id: PlayerId
  /** Nome completo. */
  name: string
  /** Data de nascimento (AAAA-MM-DD). A idade aumenta no aniversário, não na virada da temporada. */
  birthDate: IsoDate
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
