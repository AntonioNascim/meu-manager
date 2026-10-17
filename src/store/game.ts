/**
 * Estado do jogo em andamento e suas transições (funções puras: recebem o jogo e devolvem outro).
 * Nada daqui depende de React; o salvamento (Dexie) entra numa etapa futura.
 */
import { createYouth } from '../data/generateYouth'
import { loadWorld } from '../data/package/defaultPackage'
import type { World } from '../data/generateWorld'
import type { DataPackage } from '../data/package/types'
import { advanceSeason, expiringContracts, renewUserContract } from '../engine/offseason'
import type { RenewalResult } from '../engine/offseason'
import { evaluateBoard } from '../engine/board'
import { dismissedReputation, jobOpenings, moveCoach, seasonReputation, startingCoach } from '../engine/career'
import type { Coach, JobOpening } from '../engine/career'
import { AcademyError, academyOf, pendingDecisions, promoteYouth, releaseYouth } from '../engine/academy'
import { applySavedLineup } from '../engine/tacticEdit'
import { DEFAULT_PLAN, cancelIndividualTraining, setTrainingPlan, startIndividualTraining, strengthTrend } from '../engine/training'
import { fundsDecision, monthlyOperations, monthlyPayroll, requestFunds, setSalaryBudget, setTicketPrice } from '../engine/finance'
import type { FundsResult } from '../engine/finance'
import { offerPreContract, userPreContracts } from '../engine/market'
import type { PreContractOffer, PreContractResult } from '../engine/market'
import { listUserPlayer, makeOffer, releaseUserPlayer, respondToOffer, sellPlayer, unlistUserPlayer } from '../engine/market'
import type { OfferRequest, SaleResult } from '../engine/market'
import { playerOverall } from '../engine/overall'
import {
  advanceToNextEvent,
  completeMatch,
  computeStandings,
  createSeason,
  nextEvent,
  playUserMatchAuto,
  refocus,
  setTeamTactic,
} from '../engine/season'
import type { SeasonEvent, SeasonState } from '../engine/season'
import { emptyTraining } from '../engine/types'
import type { BoardEvaluation, Competition, ListingKind, IndividualGoal, IndividualTraining, FinishedTraining, TrainingPlan, Dismissal, OffseasonReport, SeasonSummary, IsoDate, MarketNotice, Match, OfferKind, MatchResult, Player, SavedLineup, StandingRow, Tactic, Team, TeamId } from '../engine/types'

/** Linha resumida da classificação final: time, jogos, vitórias, empates, derrotas, gols pró, gols contra, pontos. */
export type ArchivedRow = [teamId: string, played: number, wins: number, draws: number, losses: number, goalsFor: number, goalsAgainst: number, points: number]

/** Jogo do time do jogador resumido: rodada, adversário, 1 se foi em casa, gols pró, gols contra. */
export type ArchivedMatch = [round: number, opponentId: string, home: 0 | 1, goalsFor: number, goalsAgainst: number]

/** O que se guarda de uma temporada encerrada (os jogos completos, com lances e notas, não ficam). */
export interface SeasonArchive {
  year: number
  /** Classificação final de cada série (índice = série − 1). */
  tables: ArchivedRow[][]
  /** Todos os jogos do time do jogador na temporada, resumidos. */
  userMatches: ArchivedMatch[]
}

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
  /** Temporadas passadas em forma resumida (classificações finais e jogos do time do jogador). */
  archive: SeasonArchive[]
  /** O que a última virada de temporada fez; some quando o jogador avança na temporada nova. */
  lastReport?: OffseasonReport
  /** Jogadores que o jogador marcou com estrela para acompanhar no mercado. */
  favorites?: string[]
  /** Até 3 escalações guardadas pelo jogador (posição = espaço; vazio = nada guardado). */
  savedLineups?: (SavedLineup | null)[]
  /** Reputação do técnico e o dia em que chegou ao clube (sem ele, vale a do clube; saves antigos não têm). */
  coach?: Coach
  /** Pacote de dados importado que deu origem ao mundo (guardado no navegador, tabela `packages`); sem ele, o mundo fictício padrão. */
  dataPackage?: { id: string; name: string }
}

export interface NewGameOptions {
  /** Mundo já montado a partir do pacote (a tela de novo jogo o tem pronto): evita montar de novo. */
  world?: World
  /** Pacote de dados já validado (padrão: o mundo fictício). */
  dataPackage?: DataPackage
  /** Referência do pacote guardado no navegador. */
  dataPackageId?: string
}

export function createGame(seed: number, userTeamId: TeamId, options: NewGameOptions = {}): Game {
  // O mundo sempre nasce de um pacote de dados: o do usuário ou o fictício padrão.
  const world = options.world ?? loadWorld(seed, options.dataPackage)
  if (!world.teams.some((t) => t.id === userTeamId)) throw new Error(`Time não encontrado: ${userTeamId}`)
  // Mundo com mais de um país: só a pirâmide do técnico é jogada lance a lance (as outras usam a partida simplificada).
  const pyramids = new Set(world.competitions?.map((c) => c.pyramid))
  const focus = pyramids.size > 1 ? world.competitions?.find((c) => c.teams.some((t) => t.id === userTeamId))?.pyramid : undefined
  const season = createSeason({
    year: world.startYear,
    seed,
    teams: world.teams,
    players: world.players,
    academy: world.academy,
    training: { ...emptyTraining(), plans: { [userTeamId]: DEFAULT_PLAN } },
    ...(world.competitions ? { competitions: world.competitions } : {}),
    ...(focus !== undefined ? { focus } : {}),
  })
  const market = { ...season.market, listings: season.market.listings.filter((l) => l.teamId !== userTeamId) }
  return {
    seed,
    userTeamId,
    season: { ...season, market },
    lastDay: [],
    notices: [],
    seasonLog: [],
    archive: [],
    coach: startingCoach(world.teams.find((t) => t.id === userTeamId) as Team),
    ...(options.dataPackage ? { dataPackage: { id: options.dataPackageId ?? 'sem-id', name: options.dataPackage.name } } : {}),
  }
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
  const size = userCompetition(game).teamIds.length
  const coach: Coach = { ...coachOf(game), reputation: seasonReputation(coachOf(game), { position: mine.position, targetPosition: userTeam(game).objective.targetPosition, teamCount: size }) }
  return { ...game, season: state, lastDay: [], notices: [], seasonLog: [...game.seasonLog, summary], archive: [...game.archive, archiveSeason(game)], lastReport: report, coach }
}

/** Resume a temporada que acabou: classificação final das séries e os jogos do time do jogador. */
export function archiveSeason(game: Game): SeasonArchive {
  const { season } = game.season
  const tables = [...season.competitions]
    .sort((a, b) => a.tier - b.tier)
    .map((c) => standingsOf(game, c).map((r): ArchivedRow => [r.teamId, r.played, r.wins, r.draws, r.losses, r.goalsFor, r.goalsAgainst, r.points]))
  const userMatches = game.season.matches
    .filter((m) => m.status === 'finished' && m.result && (m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m): ArchivedMatch => {
      const home = m.homeTeamId === game.userTeamId
      const r = m.result as MatchResult
      return [m.round, home ? m.awayTeamId : m.homeTeamId, home ? 1 : 0, home ? r.homeGoals : r.awayGoals, home ? r.awayGoals : r.homeGoals]
    })
  return { year: season.year, tables, userMatches }
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

/** O jogador arrasta a barra do orçamento: `salary` é o novo orçamento de salários por mês (as compras se ajustam, com o total igual). */
export function setUserSalaryBudget(game: Game, salary: number): Game {
  const payroll = monthlyPayroll(squadOf(game, game.userTeamId))
  const team = setSalaryBudget(userTeam(game), salary, payroll)
  return { ...game, season: { ...game.season, teams: game.season.teams.map((t) => (t.id === team.id ? team : t)) } }
}

/** O que a diretoria responderia a um pedido de verba agora (sem alterar nada). */
export const userFundsDecision = (game: Game) => fundsDecision(game.season, game.userTeamId, boardOf(game).confidence)

/** Pede verba à diretoria: libera um extra para compras ou recusa com o motivo. */
export function requestUserFunds(game: Game): { game: Game; result: FundsResult } {
  const result = requestFunds(game.season, game.userTeamId, boardOf(game).confidence)
  return { game: result.granted ? { ...game, season: result.state } : game, result }
}

export function setUserTactic(game: Game, tactic: Tactic): Game {
  return { ...game, season: setTeamTactic(game.season, game.userTeamId, tactic) }
}

/** Jovens da base do time do jogador. */
export const userAcademy = (game: Game): Player[] => academyOf(game.season, game.userTeamId)

/** Jovens do time do jogador que fizeram 20 anos e esperam a decisão (promover ou dispensar). */
export const pendingAcademy = (game: Game): Player[] => pendingDecisions(game.season, game.userTeamId)

const ownYouth = (game: Game, playerId: string): void => {
  if (!userAcademy(game).some((p) => p.id === playerId)) throw new AcademyError('not-found', 'Esse jovem não é da sua base')
}

/** Promove um jovem da base ao elenco (lança `AcademyError` se o elenco já tem 30 jogadores). */
export function promoteUserYouth(game: Game, playerId: string): Game {
  ownYouth(game, playerId)
  return { ...game, season: promoteYouth(game.season, playerId) }
}

/** Dispensa um jovem da base (ele vira jogador livre). */
export function releaseUserYouth(game: Game, playerId: string): Game {
  ownYouth(game, playerId)
  return { ...game, season: releaseYouth(game.season, playerId) }
}

/** O que pede a atenção do jogador na base: jovens que chegaram na última virada e jovens esperando decisão. */
export function academyAlert(game: Game): { arrivals: number; pending: number } {
  return { arrivals: game.lastReport?.academyArrivals?.[game.userTeamId] ?? 0, pending: pendingAcademy(game).length }
}

/** Treino coletivo do time do jogador (intensidade e foco). */
export const userTrainingPlan = (game: Game): TrainingPlan => game.season.training.plans[game.userTeamId] ?? DEFAULT_PLAN

/** O jogador escolhe a intensidade e o foco do treino (vale a partir do próximo avanço). */
export function setUserTrainingPlan(game: Game, plan: TrainingPlan): Game {
  return { ...game, season: setTrainingPlan(game.season, game.userTeamId, plan) }
}

/** Vaga de treino individual do time do jogador e o último treino que terminou. */
export const userIndividualTraining = (game: Game): IndividualTraining | undefined => game.season.training.individual[game.userTeamId]
export const userFinishedTraining = (game: Game): FinishedTraining | undefined => game.season.training.finished[game.userTeamId]

/** Põe um jogador na vaga de treino individual (lança `TrainingError` se a vaga está ocupada ou a escolha é inválida). */
export function startUserIndividualTraining(game: Game, playerId: string, goal: IndividualGoal): Game {
  return { ...game, season: startIndividualTraining(game.season, game.userTeamId, playerId, goal) }
}

export function cancelUserIndividualTraining(game: Game): Game {
  return { ...game, season: cancelIndividualTraining(game.season, game.userTeamId) }
}

/** Quanto a força do jogador mudou desde o último mês (em pontos inteiros). */
export const strengthChange = (game: Game, player: Player): number => strengthTrend(game.season.training.history[player.id], playerOverall(player), game.season.season.currentDate)

/** Jogadores marcados com estrela (some quem já saiu do jogo). */
export const favoritesOf = (game: Game): string[] => (game.favorites ?? []).filter((id) => game.season.players.some((p) => p.id === id))

/** Marca ou desmarca a estrela de um jogador. */
export function toggleFavorite(game: Game, playerId: string): Game {
  const list = game.favorites ?? []
  return { ...game, favorites: list.includes(playerId) ? list.filter((id) => id !== playerId) : [...list, playerId] }
}

/** Anuncia um jogador do time (venda ou empréstimo) pelo preço dado. */
export function listUserSquadPlayer(game: Game, playerId: string, kind: ListingKind, price: number): Game {
  return { ...game, season: listUserPlayer(game.season, game.userTeamId, playerId, kind, price) }
}

export function unlistUserSquadPlayer(game: Game, playerId: string): Game {
  return { ...game, season: unlistUserPlayer(game.season, game.userTeamId, playerId) }
}

/** O jogador propõe um pré-contrato (o jogador responde na hora). Lança `OfferError` se não for possível. */
export function offerUserPreContract(game: Game, playerId: string, offer: PreContractOffer): { game: Game; result: PreContractResult } {
  const result = offerPreContract(game.season, game.userTeamId, playerId, offer)
  return { game: result.accepted ? { ...game, season: result.state } : game, result }
}

/** Pré-contratos do seu time: quem chega de graça na virada e quem vai embora. */
export const userPreContractsOf = (game: Game) => userPreContracts(game.season, game.userTeamId)

export const LINEUP_SLOTS = 3

/** Guarda a escalação atual do time no espaço `slot` (0 a 2), com o nome dado. */
export function saveUserLineup(game: Game, slot: number, name: string): Game {
  if (!Number.isInteger(slot) || slot < 0 || slot >= LINEUP_SLOTS) throw new Error('Espaço de escalação inválido')
  const tactic = userTeam(game).tactic
  const slots: (SavedLineup | null)[] = Array.from({ length: LINEUP_SLOTS }, (_, i) => game.savedLineups?.[i] ?? null)
  slots[slot] = { name: name.trim() || `Escalação ${slot + 1}`, formationId: tactic.formationId, style: tactic.style, startingXI: [...tactic.startingXI], ...(tactic.grid ? { grid: tactic.grid.map((p) => ({ ...p })) } : {}) }
  return { ...game, savedLineups: slots }
}

/** Apaga a escalação guardada no espaço `slot`. */
export function deleteUserLineup(game: Game, slot: number): Game {
  const slots = Array.from({ length: LINEUP_SLOTS }, (_, i) => (i === slot ? null : (game.savedLineups?.[i] ?? null)))
  return { ...game, savedLineups: slots }
}

/** Carrega a escalação guardada no espaço `slot` como tática do time (a mesma da tela de Tática). */
export function loadUserLineup(game: Game, slot: number): Game {
  const saved = game.savedLineups?.[slot]
  if (!saved) throw new Error('Não há escalação guardada neste espaço')
  return setUserTactic(game, applySavedLineup(userTeam(game).tactic, squadOf(game, game.userTeamId), saved))
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
  const coach = coachOf(game)
  return { ...game, coach: { ...coach, reputation: dismissedReputation(coach) }, dismissal: { date: game.season.season.currentDate, reason: board.dismissal, confidence: board.confidence, position } }
}

// ---------------------------------------------------------------------------
// Carreira: propostas de outros clubes e procura de emprego
// ---------------------------------------------------------------------------

/** Reputação do técnico (a guardada ou, em saves antigos, a do clube). */
export const coachOf = (game: Game): Coach => game.coach ?? startingCoach(userTeam(game))

/** Propostas de outros clubes (quem está empregado) ou vagas para se candidatar (quem foi demitido). */
export function userJobOpenings(game: Game): JobOpening[] {
  const employed = !game.dismissal
  const coach = coachOf(game)
  const confidence = employed ? boardOf(game).confidence : undefined
  // A lista só muda com o mês, a classificação, o clube ou a confiança: o painel a consulta a cada desenho da tela.
  const key = `${game.userTeamId}:${coach.reputation}:${confidence}:${game.season.season.currentDate}:${game.season.matches.length}`
  const cached = jobCache.get(game.season)
  if (cached?.key === key) return cached.list
  const list = jobOpenings(game.season, { userTeamId: game.userTeamId, coach, employed, ...(confidence !== undefined ? { confidence } : {}) })
  jobCache.set(game.season, { key, list })
  return list
}

const jobCache = new WeakMap<SeasonState, { key: string; list: JobOpening[] }>()

/** O técnico assume outro clube da lista de propostas ou vagas. Lança erro se o clube não está na lista ou há partida por jogar. */
export function takeUserJob(game: Game, teamId: TeamId): Game {
  if (game.pendingUserMatch) throw new Error('Termine a partida antes de trocar de clube')
  if (!userJobOpenings(game).some((o) => o.teamId === teamId)) throw new Error('Esse clube não tem proposta nem vaga para você')
  const { dismissal: _out, lastReport: _seen, savedLineups: _lineups, ...kept } = game
  const season = moveCoach(game.season, game.userTeamId, teamId, { refocus, defaultPlan: DEFAULT_PLAN })
  return { ...kept, userTeamId: teamId, season, lastDay: [], notices: [], coach: { ...coachOf(game), arrivedOn: game.season.season.currentDate } }
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
    row: sinceArrival(game, table[index]),
    position: index + 1,
    teamCount: table.length,
    totalGames: (table.length - 1) * 2,
    balance: team.finances.balance,
    monthlyCost: monthlyPayroll(squadOf(game, team.id)) + monthlyOperations(team),
  })
}

/** Linha do time só com os jogos depois da chegada do técnico (quem assume no meio da temporada não herda a campanha anterior). */
function sinceArrival(game: Game, row: StandingRow | undefined): StandingRow | undefined {
  const arrived = game.coach?.arrivedOn
  if (!arrived || !row) return row
  const mine = game.season.matches.filter((m) => m.status === 'finished' && m.result && m.date >= arrived && (m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId))
  let points = 0
  for (const m of mine) {
    const r = m.result as MatchResult
    const [gf, ga] = m.homeTeamId === game.userTeamId ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals]
    points += gf > ga ? 3 : gf === ga ? 1 : 0
  }
  return { ...row, played: mine.length, points }
}
