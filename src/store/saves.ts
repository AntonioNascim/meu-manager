/**
 * Saves no navegador (IndexedDB via Dexie): 3 espaços. O resumo de cada um fica numa tabela à parte (para listar sem
 * ler o jogo inteiro).
 *
 * O jogo é gravado em pedaços comprimidos (`saveParts.ts`): a tabela `parts` guarda os pedaços e a `manifests` diz, para
 * cada espaço, quais pedaços formam o save atual. Cada gravação só escreve os pedaços que mudaram desde a anterior
 * (o motor é imutável: o que não mudou tem a mesma referência). **A gravação nova só substitui a antiga quando está
 * completa:** todo o trabalho (dividir, serializar, comprimir) acontece antes de abrir a transação do IndexedDB; dentro
 * dela os pedaços novos entram com ids novos (nunca por cima de pedaço do save atual), depois o manifesto passa a apontar
 * para eles e só então os pedaços velhos saem, tudo numa transação só, que o navegador desfaz inteira se o jogo fechar ou
 * o aparelho apagar no meio. A tabela `games` (um objeto por espaço) é o formato antigo: ainda abre, e a primeira
 * gravação nova o troca pelos pedaços.
 */
import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { DataPackage } from '../data/package/types'
import type { Game } from './game'
import { hashSeed } from '../engine/rng'
import { pack, unpack } from './compress'
import type { Encoding, Packed } from './compress'
import { SAVE_VERSION, SLOT_COUNT, SaveError, compactGame, migrateSave, summarizeGame } from './saveFormat'
import type { SaveEnvelope, SaveSummary } from './saveFormat'
import { joinParts, planParts, sameRefs } from './saveParts'

interface SlotRow extends SaveSummary {}
/** Formato antigo: o envelope inteiro numa linha só. */
interface GameRow {
  slot: number
  envelope: SaveEnvelope
}
interface PartRow {
  id: string
  slot: number
  enc: Encoding
  data: Uint8Array | string
  size: number
}
interface PartRef {
  id: string
  size: number
}
interface ManifestRow {
  slot: number
  version: number
  savedAt: string
  /** Número da gravação (cresce a cada uma; entra no id dos pedaços novos). */
  gen: number
  parts: Record<string, PartRef>
  /** Soma dos bytes gravados dos pedaços (comprimidos). */
  bytes: number
}

/** Pacote de dados importado pelo usuário: fica só neste navegador. */
export interface PackageRow {
  id: string
  name: string
  importedAt: string
  clubs: number
  players: number
  data: DataPackage
}

/** O que custou uma gravação (mostrado na tela de diagnóstico). */
export interface SaveStats {
  slot: number
  /** Tempo total da gravação, do pedido até o fim da transação. */
  ms: number
  /** Dividir o jogo e serializar os pedaços que mudaram. */
  planMs: number
  /** Comprimir os pedaços que mudaram. */
  packMs: number
  /** Transação no IndexedDB. */
  writeMs: number
  /** Pedaços do save e quantos foram gravados desta vez. */
  parts: number
  written: number
  /** Bytes gravados desta vez e tamanho do save inteiro no disco (comprimido). */
  writtenBytes: number
  totalBytes: number
  /** Texto serializado dos pedaços gravados (antes de comprimir). */
  jsonBytes: number
  /** `true` quando todos os pedaços foram regravados (primeiro save do espaço, ou o anterior mudou por fora). */
  full: boolean
}

/** Só para teste: ganchos no meio da gravação. */
export interface SaveOptions {
  /** Chamado dentro da transação, depois de gravar os pedaços novos e antes do manifesto passar a apontar para eles. */
  beforeCommit?: () => void | Promise<void>
}

class StaleManifest extends Error {}

class SavesDatabase extends Dexie {
  slots!: Table<SlotRow, number>
  games!: Table<GameRow, number>
  packages!: Table<PackageRow, string>
  manifests!: Table<ManifestRow, number>
  parts!: Table<PartRow, string>

  constructor(name: string) {
    super(name)
    // Versão do esquema do IndexedDB (não é a versão do formato do save, que fica no envelope).
    this.version(1).stores({ slots: 'slot', games: 'slot' })
    this.version(2).stores({ slots: 'slot', games: 'slot', packages: 'id' })
    this.version(3).stores({ slots: 'slot', games: 'slot', packages: 'id', manifests: 'slot', parts: 'id, slot' })
  }
}

interface SlotCache {
  gen: number
  refs: Map<string, readonly unknown[]>
  parts: Record<string, PartRef>
}

function checkSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) throw new SaveError('invalid', `Espaço de save inválido: ${slot}`)
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Quantos pedaços são comprimidos ao mesmo tempo. */
const PACK_BATCH = 16

/** Um banco de saves. O jogo usa um só (`meu-manager`); a tela de diagnóstico abre outro, para não tocar nos saves do jogador. */
export class SaveStore {
  private database: SavesDatabase | undefined
  private readonly cache = new Map<number, SlotCache>()
  /** Custo da última gravação. */
  lastStats: SaveStats | null = null

  constructor(readonly name: string = 'meu-manager') {}

  private db(): SavesDatabase {
    this.database ??= new SavesDatabase(this.name)
    return this.database
  }

  /** Fecha e esquece a conexão (usado nos testes e antes de trocar de banco). */
  close(): void {
    this.database?.close()
    this.database = undefined
    this.cache.clear()
  }

  /** Apaga o banco inteiro (a tela de diagnóstico usa um só dela). */
  async destroy(): Promise<void> {
    this.close()
    await Dexie.delete(this.name)
  }

  /** Os 3 espaços, na ordem; `null` = vazio. */
  async listSlots(): Promise<(SaveSummary | null)[]> {
    const rows = await this.db().slots.toArray()
    return Array.from({ length: SLOT_COUNT }, (_, i) => rows.find((r) => r.slot === i + 1) ?? null)
  }

  async saveToSlot(slot: number, game: Game, at: Date = new Date(), options: SaveOptions = {}): Promise<SaveSummary> {
    return (await this.saveDetailed(slot, game, at, options)).summary
  }

  /** Grava e devolve também o custo da gravação. */
  async saveDetailed(slot: number, game: Game, at: Date = new Date(), options: SaveOptions = {}): Promise<{ summary: SaveSummary; stats: SaveStats }> {
    checkSlot(slot)
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await this.writeSlot(slot, game, at, options, attempt > 0)
          this.lastStats = result.stats
          return result
        } catch (error) {
          // O espaço mudou por fora (outra aba): uma vez só, regrava tudo.
          if (!(error instanceof StaleManifest) || attempt > 0) throw error
          this.cache.delete(slot)
        }
      }
    } catch (error) {
      // Gravação que falhou: o save anterior continua intacto, mas o que se sabe dele deixa de valer.
      this.cache.delete(slot)
      throw error
    }
  }

  private async writeSlot(slot: number, game: Game, at: Date, options: SaveOptions, forceFull: boolean): Promise<{ summary: SaveSummary; stats: SaveStats }> {
    const t0 = now()
    const savedAt = at.toISOString()
    const compact = compactGame(game)
    const summary = summarizeGame(compact, slot, savedAt)
    const plan = planParts(compact)
    const base = forceFull ? undefined : this.cache.get(slot)
    const baseGen = base ? base.gen : ((await this.db().manifests.get(slot))?.gen ?? 0)
    const gen = baseGen + 1

    // 1. Só os pedaços que mudaram são serializados e comprimidos (tudo isto antes de abrir a transação).
    const changed = plan.filter((p) => !base || !base.parts[p.name] || !sameRefs(base.refs.get(p.name), p.refs))
    const texts = changed.map((p) => JSON.stringify(p.build()))
    const t1 = now()
    const packed: Packed[] = []
    for (let i = 0; i < texts.length; i += PACK_BATCH) packed.push(...(await Promise.all(texts.slice(i, i + PACK_BATCH).map((text) => pack(text)))))
    const t2 = now()

    // 2. O manifesto novo aponta para os pedaços que não mudaram (os de antes) e para os novos.
    const rows: PartRow[] = []
    const parts: Record<string, PartRef> = {}
    const written = new Set(changed.map((p) => p.name))
    changed.forEach((p, i) => {
      const id = `${slot}:${gen}:${p.name}`
      const data = packed[i]!
      rows.push({ id, slot, enc: data.enc, data: data.data, size: data.size })
      parts[p.name] = { id, size: data.size }
    })
    for (const p of plan) if (!written.has(p.name)) parts[p.name] = (base as SlotCache).parts[p.name]!
    const totalBytes = Object.values(parts).reduce((n, p) => n + p.size, 0)
    const manifest: ManifestRow = { slot, version: SAVE_VERSION, savedAt, gen, parts, bytes: totalBytes }

    // 3. Uma transação só: pedaços novos, manifesto, resumo e, por fim, a saída dos pedaços velhos.
    const { slots, games, manifests, parts: partsTable } = this.db()
    await this.db().transaction('rw', slots, games, manifests, partsTable, async () => {
      const old = await manifests.get(slot)
      if ((old?.gen ?? 0) !== baseGen) throw new StaleManifest()
      await partsTable.bulkPut(rows)
      await options.beforeCommit?.()
      await manifests.put(manifest)
      await slots.put(summary)
      const kept = new Set(Object.values(parts).map((p) => p.id))
      const stale = Object.values(old?.parts ?? {}).map((p) => p.id).filter((id) => !kept.has(id))
      if (stale.length > 0) await partsTable.bulkDelete(stale)
      await games.delete(slot)
    })
    const t3 = now()

    this.cache.set(slot, { gen, refs: new Map(plan.map((p) => [p.name, p.refs])), parts })
    const jsonBytes = texts.reduce((n, t) => n + t.length, 0)
    return {
      summary,
      stats: { slot, ms: t3 - t0, planMs: t1 - t0, packMs: t2 - t1, writeMs: t3 - t2, parts: plan.length, written: changed.length, writtenBytes: rows.reduce((n, r) => n + r.size, 0), totalBytes, jsonBytes, full: !base },
    }
  }

  /** O envelope do espaço como está gravado (sem migrar). `fromParts` diz se veio dos pedaços ou do formato antigo. */
  private async readEnvelope(slot: number): Promise<{ envelope: SaveEnvelope; fromParts: boolean }> {
    const db = this.db()
    const manifest = await db.manifests.get(slot)
    if (!manifest) {
      const row = await db.games.get(slot)
      if (!row) throw new SaveError('not-found', 'Este espaço está vazio.')
      return { envelope: row.envelope, fromParts: false }
    }
    const names = Object.keys(manifest.parts)
    const rows = await db.parts.bulkGet(names.map((n) => (manifest.parts[n] as PartRef).id))
    const values = new Map<string, unknown>()
    try {
      for (let i = 0; i < names.length; i += PACK_BATCH) {
        const batch = rows.slice(i, i + PACK_BATCH)
        const texts = await Promise.all(
          batch.map((row, j) => {
            if (!row) throw new SaveError('invalid', `Save corrompido: falta o pedaço ${names[i + j]}.`)
            return unpack(row.enc, row.data)
          }),
        )
        texts.forEach((text, j) => values.set(names[i + j] as string, JSON.parse(text)))
      }
      return { envelope: { version: manifest.version, savedAt: manifest.savedAt, game: joinParts(values) }, fromParts: true }
    } catch (error) {
      if (error instanceof SaveError) throw error
      throw new SaveError('invalid', `Save corrompido: ${error instanceof Error ? error.message : 'pedaço ilegível'}`)
    }
  }

  /** Lê e migra o save do espaço. Lança `SaveError` se estiver vazio, for de versão mais nova ou estiver corrompido. */
  async loadSlot(slot: number): Promise<Game> {
    checkSlot(slot)
    const { envelope, fromParts } = await this.readEnvelope(slot)
    const migrated = migrateSave(envelope).game
    if (fromParts && envelope.version === SAVE_VERSION) {
      // Sem migração, o jogo carregado é o próprio objeto lido: as referências servem de base para a próxima gravação.
      const manifest = await this.db().manifests.get(slot)
      if (manifest) {
        const plan = planParts(compactGame(migrated))
        this.cache.set(slot, { gen: manifest.gen, refs: new Map(plan.map((p) => [p.name, p.refs])), parts: manifest.parts })
      }
    }
    return migrated
  }

  async deleteSlot(slot: number): Promise<void> {
    checkSlot(slot)
    const { slots, games, manifests, parts } = this.db()
    await this.db().transaction('rw', slots, games, manifests, parts, async () => {
      await games.delete(slot)
      await slots.delete(slot)
      await manifests.delete(slot)
      await parts.where('slot').equals(slot).delete()
    })
    this.cache.delete(slot)
  }

  /** O espaço salvo mais recentemente (para "Continuar"), ou `null` se não há saves. */
  async latestSlot(): Promise<SaveSummary | null> {
    const all = (await this.listSlots()).filter((s): s is SaveSummary => s !== null)
    return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null
  }

  /** Primeiro espaço vazio, ou `null` se os 3 estão ocupados. */
  async firstEmptySlot(): Promise<number | null> {
    const index = (await this.listSlots()).findIndex((s) => s === null)
    return index === -1 ? null : index + 1
  }

  /** O envelope como está gravado (sem migrar): é o que vai para o arquivo de backup. */
  async loadEnvelope(slot: number): Promise<SaveEnvelope> {
    checkSlot(slot)
    return (await this.readEnvelope(slot)).envelope
  }

  /** Tamanho do save no disco (bytes gravados, comprimidos), ou `null` se o espaço está vazio. */
  async storedBytes(slot: number): Promise<number | null> {
    checkSlot(slot)
    const manifest = await this.db().manifests.get(slot)
    if (manifest) return manifest.bytes
    const row = await this.db().games.get(slot)
    return row ? JSON.stringify(row.envelope).length : null
  }

  /** Guarda um pacote importado (o mesmo conteúdo guarda uma vez só) e devolve a linha. */
  async savePackage(data: DataPackage, at: Date = new Date()): Promise<PackageRow> {
    const id = `pkg-${hashSeed(JSON.stringify(data)).toString(36)}`
    const row: PackageRow = { id, name: data.name, importedAt: at.toISOString(), clubs: data.clubs.length, players: data.players.length, data }
    await this.db().packages.put(row)
    return row
  }

  /** Grava um pacote sob um id escolhido (o editor sobrescreve o pacote que está editando). */
  async putPackage(id: string, data: DataPackage, at: Date = new Date()): Promise<PackageRow> {
    const row: PackageRow = { id, name: data.name, importedAt: at.toISOString(), clubs: data.clubs.length, players: data.players.length, data }
    await this.db().packages.put(row)
    return row
  }

  /** Pacotes importados neste navegador, do mais recente ao mais antigo (sem ler o conteúdo de cada um para a lista, só o resumo). */
  async listPackages(): Promise<Omit<PackageRow, 'data'>[]> {
    const rows = await this.db().packages.toArray()
    return rows.sort((a, b) => b.importedAt.localeCompare(a.importedAt)).map(({ data: _data, ...summary }) => summary)
  }

  async loadPackage(id: string): Promise<PackageRow | undefined> {
    return this.db().packages.get(id)
  }

  async deletePackage(id: string): Promise<void> {
    await this.db().packages.delete(id)
  }

  /** Só para teste: grava uma linha no formato antigo (um envelope por espaço). */
  async putLegacy(slot: number, envelope: SaveEnvelope, summary: SaveSummary): Promise<void> {
    const { slots, games } = this.db()
    await this.db().transaction('rw', slots, games, async () => {
      await games.put({ slot, envelope })
      await slots.put(summary)
    })
  }
}

const main = new SaveStore('meu-manager')

/** Fecha e esquece a conexão (usado nos testes e antes de trocar de banco). */
export const closeSavesDatabase = (): void => main.close()
export const listSlots = () => main.listSlots()
export const saveToSlot = (slot: number, game: Game, at?: Date, options?: SaveOptions) => main.saveToSlot(slot, game, at, options)
export const saveDetailed = (slot: number, game: Game, at?: Date, options?: SaveOptions) => main.saveDetailed(slot, game, at, options)
export const loadSlot = (slot: number) => main.loadSlot(slot)
export const deleteSlot = (slot: number) => main.deleteSlot(slot)
export const latestSlot = () => main.latestSlot()
export const firstEmptySlot = () => main.firstEmptySlot()
export const loadEnvelope = (slot: number) => main.loadEnvelope(slot)
export const storedBytes = (slot: number) => main.storedBytes(slot)
export const savePackage = (data: DataPackage, at?: Date) => main.savePackage(data, at)
export const putPackage = (id: string, data: DataPackage, at?: Date) => main.putPackage(id, data, at)
export const listPackages = () => main.listPackages()
export const loadPackage = (id: string) => main.loadPackage(id)
export const deletePackage = (id: string) => main.deletePackage(id)
export const mainSaveStore = main
