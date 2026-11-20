import { describe, expect, it } from 'vitest'
import { applyCommand, buildDelta, buildFull, diffWorlds } from '../src/engine/league'
import type { LeagueCommand } from '../src/engine/league'
import type { SeasonState } from '../src/engine/season'
import { formationOf } from '../src/engine/formations'
import { keeperIndexOf, spotsOf } from '../src/engine/spots'
import { moveToSpot } from '../src/engine/tacticEdit'
import { LeagueMirror } from '../src/store/leagueMirror'
import type { MirrorTransport, TransportFailure } from '../src/store/leagueMirror'
import { createLeagueWorld } from '../src/store/leagueWorld'

const base = createLeagueWorld(11, undefined, { cups: false })
const MY = base.season.competitions[0]!.teamIds[0]!
const tacticOf = (w: SeasonState | undefined) => w!.teams.find((t) => t.id === MY)!.tactic
const t0 = tacticOf(base)
const keeper = keeperIndexOf(formationOf(t0).grid)
const movers = t0.startingXI.filter((_, i) => i !== keeper)

/** Um servidor de mentira ligado ao espelho: aplica os comandos de verdade (a mesma regra) e conta quantos chegaram. */
function fake(options: { delayMs?: number; failWith?: TransportFailure } = {}) {
  let server = base
  let rev = 1
  const sent: LeagueCommand[] = []
  const transport: MirrorTransport = {
    async fetch(_since, page) {
      return { ok: true, payload: buildFull(server, MY, rev, page) }
    },
    async command(command, since) {
      sent.push(command)
      if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs))
      if (options.failWith) return options.failWith
      const out = applyCommand(server, MY, command)
      if (!out.ok) return { ok: false, error: 'invalid', reason: out.error }
      const change = diffWorlds(server, out.world)
      server = out.world
      rev++
      return { ok: true, payload: buildDelta(server, MY, rev, since ?? 0, change) }
    },
  }
  return { transport, sent, server: () => server }
}

const drag = (tactic: typeof t0, who: number, x: number, y: number) => moveToSpot(tactic, movers[who] as string, { x, y })

describe('mudar jogador de posição na liga online: a tela e o envio', () => {
  it('a tela mostra a mudança na hora, antes de o servidor responder', async () => {
    const f = fake({ delayMs: 40 })
    const m = new LeagueMirror(f.transport, () => {}, 0)
    await m.sync()
    const moved = drag(tacticOf(m.season()), 0, 41.3, 38.6)
    const p = m.perform({ type: 'tactic', tactic: moved })
    expect(spotsOf(tacticOf(m.season()))).toEqual(spotsOf(moved))
    expect((await p).ok).toBe(true)
    expect(spotsOf(tacticOf(m.season()))).toEqual(spotsOf(moved))
  })

  it('vários arrastos seguidos viram um comando só e vale o último', async () => {
    const f = fake()
    const m = new LeagueMirror(f.transport, () => {}, 30)
    await m.sync()
    let tactic = tacticOf(m.season())
    const results: Promise<unknown>[] = []
    for (let i = 0; i < 6; i++) {
      tactic = drag(tactic, i % 4, 30 + i * 7, 35 + i * 3)
      results.push(m.perform({ type: 'tactic', tactic }))
    }
    const outs = (await Promise.all(results)) as { ok: boolean }[]
    expect(outs.every((o) => o.ok)).toBe(true)
    expect(f.sent.length).toBe(1)
    expect(spotsOf(tacticOf(f.server()))).toEqual(spotsOf(tactic))
    expect(spotsOf(tacticOf(m.season()))).toEqual(spotsOf(tactic))
  })

  it('enquanto um comando está a caminho, os seguintes esperam e a tela nunca volta atrás', async () => {
    const f = fake({ delayMs: 90 })
    const m = new LeagueMirror(f.transport, () => {}, 0)
    await m.sync()
    const first = drag(tacticOf(m.season()), 0, 41, 38)
    const p1 = m.perform({ type: 'tactic', tactic: first })
    await new Promise((r) => setTimeout(r, 15)) // o primeiro já está a caminho
    const second = drag(first, 1, 62, 44)
    const p2 = m.perform({ type: 'tactic', tactic: second })
    const seen: boolean[] = []
    const timer = setInterval(() => seen.push(JSON.stringify(spotsOf(tacticOf(m.season()))) === JSON.stringify(spotsOf(second))), 5)
    await Promise.all([p1, p2])
    clearInterval(timer)
    expect(seen.length).toBeGreaterThan(5)
    expect(seen.every(Boolean)).toBe(true)
    expect(f.sent.length).toBe(2)
    expect(spotsOf(tacticOf(f.server()))).toEqual(spotsOf(second))
  })

  it("a espera recomeça a cada arrasto: arrastos espaçados, mas dentro da janela, viram um comando só", async () => {
    const f = fake()
    const m = new LeagueMirror(f.transport, () => {}, 80)
    await m.sync()
    let tactic = tacticOf(m.season())
    const results: Promise<unknown>[] = []
    for (let i = 0; i < 4; i++) {
      tactic = drag(tactic, i, 30 + i * 9, 36 + i * 4)
      results.push(m.perform({ type: "tactic", tactic }))
      await new Promise((r) => setTimeout(r, 50))
    }
    await Promise.all(results)
    expect(f.sent.length).toBe(1)
    expect(spotsOf(tacticOf(f.server()))).toEqual(spotsOf(tactic))
  })

  it("se a tela é escondida a tática que espera sai na hora (flush)", async () => {
    const f = fake()
    const m = new LeagueMirror(f.transport, () => {}, 5000)
    await m.sync()
    const moved = drag(tacticOf(m.season()), 0, 41.3, 38.6)
    const p = m.perform({ type: "tactic", tactic: moved })
    await new Promise((r) => setTimeout(r, 20))
    expect(f.sent.length).toBe(0)
    m.flush()
    expect((await p).ok).toBe(true)
    expect(f.sent.length).toBe(1)
    expect(spotsOf(tacticOf(f.server()))).toEqual(spotsOf(moved))
  })

  it('um comando de outro tipo no meio não se mistura: segue a ordem', async () => {
    const f = fake()
    const m = new LeagueMirror(f.transport, () => {}, 20)
    await m.sync()
    const a = drag(tacticOf(m.season()), 0, 41, 38)
    const b = drag(a, 1, 62, 44)
    const pa = m.perform({ type: 'tactic', tactic: a })
    const pm = m.perform({ type: 'training-delegate-always', on: true })
    const pb = m.perform({ type: 'tactic', tactic: b })
    await Promise.all([pa, pm, pb])
    expect(f.sent.map((c) => c.type)).toEqual(['tactic', 'training-delegate-always', 'tactic'])
    expect(spotsOf(tacticOf(f.server()))).toEqual(spotsOf(b))
  })

  it('o servidor recusou de verdade: o motivo chega à tela e o jogador volta ao lugar antigo', async () => {
    for (const [error, expected] of [
      ['bad-body', 'bad-body'],
      ['rate-limited', 'rate-limited'],
      ['coisa-estranha', 'server'],
    ] as const) {
      const f = fake({ failWith: { ok: false, error } })
      const m = new LeagueMirror(f.transport, () => {}, 0)
      await m.sync()
      const moved = drag(tacticOf(m.season()), 0, 41.3, 38.6)
      const p = m.perform({ type: 'tactic', tactic: moved })
      expect(spotsOf(tacticOf(m.season()))).toEqual(spotsOf(moved))
      expect(await p).toEqual({ ok: false, error: expected })
      expect(spotsOf(tacticOf(m.season()))).toEqual(spotsOf(t0))
    }
  })

  it('a recusa do servidor dá o motivo da regra quando há', async () => {
    const f = fake({ failWith: { ok: false, error: 'invalid', reason: 'foreign-limit' } })
    const m = new LeagueMirror(f.transport, () => {}, 0)
    await m.sync()
    const moved = drag(tacticOf(m.season()), 0, 41.3, 38.6)
    expect(await m.perform({ type: 'tactic', tactic: moved })).toEqual({ ok: false, error: 'foreign-limit' })
  })

  it('sem conexão a mudança não vale e a tela não muda', async () => {
    const f = fake({ failWith: { ok: false, error: 'offline' } })
    const m = new LeagueMirror(f.transport, () => {}, 0)
    await m.sync()
    const moved = drag(tacticOf(m.season()), 0, 41.3, 38.6)
    expect(await m.perform({ type: 'tactic', tactic: moved })).toEqual({ ok: false, error: 'offline' })
    expect(spotsOf(tacticOf(m.season()))).toEqual(spotsOf(t0))
  })
})
