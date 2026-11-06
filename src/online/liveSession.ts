/**
 * Lado do cliente da partida ao vivo (Fase 6, B8.5). Puro: o WebSocket, o ticket, o relógio e os temporizadores entram por parâmetro, então tudo é
 * testado sem rede. O servidor manda um retrato inteiro (`full`) ao conectar e só a diferença (`frame`) a cada minuto; `applyMessage` junta as duas coisas
 * num estado que a tela desenha. Se a conexão cai, tenta de novo com ticket novo (o ticket é de uso único) e o `full` refaz tudo.
 */
import type { MatchSnapshot } from '../engine/match'
import type { CommandOutcome, LiveCommand } from '../engine/league/live'
import type { Roster, ServerMessage } from './liveProtocol'

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'no-event' | 'failed'

export interface ClientGame {
  matchId: string
  snapshot: MatchSnapshot
  controlled: { home: boolean; away: boolean }
}

export interface LiveClientState {
  status: LiveStatus
  minute: number
  paused: boolean
  /** Instante (ms) em que o jogo volta depois do aviso de retomada. */
  resumeAt?: number
  roster?: Roster
  myTeamId?: string
  games: ClientGame[]
  /** Respostas aos meus comandos (as últimas), para a tela mostrar "trocou" ou o motivo da recusa. */
  outcomes: CommandOutcome[]
  /** Comandos que mandei e ainda não tiveram resposta (entram no próximo minuto). */
  pending: string[]
}

export const initialLiveState = (): LiveClientState => ({ status: 'connecting', minute: 0, paused: false, games: [], outcomes: [], pending: [] })

/** A partida em que o meu clube joga. */
export const myGame = (s: LiveClientState): ClientGame | undefined =>
  s.games.find((g) => g.snapshot.home.teamId === s.myTeamId || g.snapshot.away.teamId === s.myTeamId)

/** O lado do meu clube na partida. */
export const mySide = (s: LiveClientState): 'home' | 'away' | undefined => {
  const g = myGame(s)
  return g ? (g.snapshot.home.teamId === s.myTeamId ? 'home' : 'away') : undefined
}

/** Junta uma mensagem do servidor ao estado. */
export function applyMessage(state: LiveClientState, msg: ServerMessage): LiveClientState {
  switch (msg.t) {
    case 'full':
      return {
        ...state,
        status: 'live',
        minute: msg.minute,
        paused: msg.paused,
        resumeAt: msg.resumeAt,
        roster: msg.roster,
        myTeamId: msg.me.teamId,
        games: msg.games.map((g) => ({ matchId: g.matchId, snapshot: g.snapshot, controlled: g.controlled })),
      }
    case 'frame': {
      const games = state.games.map((g) => {
        const f = msg.games.find((x) => x.matchId === g.matchId)
        if (!f) return g
        const snapshot: MatchSnapshot = {
          ...g.snapshot,
          minute: f.minute,
          finished: f.finished,
          homeGoals: f.homeGoals,
          awayGoals: f.awayGoals,
          events: [...g.snapshot.events, ...f.events],
          trace: [...g.snapshot.trace, ...f.trace],
          home: f.home,
          away: f.away,
          homeStats: f.homeStats,
          awayStats: f.awayStats,
          ...(f.extraTime ? { extraTime: true } : {}),
        }
        return { ...g, snapshot, controlled: f.controlled }
      })
      return { ...state, minute: msg.minute, games }
    }
    case 'result': {
      const done = new Set(msg.outcomes.map((o) => o.id))
      return { ...state, outcomes: [...state.outcomes, ...msg.outcomes].slice(-20), pending: state.pending.filter((id) => !done.has(id)) }
    }
    case 'paused':
      return { ...state, paused: true, resumeAt: undefined, minute: msg.minute }
    case 'resumed':
      return { ...state, paused: false, resumeAt: msg.resumeAt, minute: msg.minute }
    case 'end':
      return { ...state, status: 'ended' }
    case 'error':
      return msg.problem === 'not-in-event' ? { ...state, status: 'no-event' } : state
    case 'pong':
      return state
  }
}

export interface SocketLike {
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
}

export interface LiveSessionDeps {
  /** Pede um ticket de uso único (pedido assinado). */
  getTicket(): Promise<{ ok: true; ticket: string } | { ok: false; error: string }>
  openSocket(ticket: string): SocketLike
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  randomId(): string
  /** Esperas entre as tentativas de reconexão (ms); a última se repete. */
  backoffMs?: number[]
  /** Depois de tantas tentativas seguidas sem conseguir conectar, desiste (`failed`). */
  maxAttempts?: number
}

const BACKOFF = [800, 1600, 3200, 6400, 10_000]

export class LiveSession {
  state: LiveClientState = initialLiveState()
  private socket?: SocketLike
  private listeners = new Set<(s: LiveClientState) => void>()
  private timer?: unknown
  private attempts = 0
  private closed = false
  private seq = 0

  constructor(private deps: LiveSessionDeps) {}

  subscribe(fn: (s: LiveClientState) => void): () => void {
    this.listeners.add(fn)
    fn(this.state)
    return () => this.listeners.delete(fn)
  }

  private set(next: LiveClientState): void {
    this.state = next
    for (const l of this.listeners) l(next)
  }

  /** Conecta (ou reconecta). */
  async connect(): Promise<void> {
    if (this.closed) return
    const ticket = await this.deps.getTicket()
    if (this.closed) return
    if (!ticket.ok) return this.retry()
    const socket = this.deps.openSocket(ticket.ticket)
    this.socket = socket
    socket.onopen = () => {
      this.attempts = 0
      socket.send(JSON.stringify({ t: 'hello', since: Math.min(120, this.state.minute) }))
    }
    socket.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      try {
        this.set(applyMessage(this.state, JSON.parse(ev.data) as ServerMessage))
      } catch {
        /* mensagem estragada: ignora */
      }
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = undefined
      if (this.closed || this.state.status === 'ended' || this.state.status === 'no-event') return
      this.retry()
    }
    socket.onerror = () => {
      /* o onclose vem logo depois */
    }
  }

  private retry(): void {
    const steps = this.deps.backoffMs ?? BACKOFF
    this.attempts++
    if (this.attempts > (this.deps.maxAttempts ?? 12)) return this.set({ ...this.state, status: 'failed' })
    this.set({ ...this.state, status: this.state.roster ? 'reconnecting' : 'connecting' })
    const wait = steps[Math.min(this.attempts - 1, steps.length - 1)] as number
    this.timer = this.deps.setTimer(() => void this.connect(), wait)
  }

  /** Manda um comando de técnico; devolve o id (a resposta chega em `outcomes`). `false` se não há conexão. */
  send(command: Exclude<LiveCommand, { type: 'control' }>): string | false {
    if (!this.socket || this.state.status !== 'live') return false
    const id = `c${++this.seq}-${this.deps.randomId()}`
    this.socket.send(JSON.stringify({ t: 'cmd', id, command }))
    this.set({ ...this.state, pending: [...this.state.pending, id] })
    return id
  }

  close(): void {
    this.closed = true
    if (this.timer !== undefined) this.deps.clearTimer(this.timer)
    this.socket?.close()
    this.socket = undefined
  }
}
