import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyPayload, buildFull, emptyMirror, toSeasonState } from '../src/engine/league'
import type { MirrorState } from '../src/engine/league'
import { createIdentity } from '../src/online/identity'
import { LeagueMirror, type MirrorTransport } from '../src/store/leagueMirror'
import { closeLeague, openLeague } from '../src/store/leagueSession'
import { getGame, setGame } from '../src/store/gameStore'
import { MIRROR_CACHE_VERSION, MirrorCache, parseMirror, serializeMirror } from '../src/store/mirrorCache'
import { createLeagueWorld } from '../src/store/leagueWorld'

const world = createLeagueWorld(51, undefined, { cups: false })
const MY = world.season.competitions[0]!.teamIds[0]!
const OTHER = world.season.competitions[0]!.teamIds[3]!

function full(rev = 3): MirrorState {
  let m = emptyMirror()
  const first = buildFull(world, MY, rev, 0, [MY])
  m = applyPayload(m, first)
  for (let page = 1; page < (first.pages ?? 1); page++) m = applyPayload(m, buildFull(world, MY, rev, page, [MY]))
  return m
}

const offlineTransport = (): MirrorTransport => ({
  fetch: async () => ({ ok: false, error: 'offline' }),
  command: async () => ({ ok: false, error: 'offline' }),
})

afterEach(() => {
  closeLeague()
  setGame(null)
  vi.unstubAllGlobals()
})

describe('espelho guardado no aparelho e detalhe ao tocar (C6)', () => {
  it('guarda e devolve o espelho idêntico; formato antigo ou estragado é descartado', async () => {
    const cache = new MirrorCache('espelho-teste-1')
    const m = full()
    await cache.save('liga-1', m)
    const back = (await cache.load('liga-1'))!
    expect(back.rev).toBe(3)
    expect(back.players.size).toBe(m.players.size)
    expect(toSeasonState(back)!.players.length).toBe(world.players.length)
    expect(await cache.load('outra')).toBeUndefined()
    expect(parseMirror('lixo')).toBeUndefined()
    expect(parseMirror(JSON.stringify({ rev: 1 }))).toBeUndefined()
    expect(serializeMirror(m).length).toBeGreaterThan(1000)
    expect(MIRROR_CACHE_VERSION).toBe(1)
    await cache.clear('liga-1')
    expect(await cache.load('liga-1')).toBeUndefined()
  })

  it('só guarda as 3 ligas mais recentes e só regrava quando a revisão muda', async () => {
    const cache = new MirrorCache('espelho-teste-2')
    const m = full()
    for (const id of ['a', 'b', 'c', 'd']) {
      await cache.save(id, m)
      await new Promise((r) => setTimeout(r, 3))
    }
    expect(await cache.load('a')).toBeUndefined()
    expect(await cache.load('d')).toBeDefined()
    const spy = vi.spyOn(cache, 'save')
    cache.schedule('d', m, 1)
    await new Promise((r) => setTimeout(r, 30))
    expect(spy).not.toHaveBeenCalled() // mesma revisão
    cache.schedule('d', { ...m, rev: 9 }, 1)
    await new Promise((r) => setTimeout(r, 60))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('o detalhe põe a condição real e a tática dos clubes abertos por cima do neutro, uma vez por revisão', async () => {
    const victim = world.players.find((p) => p.teamId === OTHER)!
    let calls = 0
    const mirror = new LeagueMirror({
      ...offlineTransport(),
      fetch: async (_s, page) => ({ ok: true, payload: buildFull(world, MY, 5, page, [MY]) }),
      detail: async (teamId) => {
        calls++
        return { ok: true, detail: { conditions: { [victim.id]: { ...victim.condition, fitness: 37, morale: 9 } }, tactic: { ...world.teams.find((t) => t.id === teamId)!.tactic, style: 'high-press' } } }
      },
    })
    await mirror.sync()
    expect(mirror.season()!.players.find((p) => p.id === victim.id)!.condition.fitness).toBe(100)
    expect(await mirror.loadDetail(OTHER)).toBe(true)
    expect(mirror.season()!.players.find((p) => p.id === victim.id)!.condition).toMatchObject({ fitness: 37, morale: 9 })
    expect(mirror.season()!.teams.find((t) => t.id === OTHER)!.tactic.style).toBe('high-press')
    expect(await mirror.loadDetail(OTHER)).toBe(false) // mesma revisão: não baixa de novo
    expect(calls).toBe(1)
    expect(await mirror.loadDetail(MY)).toBe(false) // o próprio clube já vem completo
  })

  it('sem internet a liga abre só com o espelho guardado (leitura); sem guardado não abre', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('sem rede')
    })
    const cache = new MirrorCache('espelho-teste-3')
    const { identity } = createIdentity((n) => crypto.getRandomValues(new Uint8Array(n)))
    expect(await openLeague('liga-x', identity, offlineTransport(), cache)).toBe('failed')
    await cache.save('liga-x', full())
    expect(await openLeague('liga-x', identity, offlineTransport(), cache)).toBe('ok')
    const g = getGame()!
    expect(g.online).toMatchObject({ leagueId: 'liga-x', connection: 'offline' })
    expect(g.season.players.length).toBe(world.players.length)
    expect(g.userTeamId).toBe(MY)
  })
})
