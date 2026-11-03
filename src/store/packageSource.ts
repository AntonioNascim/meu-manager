/**
 * De onde vem o pacote de dados de um jogo novo (Fase 6, B3). Junta três fontes: a cópia **embutida** no jogo (plano B, sempre existe), as versões
 * **baixadas** do servidor (guardadas no aparelho, com o hash conferido) e o **índice** do servidor, que diz se há versão mais nova.
 *
 * Regras: nada daqui é obrigatório. Sem internet, índice ruim ou hash errado, o jogo segue com o que já tem. Um jogo em andamento nunca
 * muda de versão (o save leva o mundo dentro dele); só jogo novo usa a versão escolhida.
 */
import { compareVersions, hashOf, newestAvailable, parseIndex, updateAvailable, verifyDownload, type PackageIndex, type PackageListing } from '../data/package/delivery'
import type { DataPackage } from '../data/package/types'
import { unpack } from './compress'
import type { PackageCache } from './packageCache'

export type PackageOrigin = 'embedded' | 'downloaded'

export interface AvailablePackage {
  id: string
  version: string
  name: string
  origin: PackageOrigin
}

export interface LoadedPackage extends AvailablePackage {
  pkg: DataPackage
  /** O que vai em `Game.dataPackage.id` (embutido e baixado têm ids diferentes). */
  gameId: string
}

/** Onde a pessoa guarda "já vi este aviso" e "última consulta" (no navegador: `localStorage`, que pode falhar). */
export interface Memory {
  get(key: string): string | null
  set(key: string, value: string): void
}

export const browserMemory = (): Memory => ({
  get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Sem armazenamento (janela privada, dados bloqueados): o aviso pode voltar, e tudo bem.
    }
  },
})

export interface SourceDeps {
  cache: PackageCache
  fetchFn: typeof fetch
  /** Base da API (`https://.../`), sem barra no fim. */
  apiBase: string
  id: string
  /** A cópia embutida: versão e como abri-la. */
  embedded: { version: string; name: string; gameId: string; load: () => Promise<DataPackage> }
  memory: Memory
  now: () => number
  /** Gerador de `AbortSignal` com tempo limite (injetado nos testes). */
  timeoutSignal?: (ms: number) => AbortSignal | undefined
}

/** Consulta ao índice no máximo a cada 6 horas. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const INDEX_TIMEOUT_MS = 5000
const FILE_TIMEOUT_MS = 60_000

export const downloadedGameId = (id: string, version: string): string => `baixado:${id}@${version}`

export class PackageSource {
  constructor(private deps: SourceDeps) {}

  private signal(ms: number): AbortSignal | undefined {
    if (this.deps.timeoutSignal) return this.deps.timeoutSignal(ms)
    return typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined
  }

  /** As versões que o aparelho já tem: a embutida e as baixadas (da mais nova para a mais antiga). */
  async available(): Promise<AvailablePackage[]> {
    const { embedded, id } = this.deps
    const list: AvailablePackage[] = [{ id, version: embedded.version, name: embedded.name, origin: 'embedded' }]
    try {
      for (const row of await this.deps.cache.list()) {
        // Se a versão baixada é a mesma da embutida, a embutida basta.
        if (row.id === id && row.version !== embedded.version) list.push({ id, version: row.version, name: row.name, origin: 'downloaded' })
      }
    } catch {
      // Sem IndexedDB: só a embutida.
    }
    return list.sort((a, b) => compareVersions(b.version, a.version))
  }

  /** Consulta o índice. `undefined` em qualquer falha (sem rede, tempo esgotado, resposta ruim). */
  async fetchIndex(): Promise<PackageIndex | undefined> {
    try {
      const res = await this.deps.fetchFn(`${this.deps.apiBase}/packages/index.json`, { signal: this.signal(INDEX_TIMEOUT_MS), headers: { Accept: 'application/json' } })
      if (!res.ok) return undefined
      const parsed = parseIndex(await res.json())
      return parsed.ok ? parsed.index : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Há versão nova que valha avisar? Respeita o intervalo de consulta e o "dispensar". `force` ignora o intervalo.
   * Nunca lança: o aviso é um extra.
   */
  async checkForUpdate(force = false): Promise<PackageListing | undefined> {
    const { memory, now, id } = this.deps
    const last = Number(memory.get('pkg-check-at') ?? 0)
    if (!force && Number.isFinite(last) && now() - last < CHECK_EVERY_MS) return this.cachedNotice
    const index = await this.fetchIndex()
    if (!index) return undefined
    memory.set('pkg-check-at', String(now()))
    const have = (await this.available()).map((p) => p.version)
    this.cachedNotice = updateAvailable(index, id, have, memory.get('pkg-dismissed') ?? undefined)
    return this.cachedNotice
  }

  private cachedNotice: PackageListing | undefined

  /** "Agora não": o aviso dessa versão não volta (só quando sair uma mais nova). */
  dismiss(version: string): void {
    this.deps.memory.set('pkg-dismissed', version)
    this.cachedNotice = undefined
  }

  /** Baixa uma versão, confere tamanho e hash, confere que abre e só então guarda. Lança erro com mensagem clara se algo falhar. */
  async download(listing: PackageListing): Promise<void> {
    const res = await this.deps.fetchFn(`${this.deps.apiBase}/packages/${listing.path}`, { signal: this.signal(FILE_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`Não foi possível baixar os elencos (${res.status}).`)
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > listing.gzipBytes * 1.1) throw new Error('O arquivo de elencos veio maior do que o esperado.')
    const bytes = new Uint8Array(await res.arrayBuffer())
    const checked = verifyDownload(bytes, listing)
    if (!checked.ok) throw new Error(checked.error === 'size' ? 'O arquivo de elencos veio incompleto. Tente de novo.' : 'O arquivo de elencos não confere com o esperado. Tente de novo.')
    // Abre uma vez antes de guardar: não adianta guardar o que o jogo não consegue ler.
    await this.open(bytes, listing.id)
    await this.deps.cache.put({ id: listing.id, version: listing.version, name: listing.name, gz: bytes, sha256: listing.sha256, savedAt: this.deps.now() }, compareVersions)
    this.cachedNotice = undefined
  }

  private async open(gz: Uint8Array, id: string): Promise<DataPackage> {
    const pkg = JSON.parse(await unpack('gzip', gz)) as DataPackage
    if (pkg?.format !== 'meu-manager-package') throw new Error(`O arquivo de elencos (${id}) está corrompido.`)
    return pkg
  }

  /**
   * Abre o pacote de um jogo novo: a versão pedida, ou a mais nova que o aparelho tem. Uma versão baixada que não confere mais com o hash
   * (armazenamento corrompido) é apagada e o jogo cai para a próxima. A embutida sempre serve de último recurso.
   */
  async load(version?: string): Promise<LoadedPackage> {
    const { embedded, id } = this.deps
    const all = await this.available()
    const wanted = version ? all.find((p) => p.version === version) : newestAvailable(all)
    const ordered = [...(wanted ? [wanted] : []), ...all.filter((p) => p !== wanted)]
    for (const candidate of ordered) {
      if (candidate.origin === 'embedded') return { ...candidate, pkg: await embedded.load(), gameId: embedded.gameId }
      try {
        const row = await this.deps.cache.get(id, candidate.version)
        if (!row || hashOf(row.gz) !== row.sha256) throw new Error('hash')
        return { ...candidate, pkg: await this.open(row.gz, id), gameId: downloadedGameId(id, candidate.version) }
      } catch {
        await this.deps.cache.remove(id, candidate.version).catch(() => undefined)
      }
    }
    return { id, version: embedded.version, name: embedded.name, origin: 'embedded', pkg: await embedded.load(), gameId: embedded.gameId }
  }
}
