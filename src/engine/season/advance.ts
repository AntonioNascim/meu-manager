/**
 * O jogo avança por dias: "avançar" pula até o próximo evento relevante.
 * Hoje o único evento é o dia de jogos; propostas e fim de janela entram nas etapas de mercado.
 */
import { simulateMatch } from '../match'
import type { IsoDate, Match, Player, Team, TeamId } from '../types'
import type { SeasonState } from './calendar'

/** Times e elencos usados para simular as partidas (dados do mundo, indexados). */
export interface SimulationContext {
  teams: ReadonlyMap<TeamId, Team>
  squads: ReadonlyMap<TeamId, readonly Player[]>
}

export function createSimulationContext(teams: readonly Team[], players: readonly Player[]): SimulationContext {
  const squads = new Map<TeamId, Player[]>(teams.map((t) => [t.id, []]))
  for (const p of players) if (p.teamId) squads.get(p.teamId)?.push(p)
  return { teams: new Map(teams.map((t) => [t.id, t])), squads }
}

export type SeasonEvent = { type: 'matchday'; date: IsoDate } | { type: 'season-end' }

/** Próximo evento a partir de `currentDate` (inclusive): o primeiro dia com jogos por disputar. */
export function nextEvent(state: SeasonState): SeasonEvent {
  let next: IsoDate | undefined
  for (const m of state.matches) {
    if (m.status === 'scheduled' && m.date >= state.season.currentDate && (next === undefined || m.date < next)) next = m.date
  }
  return next === undefined ? { type: 'season-end' } : { type: 'matchday', date: next }
}

/** Simula uma partida agendada com a seed dela (mesma seed = mesmo resultado). */
export function playMatch(match: Match, context: SimulationContext): Match {
  const home = context.teams.get(match.homeTeamId)
  const away = context.teams.get(match.awayTeamId)
  if (!home || !away) throw new Error(`Time não encontrado na partida ${match.id}`)
  const result = simulateMatch({
    home: { team: home, players: context.squads.get(home.id) ?? [] },
    away: { team: away, players: context.squads.get(away.id) ?? [] },
    seed: match.seed,
  })
  return { ...match, status: 'finished', result }
}

export interface AdvanceResult {
  state: SeasonState
  event: SeasonEvent
  /** Partidas simuladas neste avanço (vazio no fim da temporada). */
  played: Match[]
}

/**
 * Avança até o próximo evento: move a data para o dia dos jogos e simula todas as partidas dele.
 * Depois da última partida a fase passa para `end-of-season`.
 */
export function advanceToNextEvent(state: SeasonState, context: SimulationContext): AdvanceResult {
  const event = nextEvent(state)
  if (event.type === 'season-end') {
    const season = { ...state.season, phase: 'end-of-season' as const }
    return { state: { ...state, season }, event, played: [] }
  }

  const played: Match[] = []
  const matches = state.matches.map((m) => {
    if (m.status !== 'scheduled' || m.date !== event.date) return m
    const finished = playMatch(m, context)
    played.push(finished)
    return finished
  })
  const done = matches.every((m) => m.status === 'finished')
  const season = { ...state.season, currentDate: event.date, phase: done ? ('end-of-season' as const) : ('in-season' as const) }
  return { state: { season, matches }, event, played }
}

/** Joga a temporada inteira (usado em testes e na simulação rápida). */
export function simulateToSeasonEnd(state: SeasonState, context: SimulationContext): SeasonState {
  let current = state
  while (nextEvent(current).type === 'matchday') current = advanceToNextEvent(current, context).state
  return advanceToNextEvent(current, context).state
}
