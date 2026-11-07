import { describe, expect, it } from 'vitest'
import { frameSince, type Roster, type ServerMessage } from '../src/online/liveProtocol'
import { LiveSession, applyMessage, initialLiveState, myGame, mySide, type SocketLike } from '../src/online/liveSession'
import { startGame, viewOf, type LiveEvent } from '../src/engine/league'
import { humanMatchInput } from '../src/engine/season'
import { createGame } from '../src/store/game'

const base = createGame(6, 'team-imp', { cups: false }).season
const match = base.matches.find((m) => m.competitionId === base.season.competitions[0]!.id)!
const input = humanMatchInput(base, match, new Set([match.homeTeamId]))
const roster: Roster = { teams: [], players: [] }

function eventAt(minute: number): { e: LiveEvent; game: ReturnType<typeof startGame> } {
  const game = startGame(match.id, input)
  game.live.playUntil(minute)
  return { e: { clock: minute, games: [game], connected: [] } as unknown as LiveEvent, game }
}

const full = (minute: number): ServerMessage => {
  const { e } = eventAt(minute)
  return { t: 'full', minute, paused: false, games: viewOf(e, []), roster, me: { teamId: match.homeTeamId } }
}

describe('estado do cliente da partida ao vivo', () => {
  it('o retrato inteiro mais os quadros dão o mesmo que o retrato do servidor no mesmo minuto', () => {
    const { e, game } = eventAt(20)
    let state = applyMessage(initialLiveState(), { t: 'full', minute: 20, paused: false, games: viewOf(e, []), roster, me: { teamId: match.homeTeamId } })
    expect(state.status).toBe('live')
    const first = frameSince(e, viewOf(e, []), {})
    game.live.playUntil(55)
    e.clock = 55
    const second = frameSince(e, viewOf(e, []), first.cursor)
    state = applyMessage(state, second.frame!)
    const snap = game.live.snapshot()
    const mine = state.games[0]!.snapshot
    expect(mine.minute).toBe(55)
    expect(mine.events).toEqual(snap.events)
    expect(mine.trace).toEqual(snap.trace)
    expect(mine.home).toEqual(snap.home)
    expect(mine.away).toEqual(snap.away)
    expect(mine.homeGoals).toBe(snap.homeGoals)
    expect(myGame(state)?.matchId).toBe(match.id)
    expect(mySide(state)).toBe('home')
  })

  it('pausa, retomada com aviso, resposta a comando e fim', () => {
    let s = applyMessage(initialLiveState(), full(10))
    s = { ...s, pending: ['c1'] }
    s = applyMessage(s, { t: 'paused', minute: 10 })
    expect(s.paused).toBe(true)
    s = applyMessage(s, { t: 'resumed', minute: 10, resumeAt: 5000 })
    expect(s.paused).toBe(false)
    expect(s.resumeAt).toBe(5000)
    s = applyMessage(s, { t: 'result', outcomes: [{ id: 'c1', playerId: 'p', ok: false, reason: 'expired' }] })
    expect(s.pending).toEqual([])
    expect(s.outcomes[0]!.reason).toBe('expired')
    expect(applyMessage(s, { t: 'end' }).status).toBe('ended')
    expect(applyMessage(s, { t: 'error', problem: 'not-in-event' }).status).toBe('no-event')
  })
})

class FakeSocket implements SocketLike {
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  send(d: string) {
    this.sent.push(d)
  }
  close() {
    this.onclose?.()
  }
}

function harness(ticketFails = 0) {
  const sockets: FakeSocket[] = []
  const timers: { fn: () => void; ms: number }[] = []
  let tickets = 0
  let failures = ticketFails
  const session = new LiveSession({
    getTicket: async () => (failures-- > 0 ? { ok: false, error: 'offline' } : { ok: true, ticket: `t${++tickets}` }),
    openSocket: () => {
      const s = new FakeSocket()
      sockets.push(s)
      return s
    },
    now: () => 0,
    setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimer: () => undefined,
    randomId: () => 'x',
    maxAttempts: 3,
  })
  return { session, sockets, timers, tickets: () => tickets }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('LiveSession: conexão e reconexão', () => {
  it('conecta, diz olá com o último minuto visto e recebe o retrato', async () => {
    const h = harness()
    await h.session.connect()
    h.sockets[0]!.onopen?.()
    expect(JSON.parse(h.sockets[0]!.sent[0]!)).toEqual({ t: 'hello', since: 0 })
    h.sockets[0]!.onmessage?.({ data: JSON.stringify(full(33)) })
    expect(h.session.state.status).toBe('live')
    expect(h.session.state.minute).toBe(33)
  })

  it('a conexão cai: tenta de novo com ticket NOVO e o retrato refaz tudo', async () => {
    const h = harness()
    await h.session.connect()
    h.sockets[0]!.onopen?.()
    h.sockets[0]!.onmessage?.({ data: JSON.stringify(full(40)) })
    h.sockets[0]!.onclose?.()
    expect(h.session.state.status).toBe('reconnecting')
    expect(h.timers).toHaveLength(1)
    h.timers[0]!.fn()
    await flush()
    expect(h.tickets()).toBe(2)
    h.sockets[1]!.onopen?.()
    expect(JSON.parse(h.sockets[1]!.sent[0]!)).toEqual({ t: 'hello', since: 40 })
    h.sockets[1]!.onmessage?.({ data: JSON.stringify(full(47)) })
    expect(h.session.state.status).toBe('live')
    expect(h.session.state.minute).toBe(47)
  })

  it('depois do fim da partida não reconecta', async () => {
    const h = harness()
    await h.session.connect()
    h.sockets[0]!.onopen?.()
    h.sockets[0]!.onmessage?.({ data: JSON.stringify(full(90)) })
    h.sockets[0]!.onmessage?.({ data: JSON.stringify({ t: 'end' }) })
    h.sockets[0]!.onclose?.()
    expect(h.timers).toHaveLength(0)
    expect(h.session.state.status).toBe('ended')
  })

  it('sem conseguir ticket várias vezes seguidas desiste', async () => {
    const h = harness(99)
    await h.session.connect()
    for (let i = 0; i < 5 && h.timers.length > i; i++) {
      h.timers[i]!.fn()
      await flush()
    }
    expect(h.session.state.status).toBe('failed')
    expect(h.sockets).toHaveLength(0)
  })

  it('comando: só com a conexão ativa; a resposta tira dos pendentes', async () => {
    const h = harness()
    expect(h.session.send({ type: 'style', style: 'possession' })).toBe(false)
    await h.session.connect()
    h.sockets[0]!.onopen?.()
    h.sockets[0]!.onmessage?.({ data: JSON.stringify(full(12)) })
    const id = h.session.send({ type: 'mentality', mentality: 1 }) as string
    expect(JSON.parse(h.sockets[0]!.sent.at(-1)!)).toEqual({ t: 'cmd', id, command: { type: 'mentality', mentality: 1 } })
    expect(h.session.state.pending).toEqual([id])
    h.sockets[0]!.onmessage?.({ data: JSON.stringify({ t: 'result', outcomes: [{ id, playerId: 'p', ok: true, minute: 13 }] }) })
    expect(h.session.state.pending).toEqual([])
  })
})
