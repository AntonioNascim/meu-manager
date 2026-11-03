import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { compareVersions, hashOf, INDEX_FORMAT, latestOf, newestAvailable, parseIndex, pathOf, updateAvailable, verifyDownload, type PackageIndex } from '../src/data/package/delivery'
import { PackageCache } from '../src/store/packageCache'
import { CHECK_EVERY_MS, PackageSource, type Memory } from '../src/store/packageSource'
import { buildRelease } from '../tools/realdata/release'

const pkgText = (name: string, extra = '') => JSON.stringify({ format: 'meu-manager-package', version: 1, name, extra })
const NOW = 1_800_000_000_000

function listingOf(version: string, text = pkgText(`Mundo ${version}`)) {
  return buildRelease({ jsonText: text, id: 'mundo-real', version, publishedAt: '2027-01-15' })
}

describe('índice e versões', () => {
  it('compara AAAA.MM com ou sem o terceiro número', () => {
    expect(compareVersions('2026.11', '2027.01')).toBeLessThan(0)
    expect(compareVersions('2027.01', '2026.12')).toBeGreaterThan(0)
    expect(compareVersions('2027.01', '2027.01.0')).toBe(0)
    expect(compareVersions('2027.01.2', '2027.01.10')).toBeLessThan(0)
  })

  it('aceita um índice bom e acha a versão mais nova', () => {
    const a = listingOf('2026.11').listing
    const b = listingOf('2027.01').listing
    const parsed = parseIndex({ format: INDEX_FORMAT, version: 1, packages: [a, b] })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(latestOf(parsed.index, 'mundo-real')?.version).toBe('2027.01')
  })

  it('recusa índice ruim em vez de usar: formato, versão, lista vazia, campos, caminho fora da pasta, duplicata, tamanhos absurdos', () => {
    const good = listingOf('2026.11').listing
    const idx = (p: unknown[]) => ({ format: INDEX_FORMAT, version: 1, packages: p })
    for (const raw of [null, [], 'x', { format: 'outro', version: 1, packages: [good] }, { format: INDEX_FORMAT, version: 2, packages: [good] }, idx([]), idx([{ ...good, version: '2026.13' }]), idx([{ ...good, sha256: 'abc' }]), idx([{ ...good, path: '../x/pacote.json.gz' }]), idx([{ ...good, path: 'mundo-real/2026.12/pacote.json.gz' }]), idx([{ ...good, id: 'Ruim Id' }]), idx([{ ...good, gzipBytes: 0 }]), idx([{ ...good, gzipBytes: 10 ** 12 }]), idx([{ ...good, publishedAt: 'ontem' }]), idx([good, good]), idx(['texto'])]) {
      expect(parseIndex(raw).ok).toBe(false)
    }
  })

  it('o aviso só aparece com versão mais nova que a do aparelho e some depois de dispensar', () => {
    const index: PackageIndex = { format: INDEX_FORMAT, version: 1, packages: [listingOf('2026.11').listing, listingOf('2027.01').listing] }
    expect(updateAvailable(index, 'mundo-real', ['2026.11'])?.version).toBe('2027.01')
    expect(updateAvailable(index, 'mundo-real', ['2026.11', '2027.01'])).toBeUndefined()
    expect(updateAvailable(index, 'mundo-real', ['2026.11'], '2027.01')).toBeUndefined()
    expect(updateAvailable(index, 'outro', ['2026.11'])).toBeUndefined()
  })

  it('newestAvailable escolhe a mais nova', () => {
    expect(newestAvailable([{ version: '2026.11' }, { version: '2027.01' }, { version: '2026.12' }])?.version).toBe('2027.01')
    expect(newestAvailable([])).toBeUndefined()
  })
})

describe('conferência do arquivo baixado', () => {
  const r = listingOf('2026.11')
  it('aceita o arquivo certo; recusa tamanho ou conteúdo trocado', () => {
    expect(verifyDownload(r.gz, r.listing)).toEqual({ ok: true })
    expect(verifyDownload(r.gz.slice(1), r.listing)).toEqual({ ok: false, error: 'size' })
    const flipped = r.gz.slice()
    flipped[flipped.length - 10] = flipped[flipped.length - 10]! ^ 1
    expect(verifyDownload(flipped, r.listing)).toEqual({ ok: false, error: 'hash' })
  })
})

describe('gerador de versão (ferramenta de publicação)', () => {
  it('o mesmo conteúdo gera sempre os mesmos bytes e o mesmo hash', () => {
    expect(listingOf('2026.11').listing.sha256).toBe(listingOf('2026.11').listing.sha256)
    expect(hashOf(listingOf('2026.11').gz)).toBe(listingOf('2026.11').listing.sha256)
  })
  it('junta a versão nova às antigas e usa o caminho certo', () => {
    const first = listingOf('2026.11')
    const second = buildRelease({ jsonText: pkgText('Mundo novo'), id: 'mundo-real', version: '2027.01', publishedAt: '2027-01-15', notes: 'Janela de janeiro', existing: first.index })
    expect(second.index.packages.map((p) => p.version)).toEqual(['2026.11', '2027.01'])
    expect(second.listing.path).toBe(pathOf('mundo-real', '2027.01'))
    expect(second.listing.notes).toBe('Janela de janeiro')
  })
  it('republicar a mesma versão com o mesmo conteúdo não duplica; com outro conteúdo é recusado', () => {
    const first = listingOf('2026.11')
    const same = buildRelease({ jsonText: pkgText('Mundo 2026.11'), id: 'mundo-real', version: '2026.11', publishedAt: '2026-11-02', existing: first.index })
    expect(same.alreadyPublished).toBe(true)
    expect(same.index.packages).toHaveLength(1)
    expect(() => buildRelease({ jsonText: pkgText('Mundo 2026.11', 'mudou'), id: 'mundo-real', version: '2026.11', publishedAt: '2026-11-02', existing: first.index })).toThrow(/nunca muda/)
  })
  it('recusa versão mal escrita, arquivo que não é pacote e índice antigo quebrado', () => {
    expect(() => buildRelease({ jsonText: pkgText('x'), id: 'mundo-real', version: '26.11', publishedAt: '2026-11-02' })).toThrow(/Versão inválida/)
    expect(() => buildRelease({ jsonText: '{"a":1}', id: 'mundo-real', version: '2026.11', publishedAt: '2026-11-02' })).toThrow(/não é um pacote/)
    expect(() => buildRelease({ jsonText: 'nada', id: 'mundo-real', version: '2026.11', publishedAt: '2026-11-02' })).toThrow(/JSON/)
    expect(() => buildRelease({ jsonText: pkgText('x'), id: 'mundo-real', version: '2026.11', publishedAt: '2026-11-02', existing: { lixo: 1 } })).toThrow(/índice/)
  })
})

/** Servidor de mentira: serve o índice e os arquivos que o teste cadastra. */
function fakeServer() {
  const files = new Map<string, { body: Uint8Array | string; status?: number; headers?: Record<string, string> }>()
  const calls: string[] = []
  const fetchFn = (async (url: string) => {
    calls.push(url)
    const f = files.get(new URL(url).pathname)
    if (!f) return { ok: false, status: 404, headers: new Headers(), json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) }
    const body = typeof f.body === 'string' ? new TextEncoder().encode(f.body) : f.body
    return {
      ok: (f.status ?? 200) < 400,
      status: f.status ?? 200,
      headers: new Headers(f.headers ?? {}),
      json: async () => JSON.parse(new TextDecoder().decode(body)),
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    }
  }) as unknown as typeof fetch
  return { files, calls, fetchFn }
}

function memory(): Memory & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return { store, get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v) }
}

const DB = 'meu-manager-teste-pacotes'
const cache = new PackageCache(DB)
afterAll(() => cache.close())

function setup(clock = { t: NOW }) {
  const server = fakeServer()
  const mem = memory()
  const source = new PackageSource({
    cache,
    fetchFn: server.fetchFn,
    apiBase: 'https://api.teste',
    id: 'mundo-real',
    embedded: { version: '2026.11', name: 'Mundo embutido', gameId: 'embutido:mundo-real', load: async () => JSON.parse(pkgText('Embutido')) },
    memory: mem,
    now: () => clock.t,
    timeoutSignal: () => undefined,
  })
  const publish = (...versions: string[]) => {
    let index: PackageIndex | undefined
    for (const v of versions) {
      const r = buildRelease({ jsonText: pkgText(`Mundo ${v}`), id: 'mundo-real', version: v, publishedAt: '2027-01-15', existing: index })
      index = r.index
      server.files.set(`/packages/${r.listing.path}`, { body: r.gz })
    }
    server.files.set('/packages/index.json', { body: JSON.stringify(index) })
    return index!
  }
  return { server, mem, source, publish, clock }
}

beforeEach(async () => {
  await cache.clear()
})

describe('PackageSource', () => {
  it('sem nada baixado, só existe a cópia embutida e ela abre', async () => {
    const { source } = setup()
    expect((await source.available()).map((p) => [p.version, p.origin])).toEqual([['2026.11', 'embedded']])
    const loaded = await source.load()
    expect(loaded).toMatchObject({ version: '2026.11', origin: 'embedded', gameId: 'embutido:mundo-real' })
    expect(loaded.pkg.name).toBe('Embutido')
  })

  it('avisa de versão nova, consulta no máximo a cada 6 horas e respeita o "agora não"', async () => {
    const { source, publish, server, clock } = setup()
    publish('2026.11', '2027.01')
    expect((await source.checkForUpdate())?.version).toBe('2027.01')
    expect(server.calls).toHaveLength(1)
    clock.t += CHECK_EVERY_MS - 1000
    expect((await source.checkForUpdate())?.version).toBe('2027.01')
    expect(server.calls).toHaveLength(1)
    source.dismiss('2027.01')
    clock.t += 2000
    expect(await source.checkForUpdate()).toBeUndefined()
    expect(server.calls).toHaveLength(2)
  })

  it('índice ausente, quebrado ou sem rede: nenhum aviso e nenhum erro', async () => {
    const { source, server } = setup()
    expect(await source.checkForUpdate(true)).toBeUndefined()
    server.files.set('/packages/index.json', { body: '{"format":"x"}' })
    expect(await source.checkForUpdate(true)).toBeUndefined()
    const offline = new PackageSource({ cache, fetchFn: (async () => { throw new TypeError('offline') }) as unknown as typeof fetch, apiBase: 'https://x', id: 'mundo-real', embedded: { version: '2026.11', name: 'E', gameId: 'e', load: async () => JSON.parse(pkgText('E')) }, memory: memory(), now: () => NOW, timeoutSignal: () => undefined })
    expect(await offline.checkForUpdate(true)).toBeUndefined()
  })

  it('baixa, confere, guarda e passa a usar a versão nova em jogos novos (com outro id de jogo)', async () => {
    const { source, publish } = setup()
    const index = publish('2026.11', '2027.01')
    const notice = (await source.checkForUpdate())!
    await source.download(notice)
    expect((await source.available()).map((p) => p.version)).toEqual(['2027.01', '2026.11'])
    expect(await source.checkForUpdate(true)).toBeUndefined()
    const loaded = await source.load()
    expect(loaded).toMatchObject({ version: '2027.01', origin: 'downloaded', gameId: 'baixado:mundo-real@2027.01' })
    expect(loaded.pkg.name).toBe('Mundo 2027.01')
    // Escolher a versão antiga continua possível.
    expect((await source.load('2026.11')).origin).toBe('embedded')
    expect(index.packages).toHaveLength(2)
  })

  it('arquivo com conteúdo trocado, incompleto, grande demais ou que não abre: erro claro e nada é guardado', async () => {
    const { source, publish, server } = setup()
    const index = publish('2027.01')
    const listing = index.packages[0]!
    const path = `/packages/${listing.path}`
    const good = server.files.get(path)!.body as Uint8Array

    const flipped = good.slice()
    flipped[flipped.length - 10] = flipped[flipped.length - 10]! ^ 1
    server.files.set(path, { body: flipped })
    await expect(source.download(listing)).rejects.toThrow(/não confere/)

    server.files.set(path, { body: good.slice(0, good.length - 5) })
    await expect(source.download(listing)).rejects.toThrow(/incompleto/)

    server.files.set(path, { body: good, headers: { 'content-length': String(good.length * 5) } })
    await expect(source.download(listing)).rejects.toThrow(/maior do que o esperado/)

    server.files.set(path, { body: good, status: 503 })
    await expect(source.download(listing)).rejects.toThrow(/503/)

    // Hash certo no índice, mas o conteúdo não é um gzip de pacote.
    const junk = new TextEncoder().encode('isto não é gzip')
    server.files.set(path, { body: junk })
    await expect(source.download({ ...listing, gzipBytes: junk.length, sha256: hashOf(junk) })).rejects.toThrow()
    expect((await source.available()).map((p) => p.origin)).toEqual(['embedded'])
  })

  it('versão guardada que estragou no aparelho é apagada e o jogo cai para a embutida', async () => {
    const { source, publish } = setup()
    const index = publish('2027.01')
    await source.download(index.packages[0]!)
    const row = (await cache.get('mundo-real', '2027.01'))!
    const damaged = row.gz.slice()
    damaged[damaged.length - 10] = damaged[damaged.length - 10]! ^ 1
    await cache.put({ ...row, gz: damaged }, compareVersions)
    const loaded = await source.load()
    expect(loaded.origin).toBe('embedded')
    expect(await cache.get('mundo-real', '2027.01')).toBeUndefined()
  })

  it('guarda só as duas versões mais novas', async () => {
    const { source, publish } = setup()
    const index = publish('2027.01', '2027.02', '2027.03')
    for (const p of index.packages) await source.download(p)
    expect((await cache.list()).map((r) => r.version).sort()).toEqual(['2027.02', '2027.03'])
  })

  it('a versão baixada igual à embutida não aparece duas vezes', async () => {
    const { source, publish } = setup()
    const index = publish('2026.11')
    await source.download(index.packages[0]!)
    expect((await source.available()).map((p) => p.origin)).toEqual(['embedded'])
  })
})
