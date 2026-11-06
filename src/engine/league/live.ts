/**
 * Partida ao vivo numa liga online (Fase 6, B7; proposta, seções 2.6, 2.8 e 4.4). Puro: nada aqui lê o relógio da máquina (`now` entra por parâmetro) nem
 * fala com rede. O Durable Object chama `stepLiveEvent` a cada alarme e entrega as mensagens que isto devolve.
 *
 * - O servidor simula (mesmo motor, `startMatch`); o cliente só manda **comandos**, que ficam numa fila e entram no **próximo minuto**.
 * - Cada partida humana guarda a lista de comandos com o minuto em que valeram (`ReplayRecord`): com a entrada e a semente, qualquer um refaz a partida e
 *   compara o resultado. É também como o objeto se reconstrói depois de uma hibernação ou de um reinício (`rebuildLiveEvent`).
 * - Técnico desconectado = IA completa (`setControlled(false)`); ao voltar, retoma no minuto seguinte. Lesão não para o jogo (o motor troca na hora).
 */
import { startMatch, type LiveMatch, type MatchSide, type MatchSnapshot } from '../match'
import type { MatchInput } from '../match'
import type { GridPoint, IsoDate, Mentality, Match, MatchResult, PlayStyle, TeamId } from '../types'
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
  /** Tempo real de cada minuto de jogo. */
  minuteMs: number
  /** Tempo real parado (pausas e avisos) até agora, sem contar uma pausa em curso. */
  pausedTotal: number
  pausedAt?: number
  /** Último minuto jogado em todas as partidas. */
  clock: number
  games: LiveGame[]
  queue: QueuedCommand[]
  /** Técnicos conectados agora. */
  connected: string[]
  /** Técnicos que estiveram conectados em algum momento do evento (conta como presença). */
  present: string[]
}

/** O que sobra do evento depois de tirar os objetos do motor: é o que vai para o armazenamento. */
export interface StoredLiveEvent extends Omit<LiveEvent, 'games'> {
  games: (ReplayRecord & { clock: number })[]
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
export function startGame(matchId: string, input: MatchInput): LiveGame {
  return { matchId, homeTeamId: input.home.team.id, awayTeamId: input.away.team.id, input, commands: [], clock: 0, live: startMatch(input) }
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
  const here = new Set(connected)
  const away = new Set(league.seats.filter((s) => s.status !== 'active' || !here.has(s.playerId)).map((s) => s.teamId))
  const games = current.pending.map((id) => {
    const match = world.matches.find((m) => m.id === id) as Match
    // `holdInjurySubs`: a lesão de um time com técnico para o jogo dele até a escolha do reserva (ou até `INJURY_WAIT_MS`).
    return startGame(id, { ...humanMatchInput(world, match, humans, away), holdInjurySubs: true, ...(injuryRate !== undefined ? { injuryRate } : {}) })
  })
  const present = league.seats.filter((s) => here.has(s.playerId)).map((s) => s.playerId)
  return { date: current.date, startedAt: now, minuteMs, pausedTotal: 0, clock: 0, games, queue: [], connected: [...here], present }
}

export const toStored = (e: LiveEvent): StoredLiveEvent => ({ ...e, games: e.games.map((g) => ({ ...replayOf(g), clock: g.clock })) })

/** Reconstrói o evento guardado (depois de hibernar ou reiniciar): cada partida volta ao minuto em que estava. */
export function rebuildLiveEvent(stored: StoredLiveEvent): LiveEvent {
  const games = stored.games.map((r) => {
    const g = rebuildGame(r, r.clock)
    g.clock = r.clock
    return g
  })
  return { ...stored, games }
}

/** Tempo real descontadas as pausas (e o aviso de retomada). */
function elapsed(e: LiveEvent, now: number): number {
  const until = e.pausedAt ?? now
  return Math.max(0, until - e.startedAt - e.pausedTotal)
}

/** Minuto de jogo devido em `now`. */
export const minuteAt = (e: LiveEvent, now: number): number => Math.min(MAX_MINUTE, Math.floor(elapsed(e, now) / e.minuteMs))

/** Quando o próximo minuto fica devido (para o alarme); `undefined` se o evento está pausado ou acabou. */
export function nextMinuteAt(e: LiveEvent, now: number): number | undefined {
  if (e.pausedAt !== undefined || isFinished(e)) return undefined
  const next = Math.max(now, e.startedAt + e.pausedTotal + (e.clock + 1) * e.minuteMs)
  return next
}

export const isFinished = (e: LiveEvent): boolean => e.games.every((g) => g.live.finished)

export function pauseLiveEvent(e: LiveEvent, now: number): LiveEvent {
  return e.pausedAt === undefined ? { ...e, pausedAt: now } : e
}

/** Retoma do minuto em que parou, com 10 s de aviso antes do próximo lance. */
export function resumeLiveEvent(e: LiveEvent, now: number, warningMs = RESUME_WARNING_MS): LiveEvent {
  if (e.pausedAt === undefined) return e
  const { pausedAt: _gone, ...rest } = e
  return { ...rest, pausedTotal: e.pausedTotal + (now - e.pausedAt) + warningMs }
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
 * Põe o comando na fila (`ok: false` na hora se o técnico não joga neste evento ou a partida já acabou). Entra no próximo minuto, em `stepLiveEvent`.
 * A validação de regras do jogo (trocas, estrangeiros, jogador em campo) é do motor e aparece no resultado do passo.
 */
export function enqueueCommand(e: LiveEvent, seats: readonly Seat[], playerId: string, id: string, command: QueuedCommand['command'], now: number): { event: LiveEvent; outcome?: CommandOutcome } {
  const seat = seats.find((s) => s.playerId === playerId)
  const found = seat ? seatGame(e, seat) : undefined
  if (!found) return { event: e, outcome: { id, playerId, ok: false, reason: 'not-your-team' } }
  if (found.game.live.finished) return { event: e, outcome: { id, playerId, ok: false, reason: 'game-finished' } }
  if (e.queue.some((q) => q.id === id)) return { event: e }
  return { event: { ...e, queue: [...e.queue, { id, playerId, command, receivedAt: now }] } }
}

/** Técnico conectou ou caiu. Muda o controle do time no próximo minuto e anota a presença. */
export function setConnected(e: LiveEvent, seats: readonly Seat[], playerId: string, connected: boolean): LiveEvent {
  const seat = seats.find((s) => s.playerId === playerId)
  const has = e.connected.includes(playerId)
  if (!seat || has === connected) return e
  const next: LiveEvent = {
    ...e,
    connected: connected ? [...e.connected, playerId] : e.connected.filter((p) => p !== playerId),
    present: connected && !e.present.includes(playerId) ? [...e.present, playerId] : e.present,
  }
  const found = seatGame(next, seat)
  if (found && !found.game.live.finished) {
    // Só vale do próximo lance; anota no registro para a reprodução refazer igual.
    const controlled = connected && seat.status === 'active'
    found.game.live.setControlled(found.side, controlled)
    found.game.commands.push({ minute: found.game.clock, side: found.side, command: { type: 'control', controlled }, by: 'system' })
  }
  return next
}

// --------------------------------------------------------------------- passo

export interface LiveStep {
  event: LiveEvent
  outcomes: CommandOutcome[]
  /** Minuto jogado neste passo (o último). */
  minute: number
  finished: boolean
}

/**
 * Leva o evento ao minuto devido em `now`, um minuto de cada vez. Antes de cada minuto, os comandos da fila entram (os que esperaram mais de 2 minutos
 * caem). Pode ser chamado a qualquer momento: se nada é devido, nada muda.
 */
export function stepLiveEvent(from: LiveEvent, seats: readonly Seat[], now: number): LiveStep {
  let e = from
  const outcomes: CommandOutcome[] = []
  const target = minuteAt(e, now)
  while (e.clock < target && !isFinished(e)) {
    const minute = e.clock + 1
    // 1. comandos que esperavam (os vencidos caem)
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
    // 2. lesões que esperam o técnico: sem ele (caiu ou é a IA) ou depois de `INJURY_WAIT_MS`, entra o melhor reserva
    settleInjuries(e, seats)
    // 3. o minuto
    for (const g of e.games) {
      if (g.live.finished) continue
      g.live.playUntil(minute)
      g.clock = minute
    }
    e = { ...e, clock: minute }
  }
  markInjuries(e)
  return { event: e, outcomes, minute: e.clock, finished: isFinished(e) }
}

/** O técnico do time está conectado e ativo (é ele quem escolhe, não a IA)? */
const humanHere = (e: LiveEvent, seats: readonly Seat[], teamId: TeamId): boolean => {
  const seat = seats.find((s) => s.teamId === teamId)
  return !!seat && seat.status === 'active' && e.connected.includes(seat.playerId)
}

/** Resolve, como a IA, as lesões que esperam um técnico que não está mais ali ou que demorou demais. Anota no registro para a reprodução refazer igual. */
function settleInjuries(e: LiveEvent, seats: readonly Seat[]): void {
  const t = e.clock * e.minuteMs // relógio do evento (os minutos já jogados): vale também quando o servidor recupera vários minutos de uma vez
  for (const g of e.games) {
    if (g.live.finished) continue
    const pending = g.live.injuryPending
    if (!pending) {
      delete g.injuryAt
      delete g.injuryLeftMs
      continue
    }
    g.injuryAt ??= t
    const teamId = pending.side === 'home' ? g.homeTeamId : g.awayTeamId
    if (humanHere(e, seats, teamId) && t - g.injuryAt < INJURY_WAIT_MS) continue
    g.live.autoResolveInjury(pending.side)
    g.commands.push({ minute: g.clock, side: pending.side, command: { type: 'injury-auto' }, by: 'system' })
    delete g.injuryAt
    delete g.injuryLeftMs
  }
}

/** Depois do passo: para cada lesão pendente, anota desde quando espera e quanto falta (a tela mostra a contagem). */
function markInjuries(e: LiveEvent): void {
  const t = e.clock * e.minuteMs
  for (const g of e.games) {
    if (g.live.finished || !g.live.injuryPending) continue
    g.injuryAt ??= t
    g.injuryLeftMs = Math.max(0, INJURY_WAIT_MS - (t - g.injuryAt))
  }
}

// -------------------------------------------------------- reconexão e telas

export interface LiveView {
  matchId: string
  snapshot: MatchSnapshot
  /** Quem controla cada lado agora (`false` = IA). */
  controlled: { home: boolean; away: boolean }
  /** Lesão à espera da escolha do técnico: quanto tempo real falta para entrar o melhor reserva. */
  injuryLeftMs?: number
}

/** O estado de todas as partidas, para quem conecta ou reconecta (o servidor manda o que o cliente perdeu: o snapshot traz todos os eventos até agora). */
export function viewOf(e: LiveEvent, seats: readonly Seat[]): LiveView[] {
  const humanOf = (teamId: TeamId) => {
    const seat = seats.find((s) => s.teamId === teamId)
    return !!seat && seat.status === 'active' && e.connected.includes(seat.playerId)
  }
  return e.games.map((g) => ({ matchId: g.matchId, snapshot: g.live.snapshot(), controlled: { home: humanOf(g.homeTeamId), away: humanOf(g.awayTeamId) }, ...(g.injuryLeftMs !== undefined && g.live.injuryPending ? { injuryLeftMs: g.injuryLeftMs } : {}) }))
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
