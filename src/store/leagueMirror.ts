/**
 * O espelho da liga no aparelho (Fase 6C, C2): guarda o `MirrorState`, sincroniza com o servidor (atualização por revisão; carga completa em páginas
 * quando preciso) e aplica os comandos do técnico **na hora**, com a mesma função do servidor (`applyCommand`); a resposta do servidor é a que vale.
 * Sem React, sem DOM e sem rede própria: o transporte entra por parâmetro, então os testes ligam isto direto à sala da liga.
 * Sem conexão o espelho continua legível e os comandos são recusados (`offline`): não há fila de comandos para depois (o relógio da liga andou).
 */
import { applyCommand, applyPayload, emptyMirror, toSeasonState } from '../engine/league'
import type { CommandError, CommandInfo, LeagueCommand, MirrorPayload, MirrorState } from '../engine/league'
import type { SeasonState } from '../engine/season'
import type { TeamDetail } from '../engine/league/career'

export type TransportFailure = { ok: false; error: string; reason?: string; minimumSalary?: number }
export interface MirrorTransport {
  fetch(since: number | null, page: number): Promise<{ ok: true; payload: MirrorPayload } | TransportFailure>
  command(command: LeagueCommand, since: number | null): Promise<{ ok: true; payload: MirrorPayload; info?: CommandInfo } | TransportFailure>
  /** Detalhe ao tocar: a condição real do elenco de um clube e a tática dele. */
  detail?(teamId: string): Promise<{ ok: true; detail: TeamDetail } | TransportFailure>
}

export type Connection = 'online' | 'offline'
export type Outcome = { ok: true; info?: CommandInfo } | { ok: false; error: CommandError | 'offline' | 'no-mirror' | 'server'; minimumSalary?: number }

/** Respostas do servidor que a tela sabe explicar (qualquer outra vira "o servidor não respondeu"). */
const KNOWN_SERVER_ERRORS = new Set(['bad-body', 'rate-limited', 'week-pending', 'bad-state', 'forbidden', 'not-seated', 'unauthorized', 'unknown-identity'])

/** Um comando à espera de ir ao servidor (ou a caminho dele). */
interface Job {
  command: LeagueCommand
  started: boolean
  info?: CommandInfo
  waiters: ((outcome: Outcome) => void)[]
}

/**
 * Espera antes de mandar uma tática: arrastos seguidos nesse tempo viram um comando só (vale o último). A espera recomeça a cada arrasto novo, até
 * `TACTIC_DEBOUNCE_MAX_MS` desde o primeiro. A tela já mostra tudo na hora, então a espera não aparece para o técnico.
 */
export const TACTIC_DEBOUNCE_MS = 600
export const TACTIC_DEBOUNCE_MAX_MS = 3000

export class LeagueMirror {
  private state: MirrorState = emptyMirror()
  private optimistic?: SeasonState
  /** Comandos aceitos aqui e ainda não confirmados pelo servidor, na ordem. A tela mostra o resultado de todos eles na hora. */
  private jobs: Job[] = []
  private debounceTimer?: ReturnType<typeof setTimeout>
  private debounceResolve?: () => void
  private debounceStart = 0
  private built?: { source: MirrorState; season: SeasonState | undefined }
  private chain: Promise<unknown> = Promise.resolve()
  connection: Connection = 'online'
  /** Quantas cargas completas já foram baixadas (serve de prova nos testes). */
  fullLoads = 0
  /** O motivo da última falha de sincronização (por exemplo `not-seated`: o técnico perdeu o clube). */
  lastError?: string
  /** Condição real e tática de clubes que o técnico abriu (detalhe ao tocar), com a revisão em que vieram. */
  private details = new Map<string, TeamDetail & { rev: number }>()
  private detailVersion = 0
  private overlaid?: { base: SeasonState; version: number; season: SeasonState }
  /** Guarda o espelho no aparelho (a sessão liga isto ao IndexedDB). */
  persist?: (state: MirrorState) => void

  constructor(
    private readonly transport: MirrorTransport,
    private readonly onChange: () => void = () => {},
    private readonly tacticDebounceMs: number = TACTIC_DEBOUNCE_MS,
  ) {}

  get rev(): number {
    return this.state.rev
  }
  get humans(): string[] | undefined {
    return this.state.own?.humans
  }
  get teamId(): string | undefined {
    return this.state.own?.teamId
  }

  /** O mundo que as telas leem: o da resposta mais recente do servidor ou, enquanto um comando espera, o que o comando já mudou. */
  season(): SeasonState | undefined {
    return this.optimistic ?? this.confirmedSeason()
  }

  /** O mundo como o servidor confirmou (mais o detalhe dos clubes abertos), sem os comandos que ainda esperam. */
  private confirmedSeason(): SeasonState | undefined {
    if (this.built?.source !== this.state) this.built = { source: this.state, season: toSeasonState(this.state) }
    const base = this.built.season
    if (!base || this.details.size === 0) return base
    if (this.overlaid?.base !== base || this.overlaid.version !== this.detailVersion) this.overlaid = { base, version: this.detailVersion, season: this.withDetails(base) }
    return this.overlaid.season
  }

  /** Põe a condição real (e a tática) dos clubes abertos por cima do que o espelho tem de neutro. */
  private withDetails(base: SeasonState): SeasonState {
    const conditions = new Map<string, TeamDetail['conditions'][string]>()
    for (const d of this.details.values()) for (const [id, c] of Object.entries(d.conditions)) conditions.set(id, c)
    return {
      ...base,
      players: base.players.map((p) => (conditions.has(p.id) ? { ...p, condition: conditions.get(p.id) as typeof p.condition } : p)),
      teams: base.teams.map((t) => (this.details.has(t.id) && t.id !== this.teamId ? { ...t, tactic: (this.details.get(t.id) as TeamDetail).tactic } : t)),
    }
  }

  /** Detalhe ao tocar: baixa a condição e a tática reais de um clube (uma vez por revisão do espelho). Devolve se algo mudou. */
  async loadDetail(teamId: string): Promise<boolean> {
    if (!this.transport.detail || teamId === this.teamId) return false
    if (this.details.get(teamId)?.rev === this.state.rev) return false
    const r = await this.transport.detail(teamId)
    if (!r.ok) return false
    this.details.set(teamId, { ...r.detail, rev: this.state.rev })
    this.detailVersion++
    this.onChange()
    return true
  }

  /** O espelho guardado no aparelho (para abrir a liga sem baixar tudo e para ler sem internet). */
  snapshotState(): MirrorState {
    return this.state
  }
  restore(state: MirrorState): void {
    this.state = state
    this.onChange()
  }

  private serial<T>(job: () => Promise<T>): Promise<T> {
    const next = this.chain.then(job, job)
    this.chain = next.catch(() => undefined)
    return next
  }

  private setConnection(c: Connection): void {
    if (this.connection === c) return
    this.connection = c
    this.onChange()
  }

  /** Busca a atualização desde a revisão que o aparelho tem (ou a carga completa, na primeira vez ou quando a revisão ficou antiga). */
  sync(): Promise<boolean> {
    return this.serial(() => this.syncNow())
  }

  private async syncNow(): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const since = this.state.rev >= 0 ? this.state.rev : null
      const first = await this.transport.fetch(since, 0)
      if (!first.ok) {
        this.lastError = first.error
        this.setConnection(first.error === 'offline' ? 'offline' : this.connection)
        return false
      }
      this.lastError = undefined
      this.setConnection('online')
      const p = first.payload
      if (!p.full) {
        this.state = applyPayload(this.state, p)
        this.refreshOptimistic()
        this.onChange()
        this.persist?.(this.state)
        return true
      }
      // Carga completa: monta num espelho à parte e troca só no fim (as telas nunca veem o mundo pela metade).
      let staging = applyPayload(emptyMirror(), p)
      for (let page = 1; page < (p.pages ?? 1); page++) {
        const next = await this.transport.fetch(null, page)
        if (!next.ok) {
          this.setConnection(next.error === 'offline' ? 'offline' : this.connection)
          return false
        }
        staging = applyPayload(staging, next.payload)
      }
      this.fullLoads++
      this.state = { ...staging, rev: p.rev }
      this.refreshOptimistic()
      this.onChange()
      // O mundo pode ter andado enquanto as páginas vinham: uma atualização curta fecha a diferença.
      const again = await this.transport.fetch(this.state.rev, 0)
      if (again.ok && !again.payload.full) this.state = applyPayload(this.state, again.payload)
      this.onChange()
      this.persist?.(this.state)
      return true
    }
    return false
  }

  /** Refaz o que a tela mostra: o mundo confirmado com todos os comandos que ainda esperam o servidor aplicados por cima, na ordem. */
  private refreshOptimistic(): void {
    if (this.jobs.length === 0) {
      this.optimistic = undefined
      return
    }
    let world = this.confirmedSeason()
    const teamId = this.teamId
    if (!world || !teamId) {
      this.optimistic = undefined
      return
    }
    for (const job of this.jobs) {
      const r = applyCommand(world, teamId, job.command, { humans: this.state.own?.humans ?? [] })
      if (r.ok) world = r.world
    }
    this.optimistic = world
  }

  /**
   * Aplica um comando do técnico: a tela mostra o resultado na hora (também dos que esperam a vez) e o servidor confirma depois (o oficial corrige o
   * local, se diferirem). Várias mudanças de tática seguidas, antes de a anterior sair, viram um comando só: vale a última. Só devolve erro se o
   * servidor realmente recusar, com o motivo.
   */
  perform(command: LeagueCommand): Promise<Outcome> {
    return new Promise<Outcome>((resolve) => {
      const teamId = this.teamId
      const season = this.season()
      if (!teamId || !season) return resolve({ ok: false, error: 'no-mirror' })
      if (this.connection === 'offline') return resolve({ ok: false, error: 'offline' })
      const local = applyCommand(season, teamId, command, { humans: this.state.own?.humans ?? [] })
      // Recusado aqui, nem chega ao servidor (a regra é a mesma).
      if (!local.ok) return resolve({ ok: false, error: local.error, ...(local.minimumSalary !== undefined ? { minimumSalary: local.minimumSalary } : {}) })
      const last = this.jobs[this.jobs.length - 1]
      if (command.type === 'tactic' && last && !last.started && last.command.type === 'tactic') {
        last.command = command
        if (local.info) last.info = local.info
        last.waiters.push(resolve)
        this.bumpDebounce()
      } else {
        this.jobs.push({ command, started: false, ...(local.info ? { info: local.info } : {}), waiters: [resolve] })
      }
      this.refreshOptimistic()
      this.onChange()
      void this.serial(() => this.runNext())
    })
  }

  /** Manda ao servidor o próximo comando que ainda não saiu (quando o anterior terminou). */
  private async runNext(): Promise<void> {
    const job = this.jobs.find((j) => !j.started)
    if (!job) return
    // Tática: espera um instante para juntar os arrastos que vierem logo em seguida (eles trocam o comando, que ainda não saiu).
    if (job.command.type === 'tactic' && this.tacticDebounceMs > 0) await this.waitTactic()
    job.started = true
    const outcome = await this.send(job)
    this.jobs = this.jobs.filter((j) => j !== job)
    this.refreshOptimistic()
    this.onChange()
    for (const waiter of job.waiters) waiter(outcome)
  }

  private waitTactic(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.debounceStart = Date.now()
      this.debounceResolve = resolve
      this.debounceTimer = setTimeout(() => this.flush(), this.tacticDebounceMs)
    })
  }

  /** Um arrasto novo chegou antes de o anterior sair: a espera recomeça (até o limite). */
  private bumpDebounce(): void {
    if (!this.debounceResolve || Date.now() - this.debounceStart >= TACTIC_DEBOUNCE_MAX_MS) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.flush(), this.tacticDebounceMs)
  }

  /** Manda já o que espera a junção (a tela foi escondida ou fechada: não dá para esperar). */
  flush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = undefined
    const resolve = this.debounceResolve
    this.debounceResolve = undefined
    resolve?.()
  }

  private async send(job: Job): Promise<Outcome> {
    const r = await this.transport.command(job.command, this.state.rev)
    if (!r.ok) {
      if (r.error === 'offline') {
        this.setConnection('offline')
        return { ok: false, error: 'offline' }
      }
      if (r.reason) return { ok: false, error: r.reason, ...(r.minimumSalary !== undefined ? { minimumSalary: r.minimumSalary } : {}) }
      return { ok: false, error: KNOWN_SERVER_ERRORS.has(r.error) ? r.error : 'server' }
    }
    const info = r.info ?? job.info
    if (r.payload.full) await this.syncNow()
    else this.state = applyPayload(this.state, r.payload)
    return { ok: true, ...(info ? { info } : {}) }
  }
}
