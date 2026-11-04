import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it } from 'vitest'
import { CloudClient } from '../src/online/cloudClient'
import { MemoryBlobStore } from '../src/online/cloudSave'
import { handleCloudRequest, type CloudApiDeps } from '../src/online/cloudSaveApi'
import { createIdentity, type Identity } from '../src/online/identity'
import { MemoryIdentityStore } from '../src/online/identityApi'
import { RateLimiter } from '../src/online/rateLimit'
import { MemoryNonceStore } from '../src/online/signedRequest'
import { CloudScheduler, CloudSync } from '../src/store/cloudSync'
import { CloudStateStore } from '../src/store/cloudState'
import { advanceToMatchday, createGame, playPendingAuto } from '../src/store/game'
import type { Game } from '../src/store/game'
import { compactGame, makeEnvelope, summarizeGame } from '../src/store/saveFormat'
import { SaveStore } from '../src/store/saves'
import Dexie from 'dexie'

const play = (game: Game, days: number): Game => {
  let g = game
  for (let i = 0; i < days; i++) g = playPendingAuto(advanceToMatchday(g))
  return g
}
const day8 = play(createGame(6, 'team-imp', { cups: false }), 8)
const day9 = play(day8, 1)

function fakeRandom(start: number): (n: number) => Uint8Array {
  let x = start >>> 0
  return (n) => {
    const out = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0
      out[i] = x >>> 24
    }
    return out
  }
}

const T0 = 1_800_000_000_000
let deviceCounter = 0

/** Um "servidor" na memória, com o mesmo código das rotas, e quantos pedidos de cada tipo ele recebeu. */
function makeServer() {
  const blobs = new MemoryBlobStore()
  const idStore = new MemoryIdentityStore()
  const clock = { now: T0 }
  blobs.clock = () => clock.now
  const deps: CloudApiDeps = {
    store: idStore,
    turnstile: { verify: async () => true },
    limiter: new RateLimiter(),
    nonces: new MemoryNonceStore(() => clock.now),
    now: () => clock.now,
    blobs,
    deleteIdentity: (id) => idStore.delete(id),
  }
  const log: string[] = []
  let down = false
  const fetchFn: typeof fetch = async (input, init) => {
    if (down) throw new TypeError('offline')
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const body = init?.body
    const headers = init?.headers as Record<string, string>
    log.push(`${method} ${url.pathname}`)
    const res = await handleCloudRequest(
      { method, path: url.pathname + url.search, body: body === undefined ? '' : typeof body === 'string' ? body : (body as Uint8Array), ip: '203.0.113.7', authorization: headers.Authorization ?? null },
      url,
      deps,
    )
    if (!res) return new Response('{}', { status: 404 })
    if ('bytes' in res) return new Response(res.bytes as BodyInit, { status: 200 })
    return Response.json(res.json, { status: res.status, headers: res.headers })
  }
  return { blobs, idStore, clock, fetchFn, log, setDown: (v: boolean) => void (down = v) }
}

type Server = ReturnType<typeof makeServer>

async function device(server: Server, identity: Identity, name: string) {
  await server.idStore.create({ playerId: identity.playerId, createdAt: T0, lastSeen: T0 }).catch(() => undefined)
  const local = new SaveStore(`meu-manager-teste-${name}`)
  const state = new CloudStateStore(`meu-manager-nuvem-teste-${name}`)
  const sync = new CloudSync({
    local,
    state,
    client: new CloudClient({ base: 'https://api.test', identity, fetchFn: server.fetchFn, now: () => server.clock.now, randomBytes: fakeRandom(1000 + 7919 * ++deviceCounter) }),
    now: () => server.clock.now,
    randomText: () => `dev-${name}-12345678`,
  })
  return { local, state, sync, async close() { await local.destroy(); state.close(); await Dexie.delete(`meu-manager-nuvem-teste-${name}`) } }
}

const identity = createIdentity(fakeRandom(42)).identity
const opened: { close(): Promise<void> }[] = []
afterAll(async () => {
  for (const d of opened) await d.close()
})

async function newDevice(server: Server, name: string, who = identity) {
  const d = await device(server, who, name)
  opened.push(d)
  return d
}

describe('nuvem: envio do aparelho (offline-first)', () => {
  it('liga o espaço, envia o save inteiro e na vez seguinte só o que mudou', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'a1')
    await a.local.saveToSlot(1, day8)
    await a.sync.enable(1)
    expect(await a.sync.sync(1)).toBe('synced')
    const firstBlobs = server.log.filter((l) => l.startsWith('PUT /api/saves/1/blob')).length
    expect(firstBlobs).toBeGreaterThan(5)

    expect(await a.sync.sync(1)).toBe('already')
    server.log.length = 0
    await a.local.saveToSlot(1, day9)
    expect(await a.sync.sync(1)).toBe('synced')
    const secondBlobs = server.log.filter((l) => l.startsWith('PUT /api/saves/1/blob')).length
    expect(secondBlobs).toBeGreaterThan(0)
    expect(secondBlobs).toBeLessThan(firstBlobs / 2)
    expect((await a.state.get(1)).remoteRev).toBe(2)
  })

  it('sem rede: o save local fica intacto, o espaço fica pendente e o envio acontece quando a rede volta', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'a2')
    await a.local.saveToSlot(1, day8)
    const before = await a.local.exportRaw(1)
    await a.sync.enable(1)
    server.setDown(true)
    expect(await a.sync.sync(1)).toBe('offline')
    expect((await a.state.get(1)).status).toBe('offline')
    expect(await a.local.exportRaw(1)).toEqual(before)
    expect(JSON.parse(JSON.stringify(await a.local.loadSlot(1)))).toEqual(JSON.parse(JSON.stringify(compactGame(day8))))
    server.setDown(false)
    expect(await a.sync.sync(1)).toBe('synced')
  })

  it('a fila sobrevive a fechar o jogo: um objeto novo com o mesmo banco continua de onde parou', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'a3')
    await a.local.saveToSlot(1, day8)
    await a.sync.enable(1)
    server.setDown(true)
    await a.sync.sync(1)
    // "Reabre o jogo": novos objetos sobre os mesmos bancos.
    const reopened = new CloudSync({
      local: a.local,
      state: new CloudStateStore('meu-manager-nuvem-teste-a3'),
      client: new CloudClient({ base: 'https://api.test', identity, fetchFn: server.fetchFn, now: () => server.clock.now, randomBytes: fakeRandom(500_000) }),
      now: () => server.clock.now,
      randomText: () => 'x',
    })
    server.setDown(false)
    expect(await reopened.syncAll()).toEqual({ 1: 'synced' })
  })

  it('cota estourada, limite e assinatura recusada deixam o save local intacto e dizem o motivo', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'a4')
    await a.local.saveToSlot(1, day8)
    await a.sync.enable(1)
    // Identidade que o servidor não conhece.
    const stranger = createIdentity(fakeRandom(77)).identity
    const s = new CloudSync({
      local: a.local,
      state: a.state,
      client: new CloudClient({ base: 'https://api.test', identity: stranger, fetchFn: server.fetchFn, now: () => server.clock.now, randomBytes: fakeRandom(600_000) }),
      now: () => server.clock.now,
      randomText: () => 'x',
    })
    expect(await s.sync(1)).toBe('auth')
    expect((await a.state.get(1)).lastError).toMatch(/registrado/)
    expect(await a.local.exportRaw(1)).not.toBeNull()
  })

  it('só envia espaços ligados à nuvem e nunca grava nada no espaço local', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'a5')
    await a.local.saveToSlot(1, day8)
    expect(await a.sync.sync(1)).toBe('disabled')
    expect(server.log).toEqual([])
    await a.sync.enable(1)
    await a.sync.sync(1)
    const slots = await a.local.listSlots()
    expect(slots[0]).not.toBeNull()
    expect(slots[1]).toBeNull()
  })
})

describe('nuvem: o mesmo save em dois aparelhos', () => {
  it('o segundo aparelho baixa o save (espaço vazio) e continua dali, sem passar por cima de ninguém', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'b1a')
    await a.local.saveToSlot(1, day8)
    await a.sync.enable(1)
    await a.sync.sync(1)

    const b = await newDevice(server, 'b1b')
    expect(await b.sync.pull(1)).toBe('pulled')
    const loaded = await b.local.loadSlot(1)
    expect(JSON.parse(JSON.stringify(loaded))).toEqual(JSON.parse(JSON.stringify(compactGame(day8))))
    // Agora o B joga mais um dia e envia: a revisão dele bate, então sobe.
    await b.local.saveToSlot(1, day9)
    expect(await b.sync.sync(1)).toBe('synced')
    expect((await b.state.get(1)).remoteRev).toBe(2)
  })

  it('os dois jogam a partir do mesmo ponto: o que enviar depois cai em conflito, nada é perdido, e a escolha resolve', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'b2a')
    const b = await newDevice(server, 'b2b')
    await a.local.saveToSlot(1, day8)
    await a.sync.enable(1)
    await a.sync.sync(1)
    await b.sync.pull(1)

    // A joga um dia e envia primeiro; B joga um dia diferente (outra semente) e tenta enviar.
    await a.local.saveToSlot(1, day9, new Date(T0 + 1000))
    expect(await a.sync.sync(1)).toBe('synced')
    const bGame = play(day8, 2)
    await b.local.saveToSlot(1, bGame, new Date(T0 + 2000))
    expect(await b.sync.sync(1)).toBe('conflict')
    const stateB = await b.state.get(1)
    expect(stateB.status).toBe('conflict')
    expect(stateB.conflict?.summary.teamName).toBeTruthy()
    expect(stateB.conflict?.rev).toBe(2)
    // O local do B segue exatamente como o B deixou, e nada mais é enviado enquanto há conflito.
    expect(JSON.parse(JSON.stringify(await b.local.loadSlot(1)))).toEqual(JSON.parse(JSON.stringify(compactGame(bGame))))
    server.log.length = 0
    expect(await b.sync.sync(1)).toBe('conflict')
    expect(server.log).toEqual([])

    // "Manter os dois": a versão da nuvem vai para um espaço livre do B e a do B sobe (o servidor guarda a anterior por 7 dias).
    expect(await b.sync.resolve(1, 'both')).toBe('synced')
    const slots = await b.local.listSlots()
    expect(slots[1]).not.toBeNull()
    expect(JSON.parse(JSON.stringify(await b.local.loadSlot(2)))).toEqual(JSON.parse(JSON.stringify(compactGame(day9))))
    expect(JSON.parse(JSON.stringify(await b.local.loadSlot(1)))).toEqual(JSON.parse(JSON.stringify(compactGame(bGame))))
    expect((await b.state.get(1)).status).toBe('synced')
  })

  it('"usar a nuvem" guarda antes o que havia no aparelho e dá para desfazer', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'b3a')
    const b = await newDevice(server, 'b3b')
    await a.local.saveToSlot(1, day9)
    await a.sync.enable(1)
    await a.sync.sync(1)
    await b.local.saveToSlot(1, day8)
    await b.sync.enable(1)
    // O B já tinha um save próprio naquele espaço: ao ligar, a nuvem diz que há outro.
    expect(await b.sync.sync(1)).toBe('conflict')

    expect(await b.sync.resolve(1, 'cloud')).toBe('pulled')
    expect(JSON.parse(JSON.stringify(await b.local.loadSlot(1)))).toEqual(JSON.parse(JSON.stringify(compactGame(day9))))
    expect(await b.sync.restoreLocalBackup(1)).toBe(true)
    expect(JSON.parse(JSON.stringify(await b.local.loadSlot(1)))).toEqual(JSON.parse(JSON.stringify(compactGame(day8))))
  })

  it('"usar este" sobrescreve a nuvem e o outro aparelho vê a mudança como conflito', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'b4a')
    const b = await newDevice(server, 'b4b')
    await a.local.saveToSlot(1, day8)
    await a.sync.enable(1)
    await a.sync.sync(1)
    await b.local.saveToSlot(1, day9)
    await b.sync.enable(1)
    expect(await b.sync.sync(1)).toBe('conflict')
    expect(await b.sync.resolve(1, 'local')).toBe('synced')
    // O A ainda acha que está na rev 1 e joga mais: conflito, não sobrescreve.
    await a.local.saveToSlot(1, play(day8, 3), new Date(T0 + 5000))
    expect(await a.sync.sync(1)).toBe('conflict')
  })

  it('baixa com pedaço adulterado: recusa e o local fica como estava', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'b5a')
    const b = await newDevice(server, 'b5b')
    await a.local.saveToSlot(1, day8)
    await a.sync.enable(1)
    await a.sync.sync(1)
    await b.local.saveToSlot(1, day9)
    const before = await b.local.exportRaw(1)
    // Corrompe um pedaço no servidor.
    const key = server.blobs.keys().find((k) => k.includes('/1/b/'))!
    await server.blobs.put(key, new TextEncoder().encode('adulterado'))
    await expect(b.sync.pull(1)).rejects.toThrow()
    expect(await b.local.exportRaw(1)).toEqual(before)
  })

  it('save da nuvem de versão mais nova que a do jogo não é aberto', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'b6a')
    const b = await newDevice(server, 'b6b')
    await a.local.saveToSlot(1, day8)
    await a.sync.enable(1)
    await a.sync.sync(1)
    const key = server.blobs.keys().find((k) => k.endsWith('/1/m.json'))!
    const m = JSON.parse(new TextDecoder().decode((await server.blobs.get(key))!.bytes))
    m.version = 9999
    await server.blobs.put(key, new TextEncoder().encode(JSON.stringify(m)))
    await b.local.saveToSlot(1, day9)
    const before = await b.local.exportRaw(1)
    await expect(b.sync.pull(1)).rejects.toThrow(/mais nova/)
    expect(await b.local.exportRaw(1)).toEqual(before)
  })
})

describe('nuvem: migração dos saves que já existem no navegador', () => {
  it('save no formato antigo é enviado sem ser alterado nem apagado, e abre igual depois', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'm1')
    const savedAt = new Date(T0).toISOString()
    const compact = compactGame(day8)
    await a.local.putLegacy(2, makeEnvelope(compact, savedAt), summarizeGame(compact, 2, savedAt))
    const legacyBefore = await a.local.loadEnvelope(2)
    await a.sync.enable(2)
    expect(await a.sync.sync(2)).toBe('synced')
    // O formato antigo continua lá, igual.
    expect(await a.local.loadEnvelope(2)).toEqual(legacyBefore)
    // E o que subiu abre em outro aparelho com o mesmo jogo.
    const b = await newDevice(server, 'm2')
    await b.sync.pull(2)
    expect(JSON.parse(JSON.stringify(await b.local.loadSlot(2)))).toEqual(JSON.parse(JSON.stringify(compact)))
  })

  it('ligar a nuvem não mexe em nenhum dos três espaços locais', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'm3')
    await a.local.saveToSlot(1, day8)
    await a.local.saveToSlot(3, day9)
    const before = [await a.local.exportRaw(1), await a.local.exportRaw(3)]
    await a.sync.enable(1)
    await a.sync.syncAll()
    expect([await a.local.exportRaw(1), await a.local.exportRaw(3)]).toEqual(before)
    expect((await a.state.get(3)).enabled).toBe(false)
  })
})

describe('nuvem: apagar e exportar', () => {
  it('"Apagar minha conta" limpa o servidor e o estado da nuvem, mas os saves locais ficam', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'd1')
    await a.local.saveToSlot(1, day8)
    await a.sync.enable(1)
    await a.sync.sync(1)
    const exported = (await a.sync.exportAccount()) as { saves: unknown[]; playerId: string }
    expect(exported.playerId).toBe(identity.playerId)
    expect(exported.saves).toHaveLength(1)
    await a.sync.deleteAccount()
    expect(server.blobs.keys()).toEqual([])
    expect((await a.state.get(1)).enabled).toBe(false)
    expect(await a.local.exportRaw(1)).not.toBeNull()
  })
})

describe('nuvem: agendamento', () => {
  it('envia já na primeira vez, espera 2 minutos entre envios e espaça as tentativas depois de falhar', async () => {
    const server = makeServer()
    const a = await newDevice(server, 'e1')
    await a.local.saveToSlot(1, day8)
    await a.sync.enable(1)
    const timers: { fn: () => void; ms: number }[] = []
    const now = { t: T0 }
    const sched = new CloudScheduler(a.sync, a.state, () => now.t, 120_000, (fn, ms) => (timers.push({ fn, ms }), timers.length as unknown as ReturnType<typeof setTimeout>), () => undefined)
    await sched.onSaved(1)
    expect(timers[0]!.ms).toBe(0)
    await sched.flush(1)
    expect((await a.state.get(1)).status).toBe('synced')
    // Gravou de novo logo depois: espera o resto dos 2 minutos.
    now.t += 30_000
    await a.local.saveToSlot(1, day9)
    await sched.onSaved(1)
    expect(timers[1]!.ms).toBe(90_000)
    // A rede cai: o envio falha e a nova tentativa vem em 30 s, depois 2 min.
    server.setDown(true)
    now.t += 120_000
    await sched.flush(1)
    expect(timers[2]!.ms).toBe(30_000)
    now.t += 30_000
    await sched.flush(1)
    expect(timers[3]!.ms).toBe(120_000)
    expect((await a.state.get(1)).status).toBe('offline')
  })
})
