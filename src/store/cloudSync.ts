/**
 * Sincronização dos saves com a nuvem (Fase 6, B4). **O aparelho manda: a nuvem é um espelho.**
 *
 * Regras que esta classe garante:
 *  - Enviar nunca altera o save local (só lê com `exportRaw`). Rede caída, servidor fora do ar, cota ou limite: o save local fica como está e
 *    o espaço fica "pendente" (a fila é o próprio estado guardado: gravação local diferente da que subiu).
 *  - O local só é trocado por escolha explícita da pessoa (`resolve` com `cloud`/`both`, ou `pull`), e só depois de **baixar e conferir tudo**
 *    (hash de cada pedaço); antes disso, o que havia vira cópia local por 7 dias.
 *  - Dois aparelhos: a gravação do manifesto exige a revisão que este aparelho conhece. Se não bate, o espaço fica em `conflict` e nada mais é
 *    enviado até a pessoa decidir. Nunca mescla.
 *  - Ligar um espaço à nuvem é opcional e não apaga nem muda nada local (saves antigos no formato antigo são divididos em memória).
 */
import { ApiError, AuthError, CloudClient, ConflictError, MissingError, NetworkError, QuotaError, RateLimitedError } from '../online/cloudClient'
import { hashHex, type CloudManifest } from '../online/cloudSave'
import { SAVE_VERSION, SLOT_COUNT, SaveError } from './saveFormat'
import type { RawPart, RawSave, SaveStore } from './saves'
import type { CloudStateStore } from './cloudState'

const enc = new TextEncoder()
const dec = new TextDecoder()

const bytesOf = (p: RawPart): Uint8Array => (typeof p.data === 'string' ? enc.encode(p.data) : p.data)

export type SyncOutcome = 'synced' | 'already' | 'disabled' | 'empty' | 'conflict' | 'offline' | 'error' | 'quota' | 'auth' | 'limited'

export interface SyncDeps {
  local: Pick<SaveStore, 'exportRaw' | 'importRaw' | 'firstEmptySlot'>
  state: CloudStateStore
  client: CloudClient
  now: () => number
  randomText: () => string
}

/** Quantos pedaços sobem ao mesmo tempo. */
const UPLOAD_PARALLEL = 8

export type ResolveChoice = 'cloud' | 'local' | 'both'

export class CloudSync {
  /** Hash de cada pedaço já calculado (o id do pedaço local nunca muda de conteúdo). */
  private hashes = new Map<string, string>()
  /** Um envio por vez por espaço. */
  private running = new Map<number, Promise<SyncOutcome>>()

  constructor(private deps: SyncDeps) {}

  private hashOf(p: RawPart): string {
    if (!p.id) return hashHex(bytesOf(p))
    let h = this.hashes.get(p.id)
    if (!h) this.hashes.set(p.id, (h = hashHex(bytesOf(p))))
    return h
  }

  /** Liga o espaço à nuvem. Não envia nada ainda; o primeiro `sync` envia (e, se a nuvem já tem save daquele espaço, vira conflito para a pessoa decidir). */
  async enable(slot: number): Promise<void> {
    const s = await this.deps.state.get(slot)
    await this.deps.state.put({ ...s, enabled: true, status: 'pending', failures: 0, lastError: undefined })
  }

  /** Desliga a nuvem do espaço (o que já está lá fica; para apagar use `deleteRemote`). */
  async disable(slot: number): Promise<void> {
    await this.deps.state.update(slot, { enabled: false, status: 'synced', conflict: undefined, lastError: undefined })
  }

  /** Envia o que falta do espaço. Várias chamadas seguidas viram uma só. */
  sync(slot: number, options: { force?: boolean } = {}): Promise<SyncOutcome> {
    const running = this.running.get(slot)
    if (running) return running
    const p = this.run(slot, options.force === true).finally(() => this.running.delete(slot))
    this.running.set(slot, p)
    return p
  }

  /** Envia todos os espaços ligados. */
  async syncAll(): Promise<Record<number, SyncOutcome>> {
    const out: Record<number, SyncOutcome> = {}
    for (let slot = 1; slot <= SLOT_COUNT; slot++) if ((await this.deps.state.get(slot)).enabled) out[slot] = await this.sync(slot)
    return out
  }

  private async fail(slot: number, status: 'offline' | 'error' | 'pending', message: string, outcome: SyncOutcome): Promise<SyncOutcome> {
    const s = await this.deps.state.get(slot)
    await this.deps.state.update(slot, { status, lastError: message, failures: s.failures + 1 })
    return outcome
  }

  private async run(slot: number, force: boolean): Promise<SyncOutcome> {
    const { state, local, client, now } = this.deps
    const current = await state.get(slot)
    if (!current.enabled) return 'disabled'
    if (current.status === 'conflict' && !force) return 'conflict'
    const raw = await local.exportRaw(slot)
    if (!raw) return 'empty'
    if (!force && current.syncedSavedAt === raw.savedAt && current.status !== 'error') {
      if (current.status !== 'synced') await state.update(slot, { status: 'synced' })
      return 'already'
    }
    await state.update(slot, { status: 'syncing' })
    try {
      const parts = raw.parts.map((p) => ({ part: p, hash: this.hashOf(p) }))
      const manifestParts: CloudManifest['parts'] = {}
      for (const { part, hash } of parts) manifestParts[part.name] = { hash, size: part.size, enc: part.enc }
      const byHash = new Map(parts.map(({ part, hash }) => [hash, part]))
      const body = {
        savedAt: raw.savedAt,
        version: raw.version,
        deviceId: await state.deviceId(this.deps.randomText),
        summary: toCloudSummary(raw),
        parts: manifestParts,
      }
      const upload = async (hashes: string[]) => {
        for (let i = 0; i < hashes.length; i += UPLOAD_PARALLEL) {
          await Promise.all(hashes.slice(i, i + UPLOAD_PARALLEL).map((h) => client.putBlob(slot, h, bytesOf(byHash.get(h)!))))
        }
      }
      await upload(await client.missing(slot, [...byHash.keys()]))
      let done: { rev: number; updatedAt: number }
      try {
        done = await client.commit(slot, { expectedRev: current.remoteRev, manifest: body, force })
      } catch (error) {
        // Pedaços que a limpeza do servidor levou no meio do caminho: envia de novo e tenta uma vez mais.
        if (!(error instanceof MissingError)) throw error
        await upload(error.hashes)
        done = await client.commit(slot, { expectedRev: current.remoteRev, manifest: body, force })
      }
      await state.put({ ...(await state.get(slot)), remoteRev: done.rev, syncedSavedAt: raw.savedAt, status: 'synced', lastSyncAt: now(), lastError: undefined, conflict: undefined, failures: 0 })
      return 'synced'
    } catch (error) {
      if (error instanceof ConflictError) {
        await state.update(slot, { status: 'conflict', conflict: error.current, lastError: undefined })
        return 'conflict'
      }
      if (error instanceof NetworkError) return this.fail(slot, 'offline', error.message, 'offline')
      if (error instanceof RateLimitedError) return this.fail(slot, 'pending', 'Muitos envios seguidos. Tentaremos de novo daqui a pouco.', 'limited')
      if (error instanceof QuotaError) return this.fail(slot, 'error', 'O save passou da cota da nuvem (5 MB por espaço).', 'quota')
      if (error instanceof AuthError) return this.fail(slot, 'error', error.reason === 'unknown-identity' ? 'Este aparelho ainda não está registrado no servidor.' : 'O servidor recusou a assinatura (confira a data e a hora do aparelho).', 'auth')
      if (error instanceof ApiError) return this.fail(slot, 'error', `O servidor recusou o envio (${error.status}).`, 'error')
      // Falha local inesperada (por exemplo, ler o save): o save local continua como está.
      return this.fail(slot, 'error', error instanceof Error ? error.message : 'Falha ao enviar.', 'error')
    }
  }

  /** Baixa o save da nuvem e confere cada pedaço. Não toca em nada local. */
  async download(slot: number): Promise<{ raw: RawSave; manifest: CloudManifest } | null> {
    const { client } = this.deps
    const manifest = await client.manifest(slot)
    if (!manifest) return null
    if (manifest.version > SAVE_VERSION) throw new SaveError('newer-version', 'O save na nuvem é de uma versão mais nova do jogo. Atualize o jogo para abrir.')
    const names = Object.keys(manifest.parts)
    const parts: RawPart[] = new Array(names.length)
    for (let i = 0; i < names.length; i += UPLOAD_PARALLEL) {
      await Promise.all(
        names.slice(i, i + UPLOAD_PARALLEL).map(async (name, j) => {
          const ref = manifest.parts[name]!
          const bytes = await client.getBlob(slot, ref.hash)
          if (hashHex(bytes) !== ref.hash || bytes.length !== ref.size) throw new SaveError('invalid', `O pedaço ${name} baixado não confere com o esperado.`)
          parts[i + j] = { name, enc: ref.enc, data: ref.enc === 'json' ? dec.decode(bytes) : bytes, size: ref.size }
        }),
      )
    }
    const raw: RawSave = { version: manifest.version, savedAt: manifest.savedAt, summary: { ...fromCloudSummary(manifest), slot, version: manifest.version, savedAt: manifest.savedAt }, parts }
    return { raw, manifest }
  }

  /**
   * Traz o save da nuvem para o espaço, trocando o local. Primeiro baixa e confere tudo; depois guarda o que havia no aparelho como cópia
   * por 7 dias; só então troca (numa transação). Se qualquer passo falhar, o local fica exatamente como estava.
   */
  async pull(slot: number): Promise<'pulled' | 'no-cloud-save'> {
    const { local, state, now } = this.deps
    const got = await this.download(slot)
    if (!got) return 'no-cloud-save'
    const before = await local.exportRaw(slot)
    if (before) await state.saveBackup(slot, before, now())
    await local.importRaw(slot, got.raw)
    const s = await state.get(slot)
    await state.put({ ...s, enabled: true, remoteRev: got.manifest.rev, syncedSavedAt: got.raw.savedAt, status: 'synced', conflict: undefined, lastError: undefined, lastSyncAt: now(), failures: 0 })
    return 'pulled'
  }

  /** Resolve um conflito (a nuvem tem um save diferente do deste aparelho). */
  async resolve(slot: number, choice: ResolveChoice): Promise<SyncOutcome | 'pulled' | 'no-free-slot' | 'no-cloud-save'> {
    const { state, local, client } = this.deps
    if (choice === 'cloud') return this.pull(slot)
    if (choice === 'both') {
      // A versão da nuvem é guardada num espaço livre (só no aparelho) antes de o deste espaço passar por cima dela.
      const free = await local.firstEmptySlot()
      if (free === null) return 'no-free-slot'
      const got = await this.download(slot)
      if (got) await local.importRaw(free, got.raw)
    }
    // "Usar este": o servidor guarda a versão anterior como cópia por 7 dias. A revisão vem fresca para a próxima gravação normal.
    const remote = await client.manifest(slot).catch(() => undefined)
    await state.update(slot, { status: 'pending', conflict: undefined, remoteRev: remote?.rev ?? (await state.get(slot)).remoteRev })
    return this.sync(slot, { force: true })
  }

  /** Desfaz um "usar a nuvem": volta o que havia no aparelho (se a cópia local ainda existe). */
  async restoreLocalBackup(slot: number): Promise<boolean> {
    const { state, local, now } = this.deps
    const backup = await state.backup(slot, now())
    if (!backup) return false
    await local.importRaw(slot, backup.save)
    // A nuvem agora tem outra coisa: o espaço volta a ser "pendente" e o próximo envio decide (conflito se for o caso).
    await state.update(slot, { syncedSavedAt: undefined, status: 'pending' })
    return true
  }

  /** Apaga o espaço na nuvem (o local não é tocado) e desliga a nuvem dele. */
  async deleteRemote(slot: number): Promise<void> {
    await this.deps.client.deleteSlot(slot)
    await this.deps.state.update(slot, { enabled: false, remoteRev: 0, syncedSavedAt: undefined, status: 'synced', conflict: undefined })
  }

  /** "Apagar minha conta": apaga tudo no servidor e esquece o estado da nuvem. Os saves locais continuam intactos. */
  async deleteAccount(): Promise<void> {
    await this.deps.client.deleteAccount()
    await this.deps.state.clear()
  }

  /** "Exportar meus dados": o que o servidor guarda da pessoa. */
  exportAccount(): Promise<unknown> {
    return this.deps.client.exportAccount()
  }
}

function toCloudSummary(raw: RawSave): CloudManifest['summary'] {
  const s = raw.summary
  return { teamName: s.teamName, abbreviation: s.abbreviation, colors: s.colors, tier: s.tier, league: s.league, year: s.year, label: s.label, date: s.date, seasonsPlayed: s.seasonsPlayed }
}

function fromCloudSummary(m: CloudManifest): Omit<RawSave['summary'], 'slot' | 'version' | 'savedAt'> {
  return { ...m.summary }
}

/**
 * Agenda os envios (navegador): depois de cada gravação local espera pelo menos 2 minutos desde o último envio do espaço (a proposta pede
 * "a cada 2 minutos de uso"), e `flush` envia já (fim de partida, fim de um dia de jogos, aba indo para segundo plano, volta da internet).
 * Falhas espaçam as novas tentativas (30 s, 2 min, 10 min, 30 min); o estado guardado garante que nada se perde se o jogo for fechado.
 */
export class CloudScheduler {
  private timers = new Map<number, ReturnType<typeof setTimeout>>()
  private lastTry = new Map<number, number>()

  constructor(
    private sync: CloudSync,
    private state: CloudStateStore,
    private now: () => number,
    private everyMs = 120_000,
    private setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn, ms) => setTimeout(fn, ms),
    private clearTimer: (t: ReturnType<typeof setTimeout>) => void = (t) => clearTimeout(t),
  ) {}

  /** Chamado a cada gravação local do espaço. */
  async onSaved(slot: number): Promise<void> {
    const s = await this.state.get(slot)
    if (!s.enabled || s.status === 'conflict') return
    if (s.status === 'synced') await this.state.update(slot, { status: 'pending' })
    this.schedule(slot, s.failures)
  }

  private schedule(slot: number, failures: number): void {
    if (this.timers.has(slot)) return
    const backoff = failures === 0 ? 0 : [30_000, 120_000, 600_000, 1_800_000][Math.min(failures, 4) - 1]!
    const sinceLast = this.now() - (this.lastTry.get(slot) ?? 0)
    const wait = failures === 0 ? Math.max(this.everyMs - sinceLast, 0) : backoff
    this.timers.set(
      slot,
      this.setTimer(() => {
        this.timers.delete(slot)
        void this.flush(slot)
      }, wait),
    )
  }

  /** Envia já. */
  async flush(slot?: number): Promise<void> {
    const slots = slot ? [slot] : [1, 2, 3]
    for (const s of slots) {
      const t = this.timers.get(s)
      if (t !== undefined) {
        this.clearTimer(t)
        this.timers.delete(s)
      }
      if (!(await this.state.get(s)).enabled) continue
      this.lastTry.set(s, this.now())
      const outcome = await this.sync.sync(s)
      if (outcome === 'offline' || outcome === 'limited' || outcome === 'error') this.schedule(s, (await this.state.get(s)).failures)
    }
  }

  stop(): void {
    for (const t of this.timers.values()) this.clearTimer(t)
    this.timers.clear()
  }
}
