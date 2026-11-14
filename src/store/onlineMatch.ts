/**
 * A partida ao vivo de uma liga online vista pelas telas do jogo solo (Fase 6C, C5). A tela de partida do solo (`Match.tsx`) sabe tocar um `LiveMatch` do
 * motor; aqui o `LiveMatch` é um **espelho dos quadros do servidor**: `snapshot()` devolve o último retrato, os "setters" mandam decisões que valem no passo
 * seguinte do relógio (menos de um segundo) e nada é simulado no aparelho. A velocidade é do técnico (1x a 8x, como no solo) e o servidor usa a mais lenta
 * quando dois técnicos jogam um contra o outro; o intervalo dura até 1 minuto e acaba antes se todos tocarem em "Voltar ao jogo".
 */
import type { MatchSide, MatchSnapshot } from '../engine/match'
import type { LiveMatch } from '../engine/match'
import type { GridPoint, Mentality, PlayStyle } from '../engine/types'
import { gridKey } from '../engine/grid'
import { LiveSession, myGame, mySide, type ClientGame, type LiveClientState } from '../online/liveSession'
import { openLiveSession } from './leagues'
import type { LiveSession as SoloLiveSession } from './liveMatch'

/** Espera antes de mandar as mudanças de posição ao servidor: quem arrasta várias vezes seguidas manda só a última de cada jogador. */
export const POSITION_SEND_DELAY_MS = 300
/** Uma mudança de posição que a tela já mostra e o servidor ainda não confirmou fica no máximo isto de tempo. */
export const POSITION_OVERLAY_MAX_MS = 6000

interface PendingMove {
  playerId: string
  point: GridPoint
  at: number
  /** Id do comando já enviado (a resposta do servidor chega em `outcomes`). */
  commandId?: string
  /** O servidor aceitou: sai da tela no próximo quadro (que já traz a posição). */
  acked?: boolean
}

/** O `LiveMatch` que a tela do solo usa, mas movido pelo servidor. */
class OnlineLiveMatch implements LiveMatch {
  /** Mudanças de posição que o técnico fez e ainda não voltaram no quadro do servidor (a tela as mostra já, na ordem em que foram feitas). */
  private moves: PendingMove[] = []
  private sendTimer: ReturnType<typeof setTimeout> | undefined
  /** O motivo da última recusa de uma mudança de posição (o jogador já voltou ao lugar). */
  lastPositionError: string | undefined
  /** Mudanças que o técnico acabou de pedir e ainda não voltaram no quadro (a tela as mostra já). */
  private overlay: { style?: PlayStyle; mentality?: Mentality; formationId?: string } = {}

  constructor(private readonly handle: OnlineMatchHandle) {}

  clearOverlay(): void {
    this.overlay = {}
  }

  /** Aplica as mudanças de posição pendentes sobre as posições do servidor, na mesma ordem e com a mesma regra de troca do motor. */
  private withMoves(onPitch: MatchSnapshot['home']['onPitch']): MatchSnapshot['home']['onPitch'] {
    if (this.moves.length === 0) return onPitch
    const points = new Map(onPitch.map((p) => [p.playerId, p.point as GridPoint]))
    for (const m of this.moves) {
      const from = points.get(m.playerId)
      if (!from) continue
      const other = [...points.entries()].find(([id, pt]) => id !== m.playerId && gridKey(pt) === gridKey(m.point))?.[0]
      if (other) points.set(other, { ...from })
      points.set(m.playerId, { ...m.point })
    }
    return onPitch.map((p) => ({ ...p, point: points.get(p.playerId) as GridPoint }))
  }

  /** Chamado a cada notícia do servidor: tira da tela as mudanças que ele já confirmou ou recusou (a recusa devolve o jogador e guarda o motivo). */
  reconcile(outcomes: readonly { id: string; ok: boolean; reason?: string; detail?: string }[], now = Date.now()): void {
    if (this.moves.length === 0) return
    const byId = new Map(outcomes.map((o) => [o.id, o]))
    const next: PendingMove[] = []
    for (const m of this.moves) {
      const o = m.commandId ? byId.get(m.commandId) : undefined
      if (o && !o.ok) {
        this.lastPositionError = o.detail ?? 'A mudança de posição não é permitida agora.'
        continue
      }
      if (m.acked) continue // o quadro que chegou já traz a posição
      if (now - m.at > POSITION_OVERLAY_MAX_MS) continue
      next.push(o?.ok ? { ...m, acked: true } : m)
    }
    this.moves = next
  }

  private flushMoves(): void {
    this.sendTimer = undefined
    for (const m of this.moves) {
      if (m.commandId) continue
      const id = this.handle.session.send({ type: 'position', playerId: m.playerId, point: m.point })
      if (id) m.commandId = id
    }
  }

  private get game(): ClientGame {
    return this.handle.game as ClientGame
  }
  get minute(): number {
    return this.game.snapshot.minute
  }
  get finished(): boolean {
    return this.game.snapshot.finished
  }
  get injuryPending(): MatchSnapshot['injuryPending'] {
    return this.game.snapshot.injuryPending
  }
  playUntil(): void {
    /* o servidor joga */
  }
  snapshot(): MatchSnapshot {
    const snap = this.game.snapshot
    const side = this.handle.side
    const o = this.overlay
    if (!o.style && o.mentality === undefined && !o.formationId && this.moves.length === 0) return snap
    const mine = snap[side]
    return { ...snap, [side]: { ...mine, onPitch: this.withMoves(mine.onPitch), ...(o.style ? { style: o.style } : {}), ...(o.mentality !== undefined ? { mentality: o.mentality, activeMentality: o.mentality } : {}), ...(o.formationId ? { formationId: o.formationId } : {}) } }
  }
  setStyle(_side: MatchSide, style: PlayStyle): void {
    this.overlay = { ...this.overlay, style }
    this.handle.session.send({ type: 'style', style })
  }
  setMentality(_side: MatchSide, mentality: Mentality): void {
    this.overlay = { ...this.overlay, mentality }
    this.handle.session.send({ type: 'mentality', mentality })
  }
  setFormation(_side: MatchSide, formationId: string): void {
    this.overlay = { ...this.overlay, formationId }
    this.handle.session.send({ type: 'formation', formationId })
  }
  setPosition(_side: MatchSide, playerId: string, point: GridPoint): void {
    const now = this.withMoves(this.game.snapshot[this.handle.side].onPitch)
    if (!now.some((p) => p.playerId === playerId)) throw new Error('O jogador não está em campo')
    // Vale só a última posição de cada jogador que ainda não foi enviada; a tela mostra a mudança na hora e o servidor recebe depois do tempo de espera.
    this.moves = [...this.moves.filter((m) => !(m.playerId === playerId && !m.commandId)), { playerId, point: { row: point.row, lane: point.lane }, at: Date.now() }]
    this.lastPositionError = undefined
    clearTimeout(this.sendTimer)
    this.sendTimer = setTimeout(() => {
      this.flushMoves()
    }, POSITION_SEND_DELAY_MS)
    this.handle.notify()
  }

  stop(): void {
    clearTimeout(this.sendTimer)
  }
  substitute(_side: MatchSide, outgoingId: string, incomingId: string): void {
    this.handle.session.send({ type: 'substitute', outgoingId, incomingId })
  }
  resolveInjury(_side: MatchSide, incomingId?: string): void {
    this.handle.session.send({ type: 'injury', ...(incomingId ? { incomingId } : {}) })
  }
  reorganize(): void {
    /* o servidor reorganiza */
  }
  autoResolveInjury(): void {
    /* o servidor decide quando o tempo acaba */
  }
  setControlled(): void {
    /* quem controla é o servidor */
  }
  result(): never {
    throw new Error('O resultado da partida online é do servidor')
  }
}

export class OnlineMatchHandle {
  readonly session: LiveSession
  readonly live: SoloLiveSession
  private readonly adapter: OnlineLiveMatch
  private listeners = new Set<() => void>()
  /** A velocidade que o técnico pediu (a tela a mostra já; o servidor confirma no quadro). */
  mySpeed = 1
  private off: () => void

  constructor(
    readonly leagueId: string,
    readonly playerId: string,
    session: LiveSession,
  ) {
    this.session = session
    this.adapter = new OnlineLiveMatch(this)
    this.live = { matchId: '', match: this.adapter, side: 'home', halftimeDone: false, online: this }
    this.off = session.subscribe((s) => {
      const g = myGame(s)
      if (g) {
        this.live.matchId = g.matchId
        this.live.side = mySide(s) ?? 'home'
        // O servidor é quem manda: o que o técnico pediu já voltou no quadro.
        this.adapter.clearOverlay()
        this.adapter.reconcile(s.outcomes)
        const mine = g.speeds[this.playerId]
        if (mine !== undefined) this.mySpeed = mine
        this.live.halftimeDone = g.snapshot.minute > 45
      }
      for (const l of this.listeners) l()
    })
  }

  get state(): LiveClientState {
    return this.session.state
  }
  get game(): ClientGame | undefined {
    return myGame(this.session.state)
  }
  get side(): MatchSide {
    return mySide(this.session.state) ?? 'home'
  }
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** A velocidade que vale (a mais lenta entre os técnicos do jogo) e se é diferente da que o técnico escolheu. */
  effectiveSpeed(): number {
    return this.game?.speed ?? this.mySpeed
  }

  setSpeed(value: number): void {
    this.mySpeed = value
    this.session.sendSpeed(value)
    for (const l of this.listeners) l()
  }

  /** O intervalo: quanto falta, se eu já toquei e se só falta o outro técnico. */
  halftime(): { deadline: number; mine: boolean; waitingOther: boolean } | undefined {
    const g = this.game
    if (!g?.halftime || g.snapshot.finished) return undefined
    const mine = g.halftime.ready.includes(this.playerId)
    const humans = (g.controlled.home ? 1 : 0) + (g.controlled.away ? 1 : 0)
    return { deadline: g.halftime.deadline, mine, waitingOther: mine && g.halftime.ready.length < humans }
  }
  sendHalf(): void {
    this.session.sendHalf()
  }

  /** "Pular": a IA joga o meu time até o fim (a partida só acaba quando todos os técnicos dela pulam). */
  skip(): void {
    this.session.sendSkip()
  }
  skipState(): { mine: boolean } {
    return { mine: this.game?.skipped?.includes(this.playerId) ?? false }
  }

  /** Respostas mais recentes do servidor aos comandos (para a tela mostrar o motivo de uma recusa). */
  lastRejected(): string | undefined {
    const o = [...this.session.state.outcomes].reverse().find((x) => !x.ok)
    return o?.reason
  }
  /** O texto do motivo (o erro do motor) da última recusa, quando houve. */
  lastRejectedDetail(): string | undefined {
    const o = [...this.session.state.outcomes].reverse().find((x) => !x.ok)
    return o?.detail
  }
  /** A recusa de uma mudança de posição (o jogador já voltou ao lugar). */
  positionError(): string | undefined {
    return this.adapter.lastPositionError
  }
  notify(): void {
    for (const l of this.listeners) l()
  }

  close(): void {
    this.adapter.stop()
    this.off()
    this.session.close()
    this.listeners.clear()
  }
}

let current: OnlineMatchHandle | undefined

export const currentOnlineMatch = (): OnlineMatchHandle | undefined => current

/** Abre (ou reaproveita) a conexão com a partida da liga; `playerId` é o do técnico (para saber a velocidade dele). */
export function openOnlineMatch(leagueId: string, playerId: string): OnlineMatchHandle {
  if (current && current.leagueId === leagueId) return current
  closeOnlineMatch()
  const session = openLiveSession(leagueId)
  current = new OnlineMatchHandle(leagueId, playerId, session)
  void session.connect()
  return current
}

export function closeOnlineMatch(): void {
  current?.close()
  current = undefined
}
