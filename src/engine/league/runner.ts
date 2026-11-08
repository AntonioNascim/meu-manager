/**
 * A liga online andando (Fase 6, B6; proposta, seções 2.2 a 2.5 e 2.8). Puro: o mundo (`SeasonState`) e o estado da liga (`LeagueState`, só dados) entram e
 * saem; o tempo real (`now`) e a virada de temporada (`turn`) entram por parâmetro. Quem chama (o Durable Object, na B7) grava os dois estados e agenda
 * o próximo alarme em `nextWakeup`.
 *
 *   agendado ─▶ (todos prontos │ chegou o horário │ ADM avança) ─▶ ao vivo ─▶ encerrado ─▶ próximo evento
 *      (qualquer estado) ─ ADM pausa ─▶ pausada ─ ADM retoma ─▶ (volta ao estado em que estava)
 *
 * Partidas de clubes humanos são jogadas lance a lance (no automático, no "resultado direto"; ao vivo, pela B7, que entrega os resultados em
 * `submitResult`); todas as outras partidas do mundo usam o resultado simplificado (`humanTeamIds` no avanço). Nada aqui lê o relógio da máquina.
 */
import { simulateMatch } from '../match'
import type { MatchResult } from '../types'
import { advanceUntil, completeMatch, humanMatchInput } from '../season/advance'
import type { SeasonState, TurnRunner } from '../season'
import { addDays } from '../season/dates'
import type { IsoDate, Match, TeamId } from '../types'
import {
  dateOfDay,
  dayOf,
  effectiveNow,
  gameDate,
  gameDay,
  newClock,
  nextEvent,
  nextTickAt,
  pauseClock,
  replanClock,
  resumeClock,
  startEvent,
  type ClockConfig,
  type ClockState,
  type ScheduledEvent,
} from './clock'
import { DEFAULT_TICK_HOUR, MAX_PAUSE_MS, READY_WAIT_MS, ROOM_OPENS_BEFORE_MS, SCHEDULE_HORIZON_MS, type PaceId } from './pace'

export type SeatStatus = 'active' | 'absent' | 'autopilot'

export interface Seat {
  teamId: TeamId
  playerId: string
  /** `absent` e `autopilot`: a IA assume o time na partida e o técnico conta como pronto (proposta, 2.8). */
  status: SeatStatus
  /** Deu "Pronto" para o próximo evento. */
  ready: boolean
  /** Partidas humanas seguidas sem técnico presente (B7, `absence.ts`). */
  missed?: number
  /** Última vez (ms) que o técnico esteve presente numa partida ou deu Pronto; sem valor, vale a entrada na liga. */
  lastActiveAt?: number
  /** Pediu para sair no meio de um evento: joga o resto com a IA e sai quando o evento acabar (B8.3). */
  leaving?: boolean
}

export interface LeagueConfig {
  clock: ClockConfig
  /** Resultado direto: o evento simula no horário e mostra o relatório, sem ao vivo. */
  directResult: boolean
  /** Hora local da passagem diária. */
  tickHour: number
}

export type LogType = 'created' | 'event-started' | 'event-ended' | 'advance' | 'pause' | 'resume' | 'auto-resume' | 'tick'

export interface LogEntry {
  at: number
  type: LogType
  /** Quem fez (ADM) ou o motivo. */
  by?: string
  date?: IsoDate
  detail?: string
}

/** O evento em andamento: as partidas humanas ainda por registrar. */
export interface CurrentEvent {
  date: IsoDate
  startedAt: number
  pending: string[]
  all: string[]
  reason: 'time' | 'all-ready' | 'advance' | 'anchor'
  /** Técnicos que não deram Pronto até o começo: a IA joga por eles e eles não entram no meio da partida. */
  locked?: string[]
}

/** O jogo chegou na hora (ou o ADM avançou) e a partida espera os técnicos darem Pronto. `deadline` está no relógio dos prazos (congela na pausa). */
export interface Waiting {
  day: number
  openedAt: number
  deadline: number
}

export interface LeagueState {
  config: LeagueConfig
  clock: ClockState
  seats: Seat[]
  current?: CurrentEvent
  /** A sala do próximo jogo está esperando o Pronto (a partida ainda não começou). */
  waiting?: Waiting
  /** Próxima passagem diária. */
  nextTick: number
  log: LogEntry[]
  /** Mercado entre técnicos humanos (B8.6, `trade.ts`); ausente nas ligas de antes dela. */
  trades?: import('./trade').TradeBook
}

export interface LeagueDeps {
  turn: TurnRunner
  /** Liga o mercado da IA nos avanços (padrão: sim). */
  market?: boolean
}

export type LeagueAction =
  | { type: 'tick'; date: IsoDate }
  | { type: 'event-started'; date: IsoDate; matchIds: string[]; reason: CurrentEvent['reason'] }
  | { type: 'event-ended'; date: IsoDate }
  | { type: 'paused' }
  | { type: 'resumed'; auto: boolean }

export interface Stepped {
  league: LeagueState
  world: SeasonState
  actions: LeagueAction[]
}

const LOG_MAX = 200
const log = (league: LeagueState, entry: LogEntry): LeagueState => ({ ...league, log: [...league.log, entry].slice(-LOG_MAX) })
const humanIds = (league: LeagueState): TeamId[] => league.seats.map((s) => s.teamId)
/** Na virada de temporada só os técnicos ativos decidem contratos e base; os ausentes e em piloto automático ficam com a IA (B8.7). */
const activeIds = (league: LeagueState): TeamId[] => league.seats.filter((s) => s.status === 'active').map((s) => s.teamId)
const optionsOf = (league: LeagueState, deps: LeagueDeps) => ({ humanTeamIds: humanIds(league), turnHumanTeamIds: activeIds(league), market: deps.market ?? true, turn: deps.turn })

/** Dias (do relógio) de todos os eventos que o mundo ainda tem: datas com partida de humano e âncoras (último dia da temporada de cada país). */
export function eventDaysOf(world: SeasonState, seats: readonly Seat[]): { day: number; kind: ScheduledEvent['kind'] }[] {
  const humans = new Set(seats.map((s) => s.teamId))
  const today = world.season.currentDate
  const matchDays = new Set<number>()
  for (const m of world.matches) if (m.status === 'scheduled' && m.date > today && (humans.has(m.homeTeamId) || humans.has(m.awayTeamId))) matchDays.add(dayOf(m.date))
  const out: { day: number; kind: ScheduledEvent['kind'] }[] = [...matchDays].map((day) => ({ day, kind: 'match' as const }))
  for (const cycle of Object.values(world.cycles)) {
    const day = dayOf(cycle.end)
    if (cycle.end > today && !matchDays.has(day)) out.push({ day, kind: 'anchor' })
  }
  return out.sort((a, b) => a.day - b.day)
}

/** Cria a liga: o relógio parte da data do mundo, no instante `now`. */
export function createLeague(config: LeagueConfig, world: SeasonState, seats: readonly { teamId: TeamId; playerId: string }[], now: number): LeagueState {
  const full: Seat[] = seats.map((s) => ({ ...s, status: 'active', ready: false }))
  const clock = newClock(config.clock, now, world.season.currentDate, eventDaysOf(world, full))
  return { config, clock, seats: full, nextTick: nextTickAt(now, config.clock, config.tickHour), log: [{ at: now, type: 'created', date: world.season.currentDate }] }
}

export const defaultLeagueConfig = (clock: ClockConfig, directResult = false): LeagueConfig => ({ clock, directResult, tickHour: DEFAULT_TICK_HOUR })

// ---------------------------------------------------------------- consulta

/** Os técnicos que têm partida no próximo evento (só eles precisam dar "Pronto"). */
export function requiredSeats(league: LeagueState, world: SeasonState): Seat[] {
  const ev = nextEvent(league.clock)
  if (!ev || ev.kind !== 'match') return []
  const date = dateOfDay(ev.day)
  const playing = new Set<TeamId>()
  for (const m of world.matches) if (m.status === 'scheduled' && m.date === date) (playing.add(m.homeTeamId), playing.add(m.awayTeamId))
  return league.seats.filter((s) => playing.has(s.teamId))
}

/** Quem ainda não está pronto (ausentes e autopiloto contam como prontos). */
export function notReady(league: LeagueState, world: SeasonState): Seat[] {
  return requiredSeats(league, world).filter((s) => s.status === 'active' && !s.ready)
}

/** A sala abre alguns minutos antes do horário: só então o evento pode começar por "todos prontos". */
export function roomOpen(league: LeagueState, now: number): boolean {
  const ev = nextEvent(league.clock)
  return !!ev && ev.kind === 'match' && now >= ev.startAt - ROOM_OPENS_BEFORE_MS
}

/** Hoje (`now`) o próximo evento já pode começar? Pelo horário, ou com a sala aberta e todos prontos. */
export function shouldStart(league: LeagueState, world: SeasonState, now: number): 'time' | 'all-ready' | false {
  const ev = nextEvent(league.clock)
  if (!ev || league.clock.pausedAt !== undefined || league.current) return false
  if (ev.kind === 'anchor') return now >= ev.startAt ? 'time' : false
  // Jogo com técnicos: o horário só abre a sala (`openWaiting`); a partida começa quando todos dão Pronto ou quando o prazo acaba.
  if (league.waiting) {
    if (notReady(league, world).length === 0) return 'all-ready'
    return deadlineExpired(league, now, league.waiting.deadline) ? 'time' : false
  }
  if (now >= ev.startAt) return false
  if (roomOpen(league, now) && requiredSeats(league, world).length > 0 && notReady(league, world).length === 0) return 'all-ready'
  return false
}

/** O horário do jogo chegou (ou o ADM avançou): a sala abre e espera o Pronto até o prazo do ritmo. O relógio do mundo já vale a data do jogo. */
export function openWaiting(league: LeagueState, now: number): LeagueState {
  const ev = nextEvent(league.clock)
  if (!ev || ev.kind !== 'match' || league.waiting || league.current) return league
  const [, ...rest] = league.clock.events
  const clock = ev.startAt > now ? { ...league.clock, events: [{ ...ev, startAt: now }, ...rest] } : league.clock
  return { ...league, clock, waiting: { day: ev.day, openedAt: now, deadline: deadlineIn(league, now, READY_WAIT_MS[league.config.clock.pace]) } }
}

/** O instante real em que a partida começa sozinha (só com a sala esperando e a liga andando). */
export const waitingDeadlineAt = (league: LeagueState): number | undefined => (league.waiting && league.clock.pausedAt === undefined ? league.waiting.deadline + league.clock.pausedTotalMs : undefined)

/** A data do mundo que a liga deveria ter alcançado em `now` (os dias completos de `D`). */
export const worldDateAt = (league: LeagueState, now: number): IsoDate => gameDate(league.clock, now, league.config.clock)

/** Quando a liga precisa ser acordada de novo (alarme do Durable Object); `undefined` se nada está agendado. */
export function nextWakeup(league: LeagueState, now: number): number | undefined {
  const c = league.clock
  if (c.pausedAt !== undefined) return c.pausedAt + MAX_PAUSE_MS
  if (league.current) return undefined // espera os resultados (B7); a conexão acorda a liga
  if (league.waiting) return waitingDeadlineAt(league)
  const ev = nextEvent(c)
  const times = [league.nextTick, ev ? ev.startAt : undefined, ev?.kind === 'match' ? ev.startAt - ROOM_OPENS_BEFORE_MS : undefined].filter((t): t is number => t !== undefined && t > now - 1)
  return times.length > 0 ? Math.min(...times) : undefined
}

/** O calendário visível: os eventos das próximas 4 semanas (ou menos). */
export function upcoming(league: LeagueState, now: number): { date: IsoDate; startAt: number; kind: ScheduledEvent['kind'] }[] {
  return league.clock.events.filter((e) => e.startAt <= now + SCHEDULE_HORIZON_MS).map((e) => ({ date: dateOfDay(e.day), startAt: e.startAt, kind: e.kind }))
}

/** Relógio dos prazos (ofertas entre humanos, por exemplo): congela sozinho na pausa. */
export const deadlineIn = (league: LeagueState, now: number, ms: number): number => effectiveNow(league.clock, now) + ms
export const deadlineLeft = (league: LeagueState, now: number, deadline: number): number => Math.max(0, deadline - effectiveNow(league.clock, now))
export const deadlineExpired = (league: LeagueState, now: number, deadline: number): boolean => deadlineLeft(league, now, deadline) === 0

// ---------------------------------------------------------------- ações dos técnicos e do ADM

export function setReady(league: LeagueState, playerId: string, ready = true): LeagueState {
  return { ...league, seats: league.seats.map((s) => (s.playerId === playerId ? { ...s, ready } : s)) }
}

export function setSeatStatus(league: LeagueState, playerId: string, status: SeatStatus): LeagueState {
  return { ...league, seats: league.seats.map((s) => (s.playerId === playerId ? { ...s, status } : s)) }
}

/** O que o ADM vê antes de confirmar o Avançar: quem ainda não está pronto e a data a que o relógio salta. */
export function previewAdvance(league: LeagueState, world: SeasonState): { date: IsoDate; notReady: string[] } | undefined {
  const ev = nextEvent(league.clock)
  return ev ? { date: dateOfDay(ev.day), notReady: notReady(league, world).map((s) => s.playerId) } : undefined
}

export function refreshEvents(league: LeagueState, world: SeasonState): LeagueState {
  const days = eventDaysOf(world, league.seats)
  const same = days.length === league.clock.events.length && days.every((d, i) => d.day === league.clock.events[i]!.day && d.kind === league.clock.events[i]!.kind)
  return same ? league : { ...league, clock: replanClock(league.clock, league.config.clock, days) }
}

export function pauseLeague(league: LeagueState, now: number, by?: string): Stepped['league'] {
  if (league.clock.pausedAt !== undefined) return league
  return log({ ...league, clock: pauseClock(league.clock, now) }, { at: now, type: 'pause', by })
}

export function resumeLeague(league: LeagueState, world: SeasonState, now: number, by?: string, auto = false): LeagueState {
  if (league.clock.pausedAt === undefined) return league
  const day = gameDay(league.clock, now, league.config.clock)
  const waitingEvent = league.waiting ? league.clock.events.find((e) => e.day === league.waiting!.day) : undefined
  const days = eventDaysOf(world, league.seats).filter((e) => e.day > day)
  const resumed = resumeClock(league.clock, now, league.config.clock, days)
  const clock = waitingEvent ? { ...resumed, events: [{ ...waitingEvent, startAt: Math.min(waitingEvent.startAt, now) }, ...resumed.events] } : resumed
  return log({ ...league, clock, nextTick: nextTickAt(now, league.config.clock, league.config.tickHour) }, { at: now, type: auto ? 'auto-resume' : 'resume', by })
}

// ---------------------------------------------------------------- andamento

/** Põe o mundo na data do evento e abre a lista de partidas humanas. */
function beginEvent(league: LeagueState, world: SeasonState, now: number, deps: LeagueDeps, reason: CurrentEvent['reason'], by?: string): Stepped {
  const ev = nextEvent(league.clock) as ScheduledEvent
  const date = dateOfDay(ev.day)
  const started = startEvent(league.clock, now)
  let current = world
  const actions: LeagueAction[] = []
  const step = date > world.season.currentDate ? advanceUntil(world, date, optionsOf(league, deps)) : undefined
  if (step) current = step.state
  const pending = (step?.pendingHumanMatches ?? []).map((m) => m.id)
  const locked = ev.kind === 'match' ? notReady(league, world).map((s) => s.playerId) : []
  const seats = league.seats.map((s) => ({ ...s, ready: false }))
  let next: LeagueState = { ...league, clock: started.clock, seats, waiting: undefined }
  next = log(next, { at: now, type: reason === 'advance' ? 'advance' : 'event-started', date, detail: reason, ...(by !== undefined ? { by } : {}) })
  if (pending.length === 0) {
    actions.push({ type: 'event-ended', date })
    return { league: refreshEvents(log(next, { at: now, type: 'event-ended', date }), current), world: current, actions }
  }
  next = { ...next, current: { date, startedAt: now, pending, all: pending, reason: ev.kind === 'anchor' ? 'anchor' : reason, ...(locked.length > 0 ? { locked } : {}) } }
  actions.push({ type: 'event-started', date, matchIds: pending, reason })
  return { league: next, world: current, actions }
}

/** Joga já (lance a lance, no automático) todas as partidas humanas do evento. É o "resultado direto". */
function playDirect(league: LeagueState, world: SeasonState, now: number): Stepped {
  let current = world
  let next = league
  const humans = new Set(humanIds(league))
  const away = new Set(league.seats.filter((s) => s.status !== 'active').map((s) => s.teamId))
  for (const id of [...(league.current?.pending ?? [])]) {
    const match = current.matches.find((m) => m.id === id) as Match
    const result = simulateMatch(humanMatchInput(current, match, humans, away))
    const done = submitResult({ league: next, world: current, actions: [] }, id, result, now)
    next = done.league
    current = done.world
  }
  return { league: next, world: current, actions: [] }
}

/**
 * Registra o resultado de uma partida humana (a B7 entrega o das partidas ao vivo; o resultado direto usa isto também). Quando a última do evento
 * é registrada, o evento termina.
 */
export function submitResult(from: Stepped, matchId: string, result: MatchResult, now: number): Stepped {
  const { league, world } = from
  const cur = league.current
  if (!cur || !cur.pending.includes(matchId)) return from
  const match = world.matches.find((m) => m.id === matchId) as Match
  const moved = completeMatch(world, { ...match, status: 'finished', result })
  const pending = cur.pending.filter((id) => id !== matchId)
  if (pending.length > 0) return { league: { ...league, current: { ...cur, pending } }, world: moved, actions: from.actions }
  const ended: LeagueState = log({ ...league, current: undefined }, { at: now, type: 'event-ended', date: cur.date })
  return { league: refreshEvents(ended, moved), world: moved, actions: [...from.actions, { type: 'event-ended', date: cur.date }] }
}

/**
 * O ADM mandou Avançar: pula a espera até o horário do próximo jogo. A sala abre ("Jogo pronto · Agora") e a partida só começa quando todos os técnicos
 * que jogam derem Pronto ou quando o prazo acabar. Âncoras (virada de um país) no caminho passam direto. Os horários dos eventos seguintes não mudam.
 */
export function advanceLeague(league: LeagueState, world: SeasonState, now: number, deps: LeagueDeps, by?: string): Stepped {
  let state: Stepped = { league, world, actions: [] }
  for (let guard = 0; guard < 20; guard++) {
    const l = state.league
    const ev = nextEvent(l.clock)
    if (l.clock.pausedAt !== undefined || l.current || l.waiting || !ev) break
    if (ev.kind === 'anchor') {
      const started = beginEvent(l, state.world, now, deps, 'advance', by)
      state = { league: started.league, world: started.world, actions: [...state.actions, ...started.actions] }
      continue
    }
    state = { ...state, league: log(openWaiting(l, now), { at: now, type: 'advance', date: dateOfDay(ev.day), ...(by !== undefined ? { by } : {}) }) }
    break
  }
  return state
}

function finishDirect(from: Stepped, now: number): Stepped {
  const done = playDirect(from.league, from.world, now)
  return { league: done.league, world: done.world, actions: [...from.actions, ...done.actions] }
}

/** Passagem diária: leva o mundo à data devida de `D` (competições sem humano, treino, condição, finanças, mercado da IA e a virada dos países). */
function tick(league: LeagueState, world: SeasonState, now: number, deps: LeagueDeps): Stepped {
  const ev = nextEvent(league.clock)
  const due = worldDateAt(league, now)
  // Nunca alcança a data do próximo evento antes de ele começar (as partidas humanas daquele dia ainda não foram jogadas).
  const target = ev && due >= dateOfDay(ev.day) ? addDays(dateOfDay(ev.day), -1) : due
  let current = world
  const actions: LeagueAction[] = []
  if (target > world.season.currentDate) {
    current = advanceUntil(world, target, optionsOf(league, deps)).state
    actions.push({ type: 'tick', date: target })
  }
  const next = refreshEvents({ ...league, nextTick: nextTickAt(now, league.config.clock, league.config.tickHour) }, current)
  return { league: next, world: current, actions }
}

/**
 * Faz tudo o que está devido em `now` e devolve o novo estado. Pode ser chamado a qualquer momento (alarme, conexão, botão): se nada é devido, nada muda.
 * Uma pausa, ou um evento ao vivo com resultados por chegar, trava o resto.
 */
export function processLeague(league: LeagueState, world: SeasonState, now: number, deps: LeagueDeps): Stepped {
  let state: Stepped = { league, world, actions: [] }
  for (let guard = 0; guard < 60; guard++) {
    const l = state.league
    if (l.clock.pausedAt !== undefined) {
      if (now - l.clock.pausedAt < MAX_PAUSE_MS) break
      state = { ...state, league: resumeLeague(l, state.world, now, undefined, true), actions: [...state.actions, { type: 'resumed', auto: true }] }
      continue
    }
    if (l.current) break
    const ev = nextEvent(l.clock)
    if (ev?.kind === 'match' && !l.waiting && now >= ev.startAt) {
      state = { ...state, league: openWaiting(l, now) }
      continue
    }
    const why = shouldStart(l, state.world, now)
    if (why) {
      const started = beginEvent(l, state.world, now, deps, why)
      const next = l.config.directResult && started.league.current ? finishDirect(started, now) : started
      state = { league: next.league, world: next.world, actions: [...state.actions, ...next.actions] }
      continue
    }
    if (now >= l.nextTick) {
      const ticked = tick(l, state.world, now, deps)
      state = { league: ticked.league, world: ticked.world, actions: [...state.actions, ...ticked.actions] }
      continue
    }
    break
  }
  return state
}

/**
 * O ADM mudou o ritmo (B8.4): os horários dos eventos futuros são refeitos a partir de agora com o ritmo novo; o que já aconteceu não muda.
 * Só vale com nenhum evento em andamento; em pausa, os horários se refazem na retomada.
 */
export function replanForPace(league: LeagueState, world: SeasonState, pace: PaceId): LeagueState {
  if (league.config.clock.pace === pace || league.current || league.waiting) return league
  const config: LeagueConfig = { ...league.config, clock: { ...league.config.clock, pace } }
  const days = eventDaysOf(world, league.seats)
  const base: LeagueState = { ...league, config }
  return league.clock.pausedAt !== undefined ? base : { ...base, clock: replanClock(league.clock, config.clock, days) }
}
