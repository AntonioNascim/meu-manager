/**
 * Estado da nuvem de cada espaço de save (Fase 6, B4), num banco IndexedDB **separado** (`meu-manager-nuvem`): o banco dos saves não muda
 * de esquema e nada daqui pode estragar um save local. Guarda: se o espaço está ligado à nuvem, a revisão que conhecemos, qual gravação
 * local já subiu (a fila é isto: "gravação local diferente da que subiu" = pendente, e sobrevive a fechar o jogo), o conflito em aberto e
 * as cópias do que havia no aparelho antes de um espaço ser trocado pelo da nuvem (7 dias).
 */
import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { CloudManifest } from '../online/cloudSave'
import type { RawSave } from './saves'

export type CloudStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'conflict' | 'error'

export interface CloudSlotState {
  slot: number
  enabled: boolean
  /** Revisão do manifesto na nuvem que este aparelho conhece (0 = nenhuma). */
  remoteRev: number
  /** `savedAt` da gravação local que já está na nuvem. */
  syncedSavedAt?: string
  status: CloudStatus
  lastSyncAt?: number
  lastError?: string
  /** O que está na nuvem quando outro aparelho gravou antes (para mostrar "hoje 21:40, temporada 3"). */
  conflict?: CloudManifest | null
  /** Tentativas seguidas que falharam (espaça as novas tentativas). */
  failures: number
}

export interface LocalBackup {
  slot: number
  takenAt: number
  save: RawSave
}

interface MetaRow {
  key: string
  value: string
}

class CloudDatabase extends Dexie {
  slots!: Table<CloudSlotState, number>
  backups!: Table<LocalBackup, number>
  meta!: Table<MetaRow, string>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ slots: 'slot', backups: 'slot', meta: 'key' })
  }
}

export const LOCAL_BACKUP_KEEP_MS = 7 * 24 * 3_600_000

export class CloudStateStore {
  private db: CloudDatabase
  constructor(name = 'meu-manager-nuvem') {
    this.db = new CloudDatabase(name)
  }

  async get(slot: number): Promise<CloudSlotState> {
    return (await this.db.slots.get(slot)) ?? { slot, enabled: false, remoteRev: 0, status: 'synced', failures: 0 }
  }

  async all(): Promise<CloudSlotState[]> {
    const rows = await this.db.slots.toArray()
    return [1, 2, 3].map((slot) => rows.find((r) => r.slot === slot) ?? { slot, enabled: false, remoteRev: 0, status: 'synced' as const, failures: 0 })
  }

  async put(state: CloudSlotState): Promise<void> {
    await this.db.slots.put(state)
  }

  async update(slot: number, patch: Partial<CloudSlotState>): Promise<CloudSlotState> {
    const next = { ...(await this.get(slot)), ...patch }
    await this.db.slots.put(next)
    return next
  }

  /** Sorteado uma vez por aparelho; só serve para o aviso dizer "outro aparelho". */
  async deviceId(randomText: () => string): Promise<string> {
    const row = await this.db.meta.get('deviceId')
    if (row) return row.value
    const value = randomText()
    await this.db.meta.put({ key: 'deviceId', value })
    return value
  }

  async saveBackup(slot: number, save: RawSave, takenAt: number): Promise<void> {
    await this.db.backups.put({ slot, takenAt, save })
  }

  async backup(slot: number, now: number): Promise<LocalBackup | undefined> {
    const row = await this.db.backups.get(slot)
    return row && now - row.takenAt < LOCAL_BACKUP_KEEP_MS ? row : undefined
  }

  async dropBackup(slot: number): Promise<void> {
    await this.db.backups.delete(slot)
  }

  async pruneBackups(now: number): Promise<void> {
    const old = (await this.db.backups.toArray()).filter((b) => now - b.takenAt >= LOCAL_BACKUP_KEEP_MS).map((b) => b.slot)
    if (old.length > 0) await this.db.backups.bulkDelete(old)
  }

  /** Esquece tudo (depois de "Apagar minha conta"). Os saves locais não são tocados. */
  async clear(): Promise<void> {
    await this.db.transaction('rw', this.db.slots, this.db.backups, async () => {
      await this.db.slots.clear()
      await this.db.backups.clear()
    })
  }

  close(): void {
    this.db.close()
  }
}
