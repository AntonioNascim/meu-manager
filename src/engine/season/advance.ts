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
import { buildTactic, repairTactic } from '../lineup'
import { expireOffers, nextMarketEvent, refreshListings, resolveDueOffers, runMarketTick, runPreContractTick } from '../market'
import type { MarketEvent } from '../market'
import { formationOf } from '../formations'
import { gridProblem } from '../grid'
import { simulateMatch } from '../match'
import type { MatchInput } from '../match'
import type { IsoDate, MarketNotice, Match, Player, PlayerId, Tactic, Team, TeamId } from '../types'
import type { SeasonState } from './calendar'
import { applyTraining, fitnessProfile } from '../training'
import { settleDueContracts } from '../offseason/dueContracts'
import { applyBirthdays } from './birthdays'
import { applyMatchToPlayers, progressDays } from './condition'
import { slimResult } from './compact'
import { daysBetween } from './dates'

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
export function aiTactic(team: Team, squad: readonly Player[]) {
  return buildTactic(squad, { formationId: team.tactic.formationId, style: team.tactic.style, mentality: team.tactic.mentality }, { rested: true })
}

/** Simula uma partida agendada com a seed dela (mesma seed = mesmo resultado). */
export function playMatch(match: Match, home: { team: Team; players: readonly Player[] }, away: { team: Team; players: readonly Player[] }): Match {
  const attendance = matchAttendance(home.team, away.team)
  const result = simulateMatch({ home, away, seed: match.seed, attendance })
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
}

export interface AdvanceResult {
  state: SeasonState
  event: SeasonEvent
  /** Partidas simuladas neste avanço (vazio no fim da temporada). */
  played: Match[]
  /** Partida do time do jogador neste dia, ainda por jogar. */
  pendingUserMatch?: Match
  /** Avisos do mercado (janela, propostas recebidas e respondidas). */
  notices: MarketNotice[]
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

/**
 * Avança até o próximo evento: passa os dias, escala os times, simula as partidas do dia e atualiza
 * os jogadores. Com `market`, o mercado também gera eventos (abertura e último dia da janela, propostas
 * recebidas e respondidas); dias de negociação sem novidade para o jogador são atravessados em silêncio.
 * Depois da última partida a fase passa para `end-of-season`.
 */
export function advanceToNextEvent(state: SeasonState, options: AdvanceOptions = {}): AdvanceResult {
  let current = state
  const notices: MarketNotice[] = []
  for (;;) {
    const matchEvent = nextEvent(current)
    if (matchEvent.type === 'season-end') {
      const season = { ...current.season, phase: 'end-of-season' as const }
      return { state: { ...current, season }, event: matchEvent, played: [], notices }
    }
    const marketEvent = options.market ? nextMarketEvent(current) : undefined
    let date = marketEvent && marketEvent.date < matchEvent.date ? marketEvent.date : matchEvent.date
    // O fim do contrato de um jogador do técnico também é um dia a parar (se cair antes do próximo evento).
    const contractEnd = options.userTeamId ? nextContractEnd(current, options.userTeamId) : undefined
    if (contractEnd !== undefined && contractEnd < date) date = contractEnd
    const todayMarket = marketEvent && marketEvent.date === date ? marketEvent : undefined

    const passed = passDays(current, date, options, todayMarket)
    notices.push(...passed.notices)
    current = passed.state
    if (date < matchEvent.date) {
      // Dia só de mercado: para se há novidade para o jogador, senão segue para o próximo evento.
      if (notices.length > 0) return { state: current, event: { type: 'market', date }, played: [], notices }
      continue
    }
    return playMatchday(current, date, options, notices)
  }
}

/** Simula as partidas do dia (menos a do jogador, que fica pendente) e atualiza os jogadores. */
function playMatchday(state: SeasonState, date: IsoDate, options: AdvanceOptions, notices: MarketNotice[]): AdvanceResult {
  const squads = groupByTeam(state.players)
  const teams = new Map(state.teams.map((t) => [t.id, t]))

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
    const finished = playMatch(
      m,
      { team: { ...home, tactic: aiTactic(home, homeSquad) }, players: homeSquad },
      { team: { ...away, tactic: aiTactic(away, awaySquad) }, players: awaySquad },
    )
    for (const p of applyMatchToPlayers(new Map([[home.id, homeSquad], [away.id, awaySquad]]), finished)) changed.set(p.id, p)
    teams.set(home.id, collectGate(home, away, m.date).team)
    played.push(finished)
    // O que fica na temporada é o resultado enxuto (narração e notas já foram usadas nos jogadores): a memória não cresce com os lances de milhares de jogos.
    return finished.result ? { ...finished, result: slimResult(finished.result) } : finished
  })

  const done = matches.every((m) => m.status === 'finished')
  const season = { ...state.season, phase: done ? ('end-of-season' as const) : ('in-season' as const) }
  return {
    state: { ...state, season, matches, teams: state.teams.map((t) => teams.get(t.id) ?? t), players: state.players.map((p) => changed.get(p.id) ?? p) },
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
  const side = (id: TeamId) => {
    const team = teamOf(id)
    const squad = squads.get(id) ?? []
    const tactic = id === userTeamId ? repairTactic(team.tactic, squad) : aiTactic(team, squad)
    return { team: { ...team, tactic }, players: squad }
  }
  return {
    home: side(match.homeTeamId),
    away: side(match.awayTeamId),
    seed: match.seed,
    attendance: matchAttendance(teamOf(match.homeTeamId), teamOf(match.awayTeamId)),
    userControlled: { home: match.homeTeamId === userTeamId, away: match.awayTeamId === userTeamId },
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
  const finished: Match = { ...played, attendance: gate.attendance }
  const squads = groupByTeam(state.players)
  const home = squads.get(finished.homeTeamId) ?? []
  const away = squads.get(finished.awayTeamId) ?? []
  const changed = new Map(applyMatchToPlayers(new Map([[finished.homeTeamId, home], [finished.awayTeamId, away]]), finished).map((p) => [p.id, p]))
  const matches = state.matches.map((m) => (m.id === finished.id ? finished : m))
  const done = matches.every((m) => m.status === 'finished')
  return {
    ...state,
    matches,
    teams: state.teams.map((t) => (t.id === home_.id ? gate.team : t)),
    players: state.players.map((p) => changed.get(p.id) ?? p),
    season: { ...state.season, phase: done ? 'end-of-season' : 'in-season' },
  }
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
