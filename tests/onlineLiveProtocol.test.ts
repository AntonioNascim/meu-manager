import { describe, expect, it } from 'vitest'
import { frameSince, makeStoredReplay, parseClientMessage, replayKey, verifyReplay, type Cursor } from '../src/online/liveProtocol'
import { LIVE_MATCH_MS, liveMinuteMs } from '../src/engine/league/pace'
import { replayOf, startGame, viewOf, type LiveEvent } from '../src/engine/league'
import { humanMatchInput } from '../src/engine/season'
import { createGame } from '../src/store/game'

const base = createGame(6, 'team-imp', { cups: false }).season
const match = base.matches.find((m) => m.competitionId === base.season.competitions[0]!.id)!
const input = humanMatchInput(base, match, new Set([match.homeTeamId]))

describe('protocolo da partida ao vivo', () => {
  it('aceita só mensagens bem formadas e nunca o comando de controle', () => {
    expect(parseClientMessage('{"t":"ping"}')).toEqual({ ok: true, message: { t: 'ping' } })
    expect(parseClientMessage('{"t":"hello","since":12}')).toEqual({ ok: true, message: { t: 'hello', since: 12 } })
    expect(parseClientMessage('{"t":"cmd","id":"a1","command":{"type":"mentality","mentality":2}}').ok).toBe(true)
    expect(parseClientMessage('{"t":"cmd","id":"a1","command":{"type":"position","playerId":"p1","point":{"row":3,"lane":1}}}').ok).toBe(true)
    expect(parseClientMessage('{"t":"cmd","id":"a1","command":{"type":"control","controlled":false}}')).toEqual({ ok: false, problem: 'bad-command' })
    expect(parseClientMessage('{"t":"cmd","id":"a1","command":{"type":"mentality","mentality":9}}')).toEqual({ ok: false, problem: 'bad-command' })
    expect(parseClientMessage('{"t":"cmd","id":"x y","command":{"type":"style","style":"possession"}}')).toEqual({ ok: false, problem: 'bad-shape' })
    expect(parseClientMessage('{"t":"hello","since":-3}')).toEqual({ ok: false, problem: 'bad-shape' })
    expect(parseClientMessage('nao e json')).toEqual({ ok: false, problem: 'not-json' })
    expect(parseClientMessage('{"t":"ping","x":"' + 'a'.repeat(5000) + '"}')).toEqual({ ok: false, problem: 'too-large' })
  })

  it('o quadro manda só o que o cliente ainda não viu', () => {
    const g = startGame(match.id, input)
    g.live.playUntil(30)
    const e = { clock: 30, games: [g], connected: [] } as unknown as LiveEvent
    const first = frameSince(e, viewOf(e, []), {})
    g.live.playUntil(60)
    const second = frameSince(e, viewOf(e, []), first.cursor as Cursor)
    const all = frameSince(e, viewOf(e, []), {})
    if (first.frame.t === 'frame' && second.frame.t === 'frame' && all.frame.t === 'frame') {
      expect(first.frame.games[0]!.trace.length + second.frame.games[0]!.trace.length).toBe(all.frame.games[0]!.trace.length)
      expect(first.frame.games[0]!.events.length + second.frame.games[0]!.events.length).toBe(all.frame.games[0]!.events.length)
    }
  })

  it('registro de reprodução: refaz e confere; resultado adulterado não passa', () => {
    const g = startGame(match.id, input)
    g.live.playUntil(120)
    const stored = makeStoredReplay(replayOf(g), g.live.result(), 'teste')
    expect(verifyReplay(JSON.parse(JSON.stringify(stored))).ok).toBe(true)
    expect(verifyReplay({ ...stored, fingerprint: 'adulterado' }).ok).toBe(false)
    expect(replayKey('liga1', '2026-11-07', match.id)).toBe(`replays/liga1/2026-11-07/${match.id}.json`)
  })

  it('durações por ritmo: Normal = 15 min (10 s por minuto) e quanto mais rápido a liga, mais curta a partida', () => {
    expect(liveMinuteMs('normal')).toBe(10_000)
    const order = [LIVE_MATCH_MS.calm, LIVE_MATCH_MS.normal, LIVE_MATCH_MS.fast, LIVE_MATCH_MS['very-fast']]
    expect(order).toEqual([...order].sort((a, b) => b - a))
  })
})
