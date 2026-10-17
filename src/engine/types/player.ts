import type { IsoDate, PlayerId, TeamId } from './common'

export const POSITIONS = ['GK', 'RB', 'LB', 'CB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'] as const
export type Position = (typeof POSITIONS)[number]

export type Foot = 'right' | 'left' | 'both'

/** Todos os países do mundo (seleções da FIFA e as do Reino Unido): o id é o nome em inglês; o nome em português e a bandeira ficam em `src/ui/countries.ts`. */
/** Todos os países do mundo (seleções da FIFA e as do Reino Unido): o id é o nome em inglês; o nome em português e a bandeira ficam em `src/ui/countries.ts`. */
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
  'Afghanistan',
  'Albania',
  'Algeria',
  'American Samoa',
  'Andorra',
  'Angola',
  'Anguilla',
  'Antigua and Barbuda',
  'Armenia',
  'Aruba',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Belize',
  'Benin',
  'Bermuda',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'British Virgin Islands',
  'Brunei',
  'Bulgaria',
  'Burkina Faso',
  'Burundi',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Cape Verde',
  'Cayman Islands',
  'Central African Republic',
  'Chad',
  'China',
  'Comoros',
  'Congo',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Curaçao',
  'Cyprus',
  'Czech Republic',
  'Denmark',
  'Djibouti',
  'Dominica',
  'Dominican Republic',
  'DR Congo',
  'Egypt',
  'El Salvador',
  'Equatorial Guinea',
  'Eritrea',
  'Estonia',
  'Eswatini',
  'Ethiopia',
  'Faroe Islands',
  'Fiji',
  'Finland',
  'Gabon',
  'Gambia',
  'Georgia',
  'Ghana',
  'Gibraltar',
  'Greece',
  'Grenada',
  'Guam',
  'Guatemala',
  'Guinea',
  'Guinea-Bissau',
  'Guyana',
  'Haiti',
  'Honduras',
  'Hong Kong',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Israel',
  'Ivory Coast',
  'Jamaica',
  'Japan',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kosovo',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Lesotho',
  'Liberia',
  'Libya',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Macau',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Maldives',
  'Mali',
  'Malta',
  'Mauritania',
  'Mauritius',
  'Mexico',
  'Moldova',
  'Mongolia',
  'Montenegro',
  'Montserrat',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nepal',
  'Netherlands',
  'New Caledonia',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'North Korea',
  'North Macedonia',
  'Northern Ireland',
  'Norway',
  'Oman',
  'Pakistan',
  'Palestine',
  'Panama',
  'Papua New Guinea',
  'Philippines',
  'Poland',
  'Puerto Rico',
  'Qatar',
  'Romania',
  'Russia',
  'Rwanda',
  'Saint Kitts and Nevis',
  'Saint Lucia',
  'Saint Vincent and the Grenadines',
  'Samoa',
  'San Marino',
  'Sao Tome and Principe',
  'Saudi Arabia',
  'Scotland',
  'Senegal',
  'Serbia',
  'Seychelles',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'Solomon Islands',
  'Somalia',
  'South Africa',
  'South Korea',
  'South Sudan',
  'Sri Lanka',
  'Sudan',
  'Suriname',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Timor-Leste',
  'Togo',
  'Tonga',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkey',
  'Turkmenistan',
  'Turks and Caicos',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United States',
  'US Virgin Islands',
  'Uzbekistan',
  'Vanuatu',
  'Venezuela',
  'Vietnam',
  'Wales',
  'Yemen',
  'Zambia',
  'Zimbabwe',
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
