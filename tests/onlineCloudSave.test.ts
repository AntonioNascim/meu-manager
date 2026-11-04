import { describe, expect, it } from 'vitest'
import { createIdentity, type Identity } from '../src/online/identity'
import { MemoryIdentityStore } from '../src/online/identityApi'
import { RateLimiter } from '../src/online/rateLimit'
import { MemoryNonceStore, signRequest } from '../src/online/signedRequest'
import { handleCloudRequest, type CloudApiDeps, type CloudResponse } from '../src/online/cloudSaveApi'
import {
  BACKUP_KEEP_MS,
  MemoryBlobStore,
  ORPHAN_GRACE_MS,
  QUOTA_BYTES_PER_SLOT,
  RETENTION_MS,
  commitManifest,
  deleteAccountData,
  getBlob,
  hashHex,
  listSaves,
  missingBlobs,
  parseCommit,
  putBlob,
  type CloudDeps,
} from '../src/online/cloudSave'

const enc = new TextEncoder()
const T0 = 1_800_000_000_000
const ME = 'A'.repeat(43)
const OTHER = 'B'.repeat(43)

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

function world() {
  let now = T0
  const blobs = new MemoryBlobStore()
  blobs.clock = () => now
  const deps: CloudDeps = { blobs, now: () => now }
  return { blobs, deps, advance: (ms: number) => (now += ms) }
}

const summary = { teamName: 'Time', abbreviation: 'TIM', colors: ['#fff', '#000'], tier: 1, year: 2026, date: '2026-03-01', seasonsPlayed: 0 }
const part = (text: string) => {
  const bytes = enc.encode(text)
  return { bytes, hash: hashHex(bytes), size: bytes.length, enc: 'json' as const }
}
async function upload(deps: CloudDeps, who: string, slot: number, parts: Record<string, ReturnType<typeof part>>) {
  for (const p of Object.values(parts)) expect((await putBlob(deps, who, slot, p.hash, p.bytes)).ok).toBe(true)
}
const manifestBody = (parts: Record<string, ReturnType<typeof part>>, over: Record<string, unknown> = {}, expectedRev = 0, force?: boolean) =>
  JSON.stringify({
    expectedRev,
    force,
    manifest: {
      savedAt: new Date(T0).toISOString(),
      version: 11,
      deviceId: 'device-aaaa1111',
      summary,
      parts: Object.fromEntries(Object.entries(parts).map(([n, p]) => [n, { hash: p.hash, size: p.size, enc: p.enc }])),
      ...over,
    },
  })

describe('saves na nuvem: pedaços e manifesto', () => {
  it('envia só o que falta, grava o manifesto e devolve o mesmo conteúdo', async () => {
    const { deps } = world()
    const parts = { core: part('{"a":1}'), 'm:br-1:0': part('{"m":[1,2,3]}') }
    expect((await missingBlobs(deps, ME, 1, Object.values(parts).map((p) => p.hash)))).toEqual({ ok: true, value: Object.values(parts).map((p) => p.hash) })
    await upload(deps, ME, 1, parts)
    expect(await missingBlobs(deps, ME, 1, Object.values(parts).map((p) => p.hash))).toEqual({ ok: true, value: [] })
    const res = await commitManifest(deps, ME, 1, manifestBody(parts))
    expect(res).toEqual({ ok: true, value: { rev: 1, updatedAt: T0 } })
    const blob = await getBlob(deps, ME, 1, parts.core.hash)
    expect(blob.ok && new TextDecoder().decode(blob.value)).toBe('{"a":1}')
  })

  it('o segundo envio manda só o pedaço que mudou', async () => {
    const { deps } = world()
    const a = { core: part('{"a":1}'), cal: part('{"c":1}') }
    await upload(deps, ME, 1, a)
    await commitManifest(deps, ME, 1, manifestBody(a))
    const b = { core: part('{"a":2}'), cal: a.cal }
    const missing = await missingBlobs(deps, ME, 1, Object.values(b).map((p) => p.hash))
    expect(missing).toEqual({ ok: true, value: [b.core.hash] })
  })

  it('o servidor confere o hash: conteúdo com o nome de outro é recusado', async () => {
    const { deps } = world()
    const good = part('{"a":1}')
    const res = await putBlob(deps, ME, 1, good.hash, enc.encode('{"a":2}'))
    expect(res).toMatchObject({ ok: false, status: 400, body: { error: 'hash-mismatch' } })
  })

  it('recusa pedaço grande demais, hash malformado e espaço inválido', async () => {
    const { deps } = world()
    const big = new Uint8Array(2 * 1024 * 1024 + 1)
    expect(await putBlob(deps, ME, 1, hashHex(big), big)).toMatchObject({ ok: false, status: 413 })
    expect(await putBlob(deps, ME, 1, 'xyz', enc.encode('a'))).toMatchObject({ ok: false, status: 400 })
    expect(await putBlob(deps, ME, 4, part('a').hash, enc.encode('a'))).toMatchObject({ ok: false, status: 400 })
    expect(await putBlob(deps, ME, 0, part('a').hash, enc.encode('a'))).toMatchObject({ ok: false, status: 400 })
  })

  it('manifesto que cita pedaço que não foi enviado: 422 com a lista, nada é gravado', async () => {
    const { deps, blobs } = world()
    const parts = { core: part('{"a":1}'), cal: part('{"c":1}') }
    await upload(deps, ME, 1, { core: parts.core })
    const res = await commitManifest(deps, ME, 1, manifestBody(parts))
    expect(res).toMatchObject({ ok: false, status: 422, body: { error: 'missing', hashes: [parts.cal.hash] } })
    expect(blobs.keys().some((k) => k.endsWith('/m.json'))).toBe(false)
  })

  it('o tamanho que vale é o do servidor, não o que o aparelho diz', async () => {
    const { deps } = world()
    const parts = { core: part('{"a":1}') }
    await upload(deps, ME, 1, parts)
    const lie = JSON.parse(manifestBody(parts)) as { manifest: { parts: Record<string, { size: number }> } }
    lie.manifest.parts.core!.size = 5
    expect(await commitManifest(deps, ME, 1, JSON.stringify(lie))).toMatchObject({ ok: false, status: 400 })
  })

  it('cota por espaço: acima de 5 MB comprimidos, recusa', async () => {
    const { deps } = world()
    const parts: Record<string, ReturnType<typeof part>> = {}
    for (let i = 0; i < 3; i++) parts[`p${i}`] = part(`${i}`.repeat(1_900_000))
    await upload(deps, ME, 1, parts)
    const res = await commitManifest(deps, ME, 1, manifestBody(parts))
    expect(res).toMatchObject({ ok: false, status: 413, body: { error: 'quota', limit: QUOTA_BYTES_PER_SLOT } })
  })

  it('um jogador não enxerga nem mexe nos saves de outro', async () => {
    const { deps } = world()
    const parts = { core: part('{"a":1}') }
    await upload(deps, ME, 1, parts)
    await commitManifest(deps, ME, 1, manifestBody(parts))
    expect(await getBlob(deps, OTHER, 1, parts.core.hash)).toMatchObject({ ok: false, status: 404 })
    expect((await listSaves(deps, OTHER)).every((s) => s.manifest === null)).toBe(true)
    // O mesmo conteúdo enviado pelo outro não conta como "já existe" para ele.
    expect(await missingBlobs(deps, OTHER, 1, [parts.core.hash])).toEqual({ ok: true, value: [parts.core.hash] })
  })

  it('rejeita manifesto com campos fora da lista e partes demais', () => {
    expect(parseCommit('{"expectedRev":0,"manifest":{},"extra":1}').ok).toBe(false)
    expect(parseCommit('{"expectedRev":-1,"manifest":{}}').ok).toBe(false)
    expect(parseCommit('nao e json').ok).toBe(false)
    expect(parseCommit('x'.repeat(70_000)).ok).toBe(false)
  })
})

describe('saves na nuvem: dois aparelhos (nunca sobrescreve às cegas)', () => {
  it('rev desatualizada: 409 com o manifesto atual (resumo do outro aparelho)', async () => {
    const { deps } = world()
    const v1 = { core: part('{"v":1}') }
    const v2 = { core: part('{"v":2}') }
    const v3 = { core: part('{"v":3}') }
    await upload(deps, ME, 1, { ...v1, ...{ x: v2.core }, y: v3.core })
    expect((await commitManifest(deps, ME, 1, manifestBody(v1, { deviceId: 'device-aaaa1111' }))).ok).toBe(true)
    // O aparelho B (que ainda acha que não há save) tenta gravar com rev 0.
    const stale = await commitManifest(deps, ME, 1, manifestBody(v2, { deviceId: 'device-bbbb2222' }, 0))
    expect(stale).toMatchObject({ ok: false, status: 409, body: { error: 'conflict', current: { rev: 1, deviceId: 'device-aaaa1111' } } })
    // Nada mudou na nuvem.
    const listing = await listSaves(deps, ME)
    expect(listing[0]!.manifest?.rev).toBe(1)
    expect(listing[0]!.manifest?.parts.core?.hash).toBe(v1.core.hash)
  })

  it('duas gravações ao mesmo tempo: só uma vence (o etag impede a segunda)', async () => {
    const { deps, blobs } = world()
    const base = { core: part('{"v":0}') }
    const a = { core: part('{"v":"a"}') }
    const b = { core: part('{"v":"b"}') }
    await upload(deps, ME, 1, { ...base, a: a.core, b: b.core })
    await commitManifest(deps, ME, 1, manifestBody(base))
    // Entre a leitura e a gravação do aparelho A, o aparelho B grava.
    let done = false
    blobs.beforeConditionalPut = (key) => {
      if (done || !key.endsWith('/m.json')) return
      done = true
      // simula a gravação do outro aparelho "no meio": troca o objeto direto
      void blobs.put(key, enc.encode(JSON.stringify({ rev: 2, updatedAt: T0, ...JSON.parse(manifestBody(b)).manifest })))
    }
    const res = await commitManifest(deps, ME, 1, manifestBody(a, {}, 1))
    expect(res).toMatchObject({ ok: false, status: 409, body: { error: 'conflict', current: { rev: 2 } } })
    expect((await listSaves(deps, ME))[0]!.manifest?.parts.core?.hash).toBe(b.core.hash)
  })

  it('"usar este": força, guarda o anterior como cópia por 7 dias e mantém os pedaços dele', async () => {
    const { deps, advance } = world()
    const theirs = { core: part('{"v":"outro"}') }
    const mine = { core: part('{"v":"meu"}') }
    await upload(deps, ME, 1, { ...theirs, m: mine.core })
    await commitManifest(deps, ME, 1, manifestBody(theirs))
    const forced = await commitManifest(deps, ME, 1, manifestBody(mine, {}, 0, true))
    expect(forced).toMatchObject({ ok: true, value: { rev: 2 } })
    advance(ORPHAN_GRACE_MS + 1000)
    // Outra gravação qualquer não apaga os pedaços da cópia enquanto ela vale.
    await commitManifest(deps, ME, 1, manifestBody(mine, {}, 2))
    const listing = await listSaves(deps, ME)
    expect(listing[0]!.backup?.manifest.parts.core?.hash).toBe(theirs.core.hash)
    expect((await getBlob(deps, ME, 1, theirs.core.hash)).ok).toBe(true)
    // Depois de 7 dias a cópia e os pedaços saem.
    advance(BACKUP_KEEP_MS + 1000)
    await commitManifest(deps, ME, 1, manifestBody(mine, {}, 3))
    expect((await listSaves(deps, ME))[0]!.backup).toBeNull()
    expect((await getBlob(deps, ME, 1, theirs.core.hash)).ok).toBe(false)
  })

  it('pedaços órfãos só saem depois da carência (outro aparelho pode estar enviando)', async () => {
    const { deps, advance } = world()
    const parts = { core: part('{"v":1}') }
    const sending = part('{"v":"enviando"}')
    await upload(deps, ME, 1, { ...parts, s: sending })
    await commitManifest(deps, ME, 1, manifestBody(parts))
    expect((await getBlob(deps, ME, 1, sending.hash)).ok).toBe(true)
    advance(ORPHAN_GRACE_MS + 1000)
    await commitManifest(deps, ME, 1, manifestBody(parts, {}, 1))
    expect((await getBlob(deps, ME, 1, sending.hash)).ok).toBe(false)
  })
})

describe('saves na nuvem: pelas rotas, com assinatura', () => {
  function api() {
    const w = world()
    const idStore = new MemoryIdentityStore()
    const deps: CloudApiDeps = {
      store: idStore,
      turnstile: { verify: async () => true },
      limiter: new RateLimiter(),
      nonces: new MemoryNonceStore(() => T0),
      now: () => T0,
      blobs: w.blobs,
      deleteIdentity: (id) => idStore.delete(id),
    }
    let seed = 1000
    const call = async (who: Identity | null, method: string, path: string, body: string | Uint8Array = '', ip = '203.0.113.9'): Promise<CloudResponse | undefined> => {
      const parts = { method, path, body }
      const authorization = who ? signRequest(who, parts, T0, fakeRandom(seed++)) : null
      return handleCloudRequest({ ...parts, ip, authorization }, new URL(`https://x${path}`), deps)
    }
    return { deps, idStore, call, blobs: w.blobs }
  }

  it('sem assinatura: 401; com assinatura de quem não tem cadastro: 404', async () => {
    const { call } = api()
    expect((await call(null, 'GET', '/api/saves'))?.status).toBe(401)
    const stranger = createIdentity(fakeRandom(5)).identity
    expect((await call(stranger, 'GET', '/api/saves'))?.status).toBe(404)
  })

  it('caminho que não é de saves não é tratado aqui', async () => {
    const { call } = api()
    expect(await call(null, 'GET', '/api/me')).toBeUndefined()
    expect(await call(null, 'GET', '/api/saves/9')).toBeUndefined()
  })

  it('fluxo completo: enviar, gravar, listar, baixar, exportar e apagar a conta', async () => {
    const { call, idStore, blobs } = api()
    const me = createIdentity(fakeRandom(7)).identity
    await idStore.create({ playerId: me.playerId, createdAt: T0 - 1000, lastSeen: T0, nickname: 'Pedro' })
    const parts = { core: part('{"a":1}'), cal: part('{"c":2}') }

    const missing = await call(me, 'POST', '/api/saves/1/missing', JSON.stringify({ hashes: Object.values(parts).map((p) => p.hash) }))
    expect(missing).toMatchObject({ status: 200, json: { missing: Object.values(parts).map((p) => p.hash) } })
    for (const p of Object.values(parts)) expect((await call(me, 'PUT', `/api/saves/1/blob/${p.hash}`, p.bytes))?.status).toBe(200)
    expect((await call(me, 'PUT', '/api/saves/1/manifest', manifestBody(parts)))?.status).toBe(200)

    const listing = (await call(me, 'GET', '/api/saves')) as { status: number; json: { saves: { slot: number; manifest: { rev: number } | null }[]; expiresAt: number } }
    expect(listing.json.saves.map((s) => s.manifest?.rev ?? null)).toEqual([1, null, null])
    expect(listing.json.expiresAt).toBe(T0 + RETENTION_MS)

    const blob = await call(me, 'GET', `/api/saves/1/blob/${parts.core.hash}`)
    expect(blob && 'bytes' in blob && new TextDecoder().decode(blob.bytes)).toBe('{"a":1}')

    const exported = (await call(me, 'GET', '/api/account/export')) as { json: { playerId: string; nickname: string; saves: { slot: number; usedBytes: number }[] } }
    expect(exported.json.playerId).toBe(me.playerId)
    expect(exported.json.saves).toEqual([expect.objectContaining({ slot: 1, usedBytes: parts.core.size + parts.cal.size })])

    expect((await call(me, 'DELETE', '/api/saves/1'))?.status).toBe(200)
    expect((await call(me, 'GET', '/api/saves/1')) as { json: { manifest: unknown } }).toMatchObject({ json: { manifest: null } })

    await call(me, 'PUT', `/api/saves/2/blob/${parts.core.hash}`, parts.core.bytes)
    expect((await call(me, 'DELETE', '/api/account'))?.status).toBe(200)
    expect(blobs.keys().filter((k) => k.startsWith(`u/${me.playerId}/`))).toEqual([])
    expect(await idStore.get(me.playerId)).toBeUndefined()
    // Depois de apagada, a mesma assinatura não abre mais nada.
    expect((await call(me, 'GET', '/api/saves'))?.status).toBe(404)
  })

  it('o caminho de outro jogador não existe: o dono é sempre quem assinou', async () => {
    const { call, idStore, deps } = api()
    const me = createIdentity(fakeRandom(8)).identity
    const them = createIdentity(fakeRandom(9)).identity
    for (const i of [me, them]) await idStore.create({ playerId: i.playerId, createdAt: T0, lastSeen: T0 })
    const p = part('{"secreto":1}')
    await call(them, 'PUT', `/api/saves/1/blob/${p.hash}`, p.bytes)
    expect((await call(me, 'GET', `/api/saves/1/blob/${p.hash}`))?.status).toBe(404)
    expect(await deleteAccountData(deps, 'nao-existe')).toBe(0)
  })

it('gente diferente no mesmo IP (rede de operadora) não bate no teto de 6 gravações por minuto, mas cada identidade tem o seu teto', async () => {
    const { call, idStore } = api()
    let who = 100
    // 12 jogadores diferentes, mesmo IP, uma gravação de manifesto cada: nenhum é barrado por limite.
    for (let i = 0; i < 12; i++) {
      const id = createIdentity(fakeRandom(who++)).identity
      await idStore.create({ playerId: id.playerId, createdAt: T0, lastSeen: T0 })
      const res = await call(id, 'PUT', '/api/saves/1/manifest', '{}', '198.51.100.77')
      expect(res?.status).toBe(400)
    }
    // O mesmo jogador, em 7 gravações no mesmo minuto, é barrado (6 por minuto por identidade).
    const heavy = createIdentity(fakeRandom(999)).identity
    await idStore.create({ playerId: heavy.playerId, createdAt: T0, lastSeen: T0 })
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await call(heavy, 'PUT', '/api/saves/1/manifest', '{}', `198.51.100.${i}`))!.status)
    expect(statuses).toEqual([400, 400, 400, 400, 400, 400, 429])
  })

  it('limita os envios de pedaço por identidade', async () => {
    const { call, idStore } = api()
    const me = createIdentity(fakeRandom(11)).identity
    await idStore.create({ playerId: me.playerId, createdAt: T0, lastSeen: T0 })
    let last: CloudResponse | undefined
    for (let i = 0; i < 301; i++) {
      const p = part(`x${i}`)
      // IPs diferentes: o limite testado aqui é o da identidade.
      last = await call(me, 'PUT', `/api/saves/1/blob/${p.hash}`, p.bytes, `198.51.100.${i % 250}`)
      if (last?.status === 429) break
    }
    expect(last?.status).toBe(429)
  })
})
