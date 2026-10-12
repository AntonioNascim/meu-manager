/**
 * Estado do jogo em andamento e suas transições (funções puras: recebem o jogo e devolvem outro).
 * Nada daqui depende de React; o salvamento (Dexie) entra numa etapa futura.
 */
import { createYouth } from '../data/generateYouth'
import { generateWorld } from '../data/generateWorld'
import { advanceSeason, expiringContracts, renewUserContract } from '../engine/offseason'
import type { RenewalResult } from '../engine/offseason'
import { evaluateBoard } from '../engine/board'
import { monthlyOperations, monthlyPayroll, setTicketPrice } from '../engine/finance'
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
import type { BoardEvaluation, Competition, Dismissal, OffseasonReport, SeasonSummary, IsoDate, MarketNotice, Match, OfferKind, MatchResult, Player, StandingRow, Tactic, Team, TeamId } from '../engine/types'

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
  /** Preenchido quando a diretoria demitiu o técnico: o jogo não avança mais. */
  dismissal?: Dismissal
  /** Resumo de cada temporada já encerrada (campeões, acesso, rebaixamento e a campanha do jogador). */
  seasonLog: SeasonSummary[]
  /** O que a última virada de temporada fez; some quando o jogador avança na temporada nova. */
  lastReport?: OffseasonReport
}

export function createGame(seed: number, userTeamId: TeamId): Game {
  const world = generateWorld({ seed })
  if (!world.teams.some((t) => t.id === userTeamId)) throw new Error(`Time não encontrado: ${userTeamId}`)
  const season = createSeason({ year: world.startYear, seed, teams: world.teams, players: world.players })
  return { seed, userTeamId, season, lastDay: [], notices: [], seasonLog: [] }
}

/** Avança até o próximo dia de jogos. A partida do jogador fica pendente em `pendingUserMatch`. */
export function advanceGame(game: Game): Game {
  if (game.pendingUserMatch || game.dismissal) return game
  const { lastReport: _seen, ...kept } = game
  game = kept
  const step = advanceToNextEvent(game.season, { userTeamId: game.userTeamId, market: true })
  return checkDismissal({
    ...game,
    season: step.state,
    lastDay: step.played,
    notices: step.notices,
    ...(step.pendingUserMatch ? { pendingUserMatch: step.pendingUserMatch } : {}),
  })
}

/** Avança (parando só para a partida do jogador) até o próximo dia de jogos, passando direto pelos dias de mercado. */
export function advanceToMatchday(game: Game): Game {
  if (game.pendingUserMatch || game.dismissal) return game
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

/** A temporada acabou e o técnico segue no cargo: vira o ano (acesso, evolução, contratos, base, tabela nova). */
export function startNextSeason(game: Game): Game {
  if (game.season.season.phase !== 'end-of-season' || game.dismissal || game.pendingUserMatch) return game
  const { state, report } = advanceSeason(game.season, { createYouth, userTeamId: game.userTeamId })
  const mine = report.finalPositions[game.userTeamId] as { tier: number; position: number }
  const summary: SeasonSummary = { year: report.year, champions: report.champions, promoted: report.promoted, relegated: report.relegated, userTeamId: game.userTeamId, userTier: mine.tier, userPosition: mine.position }
  return { ...game, season: state, lastDay: [], notices: [], seasonLog: [...game.seasonLog, summary], lastReport: report }
}

/** Registra o resultado da partida pendente (jogada ao vivo ou automaticamente). */
export function finishPendingMatch(game: Game, result: MatchResult): Game {
  const pending = game.pendingUserMatch
  if (!pending) return game
  const finished: Match = { ...pending, status: 'finished', result }
  const { pendingUserMatch: _done, ...rest } = game
  return checkDismissal({ ...rest, season: completeMatch(game.season, finished), lastDay: [...game.lastDay, finished] })
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

/** Renova o contrato de um jogador do time (ele pode recusar). */
export function renewUserPlayer(game: Game, request: { playerId: string; salary: number; years: number }): { game: Game; result: RenewalResult } {
  const result = renewUserContract(game.season, game.userTeamId, request)
  return { game: result.accepted ? { ...game, season: result.state } : game, result }
}

/** Jogadores do time com contrato no último ano (vencem no fim desta temporada). */
export const lastYearContracts = (game: Game): Player[] => expiringContracts(game.season, game.userTeamId, game.season.season.year)

/** Libera um jogador do time (paga a rescisão). */
export function releaseUserSquadPlayer(game: Game, playerId: string): Game {
  return { ...game, season: releaseUserPlayer(game.season, game.userTeamId, playerId) }
}

/** Se a diretoria acabou de perder a paciência, registra a demissão (a partida pendente, se houver, continua). */
function checkDismissal(game: Game): Game {
  if (game.dismissal || game.pendingUserMatch) return game
  const board = boardOf(game)
  if (!board.dismissal) return game
  const position = standingsOf(game, userCompetition(game)).findIndex((r) => r.teamId === game.userTeamId) + 1
  return { ...game, dismissal: { date: game.season.season.currentDate, reason: board.dismissal, confidence: board.confidence, position } }
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

/** Avaliação da diretoria hoje (derivada da classificação, da meta e das finanças). */
export function boardOf(game: Game): BoardEvaluation {
  const team = userTeam(game)
  const competition = userCompetition(game)
  const table = standingsOf(game, competition)
  const index = table.findIndex((r) => r.teamId === team.id)
  return evaluateBoard({
    objective: team.objective,
    row: table[index],
    position: index + 1,
    teamCount: table.length,
    totalGames: (table.length - 1) * 2,
    balance: team.finances.balance,
    monthlyCost: monthlyPayroll(squadOf(game, team.id)) + monthlyOperations(team),
  })
}
