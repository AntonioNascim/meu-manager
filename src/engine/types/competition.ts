import type { CompetitionId, IsoDate, MatchId, TeamId } from './common'

/** MVP: só `league`. Depois: `knockout` e `groups+knockout`. */
export type CompetitionType = 'league'

export interface Competition {
  id: CompetitionId
  name: string
  type: CompetitionType
  /** Nível na pirâmide (1 = Série A, 2 = Série B). */
  tier: number
  teamIds: TeamId[]
  /** Total de rodadas (38 para 20 times). */
  roundCount: number
  /** Quantos sobem / caem ao fim da temporada. */
  promotionSlots: number
  relegationSlots: number
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

export interface Season {
  year: number
  currentDate: IsoDate
  phase: SeasonPhase
  competitions: Competition[]
  /** Todas as partidas da temporada (todas as competições). */
  matchIds: MatchId[]
}
