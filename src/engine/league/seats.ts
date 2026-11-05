/**
 * Vagas de técnicos numa liga já em andamento (Fase 6, B8.3): entrar, sair e iniciar. Puro. O mundo continua o mesmo; quem entra assume um clube
 * da IA, quem sai devolve o clube à IA (a regra do motor para clubes sem técnico humano é `humanTeamIds`, que vem das vagas).
 */
import type { SeasonState } from '../season'
import type { TeamId } from '../types'
import { createLeague, refreshEvents, type LeagueConfig, type LeagueState, type Seat } from './runner'

export type SeatError = 'unknown-team' | 'team-taken' | 'already-seated' | 'not-seated'

export type SeatResult = { ok: true; league: LeagueState } | { ok: false; error: SeatError }

/** Começa a liga (sai do saguão): o relógio parte de `now` com os técnicos que já escolheram clube. */
export function startLeague(config: LeagueConfig, world: SeasonState, members: readonly { teamId: TeamId; playerId: string }[], now: number): LeagueState {
  return createLeague(config, world, members, now)
}

/** Um técnico assume um clube livre. O calendário de eventos é refeito com as partidas dele. */
export function addSeat(league: LeagueState, world: SeasonState, playerId: string, teamId: TeamId, now: number): SeatResult {
  if (!world.teams.some((t) => t.id === teamId)) return { ok: false, error: 'unknown-team' }
  if (league.seats.some((s) => s.playerId === playerId)) return { ok: false, error: 'already-seated' }
  if (league.seats.some((s) => s.teamId === teamId)) return { ok: false, error: 'team-taken' }
  const seat: Seat = { teamId, playerId, status: 'active', ready: false, missed: 0, lastActiveAt: now }
  return { ok: true, league: refreshEvents({ ...league, seats: [...league.seats, seat] }, world) }
}

export type RemoveResult = { ok: true; league: LeagueState; deferred: boolean } | { ok: false; error: 'not-seated' }

/**
 * Um técnico sai (por vontade própria, removido pelo ADM ou conta apagada). Se o clube tem partida no evento em andamento, ele joga o resto com a IA
 * e a vaga só fecha quando o evento acabar (`deferred`); senão fecha agora.
 */
export function removeSeat(league: LeagueState, world: SeasonState, playerId: string): RemoveResult {
  const seat = league.seats.find((s) => s.playerId === playerId)
  if (!seat) return { ok: false, error: 'not-seated' }
  const playing = (league.current?.pending ?? []).some((id) => {
    const m = world.matches.find((x) => x.id === id)
    return !!m && (m.homeTeamId === seat.teamId || m.awayTeamId === seat.teamId)
  })
  if (playing) return { ok: true, deferred: true, league: { ...league, seats: league.seats.map((s) => (s.playerId === playerId ? { ...s, leaving: true, status: 'autopilot' as const } : s)) } }
  return { ok: true, deferred: false, league: refreshEvents({ ...league, seats: league.seats.filter((s) => s.playerId !== playerId) }, world) }
}

/** Fecha as vagas de quem pediu para sair durante um evento (chame quando o evento acaba). */
export function dropLeavingSeats(league: LeagueState, world: SeasonState): LeagueState {
  if (!league.seats.some((s) => s.leaving)) return league
  return refreshEvents({ ...league, seats: league.seats.filter((s) => !s.leaving) }, world)
}
