import type { CompetitionId, IsoDate, MatchId, PlayerId, TeamId } from './common'
import type { MatchCupInfo } from './cup'

export type MatchStatus = 'scheduled' | 'finished'

export type MatchEventType =
  | 'goal'
  | 'own-goal'
  | 'missed-penalty'
  | 'yellow-card'
  | 'red-card'
  | 'injury'
  | 'substitution'
  | 'corner'
  | 'foul'

export interface MatchEvent {
  minute: number
  type: MatchEventType
  teamId: TeamId
  playerId: PlayerId
  /** Assistente (gol) ou jogador que entra (substituição). */
  relatedPlayerId?: PlayerId
  /** Tipo da assistência de um gol: passe (finalização na área, cara a cara, chute) ou cruzamento (cabeceio). */
  assistKind?: 'pass' | 'cross'
  /** Texto de narração em português. */
  text: string
}

export interface TeamMatchStats {
  /** Posse de bola em %, 0 a 100. */
  possession: number
  shots: number
  shotsOnTarget: number
  corners: number
  fouls: number
  yellowCards: number
  redCards: number
  /** Gols esperados (xG) acumulados. */
  xg: number
}

export interface PlayerMatchResult {
  playerId: PlayerId
  teamId: TeamId
  minutesPlayed: number
  /** Nota final, 0 a 10 (parte de 6,0). */
  rating: number
  /** Condição física ao fim da partida (0 a 100). */
  finalFitness: number
  /** Dias de lesão sofrida na partida, se houver. */
  injuryDays?: number
}

export interface MatchResult {
  homeGoals: number
  awayGoals: number
  events: MatchEvent[]
  homeStats: TeamMatchStats
  awayStats: TeamMatchStats
  playerResults: PlayerMatchResult[]
  /** Houve prorrogação (os gols dela já estão no placar e nos lances, com minutos de 91 a 120). */
  extraTime?: boolean
  /** Disputa de pênaltis (jogo de mata-mata empatado depois da prorrogação): cobranças convertidas por lado. */
  penalties?: { home: number; away: number }
  /** As cobranças da disputa de pênaltis, na ordem. */
  shootout?: { teamId: TeamId; playerId: PlayerId; scored: boolean }[]
}

export interface Match {
  id: MatchId
  competitionId: CompetitionId
  round: number
  date: IsoDate
  homeTeamId: TeamId
  awayTeamId: TeamId
  status: MatchStatus
  /** Semente usada na simulação (mesma semente = mesmo resultado). */
  seed: number
  /** Público presente (preenchido quando a partida é jogada). */
  attendance?: number
  /** Só nas partidas de copa: fase, confronto e perna. Ausente = jogo de liga. */
  cup?: MatchCupInfo
  /** Preenchido apenas quando `status === 'finished'`. */
  result?: MatchResult
}
