/**
 * Onde a identidade online fica no aparelho (Fase 6, B2). Banco IndexedDB **separado** do dos saves (`meu-manager-identidade`):
 * não mexe no esquema nem nos saves existentes. Guarda a semente secreta, o `playerId`, o apelido e **o código (texto de 20 símbolos)**, para a
 * pessoa poder ver o código de novo pelo menu enquanto o aparelho tem a identidade. O código só existe aqui: o servidor nunca as vê, e a
 * semente (que já dá acesso à conta) está no mesmo banco, então guardá-lo não amplia o que quem tem o aparelho já alcança.
 */
import Dexie, { type Table } from 'dexie'
import { createIdentity, identityFromRecoveryCode, identityFromSeed, type Identity } from '../online/identity'

interface IdentityRow {
  /** Sempre 'me': há uma identidade por aparelho. */
  id: 'me'
  playerId: string
  secretKey: Uint8Array
  nickname?: string
  /** O código, para mostrar de novo no menu. Ausente se a identidade veio de um registro antigo. */
  recoveryCode?: string
  /** A pessoa tocou em "Já guardei". */
  codeConfirmed: boolean
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
  recoveryCode?: string
  codeConfirmed: boolean
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
    return { identity, nickname: row.nickname, recoveryCode: row.recoveryCode, codeConfirmed: row.codeConfirmed, createdAt: row.createdAt, registered: row.registered }
  }

  /** Cria uma identidade nova neste aparelho e devolve o código de recuperação, que a tela mostra uma vez. Se já existe uma, não troca. */
  async create(randomBytes: (n: number) => Uint8Array, now: number): Promise<{ identity: Identity; recoveryCode: string } | undefined> {
    if (await this.db.identity.get('me')) return undefined
    const made = createIdentity(randomBytes)
    await this.put(made.identity, now, false, made.recoveryCode, false)
    return made
  }

  /**
   * Guarda uma identidade que o servidor já aceitou (criada na tela de cadastro: o código é sorteado antes e só é gravado depois de o servidor
   * aceitar, para uma falha de rede não deixar uma conta "meio criada" no aparelho). O aviso para guardar o código fica no menu até "Já guardei" (`confirmCode`).
   */
  async adopt(made: { identity: Identity; recoveryCode: string }, now: number, nickname?: string): Promise<void> {
    await this.db.identity.put({ id: 'me', playerId: made.identity.playerId, secretKey: made.identity.secretKey, nickname, recoveryCode: made.recoveryCode, codeConfirmed: false, createdAt: now, registered: true })
  }

  /** Outro aparelho: a identidade volta a partir do código (já registrada no servidor, se foi criada lá antes). */
  async recover(code: string, now: number): Promise<Identity> {
    const identity = identityFromRecoveryCode(code)
    // Quem digita o código já o tem anotado: conta como confirmado.
    await this.put(identity, now, false, code, true)
    return identity
  }

  /** A pessoa tocou em "Já guardei". */
  async confirmCode(): Promise<void> {
    await this.db.identity.update('me', { codeConfirmed: true })
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

  private async put(identity: Identity, createdAt: number, registered: boolean, recoveryCode: string, codeConfirmed: boolean): Promise<void> {
    await this.db.identity.put({ id: 'me', playerId: identity.playerId, secretKey: identity.secretKey, recoveryCode, codeConfirmed, createdAt, registered })
  }
}

export const mainIdentityStore = new IdentityStore()
