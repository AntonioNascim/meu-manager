/**
 * O jogo avança por dias: "avançar" pula até o próximo evento relevante.
 * Hoje o único evento é o dia de jogos; propostas e fim de janela entram nas etapas de mercado.
 *
 * A cada avanço: passam os dias (recuperação física, lesões, moral), a IA escolhe a escalação de
 * cada time com o elenco que tem (rodando o elenco quando os titulares estão cansados), as
 * partidas do dia são simuladas e seus efeitos entram nos jogadores (condição, lesões,
 * suspensões, forma e moral).
 */
import { buildTactic, repairTactic } from '../lineup'
import { getFormation } from '../formations'
import { simulateMatch } from '../match'
import type { MatchInput } from '../match'
import type { IsoDate, Match, Player, PlayerId, Tactic, Team, TeamId } from '../types'
import type { SeasonState } from './calendar'
import { applyMatchToPlayers, progressDays } from './condition'
import { daysBetween } from './dates'

export type SeasonEvent = { type: 'matchday'; date: IsoDate } | { type: 'season-end' }

/** Próximo evento a partir de `currentDate` (inclusive): o primeiro dia com jogos por disputar. */
export function nextEvent(state: SeasonState): SeasonEvent {
  let next: IsoDate | undefined
  for (const m of state.matches) {
    if (m.status === 'scheduled' && m.date >= state.season.currentDate && (next === undefined || m.date < next)) next = m.date
  }
  return next === undefined ? { type: 'season-end' } : { type: 'matchday', date: next }
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
  const result = simulateMatch({ home, away, seed: match.seed })
  return { ...match, status: 'finished', result }
}

export interface AdvanceOptions {
  /**
   * Time do jogador. A IA não mexe nele: a escalação é a que o jogador deixou (só quem ficou
   * indisponível é trocado) e a partida dele não é simulada aqui, fica em `pendingUserMatch`
   * para ser jogada (ao vivo ou por `playUserMatchAuto`) e depois registrada com `completeMatch`.
   */
  userTeamId?: TeamId
}

export interface AdvanceResult {
  state: SeasonState
  event: SeasonEvent
  /** Partidas simuladas neste avanço (vazio no fim da temporada). */
  played: Match[]
  /** Partida do time do jogador neste dia, ainda por jogar. */
  pendingUserMatch?: Match
}

/**
 * Avança até o próximo evento: passa os dias até a data dos jogos, escala os times, simula todas as
 * partidas do dia e atualiza os jogadores. Depois da última partida a fase passa para `end-of-season`.
 */
export function advanceToNextEvent(state: SeasonState, options: AdvanceOptions = {}): AdvanceResult {
  const event = nextEvent(state)
  if (event.type === 'season-end') {
    const season = { ...state.season, phase: 'end-of-season' as const }
    return { state: { ...state, season }, event, played: [] }
  }

  const days = daysBetween(state.season.currentDate, event.date)
  const players = progressDays(state.players, days)
  const squads = groupByTeam(players)
  const teams = new Map(state.teams.map((t) => [t.id, t]))

  const { userTeamId } = options
  let pendingUserMatch: Match | undefined
  const played: Match[] = []
  const changed = new Map<PlayerId, Player>()
  const matches = state.matches.map((m) => {
    if (m.status !== 'scheduled' || m.date !== event.date) return m
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
    played.push(finished)
    return finished
  })

  const done = matches.every((m) => m.status === 'finished')
  const season = { ...state.season, currentDate: event.date, phase: done ? ('end-of-season' as const) : ('in-season' as const) }
  return {
    state: { ...state, season, matches, players: players.map((p) => changed.get(p.id) ?? p) },
    event,
    played,
    ...(pendingUserMatch ? { pendingUserMatch } : {}),
  }
}

/** Joga a temporada inteira (usado em testes e na simulação rápida). */
export function simulateToSeasonEnd(state: SeasonState): SeasonState {
  let current = state
  while (nextEvent(current).type === 'matchday') current = advanceToNextEvent(current).state
  return advanceToNextEvent(current).state
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
    userControlled: { home: match.homeTeamId === userTeamId, away: match.awayTeamId === userTeamId },
  }
}

/** Joga a partida do jogador sem intervenção (ele não muda nada durante o jogo). */
export function playUserMatchAuto(state: SeasonState, match: Match, userTeamId: TeamId): Match {
  return { ...match, status: 'finished', result: simulateMatch(userMatchInput(state, match, userTeamId)) }
}

/** Registra uma partida jogada fora de `advanceToNextEvent` (a do jogador): placar, jogadores e fase. */
export function completeMatch(state: SeasonState, finished: Match): SeasonState {
  const squads = groupByTeam(state.players)
  const home = squads.get(finished.homeTeamId) ?? []
  const away = squads.get(finished.awayTeamId) ?? []
  const changed = new Map(applyMatchToPlayers(new Map([[finished.homeTeamId, home], [finished.awayTeamId, away]]), finished).map((p) => [p.id, p]))
  const matches = state.matches.map((m) => (m.id === finished.id ? finished : m))
  const done = matches.every((m) => m.status === 'finished')
  return {
    ...state,
    matches,
    players: state.players.map((p) => changed.get(p.id) ?? p),
    season: { ...state.season, phase: done ? 'end-of-season' : 'in-season' },
  }
}

/** Troca a tática do time (o jogador edita a dele entre os jogos). Valida a escalação. */
export function setTeamTactic(state: SeasonState, teamId: TeamId, tactic: Tactic): SeasonState {
  const squad = state.players.filter((p) => p.teamId === teamId)
  const formation = getFormation(tactic.formationId)
  const ids = new Set(squad.map((p) => p.id))
  if (tactic.startingXI.length !== formation.slots.length || new Set(tactic.startingXI).size !== tactic.startingXI.length || tactic.startingXI.some((id) => !ids.has(id))) {
    throw new Error('Escalação inválida')
  }
  if (tactic.bench.some((id) => !ids.has(id) || tactic.startingXI.includes(id))) throw new Error('Banco inválido')
  return { ...state, teams: state.teams.map((t) => (t.id === teamId ? { ...t, tactic } : t)) }
}
