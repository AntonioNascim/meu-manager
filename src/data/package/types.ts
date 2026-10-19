import type { Attributes, BoardObjective, CupDiscipline, CupEntrant, CupFormat, CupGroupsSpec, CupLeaguePhaseSpec, CupPrize, CupSpec, CupStageSpec, Finances, Foot, Nationality, Position, Region, Tactic } from '../../engine/types'

/** Pacote de dados: um mundo (países, ligas, clubes e jogadores) em JSON, que qualquer fonte pode produzir. */
export const PACKAGE_FORMAT = 'meu-manager-package'
export const PACKAGE_VERSION = 1

/** Critérios de desempate de uma liga, na ordem em que valem (depois dos pontos). */
export const TIEBREAKERS = ['wins', 'goal-difference', 'goals-for', 'head-to-head', 'red-cards', 'yellow-cards', 'draw'] as const
export type Tiebreaker = (typeof TIEBREAKERS)[number]

export interface PackageCountry {
  /** Identificador do país; hoje é a nacionalidade do jogo (`'Brazil'`). */
  id: string
  name: string
}

export interface PackageLeague {
  id: string
  name: string
  /** `id` de um país do pacote. */
  country: string
  /** Divisão na pirâmide do país (1 = principal). */
  level: number
  /** Número de times da divisão. */
  teams: number
  /** Quantos sobem desta divisão para a de cima ao fim da temporada. */
  promotion: number
  /** Quantos caem desta divisão para a de baixo. */
  relegation: number
  tiebreakers?: Tiebreaker[]
  /** Índice de receita e nível dos jogadores da liga em relação ao Brasil; sem ele valem os padrões do país (`leagueDefaults.ts`). */
  economy?: { revenue: number; level: number }
  /** 1 = turno único, 2 = turno e returno (padrão). */
  rounds?: 1 | 2
  /** A temporada atravessa o ano (agosto a maio; contratos até 30 de junho). Padrão do país: Europa sim, Brasil e América do Sul não. */
  split?: boolean
  /** Mês e dia de referência da primeira rodada (a primeira rodada cai no primeiro sábado a partir daí). Padrão: 11 de abril, o calendário da liga brasileira. */
  start?: [number, number]
  /** Janelas de transferência: BR, SA ou EU (padrão: a do país). */
  region?: 'BR' | 'SA' | 'EU'
  /** Limite de estrangeiros (jogadores de nacionalidade diferente da do país da liga); sem ele, sem limite. */
  foreignLimit?: { squad?: number; lineup?: number }
}

/** Dados que só uma exportação do jogo traz (sem eles o jogo deriva tudo de forma estável). */
/** Copa definida no pacote. Só `id`, `name`, `format`, `entrants` e `stages` são obrigatórios; o resto tem padrão (`CUP_DEFAULTS`). As ligas das vagas são ids de `leagues`. */
export interface PackageCup {
  id: string
  name: string
  kind?: 'cup' | 'supercup'
  /** País da copa (nacional) ou `region` (continental). */
  country?: string
  region?: Region
  format: CupFormat
  entrants: CupEntrant[]
  groups?: CupGroupsSpec
  leaguePhase?: CupLeaguePhaseSpec
  preliminary?: CupStageSpec[]
  stages: CupStageSpec[]
  weekday?: 2 | 3 | 4
  excludeCups?: string[]
  seeding?: 'random' | 'seeded' | 'ranked'
  homeOfSingleLeg?: CupSpec['homeOfSingleLeg']
  awayGoals?: boolean
  extraTime?: boolean
  penalties?: boolean
  tiebreakers?: Tiebreaker[]
  discipline?: Partial<CupDiscipline>
  prize?: Partial<CupPrize>
}

export interface PackageClubGame {
  tactic: Tactic
  finances: Finances
  fanBase: number
  ticketPrice: number
  objective: BoardObjective
}

export interface PackageClub {
  /** Referência dos jogadores e das ligas; único no pacote. */
  id: string
  name: string
  /** 3 letras. */
  abbreviation: string
  colors: [string, string]
  city: string
  state?: string
  stadium: { name: string; capacity: number }
  /** 1 a 20. */
  reputation: number
  /** `id` de uma liga do pacote. */
  league: string
  game?: PackageClubGame
}

export interface PackagePlayerHidden {
  consistency: number
  injuryProneness: number
  professionalism: number
}

export interface PackagePlayerContract {
  salary: number
  endDate: string
  releaseClause: number
}

export interface PackagePlayer {
  /** Opcional: sem ele o jogo numera (`player-N`). */
  id?: string
  name: string
  nickname?: string
  /** AAAA-MM-DD. */
  birthDate: string
  nationality: Nationality
  position: Position
  secondaryPositions?: Position[]
  foot?: Foot
  /** `id` de um clube do pacote; ausente ou `null` = jogador livre. */
  club?: string | null
  /** Opcionais: sem eles o jogo gera, de forma estável (`generateRealPlayer`). */
  attributes?: Attributes
  potential?: number
  hidden?: PackagePlayerHidden
  contract?: PackagePlayerContract
}

export interface DataPackage {
  format: typeof PACKAGE_FORMAT
  version: number
  name: string
  /** Ano da temporada inicial (padrão: 2026). */
  startYear?: number
  /** Fontes e licenças dos dados (texto livre). */
  credits?: string
  countries: PackageCountry[]
  leagues: PackageLeague[]
  clubs: PackageClub[]
  players: PackagePlayer[]
  /** Base dos clubes (jovens de 15 a 19 anos); sem ela o jogo gera uma com a semente do jogo. */
  academy?: PackagePlayer[]
  /** Copas e supercopas (nacionais ou continentais); sem elas o mundo só tem as ligas. */
  cups?: PackageCup[]
}

/** Problema encontrado ao validar um pacote. A interface transforma `code` em texto. */
export type PackageIssueCode =
  | 'not-json'
  | 'not-object'
  | 'wrong-format'
  | 'newer-version'
  | 'missing-field'
  | 'wrong-type'
  | 'out-of-range'
  | 'duplicate-id'
  | 'unknown-reference'
  | 'unknown-value'
  | 'bad-date'
  | 'bad-color'
  | 'club-without-players'
  | 'club-squad-size'
  | 'club-no-goalkeeper'
  | 'league-team-count'
  | 'league-size-unsupported'
  | 'league-promotion'
  | 'unsupported-leagues'
  | 'tiebreakers-unsupported'
  | 'league-defaults-missing'
  | 'cup-bracket'
  | 'cup-groups'
  | 'cup-defaults-skipped'

export interface PackageIssue {
  code: PackageIssueCode
  /** Onde: `clubs[3].name`, `leagues[0].teams`, … */
  path: string
  /** Valor ou nome relacionado (o que faltou, o número encontrado). */
  detail?: string | number
  /** Segundo número, quando o problema compara dois (encontrado × esperado). */
  expected?: string | number
}

export interface PackageReport {
  errors: PackageIssue[]
  warnings: PackageIssue[]
  /** Quantos problemas a mais existem além dos listados (a lista tem um limite). */
  more?: number
}
