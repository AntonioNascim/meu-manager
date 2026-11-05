import { describe, expect, it } from 'vitest'
import {
  COMMAND_EXPIRES_MS,
  DEFAULT_CONFIG,
  createLeague,
  defaultLeagueConfig,
  enqueueCommand,
  finishLiveEvent,
  isFinished,
  minuteAt,
  pauseLiveEvent,
  processLeague,
  rebuildLiveEvent,
  replayResult,
  resumeLiveEvent,
  setConnected,
  startLiveEvent,
  stepLiveEvent,
  toStored,
  viewOf,
} from '../src/engine/league'
import type { LeagueState, LiveEvent, Stepped } from '../src/engine/league'
import { MS_DAY, MS_MINUTE } from '../src/engine/league/pace'
import { createGame, turnRunner } from '../src/store/game'

const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const MINUTE_MS = 10_000
const base = createGame(6, 'team-imp', { cups: false }).season
const serieA = base.season.competitions[0]!
const SEATS = [
  { teamId: serieA.teamIds[0]!, playerId: 'jogador-1' },
  { teamId: serieA.teamIds[7]!, playerId: 'jogador-2' },
]

/** Liga ao vivo (sem resultado direto) andada até o primeiro evento com partida humana. */
function atFirstEvent(): { stepped: Stepped; event: LiveEvent; now: number } {
  const league = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('liga-ao-vivo'), false), base, SEATS, T0)
  let stepped: Stepped = { league, world: base, actions: [] }
  let now = T0
  for (let i = 0; i < 24 * 40 && !stepped.league.current; i++) {
    now = T0 + i * 30 * MS_MINUTE
    stepped = processLeague(JSON.parse(JSON.stringify(stepped.league)) as LeagueState, stepped.world, now, { turn: turnRunner })
  }
  expect(stepped.league.current).toBeDefined()
  return { stepped, event: startLiveEvent(stepped.league, stepped.world, now, MINUTE_MS, ['jogador-1', 'jogador-2']), now }
}

const play = (e: LiveEvent, seats: LeagueState['seats'], from: number, minutes: number) => stepLiveEvent(e, seats, from + minutes * MINUTE_MS)
const sameResults = (a: LiveEvent) => a.games.map((g) => JSON.stringify(g.live.result())) as string[]

describe('partida ao vivo na liga online (B7)', () => {
  it('anda um minuto por MINUTE_MS e termina', () => {
    const { stepped, event, now } = atFirstEvent()
    expect(minuteAt(event, now + 35_000)).toBe(3)
    const half = play(event, stepped.league.seats, now, 45)
    expect(half.minute).toBe(45)
    expect(half.finished).toBe(false)
    const end = play(half.event, stepped.league.seats, now, 130)
    expect(isFinished(end.event)).toBe(true)
  })

  it('comando entra no próximo minuto, é registrado e a partida refeita pelo registro dá o mesmo resultado', () => {
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    let e = play(event, seats, now, 20).event
    const q = enqueueCommand(e, seats, 'jogador-1', 'c1', { type: 'mentality', mentality: 2 }, now + 20 * MINUTE_MS)
    expect(q.outcome).toBeUndefined()
    e = q.event
    const step = play(e, seats, now, 21)
    expect(step.outcomes).toEqual([{ id: 'c1', playerId: 'jogador-1', ok: true, minute: 20 }])
    const done = play(step.event, seats, now, 130)
    const g = done.event.games.find((x) => x.homeTeamId === SEATS[0]!.teamId || x.awayTeamId === SEATS[0]!.teamId)!
    expect(g.commands.some((c) => c.command.type === 'mentality' && c.minute === 20 && c.by === 'jogador-1')).toBe(true)
    const record = JSON.parse(JSON.stringify({ version: 1, matchId: g.matchId, input: g.input, commands: g.commands }))
    expect(JSON.stringify(replayResult(record))).toBe(JSON.stringify(g.live.result()))
  })

  it('recusa quem não joga no evento, descarta comando vencido e devolve erro de regra do motor', () => {
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    expect(enqueueCommand(event, seats, 'estranho', 'x', { type: 'style', style: 'possession' }, now).outcome?.reason).toBe('not-your-team')
    const old = enqueueCommand(event, seats, 'jogador-1', 'velho', { type: 'style', style: 'high-press' }, now).event
    const late = stepLiveEvent(old, seats, now + COMMAND_EXPIRES_MS + 5 * MINUTE_MS)
    expect(late.outcomes[0]).toMatchObject({ id: 'velho', ok: false, reason: 'expired' })
    const bad = enqueueCommand(event, seats, 'jogador-1', 'ruim', { type: 'substitute', outgoingId: 'nao-existe', incomingId: 'nem-este' }, now).event
    const out = stepLiveEvent(bad, seats, now + 2 * MINUTE_MS)
    expect(out.outcomes[0]).toMatchObject({ id: 'ruim', ok: false, reason: 'engine' })
  })

  it('técnico que cai passa à IA e volta no minuto seguinte; o registro refaz igual', () => {
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    let e = play(event, seats, now, 10).event
    e = setConnected(e, seats, 'jogador-1', false)
    expect(viewOf(e, seats).some((v) => !v.controlled.home && !v.controlled.away)).toBe(true)
    e = play(e, seats, now, 30).event
    e = setConnected(e, seats, 'jogador-1', true)
    const done = play(e, seats, now, 130).event
    for (const g of done.games) {
      const record = JSON.parse(JSON.stringify({ version: 1, matchId: g.matchId, input: g.input, commands: g.commands }))
      expect(JSON.stringify(replayResult(record))).toBe(JSON.stringify(g.live.result()))
    }
    expect(done.present).toContain('jogador-1')
  })

  it('hibernação: guardar, reconstruir e seguir dá exatamente o mesmo jogo', () => {
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    let a = enqueueCommand(play(event, seats, now, 5).event, seats, 'jogador-2', 'k', { type: 'style', style: 'counter-attack' }, now + 5 * MINUTE_MS).event
    a = play(a, seats, now, 40).event
    const revived = rebuildLiveEvent(JSON.parse(JSON.stringify(toStored(a))))
    expect(revived.clock).toBe(a.clock)
    const x = play(a, seats, now, 130).event
    const y = play(revived, seats, now, 130).event
    expect(sameResults(x)).toEqual(sameResults(y))
    expect(x.games.length).toBeGreaterThan(0)
  })

  it('pausa congela o minuto e a retomada dá 10 s de aviso', () => {
    const { event, now } = atFirstEvent()
    let e = pauseLiveEvent(event, now + 25_000)
    expect(minuteAt(e, now + 10 * 60_000)).toBe(2)
    e = resumeLiveEvent(e, now + 10 * 60_000)
    expect(minuteAt(e, now + 10 * 60_000 + 10_000 + 10_000)).toBe(3)
  })

  it('o fim entrega os resultados, encerra o evento e conta a ausência de quem não esteve', () => {
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    const done = play(event, seats, now, 130).event
    const end = finishLiveEvent(stepped, { ...done, present: done.present.filter((p) => p !== 'jogador-2') }, now + MS_DAY)
    expect(end.stepped.league.current).toBeUndefined()
    expect(end.replays.length).toBe(done.games.length)
    const seat2 = end.stepped.league.seats.find((s) => s.playerId === 'jogador-2')
    const seat1 = end.stepped.league.seats.find((s) => s.playerId === 'jogador-1')
    if (done.games.some((g) => g.homeTeamId === SEATS[1]!.teamId || g.awayTeamId === SEATS[1]!.teamId)) {
      expect(seat2?.missed).toBe(1)
      expect(seat2?.status).toBe('absent')
    }
    expect(seat1?.missed ?? 0).toBe(0)
    expect(end.stepped.world.matches.filter((m) => done.games.some((g) => g.matchId === m.id)).every((m) => m.status === 'finished')).toBe(true)
  })
})
