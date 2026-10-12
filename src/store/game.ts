/**
 * Estado do jogo em andamento e suas transições (funções puras: recebem o jogo e devolvem outro).
 * Nada daqui depende de React; o salvamento (Dexie) entra numa etapa futura.
 */
import { generateWorld } from '../data/generateWorld'
import { setTicketPrice } from '../engine/finance'
import { makeOffer, releaseUserPlayer, respondToOffer, sellPlayer } from '../engine/market'
import type { OfferRequest, SaleResult } from '../engine/market'
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
import type { Competition, IsoDate, MarketNotice, Match, OfferKind, MatchResult, Player, StandingRow, Tactic, Team, TeamId } from '../engine/types'

export interface Game {
  /** Semente do mundo e da temporada (mesma semente = mesmo jogo). */
  seed: number
  userTeamId: TeamId
  season: SeasonState
  /** Partida do time do jogador no dia atual, ainda por jogar (o avanço só segue depois dela). */
  pendingUserMatch?: Match
  /** Última rodada de partidas simuladas por um avanço (a do jogador entra quando é registrada). */
  lastDay: Match[]
  /** Avisos do mercado do último avanço (janela, propostas recebidas e respondidas). */
  notices: MarketNotice[]
}

export function createGame(seed: number, userTeamId: TeamId): Game {
  const world = generateWorld({ seed })
  if (!world.teams.some((t) => t.id === userTeamId)) throw new Error(`Time não encontrado: ${userTeamId}`)
  const season = createSeason({ year: world.startYear, seed, teams: world.teams, players: world.players })
  return { seed, userTeamId, season, lastDay: [], notices: [] }
}

/** Avança até o próximo dia de jogos. A partida do jogador fica pendente em `pendingUserMatch`. */
export function advanceGame(game: Game): Game {
  if (game.pendingUserMatch) return game
  const step = advanceToNextEvent(game.season, { userTeamId: game.userTeamId, market: true })
  return {
    ...game,
    season: step.state,
    lastDay: step.played,
    notices: step.notices,
    ...(step.pendingUserMatch ? { pendingUserMatch: step.pendingUserMatch } : {}),
  }
}

/** Avança (parando só para a partida do jogador) até o próximo dia de jogos, passando direto pelos dias de mercado. */
export function advanceToMatchday(game: Game): Game {
  if (game.pendingUserMatch) return game
  let current = game
  const notices: MarketNotice[] = []
  for (;;) {
    const before = current.season.season.currentDate
    current = advanceGame(current)
    notices.push(...current.notices)
    if (current.pendingUserMatch || current.lastDay.length > 0 || nextEventOf(current).type === 'season-end' || current.season.season.currentDate === before) break
  }
  return { ...current, notices }
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

/** O jogador define o preço do ingresso (vale a partir do próximo jogo em casa). */
export function setUserTicketPrice(game: Game, price: number): Game {
  const team = setTicketPrice(userTeam(game), price)
  return { ...game, season: { ...game.season, teams: game.season.teams.map((t) => (t.id === team.id ? team : t)) } }
}

export function setUserTactic(game: Game, tactic: Tactic): Game {
  return { ...game, season: setTeamTactic(game.season, game.userTeamId, tactic) }
}

/** O jogador faz uma proposta (lança `OfferError` se for inválida). */
export function makeUserOffer(game: Game, request: OfferRequest): Game {
  return { ...game, season: makeOffer(game.season, game.userTeamId, request) }
}

/** O jogador aceita ou recusa uma proposta recebida. */
export function respondToUserOffer(game: Game, offerId: string, accept: boolean): Game {
  return { ...game, season: respondToOffer(game.season, offerId, accept) }
}

/** Vende ou empresta um jogador do time a um clube da IA, que responde na hora. */
export function sellUserPlayer(game: Game, request: { playerId: string; buyerId: TeamId; kind: OfferKind; fee: number; contractEnd: IsoDate }): { game: Game; result: SaleResult } {
  const result = sellPlayer(game.season, game.userTeamId, request)
  return { game: result.accepted ? { ...game, season: result.state } : game, result }
}

/** Libera um jogador do time (paga a rescisão). */
export function releaseUserSquadPlayer(game: Game, playerId: string): Game {
  return { ...game, season: releaseUserPlayer(game.season, game.userTeamId, playerId) }
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
