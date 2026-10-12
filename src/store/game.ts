/**
 * Estado do jogo em andamento e suas transições (funções puras: recebem o jogo e devolvem outro).
 * Nada daqui depende de React; o salvamento (Dexie) entra numa etapa futura.
 */
import { generateWorld } from '../data/generateWorld'
import { playerOverall } from '../engine/overall'
import {
  advanceToNextEvent,
  completeMatch,
  computeStandings,
  createSeason,
  nextEvent,
  playUserMatchAuto,
  setTeamTactic,
} from '../engine/season'
import type { SeasonEvent, SeasonState } from '../engine/season'
import type { Competition, Match, MatchResult, Player, StandingRow, Tactic, Team, TeamId } from '../engine/types'

export interface Game {
  /** Semente do mundo e da temporada (mesma semente = mesmo jogo). */
  seed: number
  userTeamId: TeamId
  season: SeasonState
  /** Partida do time do jogador no dia atual, ainda por jogar (o avanço só segue depois dela). */
  pendingUserMatch?: Match
  /** Última rodada de partidas simuladas por um avanço (a do jogador entra quando é registrada). */
  lastDay: Match[]
}

export function createGame(seed: number, userTeamId: TeamId): Game {
  const world = generateWorld({ seed })
  if (!world.teams.some((t) => t.id === userTeamId)) throw new Error(`Time não encontrado: ${userTeamId}`)
  const season = createSeason({ year: world.startYear, seed, teams: world.teams, players: world.players })
  return { seed, userTeamId, season, lastDay: [] }
}

/** Avança até o próximo dia de jogos. A partida do jogador fica pendente em `pendingUserMatch`. */
export function advanceGame(game: Game): Game {
  if (game.pendingUserMatch) return game
  const step = advanceToNextEvent(game.season, { userTeamId: game.userTeamId })
  return {
    ...game,
    season: step.state,
    lastDay: step.played,
    ...(step.pendingUserMatch ? { pendingUserMatch: step.pendingUserMatch } : {}),
  }
}

/** Registra o resultado da partida pendente (jogada ao vivo ou automaticamente). */
export function finishPendingMatch(game: Game, result: MatchResult): Game {
  const pending = game.pendingUserMatch
  if (!pending) return game
  const finished: Match = { ...pending, status: 'finished', result }
  const { pendingUserMatch: _done, ...rest } = game
  return { ...rest, season: completeMatch(game.season, finished), lastDay: [...game.lastDay, finished] }
}

/** Joga a partida pendente sem intervenção do jogador. */
export function playPendingAuto(game: Game): Game {
  const pending = game.pendingUserMatch
  if (!pending) return game
  const finished = playUserMatchAuto(game.season, pending, game.userTeamId)
  return finishPendingMatch(game, finished.result as MatchResult)
}

export function setUserTactic(game: Game, tactic: Tactic): Game {
  return { ...game, season: setTeamTactic(game.season, game.userTeamId, tactic) }
}

// ---------------------------------------------------------------------------
// Consultas (dados derivados: nunca guardados)
// ---------------------------------------------------------------------------

export const teamById = (game: Game, id: TeamId) => game.season.teams.find((t) => t.id === id) as Team
export const userTeam = (game: Game) => teamById(game, game.userTeamId)
export const squadOf = (game: Game, teamId: TeamId): Player[] => game.season.players.filter((p) => p.teamId === teamId)
export const nextEventOf = (game: Game): SeasonEvent => nextEvent(game.season)

export function userCompetition(game: Game): Competition {
  return game.season.season.competitions.find((c) => c.teamIds.includes(game.userTeamId)) as Competition
}

export function competitionMatches(game: Game, competitionId: string): Match[] {
  return game.season.matches.filter((m) => m.competitionId === competitionId)
}

export function standingsOf(game: Game, competition: Competition): StandingRow[] {
  return computeStandings(competition.teamIds, competitionMatches(game, competition.id))
}

/** Próxima partida do time do jogador (a pendente, se houver, ou a primeira ainda por jogar). */
export function nextUserMatch(game: Game): Match | undefined {
  if (game.pendingUserMatch) return game.pendingUserMatch
  return game.season.matches
    .filter((m) => m.status === 'scheduled' && (m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round)[0]
}

/** Última partida finalizada do time do jogador. */
export function lastUserMatch(game: Game): Match | undefined {
  return game.season.matches
    .filter((m) => m.status === 'finished' && (m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round)[0]
}

/** Força média dos titulares do time (para exibir e comparar elencos). */
export function teamStrength(game: Game, team: Team): number {
  const byId = new Map(squadOf(game, team.id).map((p) => [p.id, p]))
  const xi = team.tactic.startingXI.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined)
  return xi.reduce((sum, p) => sum + playerOverall(p), 0) / Math.max(1, xi.length)
}
