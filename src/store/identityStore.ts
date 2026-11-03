/**
 * Onde a identidade online fica no aparelho (Fase 6, B2). Banco IndexedDB **separado** do dos saves (`meu-manager-identidade`):
 * não mexe no esquema nem nos saves existentes. Guarda só a semente secreta, o `playerId` e o apelido; o código de recuperação
 * NUNCA é gravado (é mostrado uma vez, na criação).
 */
import Dexie, { type Table } from 'dexie'
import { createIdentity, identityFromRecoveryCode, identityFromSeed, type Identity } from '../online/identity'

interface IdentityRow {
  /** Sempre 'me': há uma identidade por aparelho. */
  id: 'me'
  playerId: string
  secretKey: Uint8Array
  nickname?: string
  /** Quando foi criada ou recuperada neste aparelho. */
  createdAt: number
  /** Se o servidor já conhece esta identidade (o registro já foi aceito). */
  registered: boolean
}

class IdentityDatabase extends Dexie {
  identity!: Table<IdentityRow, string>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ identity: 'id' })
  }
}

export interface StoredIdentity {
  identity: Identity
  nickname?: string
  createdAt: number
  registered: boolean
}

export class IdentityStore {
  private db: IdentityDatabase
  constructor(name = 'meu-manager-identidade') {
    this.db = new IdentityDatabase(name)
  }

  async load(): Promise<StoredIdentity | undefined> {
    const row = await this.db.identity.get('me')
    if (!row) return undefined
    const identity = identityFromSeed(row.secretKey)
    // Defesa contra um registro adulterado ou corrompido: o `playerId` precisa ser o da chave guardada.
    if (identity.playerId !== row.playerId) return undefined
    return { identity, nickname: row.nickname, createdAt: row.createdAt, registered: row.registered }
  }

  /** Cria uma identidade nova neste aparelho e devolve o código de recuperação, que a tela mostra uma vez. Se já existe uma, não troca. */
  async create(randomBytes: (n: number) => Uint8Array, now: number): Promise<{ identity: Identity; recoveryCode: string[] } | undefined> {
    if (await this.db.identity.get('me')) return undefined
    const made = createIdentity(randomBytes)
    await this.put(made.identity, now, false)
    return made
  }

  /** Outro aparelho: a identidade volta a partir do código (já registrada no servidor, se foi criada lá antes). */
  async recover(words: readonly string[], now: number): Promise<Identity> {
    const identity = identityFromRecoveryCode(words)
    await this.put(identity, now, false)
    return identity
  }

  async markRegistered(nickname?: string): Promise<void> {
    await this.db.identity.update('me', { registered: true, ...(nickname !== undefined ? { nickname } : {}) })
  }

  async setNickname(nickname: string | undefined): Promise<void> {
    await this.db.identity.update('me', { nickname })
  }

  /** "Apagar minha conta" (lado do aparelho): esquece a chave. Sem o código, não há volta. */
  async clear(): Promise<void> {
    await this.db.identity.clear()
  }

  close(): void {
    this.db.close()
  }

  private async put(identity: Identity, createdAt: number, registered: boolean): Promise<void> {
    await this.db.identity.put({ id: 'me', playerId: identity.playerId, secretKey: identity.secretKey, createdAt, registered })
  }
}

export const mainIdentityStore = new IdentityStore()
