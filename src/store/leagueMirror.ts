/**
 * O espelho da liga no aparelho (Fase 6C, C2): guarda o `MirrorState`, sincroniza com o servidor (atualização por revisão; carga completa em páginas
 * quando preciso) e aplica os comandos do técnico **na hora**, com a mesma função do servidor (`applyCommand`); a resposta do servidor é a que vale.
 * Sem React, sem DOM e sem rede própria: o transporte entra por parâmetro, então os testes ligam isto direto à sala da liga.
 * Sem conexão o espelho continua legível e os comandos são recusados (`offline`): não há fila de comandos para depois (o relógio da liga andou).
 */
import { applyCommand, applyPayload, emptyMirror, toSeasonState } from '../engine/league'
import type { CommandError, CommandInfo, LeagueCommand, MirrorPayload, MirrorState } from '../engine/league'
import type { SeasonState } from '../engine/season'

export type TransportFailure = { ok: false; error: string; reason?: string; minimumSalary?: number }
export interface MirrorTransport {
  fetch(since: number | null, page: number): Promise<{ ok: true; payload: MirrorPayload } | TransportFailure>
  command(command: LeagueCommand, since: number | null): Promise<{ ok: true; payload: MirrorPayload; info?: CommandInfo } | TransportFailure>
}

export type Connection = 'online' | 'offline'
export type Outcome = { ok: true; info?: CommandInfo } | { ok: false; error: CommandError | 'offline' | 'no-mirror' | 'server'; minimumSalary?: number }

export class LeagueMirror {
  private state: MirrorState = emptyMirror()
  private optimistic?: SeasonState
  private built?: { source: MirrorState; season: SeasonState | undefined }
  private chain: Promise<unknown> = Promise.resolve()
  connection: Connection = 'online'
  /** Quantas cargas completas já foram baixadas (serve de prova nos testes). */
  fullLoads = 0

  constructor(
    private readonly transport: MirrorTransport,
    private readonly onChange: () => void = () => {},
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
    if (this.optimistic) return this.optimistic
    if (this.built?.source !== this.state) this.built = { source: this.state, season: toSeasonState(this.state) }
    return this.built.season
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
        this.setConnection(first.error === 'offline' ? 'offline' : this.connection)
        return false
      }
      this.setConnection('online')
      const p = first.payload
      if (!p.full) {
        this.state = applyPayload(this.state, p)
        this.optimistic = undefined
        this.onChange()
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
      this.optimistic = undefined
      this.onChange()
      // O mundo pode ter andado enquanto as páginas vinham: uma atualização curta fecha a diferença.
      const again = await this.transport.fetch(this.state.rev, 0)
      if (again.ok && !again.payload.full) this.state = applyPayload(this.state, again.payload)
      this.onChange()
      return true
    }
    return false
  }

  /** Aplica um comando do técnico: mostra o resultado na hora e confirma no servidor (o oficial corrige o local, se diferirem). */
  perform(command: LeagueCommand): Promise<Outcome> {
    return this.serial(async () => {
      const teamId = this.teamId
      const season = this.season()
      if (!teamId || !season) return { ok: false, error: 'no-mirror' }
      if (this.connection === 'offline') return { ok: false, error: 'offline' }
      const local = applyCommand(season, teamId, command, { humans: this.state.own?.humans ?? [] })
      // Recusado aqui, nem chega ao servidor (a regra é a mesma).
      if (!local.ok) return { ok: false, error: local.error, ...(local.minimumSalary !== undefined ? { minimumSalary: local.minimumSalary } : {}) }
      this.optimistic = local.world
      this.onChange()
      const r = await this.transport.command(command, this.state.rev)
      if (!r.ok) {
        this.optimistic = undefined
        if (r.error === 'offline') this.setConnection('offline')
        this.onChange()
        if (r.error === 'offline') return { ok: false, error: 'offline' }
        if (r.reason) return { ok: false, error: r.reason, ...(r.minimumSalary !== undefined ? { minimumSalary: r.minimumSalary } : {}) }
        return { ok: false, error: 'server' }
      }
      const info = r.info ?? local.info
      if (r.payload.full) {
        this.optimistic = undefined
        await this.syncNow()
        return { ok: true, ...(info ? { info } : {}) }
      }
      this.state = applyPayload(this.state, r.payload)
      this.optimistic = undefined
      this.onChange()
      return { ok: true, ...(info ? { info } : {}) }
    })
  }
}
