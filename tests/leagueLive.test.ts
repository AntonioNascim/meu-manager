import { describe, expect, it } from 'vitest'
import {
  COMMAND_EXPIRES_MS,
  DEFAULT_CONFIG,
  DEFAULT_SPEED,
  GRID_MS,
  HALFTIME_MS,
  UNWATCHED_SPEED,
  createLeague,
  defaultLeagueConfig,
  enqueueCommand,
  finishLiveEvent,
  isFinished,
  nextWakeAt,
  pauseLiveEvent,
  processLeague,
  readyForSecondHalf,
  rebuildLiveEvent,
  replayResult,
  resumeLiveEvent,
  setConnected,
  setSpeed,
  speedOf,
  startLiveEvent,
  stepLiveEvent,
  toStored,
  viewOf,
} from '../src/engine/league'
import type { LeagueState, LiveEvent, Stepped } from '../src/engine/league'
import { MS_DAY, MS_MINUTE } from '../src/engine/league/pace'
import { BASE_MINUTE_MS } from '../src/engine/match/timing'
import { createGame, turnRunner } from '../src/store/game'

const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const base = createGame(6, 'team-imp', { cups: false }).season
const serieA = base.season.competitions[0]!
const SEATS = [
  { teamId: serieA.teamIds[0]!, playerId: 'jogador-1' },
  { teamId: serieA.teamIds[7]!, playerId: 'jogador-2' },
]
/** Dois técnicos que jogam um contra o outro (a mesma partida): o primeiro jogo da liga. */
const first = base.matches.find((m) => m.competitionId === serieA.id)!
const DUEL = [
  { teamId: first.homeTeamId, playerId: 'jogador-1' },
  { teamId: first.awayTeamId, playerId: 'jogador-2' },
]

/** Liga ao vivo (sem resultado direto) andada até o primeiro evento com partida humana. */
function atFirstEvent(seats = SEATS): { stepped: Stepped; event: LiveEvent; now: number } {
  const league = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('liga-ao-vivo'), false), base, seats, T0)
  let stepped: Stepped = { league, world: base, actions: [] }
  let now = T0
  for (let i = 0; i < 24 * 40 && !stepped.league.current; i++) {
    now = T0 + i * 30 * MS_MINUTE
    stepped = processLeague(JSON.parse(JSON.stringify(stepped.league)) as LeagueState, stepped.world, now, { turn: turnRunner })
  }
  expect(stepped.league.current).toBeDefined()
  return { stepped, event: startLiveEvent(stepped.league, stepped.world, now, BASE_MINUTE_MS, seats.map((s) => s.playerId)), now }
}

/** O alarme da sala: acorda em segundos cheios e passa o relógio até `until` (ms depois de `from`). */
function tick(e: LiveEvent, seats: LeagueState['seats'], from: number, until: number, hook?: (e: LiveEvent, at: number) => LiveEvent) {
  let ev = e
  const outcomes = []
  for (let t = from + GRID_MS; t <= from + until; t += GRID_MS) {
    if (hook) ev = hook(ev, t)
    const step = stepLiveEvent(ev, seats, t)
    ev = step.event
    outcomes.push(...step.outcomes)
    if (isFinished(ev)) break
  }
  return { event: ev, outcomes }
}
/** O que o técnico faria no intervalo: tocar em Voltar ao jogo. */
const ready = (seats: LeagueState['seats']) => (e: LiveEvent, at: number) => {
  for (const g of e.games) if (g.halftime) for (const s of seats) readyForSecondHalf(e, seats, s.playerId, at)
  return e
}
const gameOf = (e: LiveEvent, teamId: string) => e.games.find((g) => g.homeTeamId === teamId || g.awayTeamId === teamId)!
const sameResults = (a: LiveEvent) => a.games.map((g) => JSON.stringify(g.live.result())) as string[]

describe('partida ao vivo na liga online: um relógio por partida (C5)', () => {
  it('a 1x o minuto de jogo dura 700 ms (o do jogo solo) e a velocidade escolhida o divide', () => {
    expect(BASE_MINUTE_MS).toBe(700)
    expect(DEFAULT_SPEED).toBe(2)
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    const slow = gameOf(event, SEATS[0]!.teamId)
    const fast = gameOf(event, SEATS[1]!.teamId)
    if (slow === fast) return
    expect(setSpeed(event, seats, 'jogador-1', 1)).toBe(true)
    expect(setSpeed(event, seats, 'jogador-2', 8)).toBe(true)
    const after = tick(event, seats, now, 12_000).event
    // Em 12 s a 8x a partida passa de 40 minutos; a 1x ainda não chegou ao intervalo.
    expect(gameOf(after, SEATS[1]!.teamId).clock).toBeGreaterThan(gameOf(after, SEATS[0]!.teamId).clock)
    expect(setSpeed(event, seats, 'jogador-1', 3)).toBe(false)
    expect(setSpeed(event, seats, 'estranho', 4)).toBe(false)
  })

  it('dois técnicos na mesma partida: vale a velocidade mais lenta; quem cai deixa a do outro; sem ninguém roda na máxima', () => {
    const { stepped, event } = atFirstEvent(DUEL)
    const seats = stepped.league.seats
    const g = gameOf(event, DUEL[0]!.teamId)
    expect(g).toBe(gameOf(event, DUEL[1]!.teamId))
    setSpeed(event, seats, 'jogador-1', 8)
    expect(speedOf(event, seats, g)).toBe(2) // o outro ainda não escolheu: vale a padrão
    setSpeed(event, seats, 'jogador-2', 4)
    expect(speedOf(event, seats, g)).toBe(4)
    setSpeed(event, seats, 'jogador-2', 1)
    expect(speedOf(event, seats, g)).toBe(1)
    const v = viewOf(event, seats, T0).find((x) => x.matchId === g.matchId)!
    expect(v.speed).toBe(1)
    expect(v.speeds).toEqual({ 'jogador-1': 8, 'jogador-2': 1 })
    let e = setConnected(event, seats, 'jogador-2', false)
    expect(speedOf(e, seats, gameOf(e, DUEL[0]!.teamId))).toBe(8)
    e = setConnected(e, seats, 'jogador-1', false)
    expect(speedOf(e, seats, gameOf(e, DUEL[0]!.teamId))).toBe(UNWATCHED_SPEED)
  })

  it('o intervalo para a partida por até 1 minuto e termina antes quando todos os técnicos tocam em Voltar ao jogo', () => {
    const { stepped, event, now } = atFirstEvent(DUEL)
    const seats = stepped.league.seats
    setSpeed(event, seats, 'jogador-1', 8)
    setSpeed(event, seats, 'jogador-2', 8)
    const g = gameOf(event, DUEL[0]!.teamId)
    let at = now
    let e = event
    // até o intervalo
    for (let i = 0; i < 200 && !gameOf(e, DUEL[0]!.teamId).halftime; i++) {
      at += GRID_MS
      e = stepLiveEvent(e, seats, at).event
    }
    const half = gameOf(e, DUEL[0]!.teamId)
    expect(half.halftime).toBeDefined()
    expect(half.clock).toBe(45)
    expect(half.halftime!.until - at).toBeLessThanOrEqual(HALFTIME_MS + 5_000)
    // parada: nada avança durante o intervalo
    const stay = stepLiveEvent(e, seats, at + 20_000).event
    expect(gameOf(stay, DUEL[0]!.teamId).clock).toBe(45)
    expect(nextWakeAt(stay, at + 20_000)! % GRID_MS).toBe(0)
    // um toque só não basta (são dois técnicos); os dois voltam já
    expect(readyForSecondHalf(stay, seats, 'jogador-1', at + 21_000)).toBe(false)
    expect(readyForSecondHalf(stay, seats, 'jogador-2', at + 22_000)).toBe(true)
    const back = tick(stay, seats, at + 22_000, 3_000).event
    expect(gameOf(back, DUEL[0]!.teamId).clock).toBeGreaterThan(45)
    void g
  })

  it('sem ninguém tocar, o intervalo acaba sozinho em 1 minuto', () => {
    const { stepped, event, now } = atFirstEvent(DUEL)
    const seats = stepped.league.seats
    setSpeed(event, seats, 'jogador-1', 8)
    setSpeed(event, seats, 'jogador-2', 8)
    let at = now
    let e = event
    for (let i = 0; i < 200 && !gameOf(e, DUEL[0]!.teamId).halftime; i++) {
      at += GRID_MS
      e = stepLiveEvent(e, seats, at).event
    }
    const until = gameOf(e, DUEL[0]!.teamId).halftime!.until
    expect(gameOf(stepLiveEvent(e, seats, until - 500).event, DUEL[0]!.teamId).clock).toBe(45)
    expect(gameOf(stepLiveEvent(e, seats, until + 3_000).event, DUEL[0]!.teamId).clock).toBeGreaterThan(45)
  })

  it('comando entra já, é registrado com o minuto em que valeu e a partida refeita pelo registro dá o mesmo resultado', () => {
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    setSpeed(event, seats, 'jogador-1', 8)
    let e = tick(event, seats, now, 6_000).event
    const q = enqueueCommand(e, seats, 'jogador-1', 'c1', { type: 'mentality', mentality: 2 }, now + 6_000)
    expect(q.outcome).toBeUndefined()
    const step = stepLiveEvent(q.event, seats, now + 6_500)
    expect(step.outcomes).toEqual([expect.objectContaining({ id: 'c1', playerId: 'jogador-1', ok: true })])
    e = tick(step.event, seats, now + 6_500, 400_000, ready(seats)).event
    const g = gameOf(e, SEATS[0]!.teamId)
    expect(isFinished(e)).toBe(true)
    expect(g.commands.some((c) => c.command.type === 'mentality' && c.by === 'jogador-1')).toBe(true)
    const record = JSON.parse(JSON.stringify({ version: 1, matchId: g.matchId, input: g.input, commands: g.commands }))
    expect(JSON.stringify(replayResult(record))).toBe(JSON.stringify(g.live.result()))
  })

  it('recusa quem não joga no evento, descarta comando vencido e devolve erro de regra do motor', () => {
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    expect(enqueueCommand(event, seats, 'estranho', 'x', { type: 'style', style: 'possession' }, now).outcome?.reason).toBe('not-your-team')
    const old = enqueueCommand(event, seats, 'jogador-1', 'velho', { type: 'style', style: 'high-press' }, now).event
    const late = stepLiveEvent(old, seats, now + COMMAND_EXPIRES_MS + 5_000)
    expect(late.outcomes[0]).toMatchObject({ id: 'velho', ok: false, reason: 'expired' })
    const fresh = atFirstEvent()
    const bad = enqueueCommand(fresh.event, fresh.stepped.league.seats, 'jogador-1', 'ruim', { type: 'substitute', outgoingId: 'nao-existe', incomingId: 'nem-este' }, fresh.now).event
    expect(stepLiveEvent(bad, fresh.stepped.league.seats, fresh.now + 2_000).outcomes[0]).toMatchObject({ id: 'ruim', ok: false, reason: 'engine' })
  })

  it('técnico que cai passa à IA (e a partida sem ninguém roda na máxima); ao voltar retoma, e o registro refaz igual', () => {
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    let e = tick(event, seats, now, 3_000).event
    e = setConnected(e, seats, 'jogador-1', false)
    expect(viewOf(e, seats, now).some((v) => !v.controlled.home && !v.controlled.away)).toBe(true)
    e = tick(e, seats, now + 3_000, 8_000).event
    e = setConnected(e, seats, 'jogador-1', true)
    const done = tick(e, seats, now + 11_000, 400_000, ready(seats)).event
    expect(isFinished(done)).toBe(true)
    for (const g of done.games) {
      const record = JSON.parse(JSON.stringify({ version: 1, matchId: g.matchId, input: g.input, commands: g.commands }))
      expect(JSON.stringify(replayResult(record))).toBe(JSON.stringify(g.live.result()))
    }
    expect(done.present).toContain('jogador-1')
  })

  it('hibernação: guardar, reconstruir e seguir dá exatamente o mesmo jogo (com velocidade e intervalo)', () => {
    const { stepped, event, now } = atFirstEvent(DUEL)
    const seats = stepped.league.seats
    setSpeed(event, seats, 'jogador-1', 8)
    setSpeed(event, seats, 'jogador-2', 4)
    let a = enqueueCommand(tick(event, seats, now, 3_000).event, seats, 'jogador-2', 'k', { type: 'style', style: 'counter-attack' }, now + 3_000).event
    a = tick(a, seats, now + 3_000, 25_000).event
    const revived = rebuildLiveEvent(JSON.parse(JSON.stringify(toStored(a))))
    expect(revived.clock).toBe(a.clock)
    expect(revived.games[0]!.speeds).toEqual(a.games[0]!.speeds)
    expect(revived.games[0]!.nextAt).toBe(a.games[0]!.nextAt)
    const ready2 = ready(seats)
    const x = tick(a, seats, now + 28_000, 300_000, ready2).event
    const y = tick(revived, seats, now + 28_000, 300_000, ready2).event
    expect(sameResults(x)).toEqual(sameResults(y))
    expect(x.games.length).toBeGreaterThan(0)
  })

  it('pausa congela o relógio de cada partida e a retomada dá 10 s de aviso antes do próximo lance', () => {
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    let e = tick(event, seats, now, 4_000).event
    const clocks = e.games.map((g) => g.clock)
    e = pauseLiveEvent(e, now + 4_000)
    expect(nextWakeAt(e, now + 5_000)).toBeUndefined()
    expect(stepLiveEvent(e, seats, now + 60_000).event.games.map((g) => g.clock)).toEqual(clocks)
    const nextAts = e.games.map((g) => g.nextAt)
    e = resumeLiveEvent(e, now + 64_000)
    // ficou 60 s parado + 10 s de aviso
    expect(e.games.map((g) => g.nextAt)).toEqual(nextAts.map((n) => n + 70_000))
    expect(e.pausedAt).toBeUndefined()
  })

  it('o alarme acorda em segundos cheios e o fim entrega os resultados, encerra o evento e conta a ausência de quem não esteve', () => {
    const { stepped, event, now } = atFirstEvent()
    const seats = stepped.league.seats
    expect(nextWakeAt(event, now)! % GRID_MS).toBe(0)
    for (const s of seats) setSpeed(event, seats, s.playerId, 8)
    const ready2 = ready(seats)
    const done = tick(event, seats, now, 400_000, ready2).event
    expect(isFinished(done)).toBe(true)
    expect(nextWakeAt(done, now + 500_000)).toBeUndefined()
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
