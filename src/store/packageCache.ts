/**
 * Pacotes de dados baixados do servidor (Fase 6, B3). Banco IndexedDB **separado** do dos saves e do da identidade (`meu-manager-pacotes`):
 * guarda o arquivo comprimido (~0,8 MB) exatamente como veio, para poder conferir o hash de novo ao abrir. Os saves nunca dependem daqui: cada
 * save já leva o mundo dentro dele.
 */
import Dexie, { type Table } from 'dexie'

export interface DownloadedRow {
  /** `id@versão`. */
  key: string
  id: string
  version: string
  name: string
  /** O arquivo `.json.gz` como baixado. */
  gz: Uint8Array
  sha256: string
  savedAt: number
}

class PackageDatabase extends Dexie {
  downloaded!: Table<DownloadedRow, string>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ downloaded: 'key, id' })
  }
}

export const packageKey = (id: string, version: string): string => `${id}@${version}`

/** Quantas versões de cada pacote ficam guardadas (as mais novas). Cada uma ocupa ~0,8 MB. */
export const KEEP_VERSIONS = 2

export class PackageCache {
  private db: PackageDatabase
  constructor(name = 'meu-manager-pacotes') {
    this.db = new PackageDatabase(name)
  }

  async get(id: string, version: string): Promise<DownloadedRow | undefined> {
    return this.db.downloaded.get(packageKey(id, version))
  }

  /** O que está guardado, sem os bytes. */
  async list(): Promise<Omit<DownloadedRow, 'gz'>[]> {
    const rows = await this.db.downloaded.toArray()
    return rows.map(({ gz: _gz, ...rest }) => rest)
  }

  /** Guarda a versão e apaga as mais antigas além de `KEEP_VERSIONS`. `compare` ordena versões (a mais nova por último). */
  async put(row: Omit<DownloadedRow, 'key'>, compare: (a: string, b: string) => number): Promise<void> {
    await this.db.transaction('rw', this.db.downloaded, async () => {
      await this.db.downloaded.put({ ...row, key: packageKey(row.id, row.version) })
      const same = (await this.db.downloaded.where('id').equals(row.id).toArray()).sort((a, b) => compare(b.version, a.version))
      for (const old of same.slice(KEEP_VERSIONS)) await this.db.downloaded.delete(old.key)
    })
  }

  async remove(id: string, version: string): Promise<void> {
    await this.db.downloaded.delete(packageKey(id, version))
  }

  async clear(): Promise<void> {
    await this.db.downloaded.clear()
  }

  close(): void {
    this.db.close()
  }
}

export const mainPackageCache = new PackageCache()
