import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { advanceToMatchday, createGame, playPendingAuto } from '../src/store/game'
import type { Game } from '../src/store/game'
import { pack, unpack } from '../src/store/compress'
import { SAVE_VERSION, compactGame, makeEnvelope, summarizeGame } from '../src/store/saveFormat'
import { exportSlot, importSave } from '../src/store/saveFile'
import { joinParts, planParts, sameRefs } from '../src/store/saveParts'
import { SaveStore, deleteSlot, loadSlot, saveToSlot } from '../src/store/saves'

const store = new SaveStore('meu-manager-teste-partes')

const play = (game: Game, days: number): Game => {
  let g = game
  for (let i = 0; i < days; i++) g = playPendingAuto(advanceToMatchday(g))
  return g
}

const base = play(createGame(6, 'team-imp'), 8)
const next = play(base, 1)
const nextCompact = compactGame(next)

/** Lê as linhas cruas do banco (sem passar pelo SaveStore). */
async function raw<T>(table: string): Promise<T[]> {
  const d = new Dexie(store.name)
  await d.open()
  try {
    return (await d.table(table).toArray()) as T[]
  } finally {
    d.close()
  }
}

beforeEach(async () => {
  for (let slot = 1; slot <= 3; slot++) await store.deleteSlot(slot)
})
afterAll(async () => {
  await store.destroy()
})

describe('save em partes: dividir e juntar', () => {
  it('juntar os pedaços devolve exatamente o jogo (mesma ordem de partidas, times e jogadores)', () => {
    const game = compactGame(base)
    const values = new Map<string, unknown>()
    for (const p of planParts(game)) values.set(p.name, JSON.parse(JSON.stringify(p.build())))
    expect(joinParts(values)).toEqual(JSON.parse(JSON.stringify(game)))
  })

  it('um dia a mais muda só alguns pedaços; o que não mudou tem as mesmas referências', () => {
    const a = planParts(compactGame(base))
    const b = planParts(compactGame(next))
    const before = new Map(a.map((p) => [p.name, p.refs]))
    const changed = b.filter((p) => !sameRefs(before.get(p.name), p.refs))
    expect(b.length).toBeGreaterThan(20)
    expect(changed.length).toBeGreaterThan(0)
    expect(changed.length).toBeLessThan(b.length)
    // As partidas de rodadas que não foram jogadas não entram.
    expect(changed.filter((p) => p.name.startsWith('m:')).length).toBeLessThanOrEqual(4)
  })

  it('pedaço ausente é erro', () => {
    expect(() => joinParts(new Map())).toThrow(/ausente/)
  })
})

describe('compressão', () => {
  it('comprime e descomprime sem perder nada (e o texto puro é o plano B de navegador sem a API)', async () => {
    const text = JSON.stringify({ a: 'olá, ção', n: Array.from({ length: 500 }, (_, i) => i) })
    const gz = await pack(text, true)
    expect(gz.enc).toBe('gzip')
    expect(gz.size).toBeLessThan(text.length)
    expect(await unpack(gz.enc, gz.data)).toBe(text)
    const plain = await pack(text, false)
    expect(plain.enc).toBe('json')
    expect(await unpack(plain.enc, plain.data)).toBe(text)
  })
})

describe('gravação em partes', () => {
  it('grava, carrega igual e a segunda gravação só escreve o que mudou', async () => {
    const first = await store.saveDetailed(1, base, new Date('2026-05-01T10:00:00Z'))
    expect(first.stats.full).toBe(true)
    expect(first.stats.written).toBe(first.stats.parts)
    expect(await store.loadSlot(1)).toEqual(JSON.parse(JSON.stringify(compactGame(base))))

    const second = await store.saveDetailed(1, nextCompact, new Date('2026-05-01T10:05:00Z'))
    expect(second.stats.full).toBe(false)
    expect(second.stats.written).toBeGreaterThan(0)
    expect(second.stats.written).toBeLessThanOrEqual(second.stats.parts)
    expect(second.stats.writtenBytes).toBeLessThanOrEqual(second.stats.totalBytes)
    expect(await store.storedBytes(1)).toBe(second.stats.totalBytes)
    // Gravar o mesmo jogo de novo não escreve nenhum pedaço.
    const again = await store.saveDetailed(1, nextCompact)
    expect(again.stats.written).toBe(0)
    expect(await store.loadSlot(1)).toEqual(JSON.parse(JSON.stringify(compactGame(next))))
    // Não sobra pedaço velho no banco: só os que o manifesto usa.
    const rows = await raw<{ slot: number }>('parts')
    expect(rows).toHaveLength(again.stats.parts)
  })

  it('o jogo carregado já serve de base: gravar logo depois escreve só o que mudou', async () => {
    await store.saveToSlot(1, base)
    store.close()
    const loaded = await store.loadSlot(1)
    const stats = (await store.saveDetailed(1, play(loaded, 1))).stats
    expect(stats.full).toBe(false)
    expect(stats.written).toBeLessThan(stats.parts)
  })

  it('o save em partes pesa bem menos que o JSON e o tempo da gravação é medido', async () => {
    const { stats } = await store.saveDetailed(2, next)
    expect(stats.totalBytes).toBeLessThan(stats.jsonBytes / 3)
    expect(stats.ms).toBeGreaterThan(0)
    expect(stats.planMs + stats.packMs + stats.writeMs).toBeLessThanOrEqual(stats.ms + 1)
  })
})

describe('gravação interrompida', () => {
  it('se a gravação falha no meio, o save anterior continua inteiro e abre igual', async () => {
    await store.saveToSlot(1, base, new Date('2026-05-01T10:00:00Z'))
    const before = await raw<{ id: string }>('parts')
    await expect(
      store.saveToSlot(1, next, new Date('2026-05-01T10:05:00Z'), {
        beforeCommit: () => {
          throw new Error('aparelho desligou')
        },
      }),
    ).rejects.toThrow('aparelho desligou')
    // Nada do que a gravação tentou entrou: os mesmos pedaços, o mesmo resumo, o mesmo jogo.
    expect((await raw<{ id: string }>('parts')).map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort())
    expect((await store.listSlots())[0]?.date).toBe(base.season.season.currentDate)
    expect(await store.loadSlot(1)).toEqual(JSON.parse(JSON.stringify(compactGame(base))))
    // A gravação seguinte funciona.
    await store.saveDetailed(1, next)
    expect(await store.loadSlot(1)).toEqual(JSON.parse(JSON.stringify(compactGame(next))))
  })

  it('a primeira gravação interrompida não deixa o espaço pela metade', async () => {
    await expect(store.saveToSlot(3, base, new Date(), { beforeCommit: () => Promise.reject(new Error('fechou')) })).rejects.toThrow('fechou')
    expect((await store.listSlots())[2]).toBeNull()
    expect(await raw('parts')).toHaveLength(0)
    await expect(store.loadSlot(3)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('pedaço que sumiu do disco vira erro de save corrompido, não um jogo quebrado', async () => {
    await store.saveToSlot(1, base)
    const d = new Dexie(store.name)
    await d.open()
    const first = (await d.table('parts').toArray())[0] as { id: string }
    await d.table('parts').delete(first.id)
    d.close()
    store.close()
    await expect(store.loadSlot(1)).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('saves antigos e arquivo de backup', () => {
  it('um save no formato antigo (um envelope por espaço, versão velha) abre pela migração e a primeira gravação o troca pelos pedaços', async () => {
    const old = JSON.parse(JSON.stringify(makeEnvelope(base, '2026-01-01T00:00:00Z')))
    for (const p of [...old.game.season.players, ...old.game.season.academy]) delete p.birthDate
    old.version = 9
    await store.putLegacy(2, old, { ...summarizeGame(compactGame(base), 2, old.savedAt), version: 9 })
    expect((await raw('games')).length).toBe(1)

    const loaded = await store.loadSlot(2)
    expect(loaded.season.players.every((p) => typeof p.birthDate === 'string')).toBe(true)
    expect((await store.listSlots())[1]?.version).toBe(9)

    const saved = await store.saveDetailed(2, loaded)
    expect(saved.stats.full).toBe(true)
    expect((await store.listSlots())[1]?.version).toBe(SAVE_VERSION)
    expect(await raw('games')).toHaveLength(0)
    expect(await store.loadSlot(2)).toEqual(JSON.parse(JSON.stringify(compactGame(loaded))))
  })

  it('save no formato antigo já na versão atual também abre', async () => {
    const env = JSON.parse(JSON.stringify(makeEnvelope(base, '2026-01-01T00:00:00Z')))
    await store.putLegacy(1, env, summarizeGame(compactGame(base), 1, env.savedAt))
    expect(await store.loadSlot(1)).toEqual(env.game)
    expect(await store.storedBytes(1)).toBeGreaterThan(1000)
  })
})

describe('exportar e importar o save em arquivo', () => {
  it('o arquivo sai como antes (JSON com o envelope) e entra em outro espaço igual ao original', async () => {
    await saveToSlot(1, next)
    const file = await exportSlot(1)
    const parsed = JSON.parse(file.json)
    expect(parsed.app).toBe('meu-manager')
    expect(parsed.version).toBe(SAVE_VERSION)
    expect(parsed.game).toEqual(JSON.parse(JSON.stringify(compactGame(next))))
    await importSave(file.json, 2)
    expect(await loadSlot(2)).toEqual(await loadSlot(1))
    await deleteSlot(1)
    await deleteSlot(2)
  })
})
