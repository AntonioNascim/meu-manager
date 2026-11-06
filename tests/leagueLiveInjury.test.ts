import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, INJURY_WAIT_MS, createLeague, defaultLeagueConfig, enqueueCommand, processLeague, replayResult, setConnected, startLiveEvent, stepLiveEvent, viewOf } from '../src/engine/league'
import type { LeagueState, LiveEvent, LiveGame, Stepped } from '../src/engine/league'
import { MS_MINUTE } from '../src/engine/league/pace'
import { frameSince, parseClientMessage } from '../src/online/liveProtocol'
import { applyMessage, initialLiveState, myGame } from '../src/online/liveSession'
import { createGame, turnRunner } from '../src/store/game'

const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const MINUTE_MS = 10_000

interface Found {
  seats: LeagueState['seats']
  event: LiveEvent
  now: number
  /** Partida e lado do técnico 1 onde a lesão está esperando. */
  game: LiveGame
  side: 'home' | 'away'
}

/** Procura (por semente do mundo) uma partida humana em que um dos técnicos sofre uma lesão, e devolve o evento parado nela. */
function withInjury(): Found {
  for (let seed = 1; seed <= 40; seed++) {
    const base = createGame(seed, 'team-imp', { cups: false }).season
    const serieA = base.season.competitions[0]!
    const seats = [
      { teamId: serieA.teamIds[0]!, playerId: 'jogador-1' },
      { teamId: serieA.teamIds[7]!, playerId: 'jogador-2' },
    ]
    const league = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('liga-ao-vivo'), false), base, seats, T0)
    let stepped: Stepped = { league, world: base, actions: [] }
    let now = T0
    for (let i = 0; i < 24 * 40 && !stepped.league.current; i++) {
      now = T0 + i * 30 * MS_MINUTE
      stepped = processLeague(JSON.parse(JSON.stringify(stepped.league)) as LeagueState, stepped.world, now, { turn: turnRunner })
    }
    if (!stepped.league.current) continue
    let event = startLiveEvent(stepped.league, stepped.world, now, MINUTE_MS, ['jogador-1', 'jogador-2'])
    for (let m = 1; m <= 90; m++) {
      event = stepLiveEvent(event, stepped.league.seats, now + m * MINUTE_MS).event
      const game = event.games.find((g) => g.live.injuryPending && (g.homeTeamId === seats[0]!.teamId || g.awayTeamId === seats[0]!.teamId || g.homeTeamId === seats[1]!.teamId || g.awayTeamId === seats[1]!.teamId))
      if (game) return { seats: stepped.league.seats, event, now: now + m * MINUTE_MS, game, side: game.live.injuryPending!.side }
    }
  }
  throw new Error('nenhuma lesão encontrada nas sementes testadas')
}

const ownerOf = (f: Found): string => {
  const teamId = f.side === 'home' ? f.game.homeTeamId : f.game.awayTeamId
  return f.seats.find((s) => s.teamId === teamId)!.playerId
}

describe('lesão na partida ao vivo online: o técnico escolhe quem entra', () => {
  it('a partida do técnico para na lesão e a tela recebe a lesão com a contagem', () => {
    const f = withInjury()
    const before = f.game.live.snapshot().minute
    const later = stepLiveEvent(f.event, f.seats, f.now + 2 * MINUTE_MS)
    const g = later.event.games.find((x) => x.matchId === f.game.matchId)!
    expect(g.live.injuryPending).toBeDefined()
    expect(g.live.snapshot().minute).toBe(before) // parada: o relógio do evento anda e o jogo dele não
    const views = viewOf(later.event, f.seats)
    const mine = views.find((v) => v.matchId === f.game.matchId)!
    expect(mine.injuryLeftMs).toBeGreaterThan(0)
    expect(mine.injuryLeftMs).toBeLessThanOrEqual(INJURY_WAIT_MS)
    // O quadro que vai para o cliente leva a lesão e o estado do cliente a guarda e a tira quando resolve.
    const { frame } = frameSince(later.event, views, {})
    expect(frame.t === 'frame' && frame.games.find((x) => x.matchId === f.game.matchId)?.injury).toMatchObject({ side: f.side, playerId: f.game.live.injuryPending!.playerId })
  })

  it('o técnico escolhe o reserva: ele entra, o jogo volta e a partida refeita pelo registro dá o mesmo resultado', () => {
    const f = withInjury()
    const who = ownerOf(f)
    const snap = f.game.live.snapshot()
    const bench = snap[f.side].bench
    expect(bench.length).toBeGreaterThan(0)
    const incoming = bench[bench.length - 1]!
    const q = enqueueCommand(f.event, f.seats, who, 'inj-1', { type: 'injury', incomingId: incoming }, f.now)
    const step = stepLiveEvent(q.event, f.seats, f.now + MINUTE_MS)
    expect(step.outcomes).toEqual([expect.objectContaining({ id: 'inj-1', ok: true })])
    const g = step.event.games.find((x) => x.matchId === f.game.matchId)!
    expect(g.live.snapshot()[f.side].onPitch.some((p) => p.playerId === incoming)).toBe(true)
    expect(g.live.injuryPending).toBeUndefined()
    const done = stepLiveEvent(step.event, f.seats, f.now + 200 * MINUTE_MS)
    const dg = done.event.games.find((x) => x.matchId === f.game.matchId)!
    expect(dg.commands.some((c) => c.command.type === 'injury' && c.by === who)).toBe(true)
    const record = JSON.parse(JSON.stringify({ version: 1, matchId: dg.matchId, input: dg.input, commands: dg.commands }))
    expect(JSON.stringify(replayResult(record))).toBe(JSON.stringify(dg.live.result()))
  })

  it('"seguir com um a menos" é uma escolha válida', () => {
    const f = withInjury()
    const who = ownerOf(f)
    const q = enqueueCommand(f.event, f.seats, who, 'inj-2', { type: 'injury' }, f.now)
    const step = stepLiveEvent(q.event, f.seats, f.now + MINUTE_MS)
    expect(step.outcomes[0]).toMatchObject({ ok: true })
    const g = step.event.games.find((x) => x.matchId === f.game.matchId)!
    expect(g.live.injuryPending).toBeUndefined()
    expect(g.live.snapshot()[f.side].onPitch.length).toBe(10)
  })

  it('sem escolha, depois de INJURY_WAIT_MS entra o melhor reserva (anotado no registro) e a reprodução bate', () => {
    const f = withInjury()
    const waiting = stepLiveEvent(f.event, f.seats, f.now + MINUTE_MS)
    expect(waiting.event.games.find((x) => x.matchId === f.game.matchId)!.live.injuryPending).toBeDefined()
    const after = stepLiveEvent(waiting.event, f.seats, f.now + 2 * MINUTE_MS + INJURY_WAIT_MS + MINUTE_MS)
    const g = after.event.games.find((x) => x.matchId === f.game.matchId)!
    expect(g.live.injuryPending).toBeUndefined()
    expect(g.commands.some((c) => c.command.type === 'injury-auto')).toBe(true)
    const done = stepLiveEvent(after.event, f.seats, f.now + 300 * MINUTE_MS)
    const dg = done.event.games.find((x) => x.matchId === f.game.matchId)!
    const record = JSON.parse(JSON.stringify({ version: 1, matchId: dg.matchId, input: dg.input, commands: dg.commands }))
    expect(JSON.stringify(replayResult(record))).toBe(JSON.stringify(dg.live.result()))
  })

  it('no teto do relógio (minuto 120) a lesão que espera é resolvida na hora e a partida termina', () => {
    const f = withInjury()
    const capped = { ...f.event, clock: 120 }
    const step = stepLiveEvent(capped, f.seats, f.now + 500 * MINUTE_MS)
    const g = step.event.games.find((x) => x.matchId === f.game.matchId)!
    expect(g.live.injuryPending).toBeUndefined()
    expect(g.live.finished).toBe(true)
  })

  it('técnico que cai: o melhor reserva entra no minuto seguinte, sem esperar', () => {
    const f = withInjury()
    const who = ownerOf(f)
    const dropped = setConnected(f.event, f.seats, who, false)
    const step = stepLiveEvent(dropped, f.seats, f.now + MINUTE_MS)
    const g = step.event.games.find((x) => x.matchId === f.game.matchId)!
    expect(g.live.injuryPending).toBeUndefined()
    expect(g.commands.some((c) => c.command.type === 'injury-auto')).toBe(true)
  })

  it('o quadro seguinte sem lesão limpa a lesão do estado do cliente', () => {
    const f = withInjury()
    const views = viewOf(f.event, f.seats)
    let state = applyMessage(initialLiveState(), { t: 'full', minute: f.event.clock, paused: false, games: views, roster: { teams: [], players: [] }, me: { teamId: f.seats.find((s) => s.playerId === ownerOf(f))!.teamId } })
    expect(myGame(state)?.injury).toMatchObject({ side: f.side })
    const resolved = stepLiveEvent(enqueueCommand(f.event, f.seats, ownerOf(f), 'x', { type: 'injury' }, f.now).event, f.seats, f.now + MINUTE_MS).event
    state = applyMessage(state, frameSince(resolved, viewOf(resolved, f.seats), {}).frame)
    expect(myGame(state)?.injury).toBeUndefined()
    expect(myGame(state)?.snapshot.injuryPending).toBeUndefined()
  })

  it('o protocolo aceita a escolha da lesão e recusa lixo', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', id: 'a1', command: { type: 'injury', incomingId: 'player-9' } }))).toMatchObject({ ok: true })
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', id: 'a1', command: { type: 'injury' } }))).toMatchObject({ ok: true })
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', id: 'a1', command: { type: 'injury', incomingId: 'x y' } }))).toMatchObject({ ok: false })
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', id: 'a1', command: { type: 'injury-auto' } }))).toMatchObject({ ok: false })
  })
})
