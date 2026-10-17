/**
 * O jogo avança por dias: "avançar" pula até o próximo evento relevante.
 * Eventos: dia de jogos e, com o mercado ligado, abertura/fim de janela e propostas.
 *
 * A cada avanço: passam os dias (recuperação física, lesões, moral), a IA escolhe a escalação de
 * cada time com o elenco que tem (rodando o elenco quando os titulares estão cansados), as
 * partidas do dia são simuladas e seus efeitos entram nos jogadores (condição, lesões,
 * suspensões, forma e moral).
 */
import { collectGate, matchAttendance, monthStartsBetween, settleMonth } from '../finance'
import { lineupForeign } from '../foreign'
import { buildTactic, repairTactic } from '../lineup'
import { expireOffers, nextMarketEvent, refreshListings, resolveDueOffers, runMarketTick, runPreContractTick } from '../market'
import type { MarketEvent } from '../market'
import { formationOf } from '../formations'
import { gridProblem } from '../grid'
import { simulateMatch } from '../match'
import type { KnockoutRules, MatchInput } from '../match'
import { cupScopeOf, knockoutRulesFor, progressCups } from '../cups'
import type { ArchivedRow, IsoDate, MarketNotice, Match, OffseasonReport, Player, PlayerId, Tactic, Team, TeamId, TurnRecord } from '../types'
import type { SeasonState } from './calendar'
import { applyTraining, fitnessProfile } from '../training'
import { settleDueContracts } from '../offseason/dueContracts'
import { applyBirthdays } from './birthdays'
import { applyMatchToPlayers, cupView, progressDays } from './condition'
import { slimResult } from './compact'
import { daysBetween } from './dates'
import { competitionsOf, cycleOfPyramid, focusPyramid, phaseOfPyramid, pyramidFinished, pyramidOfTeamId, seasonLabel } from './cycles'
import { computeStandings } from './standings'
import { cupMatchIsQuick, playQuickMatch, quickCompetitionIds } from './fidelity'

export type SeasonEvent = { type: 'matchday'; date: IsoDate } | { type: 'market'; date: IsoDate } | { type: 'season-end' }

/** Próximo evento a partir de `currentDate` (inclusive): o primeiro dia com jogos por disputar. */
export function nextEvent(state: SeasonState): SeasonEvent {
  let next: IsoDate | undefined
  for (const m of state.matches) {
    if (m.status === 'scheduled' && m.date >= state.season.currentDate && (next === undefined || m.date < next)) next = m.date
  }
  return next === undefined ? { type: 'season-end' } : { type: 'matchday', date: next }
}

/** Primeiro dia depois de hoje em que termina o contrato de um jogador do time (empréstimos voltam na virada). */
function nextContractEnd(state: SeasonState, teamId: TeamId): IsoDate | undefined {
  let next: IsoDate | undefined
  for (const p of state.players) {
    if (p.teamId !== teamId || p.contract.loanedFrom || p.contract.endDate <= state.season.currentDate) continue
    if (next === undefined || p.contract.endDate < next) next = p.contract.endDate
  }
  return next
}

function groupByTeam(players: readonly Player[]): Map<TeamId, Player[]> {
  const squads = new Map<TeamId, Player[]>()
  for (const p of players) {
    if (!p.teamId) continue
    const squad = squads.get(p.teamId)
    if (squad) squad.push(p)
    else squads.set(p.teamId, [p])
  }
  return squads
}

/**
 * Escalação da IA para o jogo: mesma formação, estilo e mentalidade do time, mas com os
 * jogadores disponíveis (sem lesão nem suspensão) e descansados.
 */
const foreignOpt = (team: Team) => {
  const foreign = lineupForeign(team)
  return foreign ? { foreign } : {}
}

export function aiTactic(team: Team, squad: readonly Player[]) {
  return buildTactic(squad, { formationId: team.tactic.formationId, style: team.tactic.style, mentality: team.tactic.mentality }, { rested: true, ...foreignOpt(team) })
}

/** Simula uma partida agendada com a seed dela (mesma seed = mesmo resultado). */
export function playMatch(match: Match, home: { team: Team; players: readonly Player[] }, away: { team: Team; players: readonly Player[] }, knockout?: KnockoutRules, neutral = false): Match {
  const attendance = matchAttendance(home.team, away.team)
  const result = simulateMatch({ home, away, seed: match.seed, attendance, ...(knockout ? { knockout } : {}), ...(neutral ? { neutral } : {}) })
  return { ...match, status: 'finished', result, attendance }
}

/** Fechamento financeiro dos meses que começam no intervalo (de, até]; os clubes da IA reinvestem o excesso. */
function settleMonths(teams: readonly Team[], squads: Map<TeamId, Player[]>, from: IsoDate, to: IsoDate, userTeamId?: TeamId): Team[] {
  let current = [...teams]
  for (const month of monthStartsBetween(from, to)) {
    current = current.map((t) => settleMonth(t, squads.get(t.id) ?? [], month, t.id !== userTeamId))
  }
  return current
}

export interface AdvanceOptions {
  /**
   * Time do jogador. A IA não mexe nele: a escalação é a que o jogador deixou (só quem ficou
   * indisponível é trocado) e a partida dele não é simulada aqui, fica em `pendingUserMatch`
   * para ser jogada (ao vivo ou por `playUserMatchAuto`) e depois registrada com `completeMatch`.
   */
  userTeamId?: TeamId
  /** Liga o mercado: janelas, negociações da IA e propostas viram eventos do avanço. */
  market?: boolean
  /**
   * Vira a temporada de uma pirâmide (um país). Com ela, os países da IA viram sozinhos, no último dia da temporada de cada um; a pirâmide do
   * técnico espera o jogador (`startNextSeason`). Sem ela, nenhum país vira sozinho. Feita para jogos com técnico: sem técnico os países
   * virariam para sempre.
   */
  turn?: TurnRunner
}

export type TurnRunner = (state: SeasonState, pyramid: string) => { state: SeasonState; report: OffseasonReport }

export interface AdvanceResult {
  state: SeasonState
  event: SeasonEvent
  /** Partidas simuladas neste avanço (vazio no fim da temporada). */
  played: Match[]
  /** Partida do time do jogador neste dia, ainda por jogar. */
  pendingUserMatch?: Match
  /** Avisos do mercado (janela, propostas recebidas e respondidas). */
  notices: MarketNotice[]
  /** Países da IA que viraram a temporada neste avanço. */
  turned?: TurnRecord[]
}

/** Passa os dias até `date`: recuperação, fechamento dos meses e, se for dia de negociação, o mercado. */
function passDays(state: SeasonState, date: IsoDate, options: AdvanceOptions, marketEvent: MarketEvent | undefined): { state: SeasonState; notices: MarketNotice[] } {
  const days = daysBetween(state.season.currentDate, date)
  // Quem faz anos nesses dias envelhece um ano (idade, declínio e ruído dos atributos).
  const players = applyBirthdays(progressDays(state.players, days, (teamId) => fitnessProfile(state.training, teamId, days)), state.season.currentDate, date, state.market.seed) as Player[]
  const squads = groupByTeam(players)
  const teams = settleMonths(state.teams, squads, state.season.currentDate, date, options.userTeamId)
  let current: SeasonState = applyTraining({ ...state, players, teams, season: { ...state.season, currentDate: date } }, state.season.currentDate, date, options.userTeamId)
  // Contratos que terminam nestes dias (no meio da temporada) acabam na data deles.
  const due = settleDueContracts(current, state.season.currentDate, date, options.userTeamId)
  current = due.state
  const notices: MarketNotice[] = [...due.notices]
  if (!options.market) return { state: current, notices }

  current = expireOffers(current, date)
  if (marketEvent) {
    for (const w of marketEvent.opens) notices.push({ type: 'window-opened', window: w })
    for (const w of marketEvent.closes) notices.push({ type: 'window-last-day', window: w })
    const answered = resolveDueOffers(current, date)
    current = answered.state
    for (const o of answered.decided) notices.push({ type: 'offer-answered', offerId: o.id })
    if (marketEvent.tick) {
      const tick = runMarketTick(current, date, options.userTeamId)
      current = tick.state
      for (const o of tick.incoming) notices.push({ type: 'offer-received', offerId: o.id })
    }
    if (marketEvent.preContract) {
      const pre = runPreContractTick(current, date, options.userTeamId)
      current = pre.state
      for (const c of pre.lost) notices.push({ type: 'pre-contract-lost', playerId: c.playerId, teamId: c.toTeamId })
    }
    if (marketEvent.opens.length > 0 || marketEvent.tick) current = refreshListings(current, date, options.userTeamId)
    current = { ...current, market: { ...current.market, handled: date } }
  }
  return { state: current, notices }
}

/** A pirâmide do técnico (a do clube dele); sem técnico, nenhuma. */
const userPyramidOf = (state: SeasonState, options: AdvanceOptions): string | undefined => (options.userTeamId ? pyramidOfTeamId(state, options.userTeamId) : undefined)

/** Países da IA com todos os jogos feitos que esperam o último dia da temporada para virar (só com `options.turn`). */
function pendingTurns(state: SeasonState, options: AdvanceOptions): string[] {
  if (!options.turn) return []
  const mine = userPyramidOf(state, options)
  return Object.keys(state.cycles).filter((p) => p !== mine && pyramidFinished(state, p))
}

/** A classificação final de cada liga do país, antes da virada. */
function finalTables(state: SeasonState, pyramid: string): TurnRecord['tables'] {
  return competitionsOf(state, pyramid)
    .sort((a, b) => a.tier - b.tier)
    .map((c) => ({
      competitionId: c.id,
      tier: c.tier,
      rows: computeStandings(c.teamIds, state.matches.filter((m) => m.competitionId === c.id)).map((r): ArchivedRow => [r.teamId, r.played, r.wins, r.draws, r.losses, r.goalsFor, r.goalsAgainst, r.points]),
    }))
}

/** Vira os países da IA que já chegaram ao último dia da temporada. */
function runDueTurns(state: SeasonState, options: AdvanceOptions): { state: SeasonState; turned: TurnRecord[] } {
  let current = state
  const turned: TurnRecord[] = []
  for (const pyramid of pendingTurns(state, options)) {
    const cycle = cycleOfPyramid(current, pyramid)
    if (current.season.currentDate < cycle.end || !pyramidFinished(current, pyramid)) continue
    const tables = finalTables(current, pyramid)
    const run = (options.turn as TurnRunner)(current, pyramid)
    current = run.state
    turned.push({ pyramid, year: cycle.year, label: seasonLabel(cycle), report: run.report, tables })
  }
  return { state: current, turned }
}

/** Primeiro dia (depois de hoje) em que um país da IA com a temporada acabada chega ao último dia dela. */
function nextTurnDate(state: SeasonState, options: AdvanceOptions): IsoDate | undefined {
  let next: IsoDate | undefined
  for (const pyramid of pendingTurns(state, options)) {
    const end = cycleOfPyramid(state, pyramid).end
    if (end > state.season.currentDate && (next === undefined || end < next)) next = end
  }
  return next
}

/**
 * Avança até o próximo evento: passa os dias, escala os times, simula as partidas do dia e atualiza
 * os jogadores. Com `market`, o mercado também gera eventos (abertura e último dia da janela, propostas
 * recebidas e respondidas); dias de negociação sem novidade para o jogador são atravessados em silêncio.
 * Quando todos os jogos da pirâmide do técnico terminam, devolve `season-end` e espera `startNextSeason`;
 * as pirâmides da IA viram a temporada sozinhas (com `turn`) no último dia dela.
 */
export function advanceToNextEvent(state: SeasonState, options: AdvanceOptions = {}): AdvanceResult {
  return stepWorld(state, options)
}

/**
 * Passa o relógio do mundo até `date` (inclusive), jogando o que houver pelo caminho e virando os países da IA que chegarem ao último dia
 * da temporada. Não para pelos eventos do técnico: serve para o fim da temporada dele, quando só os outros países ainda jogam.
 */
export function advanceUntil(state: SeasonState, date: IsoDate, options: AdvanceOptions = {}): AdvanceResult {
  let current = state
  const turned: TurnRecord[] = []
  const notices: MarketNotice[] = []
  const played: Match[] = []
  while (current.season.currentDate < date) {
    const step = stepWorld(current, options, date)
    current = step.state
    turned.push(...(step.turned ?? []))
    notices.push(...step.notices)
    played.push(...step.played)
    if (step.pendingUserMatch) return { ...step, played, notices, turned }
  }
  // Os países da IA que chegaram ao último dia exatamente em `date` viram agora.
  const due = runDueTurns(current, options)
  return { state: due.state, event: { type: 'market', date }, played, notices, turned: [...turned, ...due.turned] }
}

function stepWorld(state: SeasonState, options: AdvanceOptions, limit?: IsoDate): AdvanceResult {
  let current = state
  const notices: MarketNotice[] = []
  const turned: TurnRecord[] = []
  const played: Match[] = []
  for (;;) {
    const due = runDueTurns(current, options)
    current = due.state
    turned.push(...due.turned)
    const mine = userPyramidOf(current, options)
    if (limit === undefined && mine !== undefined && pyramidFinished(current, mine)) {
      const season = { ...current.season, phase: 'end-of-season' as const }
      return { state: { ...current, season: mine === focusPyramid(current) ? season : current.season }, event: { type: 'season-end' }, played: [], notices, ...(turned.length > 0 ? { turned } : {}) }
    }
    const matchEvent = nextEvent(current)
    const marketEvent = options.market ? nextMarketEvent(current) : undefined
    // O fim do contrato de um jogador do técnico também é um dia a parar (se cair antes do próximo evento).
    const contractEnd = options.userTeamId ? nextContractEnd(current, options.userTeamId) : undefined
    const candidates = [matchEvent.type === 'matchday' ? matchEvent.date : undefined, marketEvent?.date, contractEnd, nextTurnDate(current, options), limit].filter((d): d is IsoDate => d !== undefined && d >= current.season.currentDate)
    if (candidates.length === 0) {
      const season = { ...current.season, phase: phaseOfPyramid(current, focusPyramid(current)) }
      return { state: { ...current, season }, event: { type: 'season-end' }, played: [], notices, ...(turned.length > 0 ? { turned } : {}) }
    }
    const date = candidates.reduce((a, b) => (b < a ? b : a))
    const todayMarket = marketEvent && marketEvent.date === date ? marketEvent : undefined

    const passed = passDays(current, date, options, todayMarket)
    notices.push(...passed.notices)
    current = passed.state
    if (matchEvent.type === 'matchday' && matchEvent.date === date) {
      const day = playMatchday(current, date, options, notices)
      current = day.state
      played.push(...day.played)
      if (limit === undefined || day.pendingUserMatch) return { ...day, played, ...(turned.length > 0 ? { turned } : {}) }
      if (current.season.currentDate >= limit) return { state: current, event: day.event, played, notices, ...(turned.length > 0 ? { turned } : {}) }
      continue
    }
    // Dia sem jogos (mercado, fim de contrato, último dia da temporada de um país): para só se há novidade para o jogador.
    if (limit !== undefined) {
      if (date >= limit) return { state: current, event: { type: 'market', date }, played, notices, ...(turned.length > 0 ? { turned } : {}) }
      continue
    }
    if (notices.length > 0) return { state: current, event: { type: 'market', date }, played: [], notices, ...(turned.length > 0 ? { turned } : {}) }
  }
}

/**
 * Simula as partidas do dia (menos a do jogador, que fica pendente) e atualiza os jogadores. As competições fora do foco do técnico
 * (`quickCompetitionIds`) usam o resultado simplificado, sem escalação da IA e sem lances; `allQuick` faz o mesmo com todas (pré-aquecimento).
 */
export function playMatchday(state: SeasonState, date: IsoDate, options: AdvanceOptions, notices: MarketNotice[], allQuick = false): AdvanceResult {
  const squads = groupByTeam(state.players)
  const teams = new Map(state.teams.map((t) => [t.id, t]))
  const quickIds = quickCompetitionIds(state)

  const { userTeamId } = options
  let pendingUserMatch: Match | undefined
  const played: Match[] = []
  const changed = new Map<PlayerId, Player>()
  const matches = state.matches.map((m) => {
    if (m.status !== 'scheduled' || m.date !== date) return m
    const home = teams.get(m.homeTeamId)
    const away = teams.get(m.awayTeamId)
    if (!home || !away) throw new Error(`Time não encontrado na partida ${m.id}`)
    const homeSquad = squads.get(home.id) ?? []
    const awaySquad = squads.get(away.id) ?? []
    if (userTeamId !== undefined && (m.homeTeamId === userTeamId || m.awayTeamId === userTeamId)) {
      pendingUserMatch = m
      return m
    }
    // Copa: suspensão e amarelos são os da copa, o mata-mata tem prorrogação e pênaltis e a final pode ser em campo neutro.
    const cup = m.cup ? state.cups?.find((c) => c.id === m.competitionId) : undefined
    const scope = cup ? cupScopeOf(cup) : undefined
    const homeView = cup ? cupView(homeSquad, cup.id) : homeSquad
    const awayView = cup ? cupView(awaySquad, cup.id) : awaySquad
    const rules = knockoutRulesFor(cup, m, state.matches)
    const quick = allQuick || (m.cup ? cupMatchIsQuick(state, m) : quickIds.has(m.competitionId))
    const finished = quick
      ? playQuickMatch(m, { team: home, players: homeView }, { team: away, players: awayView }, rules, m.cup?.neutral)
      : playMatch(m, { team: { ...home, tactic: aiTactic(home, homeView) }, players: homeView }, { team: { ...away, tactic: aiTactic(away, awayView) }, players: awayView }, rules, m.cup?.neutral)
    for (const p of applyMatchToPlayers(new Map([[home.id, homeSquad], [away.id, awaySquad]]), finished, scope)) changed.set(p.id, p)
    if (!m.cup?.neutral) teams.set(home.id, collectGate(home, away, m.date).team)
    played.push(finished)
    // O que fica na temporada é o resultado enxuto (narração e notas já foram usadas nos jogadores): a memória não cresce com os lances de milhares de jogos.
    return finished.result ? { ...finished, result: slimResult(finished.result) } : finished
  })

  // As copas sorteiam a fase seguinte (e premiam) antes de dizer se a temporada acabou.
  const moved = progressCups({ ...state, matches, teams: state.teams.map((t) => teams.get(t.id) ?? t), players: state.players.map((p) => changed.get(p.id) ?? p) })
  const season = { ...moved.season, phase: phaseOfPyramid(moved, focusPyramid(moved)) }
  return {
    state: { ...moved, season },
    event: { type: 'matchday', date },
    played,
    notices,
    ...(pendingUserMatch ? { pendingUserMatch } : {}),
  }
}

/** Joga a temporada inteira (usado em testes e na simulação rápida). */
export function simulateToSeasonEnd(state: SeasonState, options: AdvanceOptions = {}): SeasonState {
  let current = state
  while (nextEvent(current).type === 'matchday') current = advanceToNextEvent(current, options).state
  return advanceToNextEvent(current, options).state
}

/**
 * Entrada de motor da partida do jogador: a escalação dele é a que ele deixou (só quem ficou
 * indisponível é trocado), o adversário usa a escalação da IA e a IA do motor não mexe no time do jogador.
 */
export function userMatchInput(state: SeasonState, match: Match, userTeamId: TeamId): MatchInput {
  const squads = groupByTeam(state.players)
  const teamOf = (id: TeamId) => state.teams.find((t) => t.id === id) as Team
  const cup = match.cup ? state.cups?.find((c) => c.id === match.competitionId) : undefined
  const rules = knockoutRulesFor(cup, match, state.matches)
  const side = (id: TeamId) => {
    const team = teamOf(id)
    const squad = cup ? cupView(squads.get(id) ?? [], cup.id) : (squads.get(id) ?? [])
    const tactic = id === userTeamId ? repairTactic(team.tactic, squad, lineupForeign(team)) : aiTactic(team, squad)
    return { team: { ...team, tactic }, players: squad }
  }
  return {
    home: side(match.homeTeamId),
    away: side(match.awayTeamId),
    seed: match.seed,
    attendance: matchAttendance(teamOf(match.homeTeamId), teamOf(match.awayTeamId)),
    userControlled: { home: match.homeTeamId === userTeamId, away: match.awayTeamId === userTeamId },
    ...(rules ? { knockout: rules } : {}),
    ...(match.cup?.neutral ? { neutral: true } : {}),
  }
}

/** Joga a partida do jogador sem intervenção (ele não muda nada durante o jogo). */
export function playUserMatchAuto(state: SeasonState, match: Match, userTeamId: TeamId): Match {
  return { ...match, status: 'finished', result: simulateMatch(userMatchInput(state, match, userTeamId)) }
}

/** Registra uma partida jogada fora de `advanceToNextEvent` (a do jogador): placar, jogadores e fase. */
export function completeMatch(state: SeasonState, played: Match): SeasonState {
  const home_ = state.teams.find((t) => t.id === played.homeTeamId) as Team
  const away_ = state.teams.find((t) => t.id === played.awayTeamId) as Team
  const gate = collectGate(home_, away_, played.date)
  const neutral = played.cup?.neutral === true
  const finished: Match = { ...played, attendance: gate.attendance }
  const squads = groupByTeam(state.players)
  const home = squads.get(finished.homeTeamId) ?? []
  const away = squads.get(finished.awayTeamId) ?? []
  const cup = finished.cup ? state.cups?.find((c) => c.id === finished.competitionId) : undefined
  const changed = new Map(applyMatchToPlayers(new Map([[finished.homeTeamId, home], [finished.awayTeamId, away]]), finished, cup ? cupScopeOf(cup) : undefined).map((p) => [p.id, p]))
  const matches = state.matches.map((m) => (m.id === finished.id ? finished : m))
  const moved = progressCups({
    ...state,
    matches,
    teams: state.teams.map((t) => (t.id === home_.id && !neutral ? gate.team : t)),
    players: state.players.map((p) => changed.get(p.id) ?? p),
  })
  return { ...moved, season: { ...moved.season, phase: phaseOfPyramid(moved, focusPyramid(moved)) } }
}

/** Troca a tática do time (o jogador edita a dele entre os jogos). Valida a escalação. */
export function setTeamTactic(state: SeasonState, teamId: TeamId, tactic: Tactic): SeasonState {
  const squad = state.players.filter((p) => p.teamId === teamId)
  const formation = formationOf(tactic)
  if (tactic.grid && gridProblem(tactic.grid)) throw new Error('Escalação inválida')
  const ids = new Set(squad.map((p) => p.id))
  if (tactic.startingXI.length !== formation.slots.length || new Set(tactic.startingXI).size !== tactic.startingXI.length || tactic.startingXI.some((id) => !ids.has(id))) {
    throw new Error('Escalação inválida')
  }
  if (tactic.bench.some((id) => !ids.has(id) || tactic.startingXI.includes(id))) throw new Error('Banco inválido')
  return { ...state, teams: state.teams.map((t) => (t.id === teamId ? { ...t, tactic } : t)) }
}
