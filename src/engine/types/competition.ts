import type { CompetitionId, IsoDate, MatchId, TeamId } from './common'

/** MVP: só `league`. Depois: `knockout` e `groups+knockout`. */
export type CompetitionType = 'league'

/** Região da liga: define as janelas de transferência. */
export type Region = 'BR' | 'SA' | 'EU'

import type { Nationality } from './player'
import type { ForeignLimit, LeagueEconomy } from './team'

export interface Competition {
  id: CompetitionId
  name: string
  type: CompetitionType
  /** Nível na pirâmide (1 = Série A, 2 = Série B, 3 = Série C). */
  tier: number
  teamIds: TeamId[]
  /** Total de rodadas (38 para 20 times). */
  roundCount: number
  /** Quantos sobem / caem ao fim da temporada. */
  promotionSlots: number
  relegationSlots: number
  /** Região (janelas de transferência); padrão: Brasil. */
  region?: Region
  /** Dia da primeira rodada de referência (mês e dia); padrão: `SEASON.startMonth/startDay`. */
  start?: [number, number]
  /** 1 = turno único, 2 = turno e returno (padrão). */
  rounds?: 1 | 2
  /** Temporada que atravessa o ano (agosto a maio): a temporada da pirâmide vai de 1º de julho a 30 de junho. Ausente = ano civil. */
  split?: boolean
  /** Uma semana sem rodada a cada tantas rodadas de fim de semana (pausas de calendário); ausente = rodadas todas as semanas. */
  gapEvery?: number
  /** Pirâmide: as divisões ligadas por acesso e rebaixamento (as de um país). Sem ela, todas as competições formam uma só. */
  pyramid?: string
  /** Economia da liga (índice de receita e nível dos jogadores); ausente = a do Brasil. */
  economy?: LeagueEconomy
  /** País da liga (nacionalidade) e limite de estrangeiros; ausentes = Brasil e sem limite. */
  country?: Nationality
  foreignLimit?: ForeignLimit
  /** Reputação média dos clubes da divisão (para onde a reputação volta); ausente = `OFFSEASON.reputation.tierMean` da série. */
  reputationMean?: number
}

/** Linha da classificação, sempre derivada das partidas finalizadas (nunca guardada). */
export interface StandingRow {
  teamId: TeamId
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  yellowCards: number
  redCards: number
}

export type SeasonPhase = 'pre-season' | 'in-season' | 'end-of-season'

/**
 * A temporada de uma pirâmide (um país): cada país tem a sua. `year` é o ano em que ela começa: no ano civil a temporada "2026" vai de
 * 1º/1 a 31/12/2026; na que atravessa o ano (`split`), "2026/27" vai de 1º/7/2026 a 30/6/2027. Contratos terminam em `end`.
 */
export interface Cycle {
  year: number
  start: IsoDate
  end: IsoDate
  split: boolean
}

export interface Season {
  year: number
  currentDate: IsoDate
  phase: SeasonPhase
  competitions: Competition[]
  /** Todas as partidas da temporada (todas as competições). */
  matchIds: MatchId[]
}
