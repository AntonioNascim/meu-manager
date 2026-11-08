/**
 * O que a tela da liga mostra (B8.4): calendário, quem está pronto, pausa e o que o ADM confirma antes de Avançar. Puro: só lê o estado da liga e do
 * mundo. Os horários saem em milissegundos; quem formata (no fuso do aparelho) é a interface.
 */
import type { IsoDate } from '../types'
import type { SeasonState } from '../season'
import { dateOfDay, type ScheduledEvent } from './clock'
import { markPresent, suggestionsFor, type AbsenceSuggestion } from './absence'
import { bookOf, type TradeRecord, type TradeReport } from './trade'
import { LEAGUE_TRADE } from '../config'
import { fixturesOn, type LeagueFixture } from './cupsView'
import { MAX_PAUSE_MS, ROOM_OPENS_BEFORE_MS, type PaceId } from './pace'
import { notReady, requiredSeats, upcoming, waitingDeadlineAt, type LeagueState, type LogType, type SeatStatus } from './runner'

export interface ViewEvent {
  date: IsoDate
  startAt: number
  kind: ScheduledEvent['kind']
  /** Os jogos de técnicos humanos nesta data (liga ou copa, com a fase). */
  fixtures?: LeagueFixture[]
}

export interface ViewSeat {
  playerId: string
  teamId: string
  status: SeatStatus
  ready: boolean
  /** Tem partida no próximo evento (só quem tem precisa dar "Pronto"). */
  required: boolean
  missed: number
  leaving: boolean
  /** Última vez que o técnico apareceu (jogou, deu Pronto ou abriu o jogo); sem registro, a entrada na liga. */
  lastActiveAt: number
}

export interface ViewLog {
  at: number
  type: LogType
  by?: string
  date?: IsoDate
}

export interface LeagueView {
  now: number
  worldDate: IsoDate
  /** Ano da temporada do técnico da liga (do mundo). */
  season: number
  /** Jogos do clube de quem consulta na temporada (todas as competições): `played` de `total`. */
  progress?: { played: number; total: number }
  pace: PaceId
  band: string
  tzOffsetMin: number
  directResult: boolean
  paused: boolean
  pausedAt?: number
  /** Quando a pausa acaba sozinha (limite de 30 dias). */
  autoResumeAt?: number
  /** O próximo evento de partidas (as âncoras não aparecem). */
  next?: ViewEvent & { roomOpensAt: number; required: string[]; notReady: string[]; /** O jogo já chegou na hora e a partida espera o Pronto; `deadlineAt` é quando começa sozinha. */ waiting?: { openedAt: number; deadlineAt?: number } }
  /** Calendário das próximas semanas (só eventos com partidas). */
  events: ViewEvent[]
  /** `playing`: técnicos cujo clube tem partida neste evento (quem não joga não tem o que ver ao vivo). */
  current?: { date: IsoDate; startedAt: number; pending: number; all: number; playing: string[]; /** Técnicos que não deram Pronto: a IA joga por eles e eles não entram no meio da partida. */ locked: string[]; fixtures: LeagueFixture[] }
  seats: ViewSeat[]
  log: ViewLog[]
  /** Só para o ADM (a API tira dos outros): quem passaria do limite de ausência. */
  suggestions: AbsenceSuggestion[]
  /** Histórico público de transferências entre técnicos e contratações de jogador livre (as mais recentes primeiro). */
  transfers: TradeRecord[]
  /** Só para o ADM (a API tira dos outros): denúncias de transferências. */
  reports: TradeReport[]
}

/** Jogos feitos e a fazer do clube na temporada (liga e copas). */
function progressOf(world: SeasonState, teamId: string): { played: number; total: number } {
  let played = 0
  let total = 0
  for (const m of world.matches) {
    if (m.homeTeamId !== teamId && m.awayTeamId !== teamId) continue
    total++
    if (m.status === 'finished') played++
  }
  return { played, total }
}

/** Técnicos cujo clube joga no evento em andamento. */
function playingIn(league: LeagueState, world: SeasonState): string[] {
  const ids = new Set(league.current?.all ?? [])
  const teams = new Set<string>()
  for (const m of world.matches) if (ids.has(m.id)) (teams.add(m.homeTeamId), teams.add(m.awayTeamId))
  return league.seats.filter((s) => teams.has(s.teamId)).map((s) => s.playerId)
}

export function leagueView(league: LeagueState, world: SeasonState, now: number, joinedAt: (playerId: string) => number, viewerTeamId?: string): LeagueView {
  const required = new Set(requiredSeats(league, world).map((s) => s.playerId))
  const matchEvents = upcoming(league, now).filter((e) => e.kind === 'match')
  const firstMatch = league.clock.events.find((e) => e.kind === 'match')
  const paused = league.clock.pausedAt !== undefined
  // Os jogos de técnicos humanos de cada data que a tela mostra (liga ou copa, com a fase), numa passada só pelas partidas.
  const shown = matchEvents.slice(0, 12)
  const humans = new Set(league.seats.map((s) => s.teamId))
  const dates = new Set<string>(shown.map((e) => e.date))
  if (firstMatch) dates.add(dateOfDay(firstMatch.day))
  if (league.current) dates.add(league.current.date)
  const fixtures = fixturesOn(world, humans, dates, true)
  return {
    now,
    worldDate: world.season.currentDate,
    season: world.season.year,
    ...(viewerTeamId ? { progress: progressOf(world, viewerTeamId) } : {}),
    pace: league.config.clock.pace,
    band: league.config.clock.band.id,
    tzOffsetMin: league.config.clock.tzOffsetMin,
    directResult: league.config.directResult,
    paused,
    ...(paused ? { pausedAt: league.clock.pausedAt as number, autoResumeAt: (league.clock.pausedAt as number) + MAX_PAUSE_MS } : {}),
    ...(firstMatch
      ? { next: { date: dateOfDay(firstMatch.day), startAt: firstMatch.startAt, kind: 'match' as const, fixtures: fixtures.get(dateOfDay(firstMatch.day)) ?? [], roomOpensAt: firstMatch.startAt - ROOM_OPENS_BEFORE_MS, required: [...required], notReady: notReady(league, world).map((s) => s.playerId), ...(league.waiting ? { waiting: { openedAt: league.waiting.openedAt, ...(waitingDeadlineAt(league) !== undefined ? { deadlineAt: waitingDeadlineAt(league) as number } : {}) } } : {}) } }
      : {}),
    events: shown.map((e) => ({ ...e, fixtures: fixtures.get(e.date) ?? [] })),
    ...(league.current ? { current: { date: league.current.date, startedAt: league.current.startedAt, pending: league.current.pending.length, all: league.current.all.length, playing: playingIn(league, world), locked: league.current.locked ?? [], fixtures: fixtures.get(league.current.date) ?? [] } } : {}),
    seats: league.seats.map((s) => ({ playerId: s.playerId, teamId: s.teamId, status: s.status, ready: s.ready, required: required.has(s.playerId), missed: s.missed ?? 0, leaving: s.leaving === true, lastActiveAt: s.lastActiveAt ?? joinedAt(s.playerId) })),
    log: league.log.filter((l) => l.type !== 'tick').slice(-15).map((l) => ({ at: l.at, type: l.type, ...(l.by ? { by: l.by } : {}), ...(l.date ? { date: l.date } : {}) })),
    suggestions: suggestionsFor(league.seats, now, joinedAt),
    transfers: [...bookOf(league).history].reverse().slice(0, LEAGUE_TRADE.historyShown),
    reports: bookOf(league).reports,
  }
}

/** O técnico deu (ou tirou) o "Pronto". Dar "Pronto" também conta como presença: volta de ausente para ativo. */
export function setPlayerReady(league: LeagueState, playerId: string, ready: boolean, now: number): LeagueState {
  return { ...league, seats: league.seats.map((s) => (s.playerId === playerId ? (ready ? { ...markPresent(s, now), ready: true } : { ...s, ready: false }) : s)) }
}
