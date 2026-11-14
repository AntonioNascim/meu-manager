/**
 * Partida ao vivo numa liga online (Fase 6, B7; proposta, seções 2.6, 2.8 e 4.4). Puro: nada aqui lê o relógio da máquina (`now` entra por parâmetro) nem
 * fala com rede. O Durable Object chama `stepLiveEvent` a cada alarme e entrega as mensagens que isto devolve.
 *
 * - O servidor simula (mesmo motor, `startMatch`); o cliente só manda **comandos**, que ficam numa fila e entram no próximo passo do relógio (Fase 6C: cada
 *   partida tem o seu relógio, a 1.600 ms por minuto de jogo dividido pela velocidade que o técnico escolheu; dois técnicos no mesmo jogo usam a mais lenta).
 * - Cada partida humana guarda a lista de comandos com o minuto em que valeram (`ReplayRecord`): com a entrada e a semente, qualquer um refaz a partida e
 *   compara o resultado. É também como o objeto se reconstrói depois de uma hibernação ou de um reinício (`rebuildLiveEvent`).
 * - Técnico desconectado = IA completa (`setControlled(false)`); ao voltar, retoma no minuto seguinte. Lesão não para o jogo (o motor troca na hora).
 */
import { startMatch, type LiveMatch, type MatchSide, type MatchSnapshot } from '../match'
import type { MatchInput } from '../match'
import type { GridPoint, IsoDate, Mentality, Match, MatchResult, PlayStyle, TeamId } from '../types'
import { BASE_MINUTE_MS, holdFor } from '../match/timing'
import type { SeasonState } from '../season'
import { humanMatchInput } from '../season/advance'
import { applyEventAbsence, type LeagueKind } from './absence'
import { submitResult, type LeagueState, type Seat, type Stepped } from './runner'

/** Quanto tempo real um comando espera para entrar antes de ser descartado (proposta, 4.4). */
export const COMMAND_EXPIRES_MS = 2 * 60_000
/** Aviso ao retomar uma partida pausada (proposta, 2.5). */
export const RESUME_WARNING_MS = 10_000
/** Último minuto possível (90 + prorrogação). */
export const MAX_MINUTE = 120
/** Quanto tempo de relógio do evento (sem contar pausas) o jogo de um técnico espera a escolha do reserva depois de uma lesão; passado isso entra o melhor reserva, como a IA faria. */
export const INJURY_WAIT_MS = 45_000

/** Velocidades que o técnico escolhe (as mesmas do jogo solo). */
/** As velocidades que o técnico escolhe: 1x (normal, 800 ms por minuto de jogo) e 2x (rápida, 400 ms). */
export const LIVE_SPEEDS = [1, 2] as const
export type LiveSpeed = (typeof LIVE_SPEEDS)[number]
/** Velocidades antigas (1x, 2x, 4x e 8x) que um aparelho com a versão anterior ainda pode mandar: de 2x para cima vale a rápida. */
export const normalizeSpeed = (speed: number): LiveSpeed | undefined => ([1, 2, 4, 8].includes(speed) ? ((speed >= 2 ? 2 : 1) as LiveSpeed) : undefined)
/** A velocidade de quem ainda não escolheu (a mesma do solo). */
export const DEFAULT_SPEED: LiveSpeed = 1
/** Partida sem técnico conectado: ninguém assiste, roda na velocidade máxima e sem câmera lenta. */
export const UNWATCHED_SPEED = 4
/** O intervalo dura até 1 minuto; termina antes quando todos os técnicos do jogo tocam em "Voltar ao jogo". */
export const HALFTIME_MS = 60_000
/** O alarme da sala acorda em segundos cheios: no máximo uma vez por segundo, qualquer que seja o número de partidas. */
export const GRID_MS = 1_000
/** Quem deu Pronto mas ainda não abriu a partida tem este tempo antes de o jogo começar a andar (o técnico é levado para a tela sozinho). */
export const START_GRACE_MS = 30_000

export type LiveCommand =
  | { type: 'style'; style: PlayStyle }
  | { type: 'mentality'; mentality: Mentality }
  | { type: 'formation'; formationId: string }
  | { type: 'position'; playerId: string; point: GridPoint }
  | { type: 'substitute'; outgoingId: string; incomingId: string }
  /** O técnico resolve a lesão que parou o jogo dele: com `incomingId` entra o reserva; sem ele o time segue com um a menos. */
  | { type: 'injury'; incomingId?: string }
  /** Só o servidor emite: o time passa à IA (técnico caiu) ou volta ao técnico. */
  | { type: 'control'; controlled: boolean }
  /** Só o servidor emite: a lesão esperou demais (ou o técnico caiu) e entrou o melhor reserva. */
  | { type: 'injury-auto' }

export interface CommandRecord {
  /** Minuto do relógio da partida em que o comando valeu (a partida já tinha sido jogada até aqui). */
  minute: number
  side: MatchSide
  command: LiveCommand
  /** Quem mandou (`playerId`) ou `system`. */
  by: string
}

/** Tudo o que é preciso para refazer uma partida: a entrada do motor e os comandos, na ordem. Cabe em JSON. */
export interface ReplayRecord {
  version: 1
  matchId: string
  input: MatchInput
  commands: CommandRecord[]
}

export interface LiveGame {
  matchId: string
  homeTeamId: TeamId
  awayTeamId: TeamId
  input: MatchInput
  commands: CommandRecord[]
  /** Minuto do relógio já jogado. */
  clock: number
  /** Quando (ms reais) o próximo minuto desta partida fica devido. */
  nextAt: number
  /** A velocidade que cada técnico do jogo escolheu (quem não escolheu usa `DEFAULT_SPEED`). Não entra na reprodução: não muda o resultado. */
  speeds: Record<string, number>
  /** Intervalo em andamento: até quando e quem já tocou em "Voltar ao jogo". */
  halftime?: { until: number; ready: string[] }
  halftimeDone?: boolean
  /** Técnicos que tocaram em "Pular": a IA joga o time deles; quando todos os técnicos da partida pulam, ela vai direto ao fim. */
  skipped?: string[]
  /** Só em memória: quanto dos lances e eventos o relógio já viu (a câmera lenta olha só o que veio depois). */
  seenTrace: number
  seenEvents: number
  /** Só em memória: reconstruído a partir de `input` e `commands` quando falta. */
  live: LiveMatch
  /** Só em memória: quando (tempo do evento, sem pausas) a lesão pendente foi vista e quanto falta para entrar o melhor reserva. */
  injuryAt?: number
  injuryLeftMs?: number
}

export interface QueuedCommand {
  id: string
  playerId: string
  command: Exclude<LiveCommand, { type: 'control' } | { type: 'injury-auto' }>
  receivedAt: number
}

export interface LiveEvent {
  date: IsoDate
  /** Horário real em que o evento começou. */
  startedAt: number
  /** Tempo real de cada minuto de jogo na velocidade 1x. */
  minuteMs: number
  pausedAt?: number
  /** O maior minuto jogado entre as partidas (para a tela e a reconexão). */
  clock: number
  games: LiveGame[]
  queue: QueuedCommand[]
  /** Técnicos conectados agora. */
  connected: string[]
  /** Técnicos que estiveram conectados em algum momento do evento (conta como presença). */
  present: string[]
  /** Não deram Pronto antes do começo: a IA joga por eles e eles não assumem o time no meio da partida. */
  locked?: string[]
}

/** O que sobra do evento depois de tirar os objetos do motor: é o que vai para o armazenamento. */
export interface StoredLiveEvent extends Omit<LiveEvent, 'games'> {
  games: (ReplayRecord & Pick<LiveGame, 'clock' | 'nextAt' | 'speeds' | 'halftime' | 'halftimeDone' | 'skipped'>)[]
}

export type RejectReason = 'not-your-team' | 'game-finished' | 'expired' | 'invalid' | 'engine'
export interface CommandOutcome {
  id: string
  playerId: string
  ok: boolean
  reason?: RejectReason
  detail?: string
  /** Minuto em que valeu (se aceito). */
  minute?: number
}

// ------------------------------------------------------------------ partidas

const sideOfTeam = (g: Pick<LiveGame, 'homeTeamId' | 'awayTeamId'>, teamId: TeamId): MatchSide | undefined =>
  g.homeTeamId === teamId ? 'home' : g.awayTeamId === teamId ? 'away' : undefined

function applyCommand(live: LiveMatch, side: MatchSide, c: LiveCommand): void {
  switch (c.type) {
    case 'style':
      return live.setStyle(side, c.style)
    case 'mentality':
      return live.setMentality(side, c.mentality)
    case 'formation':
      return live.setFormation(side, c.formationId)
    case 'position':
      return live.setPosition(side, c.playerId, c.point)
    case 'substitute':
      return live.substitute(side, c.outgoingId, c.incomingId)
    case 'injury':
      return live.resolveInjury(side, c.incomingId)
    case 'control':
      return live.setControlled(side, c.controlled)
    case 'injury-auto':
      return live.autoResolveInjury(side)
  }
}

/** Começa uma partida do zero com a entrada dada. */
export function startGame(matchId: string, input: MatchInput, nextAt = 0): LiveGame {
  return { matchId, homeTeamId: input.home.team.id, awayTeamId: input.away.team.id, input, commands: [], clock: 0, nextAt, speeds: {}, seenTrace: 0, seenEvents: 0, live: startMatch(input) }
}

/**
 * Refaz uma partida a partir do registro: joga até o minuto de cada comando, aplica-o e segue. Com `upTo`, para nesse minuto; sem ele, vai até o fim.
 * O resultado só depende da entrada e dos comandos (o motor usa a semente da entrada), então o jogo refeito é idêntico ao original.
 */
export function rebuildGame(record: ReplayRecord, upTo = MAX_MINUTE): LiveGame {
  const game = startGame(record.matchId, record.input)
  for (const c of record.commands) {
    if (c.minute > upTo) break
    game.live.playUntil(c.minute)
    applyCommand(game.live, c.side, c.command)
    game.commands.push(c)
    game.clock = c.minute
  }
  game.live.playUntil(upTo)
  game.clock = upTo
  return game
}

export const replayOf = (g: LiveGame): ReplayRecord => ({ version: 1, matchId: g.matchId, input: g.input, commands: g.commands })

/** Refaz a partida inteira e devolve o resultado (verificação: compare com o resultado registrado). */
export function replayResult(record: ReplayRecord): MatchResult {
  const g = rebuildGame(record, MAX_MINUTE)
  return g.live.result()
}

// -------------------------------------------------------------------- evento

/**
 * Começa o evento ao vivo. Os técnicos conectados controlam o time; quem não está conectado (ou está ausente/em autopiloto) joga com a IA completa
 * até conectar. A tática de quem não deu "Pronto" é a última salva, consertada por `repairTactic` (lesionados, suspensos, estrangeiros) dentro de
 * `humanMatchInput`.
 */
export function startLiveEvent(
  league: LeagueState,
  world: SeasonState,
  now: number,
  minuteMs: number,
  connected: readonly string[] = [],
  /** Só em laboratório: multiplica a chance de lesão para o teste de ponta a ponta provocar uma cedo. */
  injuryRate?: number,
): LiveEvent {
  const current = league.current
  if (!current) throw new Error('Não há evento em andamento')
  const humans = new Set(league.seats.map((s) => s.teamId))
  const locked = new Set(current.locked ?? [])
  const here = new Set(connected.filter((p) => !locked.has(p)))
  const away = new Set(league.seats.filter((s) => s.status !== 'active' || !here.has(s.playerId)).map((s) => s.teamId))
  const games = current.pending.map((id) => {
    const match = world.matches.find((m) => m.id === id) as Match
    // `holdInjurySubs`: a lesão de um time com técnico para o jogo dele até a escolha do reserva (ou até `INJURY_WAIT_MS`).
    const waitFor = league.seats.some((s) => s.status === 'active' && !locked.has(s.playerId) && !here.has(s.playerId) && (s.teamId === match.homeTeamId || s.teamId === match.awayTeamId))
    return startGame(id, { ...humanMatchInput(world, match, humans, away), holdInjurySubs: true, ...(injuryRate !== undefined ? { injuryRate } : {}) }, now + (waitFor ? START_GRACE_MS : minuteMs / DEFAULT_SPEED))
  })
  const present = league.seats.filter((s) => here.has(s.playerId)).map((s) => s.playerId)
  return { date: current.date, startedAt: now, minuteMs, clock: 0, games, queue: [], connected: [...here], present, ...(locked.size > 0 ? { locked: [...locked] } : {}) }
}

export const toStored = (e: LiveEvent): StoredLiveEvent => ({
  ...e,
  games: e.games.map((g) => ({ ...replayOf(g), clock: g.clock, nextAt: g.nextAt, speeds: g.speeds, ...(g.halftime ? { halftime: g.halftime } : {}), ...(g.halftimeDone ? { halftimeDone: true } : {}), ...(g.skipped?.length ? { skipped: g.skipped } : {}) })),
})

/** Reconstrói o evento guardado (depois de hibernar ou reiniciar): cada partida volta ao minuto em que estava. */
export function rebuildLiveEvent(stored: StoredLiveEvent): LiveEvent {
  const games = stored.games.map((r) => {
    const g = rebuildGame(r, r.clock)
    g.clock = r.clock
    g.nextAt = r.nextAt
    g.speeds = { ...(r.speeds ?? {}) }
    if (r.halftime) g.halftime = { until: r.halftime.until, ready: [...r.halftime.ready] }
    if (r.halftimeDone) g.halftimeDone = true
    if (r.skipped?.length) g.skipped = [...r.skipped]
    const snap = g.live.snapshot()
    g.seenTrace = snap.trace.length
    g.seenEvents = snap.events.length
    return g
  })
  return { ...stored, games }
}

export const isFinished = (e: LiveEvent): boolean => e.games.every((g) => g.live.finished)

/** Os técnicos ativos e conectados que jogam esta partida (quem a assiste de verdade). */
function humansOf(e: LiveEvent, seats: readonly Seat[], g: Pick<LiveGame, 'homeTeamId' | 'awayTeamId' | 'skipped'>): Seat[] {
  return seats.filter((s) => (s.teamId === g.homeTeamId || s.teamId === g.awayTeamId) && s.status === 'active' && e.connected.includes(s.playerId) && !g.skipped?.includes(s.playerId))
}

/**
 * A velocidade que vale para a partida: a **mais lenta** entre as escolhas dos técnicos conectados nela (o jogo é o mesmo para os dois), a de quem
 * escolheu ou `DEFAULT_SPEED`; sem técnico conectado ninguém assiste e roda na máxima.
 */
export function speedOf(e: LiveEvent, seats: readonly Seat[], g: LiveGame): number {
  const humans = humansOf(e, seats, g)
  if (humans.length === 0) return UNWATCHED_SPEED
  // (jogo guardado com a escolha antiga de 4x ou 8x: conta como a velocidade rápida)
  return Math.min(...humans.map((s) => Math.min(2, g.speeds[s.playerId] ?? DEFAULT_SPEED)))
}

/**
 * Quando o relógio deve acordar de novo (para o alarme da sala), arredondado para segundos cheios; `undefined` se o evento está pausado ou acabou.
 * Uma partida parada por lesão espera o técnico até `INJURY_WAIT_MS`; uma em intervalo, até o fim dele.
 */
export function nextWakeAt(e: LiveEvent, now: number): number | undefined {
  if (e.pausedAt !== undefined || isFinished(e)) return undefined
  let t = Infinity
  for (const g of e.games) {
    if (g.live.finished) continue
    if (g.halftime) t = Math.min(t, g.halftime.until)
    else if (g.live.injuryPending) t = Math.min(t, (g.injuryAt ?? now) + INJURY_WAIT_MS)
    else t = Math.min(t, g.nextAt)
  }
  if (!Number.isFinite(t)) return undefined
  return Math.ceil(Math.max(now, t) / GRID_MS) * GRID_MS
}

export function pauseLiveEvent(e: LiveEvent, now: number): LiveEvent {
  return e.pausedAt === undefined ? { ...e, pausedAt: now } : e
}

/** Retoma do minuto em que parou, com 10 s de aviso antes do próximo lance: o relógio de cada partida anda o tempo da pausa. */
export function resumeLiveEvent(e: LiveEvent, now: number, warningMs = RESUME_WARNING_MS): LiveEvent {
  if (e.pausedAt === undefined) return e
  const { pausedAt: _gone, ...rest } = e
  const shift = now - e.pausedAt + warningMs
  for (const g of e.games) {
    g.nextAt += shift
    if (g.halftime) g.halftime = { ...g.halftime, until: g.halftime.until + shift }
    if (g.injuryAt !== undefined) g.injuryAt += shift
  }
  return rest
}

// ------------------------------------------------------------------ comandos

/** Em qual partida e lado o técnico joga neste evento. */
export function seatGame(e: LiveEvent, seat: Pick<Seat, 'teamId'>): { game: LiveGame; side: MatchSide } | undefined {
  for (const game of e.games) {
    const side = sideOfTeam(game, seat.teamId)
    if (side) return { game, side }
  }
  return undefined
}

/**
 * Põe o comando na fila (`ok: false` na hora se o técnico não joga neste evento ou a partida já acabou). Entra no próximo passo do relógio, em `stepLiveEvent`.
 * A validação de regras do jogo (trocas, estrangeiros, jogador em campo) é do motor e aparece no resultado do passo.
 */
export function enqueueCommand(e: LiveEvent, seats: readonly Seat[], playerId: string, id: string, command: QueuedCommand['command'], now: number): { event: LiveEvent; outcome?: CommandOutcome } {
  const seat = seats.find((s) => s.playerId === playerId)
  const found = seat && !e.locked?.includes(playerId) ? seatGame(e, seat) : undefined
  if (!found) return { event: e, outcome: { id, playerId, ok: false, reason: 'not-your-team' } }
  if (found.game.live.finished) return { event: e, outcome: { id, playerId, ok: false, reason: 'game-finished' } }
  if (e.queue.some((q) => q.id === id)) return { event: e }
  return { event: { ...e, queue: [...e.queue, { id, playerId, command, receivedAt: now }] } }
}

/** O técnico escolhe a velocidade do jogo dele (vale do minuto seguinte). `false` se ele não joga neste evento ou a velocidade não existe. */
export function setSpeed(e: LiveEvent, seats: readonly Seat[], playerId: string, speed: number): boolean {
  const wanted = normalizeSpeed(speed)
  if (wanted === undefined) return false
  const seat = seats.find((s) => s.playerId === playerId)
  const found = seat && !e.locked?.includes(playerId) ? seatGame(e, seat) : undefined
  if (!found || found.game.live.finished) return false
  found.game.speeds = { ...found.game.speeds, [playerId]: wanted }
  return true
}

/**
 * "Voltar ao jogo" no intervalo. O jogo volta quando todos os técnicos conectados nele tocaram (ou quando o minuto acaba). Devolve `true` se a
 * partida voltou agora.
 */
export function readyForSecondHalf(e: LiveEvent, seats: readonly Seat[], playerId: string, now: number): boolean {
  const seat = seats.find((s) => s.playerId === playerId)
  const found = seat ? seatGame(e, seat) : undefined
  const g = found?.game
  if (!g || !g.halftime) return false
  if (!g.halftime.ready.includes(playerId)) g.halftime = { ...g.halftime, ready: [...g.halftime.ready, playerId] }
  const needed = humansOf(e, seats, g).map((s) => s.playerId)
  if (needed.every((p) => g.halftime!.ready.includes(p))) {
    g.halftime = undefined
    g.halftimeDone = true
    g.nextAt = Math.max(g.nextAt, now)
    return true
  }
  return false
}

/**
 * "Pular": a IA assume o time de quem tocou pelo resto do jogo. Contra a IA (ou quando o outro técnico não está conectado) a partida vai direto ao fim;
 * entre dois técnicos ela só vai quando os dois pularem. O resultado é jogado pelo mesmo motor, então a reprodução refaz igual (o controle e as lesões entram
 * no registro). Devolve `true` se algo mudou.
 */
export function skipLiveGame(e: LiveEvent, seats: readonly Seat[], playerId: string): boolean {
  const seat = seats.find((s) => s.playerId === playerId)
  const found = seat && !e.locked?.includes(playerId) ? seatGame(e, seat) : undefined
  if (!found || found.game.live.finished || found.game.skipped?.includes(playerId)) return false
  const g = found.game
  g.skipped = [...(g.skipped ?? []), playerId]
  g.live.setControlled(found.side, false)
  g.commands.push({ minute: g.clock, side: found.side, command: { type: 'control', controlled: false }, by: playerId })
  const left = humansOf(e, seats, g)
  if (left.length > 0) {
    // Ainda há técnico assistindo: o intervalo só espera por ele.
    if (g.halftime && left.every((s) => g.halftime!.ready.includes(s.playerId))) {
      g.halftime = undefined
      g.halftimeDone = true
    }
    return true
  }
  g.halftime = undefined
  g.halftimeDone = true
  for (let guard = 0; guard < 12 && !g.live.finished; guard++) {
    const pending = g.live.injuryPending
    if (pending) {
      g.live.autoResolveInjury(pending.side)
      g.commands.push({ minute: g.live.snapshot().minute, side: pending.side, command: { type: 'injury-auto' }, by: 'system' })
    }
    g.live.playUntil(MAX_MINUTE)
  }
  g.clock = MAX_MINUTE
  delete g.injuryAt
  delete g.injuryLeftMs
  return true
}

/** Técnico conectou ou caiu. Muda o controle do time no próximo minuto e anota a presença. */
export function setConnected(e: LiveEvent, seats: readonly Seat[], playerId: string, connected: boolean, now?: number): LiveEvent {
  const seat = seats.find((s) => s.playerId === playerId)
  const has = e.connected.includes(playerId)
  if (!seat || has === connected || e.locked?.includes(playerId)) return e
  const next: LiveEvent = {
    ...e,
    connected: connected ? [...e.connected, playerId] : e.connected.filter((p) => p !== playerId),
    present: connected && !e.present.includes(playerId) ? [...e.present, playerId] : e.present,
  }
  const found = seatGame(next, seat)
  if (found && !found.game.live.finished) {
    // Só vale do próximo lance; anota no registro para a reprodução refazer igual.
    const controlled = connected && seat.status === 'active' && !found.game.skipped?.includes(playerId)
    found.game.live.setControlled(found.side, controlled)
    found.game.commands.push({ minute: found.game.clock, side: found.side, command: { type: 'control', controlled }, by: 'system' })
    // Todos os técnicos que deram Pronto chegaram: não precisa esperar o fim da tolerância do começo.
    if (connected && now !== undefined && found.game.clock === 0) {
      const waiting = seats.some((s) => (s.teamId === found.game.homeTeamId || s.teamId === found.game.awayTeamId) && s.status === 'active' && !next.locked?.includes(s.playerId) && !next.connected.includes(s.playerId))
      if (!waiting) found.game.nextAt = Math.min(found.game.nextAt, now + next.minuteMs / DEFAULT_SPEED)
    }
    // Ninguém mais esperando o intervalo: quem caiu não segura o adversário.
    if (!connected && found.game.halftime) readyForSecondHalf(next, seats, playerId, 0)
  }
  return next
}

// --------------------------------------------------------------------- passo

export interface LiveStep {
  event: LiveEvent
  outcomes: CommandOutcome[]
  /** O maior minuto jogado entre as partidas. */
  minute: number
  finished: boolean
}

/**
 * Leva cada partida ao ponto devido em `now`: antes de tudo entram os comandos da fila (os que esperaram mais de 2 minutos caem); depois cada partida joga os
 * minutos que já venceram no relógio dela (1.600 ms ÷ velocidade, mais a câmera lenta dos lances quando há técnico assistindo), para no intervalo e na lesão que
 * espera o técnico. Pode ser chamado a qualquer momento: se nada é devido, nada muda.
 */
export function stepLiveEvent(from: LiveEvent, seats: readonly Seat[], now: number): LiveStep {
  let e = from
  const outcomes: CommandOutcome[] = []
  if (e.pausedAt !== undefined) return { event: e, outcomes, minute: e.clock, finished: false }
  // 1. comandos que esperavam (os vencidos caem); valem no ponto em que a partida está, e a reprodução refaz igual
  const queue = e.queue
  e = { ...e, queue: [] }
  for (const q of queue) {
    if (now - q.receivedAt > COMMAND_EXPIRES_MS) {
      outcomes.push({ id: q.id, playerId: q.playerId, ok: false, reason: 'expired' })
      continue
    }
    const seat = seats.find((s) => s.playerId === q.playerId)
    const found = seat ? seatGame(e, seat) : undefined
    if (!found || found.game.live.finished) {
      outcomes.push({ id: q.id, playerId: q.playerId, ok: false, reason: found ? 'game-finished' : 'not-your-team' })
      continue
    }
    try {
      applyCommand(found.game.live, found.side, q.command)
      found.game.commands.push({ minute: found.game.clock, side: found.side, command: q.command, by: q.playerId })
      outcomes.push({ id: q.id, playerId: q.playerId, ok: true, minute: found.game.clock })
    } catch (err) {
      outcomes.push({ id: q.id, playerId: q.playerId, ok: false, reason: 'engine', detail: err instanceof Error ? err.message : String(err) })
    }
  }
  // 2. o relógio de cada partida
  for (const g of e.games) {
    for (let guard = 0; guard < MAX_MINUTE + 10; guard++) {
      if (g.live.finished) break
      if (g.halftime) {
        if (now < g.halftime.until) break
        g.halftime = undefined
        g.halftimeDone = true
      }
      settleInjury(e, seats, g, now)
      if (g.live.injuryPending) break // espera o técnico escolher o reserva (ou `INJURY_WAIT_MS`)
      if (g.nextAt > now) break
      const minute = g.clock + 1
      g.live.playUntil(minute)
      g.clock = minute
      const snap = g.live.snapshot()
      const watchers = humansOf(e, seats, g).length
      const hold = watchers > 0 ? holdFor(snap.trace.slice(g.seenTrace), snap.events.slice(g.seenEvents)) : 0
      g.seenTrace = snap.trace.length
      g.seenEvents = snap.events.length
      g.nextAt += BASE_MINUTE_MS_OF(e) / speedOf(e, seats, g) + hold
      // O intervalo: quando há técnico assistindo, até 1 minuto (ou até todos tocarem em "Voltar ao jogo").
      if (minute === 45 && !g.halftimeDone && watchers > 0 && !g.live.finished) g.halftime = { until: g.nextAt + HALFTIME_MS, ready: [] }
    }
  }
  e = { ...e, clock: Math.max(e.clock, ...e.games.map((g) => g.clock)) }
  // O relógio chegou ao teto (120'): lesão que ainda espera não tem mais tempo, entra o melhor reserva e a partida termina.
  for (const g of e.games) {
    if (g.live.finished || g.clock < MAX_MINUTE) continue
    settleInjury(e, seats, g, now, true)
    g.live.playUntil(MAX_MINUTE)
  }
  markInjuries(e, now)
  return { event: e, outcomes, minute: e.clock, finished: isFinished(e) }
}

/** O tempo real de um minuto no 1x: o do evento (é o do solo, 1.600 ms; só os testes locais o encurtam). */
const BASE_MINUTE_MS_OF = (e: LiveEvent): number => e.minuteMs || BASE_MINUTE_MS

/** Resolve, como a IA, a lesão que espera um técnico que não está mais ali ou que demorou demais. Anota no registro para a reprodução refazer igual. */
function settleInjury(e: LiveEvent, seats: readonly Seat[], g: LiveGame, now: number, force = false): void {
  const pending = g.live.injuryPending
  if (!pending) {
    delete g.injuryAt
    delete g.injuryLeftMs
    return
  }
  g.injuryAt ??= now
  const teamId = pending.side === 'home' ? g.homeTeamId : g.awayTeamId
  const here = seats.some((s) => s.teamId === teamId && s.status === 'active' && e.connected.includes(s.playerId) && !g.skipped?.includes(s.playerId))
  if (!force && here && now - g.injuryAt < INJURY_WAIT_MS) return
  g.live.autoResolveInjury(pending.side)
  g.commands.push({ minute: g.clock, side: pending.side, command: { type: 'injury-auto' }, by: 'system' })
  delete g.injuryAt
  delete g.injuryLeftMs
}

/** Depois do passo: para cada lesão pendente, anota desde quando espera e quanto falta (a tela mostra a contagem). */
function markInjuries(e: LiveEvent, now: number): void {
  for (const g of e.games) {
    if (g.live.finished || !g.live.injuryPending) continue
    g.injuryAt ??= now
    g.injuryLeftMs = Math.max(0, INJURY_WAIT_MS - (now - g.injuryAt))
  }
}

// -------------------------------------------------------- reconexão e telas

export interface LiveView {
  matchId: string
  snapshot: MatchSnapshot
  /** Quem controla cada lado agora (`false` = IA). */
  controlled: { home: boolean; away: boolean }
  /** A velocidade que vale para a partida (a mais lenta entre as escolhas dos técnicos conectados) e a escolha de cada um. */
  speed: number
  speeds: Record<string, number>
  /** Intervalo em andamento: quanto falta e quem já tocou em "Voltar ao jogo". */
  halftime?: { leftMs: number; ready: string[] }
  /** Lesão à espera da escolha do técnico: quanto tempo real falta para entrar o melhor reserva. */
  injuryLeftMs?: number
  /** Quem já tocou em "Pular" nesta partida. */
  skipped?: string[]
}

/** O estado de todas as partidas, para quem conecta ou reconecta (o servidor manda o que o cliente perdeu: o snapshot traz todos os eventos até agora). */
export function viewOf(e: LiveEvent, seats: readonly Seat[], now: number = Date.now()): LiveView[] {
  const seatOf = (teamId: TeamId) => seats.find((s) => s.teamId === teamId)?.playerId ?? ''
  const skippedIn = (g: LiveGame) => g.skipped ?? []
  const humanOf = (teamId: TeamId) => {
    const seat = seats.find((s) => s.teamId === teamId)
    return !!seat && seat.status === 'active' && e.connected.includes(seat.playerId)
  }
  return e.games.map((g) => ({
    matchId: g.matchId,
    snapshot: g.live.snapshot(),
    controlled: { home: humanOf(g.homeTeamId) && !skippedIn(g).includes(seatOf(g.homeTeamId)), away: humanOf(g.awayTeamId) && !skippedIn(g).includes(seatOf(g.awayTeamId)) },
    ...(g.skipped?.length ? { skipped: g.skipped } : {}),
    speed: speedOf(e, seats, g),
    speeds: g.speeds,
    ...(g.halftime ? { halftime: { leftMs: Math.max(0, g.halftime.until - now), ready: g.halftime.ready } } : {}),
    ...(g.injuryLeftMs !== undefined && g.live.injuryPending ? { injuryLeftMs: g.injuryLeftMs } : {}),
  }))
}

/** Eventos da partida depois do minuto que o cliente já viu (reconexão). */
export const eventsSince = (snapshot: MatchSnapshot, sinceMinute: number): MatchSnapshot['events'] => snapshot.events.filter((ev) => ev.minute > sinceMinute)

// ------------------------------------------------------------ fim do evento

export interface FinishedLive {
  stepped: Stepped
  replays: ReplayRecord[]
  /** Quem passou a autopiloto longo e quem perdeu o clube (aviso ao ADM / vaga). */
  newLongAutopilot: Seat[]
  vacated: Seat[]
}

/**
 * Entrega os resultados ao orquestrador (`submitResult`), um a um, e atualiza a ausência de cada técnico (partida sem ele conectado soma uma falta).
 * Só chame com `isFinished(e)`.
 */
export function finishLiveEvent(from: Stepped, e: LiveEvent, now: number, kind: LeagueKind = 'open', joinedAt: (playerId: string) => number = () => now): FinishedLive {
  let stepped = from
  const replays: ReplayRecord[] = []
  for (const g of e.games) {
    stepped = submitResult(stepped, g.matchId, g.live.result(), now)
    replays.push(replayOf(g))
  }
  const played = new Set(
    stepped.league.seats
      .filter((s) => e.games.some((g) => g.homeTeamId === s.teamId || g.awayTeamId === s.teamId))
      .map((s) => s.playerId),
  )
  const out = applyEventAbsence(stepped.league.seats, played, new Set(e.present), kind, now, joinedAt)
  return { stepped: { ...stepped, league: { ...stepped.league, seats: out.seats } }, replays, newLongAutopilot: out.newLongAutopilot, vacated: out.vacated }
}
