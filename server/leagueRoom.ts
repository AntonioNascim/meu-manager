/**
 * Sala de uma liga online: um Durable Object por liga (Fase 6, B7; proposta, seções 2.6, 2.8, 2.9 e 4.4).
 *
 * - O mundo vive no SQLite do objeto em blocos (`SqliteWorldStore`, B5) e o estado da liga e do evento ao vivo em linhas próprias. A memória é só
 *   cache: se o objeto for reiniciado ou despertar de uma hibernação, tudo é recarregado e as partidas ao vivo são refeitas pelo registro de comandos.
 * - Um alarme por minuto de jogo DURANTE um evento (e o próximo alarme da liga fora dele). Fora de eventos não há alarme por minuto e os WebSockets
 *   hibernam (API de hibernação: `ctx.acceptWebSocket`), que é o que mantém o custo baixo (proposta, seção 12).
 * - O cliente manda só comandos (`liveProtocol.ts`); o servidor simula com o mesmo motor e devolve quadros com o que mudou.
 * - Quem sai (fecha a conexão) passa à IA no minuto seguinte; ao voltar, retoma. Registros de reprodução ficam numa tabela e, se houver o bucket
 *   `REPLAYS`, também no R2.
 *
 * A autenticação NÃO é feita aqui: o Worker da frente confere a assinatura e repassa o `playerId` no cabeçalho `x-player-id` (B8 liga as rotas públicas;
 * os testes locais usam um Worker de laboratório). Estruturas do Cloudflare entram como tipos mínimos para não depender de pacote de tipos.
 */
import {
  addSeat,
  advanceLeague,
  defaultLeagueConfig,
  DEFAULT_CONFIG,
  bandOf,
  dropLeavingSeats,
  removeSeat,
  startLeague,
  enqueueCommand,
  finishLiveEvent,
  isFinished,
  liveMinuteMs,
  nextMinuteAt,
  nextWakeup,
  pauseLeague,
  pauseLiveEvent,
  processLeague,
  rebuildLiveEvent,
  replayOf,
  resumeLeague,
  resumeLiveEvent,
  setConnected,
  setReady,
  setPlayerReady,
  leagueView,
  replanForPace,
  PACES,
  startLiveEvent,
  stepLiveEvent,
  toStored,
  viewOf,
  type LeagueState,
  type PaceId,
  type LiveEvent,
  type ReplayRecord,
  type StoredLiveEvent,
} from '../src/engine/league'
import type { SeasonState } from '../src/engine/season'
import { turnRunner } from '../src/store/game'
import { createLeagueWorld } from '../src/store/leagueWorld'
import type { LeagueRecord } from '../src/online/leagueApi'
import type { DataPackage } from '../src/data/package/types'
import { SqliteWorldStore, type WorldSql } from '../src/store/worldStore'
import { frameSince, makeStoredReplay, parseClientMessage, replayKey, type Cursor, type ServerMessage } from '../src/online/liveProtocol'
import { fingerprintResult } from '../src/online/liveProtocol'

/** Versão do motor registrada nos replays (aumente quando o motor de partida mudar de resultado). */
export const ENGINE_VERSION = 'b7-1'

/** No máximo isto de comandos por técnico a cada 10 s (limite final: B9). */
const COMMANDS_PER_WINDOW = 12
const COMMAND_WINDOW_MS = 10_000

interface SocketLike {
  send(data: string): void
  close(code?: number, reason?: string): void
  readyState: number
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}
interface RoomCtx {
  storage: {
    sql: { exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] }; databaseSize?: number }
    transactionSync<T>(fn: () => T): T
    setAlarm(at: number): Promise<void>
    getAlarm(): Promise<number | null>
    deleteAlarm(): Promise<void>
    deleteAll(): Promise<void>
  }
  acceptWebSocket(ws: SocketLike, tags?: string[]): void
  getWebSockets(tag?: string): SocketLike[]
}
interface RoomEnv {
  /** Bucket dos pacotes de dados (`meu-manager-pacotes`): o mundo real de uma liga é lido dele. */
  PACKAGES?: { get(key: string): Promise<{ body: ReadableStream } | null> }
  /** Bucket opcional dos registros de reprodução (`meu-manager-replays`). */
  REPLAYS?: { put(key: string, value: string): Promise<unknown> }
}

export interface RoomMeta {
  /** A liga como o índice a conhece (nome, ritmo, faixa, mundo...). Ausente em salas de laboratório. */
  record?: LeagueRecord
  leagueId: string
  /** Aberta ou só para amigos (muda a regra de vaga aberta). */
  kind: 'open' | 'friends'
  /** Tempo real de cada minuto de jogo; sem ele vale o do ritmo da liga. */
  minuteMs?: number
  createdAt: number
}

export class LeagueRoom {
  protected sql: RoomCtx['storage']['sql']
  protected store: SqliteWorldStore
  protected league?: LeagueState
  protected world?: SeasonState
  protected live?: LiveEvent
  protected meta?: RoomMeta
  private cursor: Cursor = {}
  private inputSaved = new Set<string>()
  private cmdsSaved = new Map<string, number>()
  private recent = new Map<string, number[]>()
  /** Quantas vezes esta instância foi criada (sobe a cada reinício; serve de prova nos testes). */
  readonly boot: number

  constructor(
    protected ctx: RoomCtx,
    protected env: RoomEnv = {},
  ) {
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID')
    this.sql.exec('CREATE TABLE IF NOT EXISTS replays (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID')
    const wsql: WorldSql = { exec: (q: string, ...b: unknown[]) => this.sql.exec(q, ...b), transaction: <T>(fn: () => T): T => ctx.storage.transactionSync(fn) }
    this.store = new SqliteWorldStore(wsql)
    this.boot = Number(this.get('boot') ?? 0) + 1
    this.set('boot', String(this.boot))
  }

  // ------------------------------------------------------------ armazenamento
  protected get(k: string): string | undefined {
    const row = this.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray()[0]
    return row ? String(row.v) : undefined
  }
  protected set(k: string, v: string): void {
    this.sql.exec('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', k, v)
  }
  protected del(prefix: string): void {
    this.sql.exec('DELETE FROM kv WHERE k LIKE ?', `${prefix}%`)
  }

  /** Recarrega da memória persistente o que faltar (objeto novo, reinício ou despertar). */
  protected ensureLoaded(): boolean {
    return this.ensureWorld() && this.league !== undefined
  }

  /** Carrega a sala (mundo e, se a liga já começou, o estado dela). Numa liga ainda no saguão não há `league`. */
  protected ensureWorld(): boolean {
    if (this.world && this.meta && (this.league || this.get('league') === undefined)) return true
    const meta = this.get('meta')
    if (!meta) return false
    const world = this.world ?? this.store.load()
    if (!world) return false
    this.meta = JSON.parse(meta) as RoomMeta
    const league = this.get('league')
    if (league) this.league = JSON.parse(league) as LeagueState
    this.world = world
    this.cursor = JSON.parse(this.get('cursor') ?? '{}') as Cursor
    const liveMeta = this.get('live')
    if (liveMeta && !this.live) this.live = this.loadLive(JSON.parse(liveMeta) as Omit<StoredLiveEvent, 'games'> & { games: { matchId: string; clock: number }[] })
    return true
  }

  private loadLive(m: Omit<StoredLiveEvent, 'games'> & { games: { matchId: string; clock: number }[] }): LiveEvent {
    const games = m.games.map((g) => {
      const input = JSON.parse(this.get(`in:${g.matchId}`) as string)
      const commands = JSON.parse(this.get(`cmds:${g.matchId}`) ?? '[]')
      this.inputSaved.add(g.matchId)
      this.cmdsSaved.set(g.matchId, commands.length)
      return { version: 1 as const, matchId: g.matchId, input, commands, clock: g.clock }
    })
    return rebuildLiveEvent({ ...m, games })
  }

  /** Grava o estado da liga e do evento ao vivo. O mundo só quando mudou (`world`): o `SqliteWorldStore` escreve só os blocos alterados. */
  protected persist(opts: { world?: boolean } = {}): void {
    this.ctx.storage.transactionSync(() => {
      if (this.league) this.set('league', JSON.stringify(this.league))
      this.set('cursor', JSON.stringify(this.cursor))
      if (this.live) {
        const stored = toStored(this.live)
        for (const g of stored.games) {
          if (!this.inputSaved.has(g.matchId)) {
            this.set(`in:${g.matchId}`, JSON.stringify(g.input))
            this.inputSaved.add(g.matchId)
          }
          if (this.cmdsSaved.get(g.matchId) !== g.commands.length) {
            this.set(`cmds:${g.matchId}`, JSON.stringify(g.commands))
            this.cmdsSaved.set(g.matchId, g.commands.length)
          }
        }
        this.set('live', JSON.stringify({ ...stored, games: stored.games.map((g) => ({ matchId: g.matchId, clock: g.clock })) }))
      } else {
        this.sql.exec("DELETE FROM kv WHERE k = 'live'")
        this.del('in:')
        this.del('cmds:')
        this.inputSaved.clear()
        this.cmdsSaved.clear()
      }
      if (opts.world && this.world) this.store.save(this.world)
    })
  }

  /** Cria a sala com o mundo e a liga prontos (B8 faz isto pelo fluxo de "Criar liga"). */
  protected create(meta: RoomMeta, league: LeagueState | undefined, world: SeasonState): void {
    this.meta = meta
    this.league = league
    this.world = world
    this.live = undefined
    this.cursor = {}
    this.set('meta', JSON.stringify(meta))
    this.persist({ world: true })
  }

  // --------------------------------------------------------------------- relógio
  protected now(): number {
    return Date.now()
  }

  private connectedPlayers(except?: SocketLike): string[] {
    const out = new Set<string>()
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState > 1) continue
      const att = ws.deserializeAttachment() as { playerId?: string } | null
      if (att?.playerId) out.add(att.playerId)
    }
    return [...out]
  }

  private broadcast(message: ServerMessage, only?: SocketLike): void {
    const text = JSON.stringify(message)
    for (const ws of only ? [only] : this.ctx.getWebSockets()) {
      try {
        if (ws.readyState === 1) ws.send(text)
      } catch {
        /* conexão já caiu; webSocketClose cuida */
      }
    }
  }

  /**
   * Faz tudo o que está devido em `now`: passagem diária, início do evento, minutos de jogo, fim do evento e o próximo evento. Idempotente.
   * Devolve quando deve ser acordado de novo.
   */
  protected async run(): Promise<void> {
    if (!this.ensureLoaded()) return
    const now = this.now()
    const league0 = this.league as LeagueState
    let worldChanged = false
    for (let guard = 0; guard < 400; guard++) {
      if (!this.live) {
        const before = this.league as LeagueState
        const stepped = processLeague(before, this.world as SeasonState, now, { turn: turnRunner })
        worldChanged ||= stepped.world !== this.world
        this.league = stepped.league
        this.world = stepped.world
        if (!stepped.league.current) break
        // Evento ao vivo: abre as partidas dos técnicos (resultado direto já terminou dentro de processLeague).
        this.live = startLiveEvent(stepped.league, stepped.world, now, this.minuteMs(), this.connectedPlayers())
        this.cursor = {}
      }
      const live = this.live as LiveEvent
      const step = stepLiveEvent(live, (this.league as LeagueState).seats, now)
      this.live = step.event
      if (step.outcomes.length > 0) this.sendOutcomes(step.outcomes)
      if (step.event.clock > live.clock || Object.keys(this.cursor).length === 0) this.sendFrame()
      if (!isFinished(step.event)) break
      await this.finishEvent(now)
      worldChanged = true
    }
    this.persist({ world: worldChanged || this.league !== league0 })
    await this.schedule(now)
  }

  private minuteMs(): number {
    const league = this.league as LeagueState
    return this.meta?.minuteMs ?? liveMinuteMs(league.config.clock.pace)
  }

  private sendFrame(): void {
    if (!this.live || !this.league) return
    const { frame, cursor } = frameSince(this.live, viewOf(this.live, this.league.seats), this.cursor)
    this.cursor = cursor
    this.broadcast(frame)
  }

  private sendOutcomes(outcomes: import('../src/engine/league').CommandOutcome[]): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as { playerId?: string } | null
      const mine = outcomes.filter((o) => o.playerId === att?.playerId)
      if (mine.length > 0 && ws.readyState === 1) ws.send(JSON.stringify({ t: 'result', outcomes: mine } satisfies ServerMessage))
    }
  }

  private async finishEvent(now: number): Promise<void> {
    const live = this.live as LiveEvent
    const league = this.league as LeagueState
    const meta = this.meta as RoomMeta
    const done = finishLiveEvent({ league, world: this.world as SeasonState, actions: [] }, live, now, meta.kind, () => meta.createdAt)
    // Registros de reprodução: o replay e a impressão digital do resultado entregue.
    for (const [i, replay] of done.replays.entries()) {
      const game = live.games[i]!
      const stored = makeStoredReplay(replay as ReplayRecord, game.live.result(), ENGINE_VERSION)
      const key = replayKey(meta.leagueId, live.date, game.matchId)
      const text = JSON.stringify(stored)
      this.sql.exec('INSERT OR REPLACE INTO replays (k, v) VALUES (?, ?)', key, text)
      if (this.env.REPLAYS) await this.env.REPLAYS.put(key, text)
    }
    this.sendFrame()
    this.broadcast({ t: 'end' })
    const notices = JSON.parse(this.get('notices') ?? '[]') as unknown[]
    for (const s of done.newLongAutopilot) notices.push({ at: now, type: 'long-autopilot', playerId: s.playerId, teamId: s.teamId })
    for (const s of done.vacated) notices.push({ at: now, type: meta.kind === 'open' ? 'vacancy-opened' : 'suggest-remove', playerId: s.playerId, teamId: s.teamId })
    this.set('notices', JSON.stringify(notices.slice(-50)))
    this.world = done.stepped.world
    // Quem pediu para sair no meio do evento fecha a vaga agora.
    this.league = dropLeavingSeats(done.stepped.league, this.world)
    this.live = undefined
    this.cursor = {}
  }

  private async schedule(now: number): Promise<void> {
    const league = this.league as LeagueState
    let at: number | undefined
    if (this.live) at = nextMinuteAt(this.live, now)
    else at = nextWakeup(league, now)
    if (at === undefined) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(Math.max(at, now + 25))
  }

  async alarm(): Promise<void> {
    await this.run()
  }

  // --------------------------------------------------------------- WebSocket
  protected async upgrade(req: Request): Promise<Response> {
    const playerId = req.headers.get('x-player-id')
    if (!playerId || !this.ensureLoaded()) return new Response('not found', { status: 404 })
    if (!(this.league as LeagueState).seats.some((s) => s.playerId === playerId)) return new Response('forbidden', { status: 403 })
    const Pair = (globalThis as unknown as { WebSocketPair: new () => { 0: SocketLike; 1: SocketLike } }).WebSocketPair
    const pair = new Pair()
    this.ctx.acceptWebSocket(pair[1], [playerId])
    pair[1].serializeAttachment({ playerId })
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit)
  }

  async webSocketMessage(ws: SocketLike, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string') return ws.send(JSON.stringify({ t: 'error', problem: 'bad-shape' } satisfies ServerMessage))
    const parsed = parseClientMessage(data)
    if (!parsed.ok) return ws.send(JSON.stringify({ t: 'error', problem: parsed.problem } satisfies ServerMessage))
    if (!this.ensureLoaded()) return
    const playerId = (ws.deserializeAttachment() as { playerId: string }).playerId
    const msg = parsed.message
    const now = this.now()
    if (msg.t === 'ping') return ws.send(JSON.stringify({ t: 'pong' } satisfies ServerMessage))
    if (msg.t === 'hello') {
      // Chegou ou voltou: avisa o motor (retoma no minuto seguinte) e manda tudo o que ele pode ter perdido.
      if (this.live) {
        this.live = setConnected(this.live, (this.league as LeagueState).seats, playerId, true)
        this.persist()
        ws.send(JSON.stringify({ t: 'full', minute: this.live.clock, paused: this.live.pausedAt !== undefined, games: viewOf(this.live, (this.league as LeagueState).seats) } satisfies ServerMessage))
      } else ws.send(JSON.stringify({ t: 'error', problem: 'not-in-event' } satisfies ServerMessage))
      return
    }
    // cmd
    const hits = (this.recent.get(playerId) ?? []).filter((t) => now - t < COMMAND_WINDOW_MS)
    if (hits.length >= COMMANDS_PER_WINDOW) return ws.send(JSON.stringify({ t: 'error', problem: 'rate-limited' } satisfies ServerMessage))
    this.recent.set(playerId, [...hits, now])
    if (!this.live) return ws.send(JSON.stringify({ t: 'error', problem: 'not-in-event' } satisfies ServerMessage))
    const queued = enqueueCommand(this.live, (this.league as LeagueState).seats, playerId, msg.id, msg.command, now)
    this.live = queued.event
    if (queued.outcome) ws.send(JSON.stringify({ t: 'result', outcomes: [queued.outcome] } satisfies ServerMessage))
    else this.persist()
  }

  async webSocketClose(ws: SocketLike): Promise<void> {
    await this.dropped(ws)
  }
  async webSocketError(ws: SocketLike): Promise<void> {
    await this.dropped(ws)
  }

  private async dropped(ws: SocketLike): Promise<void> {
    if (!this.ensureLoaded() || !this.live) return
    const att = ws.deserializeAttachment() as { playerId?: string } | null
    if (!att?.playerId) return
    // Só cai de verdade se não restou outra conexão do mesmo técnico.
    if (this.connectedPlayers(ws).includes(att.playerId)) return
    this.live = setConnected(this.live, (this.league as LeagueState).seats, att.playerId, false)
    this.persist()
  }

  // ----------------------------------------------------------- rotas internas
  /** Ações do ADM e consultas (o Worker da frente confere quem pode). */
  protected async admin(path: string, body: Record<string, unknown>): Promise<Response> {
    if (!this.ensureLoaded()) return Response.json({ error: 'not-created' }, { status: 404 })
    const now = this.now()
    const league = this.league as LeagueState
    if (path === '/admin/ready-all') {
      this.league = league.seats.reduce((l, s) => setReady(l, s.playerId, true), league)
      this.persist()
      await this.run()
    } else if (path === '/admin/advance') {
      const stepped = advanceLeague(league, this.world as SeasonState, now, { turn: turnRunner }, String(body.by ?? 'adm'))
      this.league = stepped.league
      this.world = stepped.world
      this.persist({ world: true })
      await this.run()
    } else if (path === '/admin/pause') {
      this.league = pauseLeague(league, now, String(body.by ?? 'adm'))
      if (this.live) this.live = pauseLiveEvent(this.live, now)
      this.persist()
      this.broadcast({ t: 'paused', minute: this.live?.clock ?? 0 })
      await this.schedule(now)
    } else if (path === '/admin/resume') {
      this.league = resumeLeague(league, this.world as SeasonState, now, String(body.by ?? 'adm'))
      if (this.live) this.live = resumeLiveEvent(this.live, now)
      this.persist()
      this.broadcast({ t: 'resumed', minute: this.live?.clock ?? 0 })
      await this.run()
    } else if (path === '/admin/run') {
      await this.run()
    } else if (path !== '/admin/info') return Response.json({ error: 'not-found' }, { status: 404 })
    return Response.json(this.info())
  }

  protected info() {
    const league = this.league
    return {
      boot: this.boot,
      date: this.world?.season.currentDate,
      current: league?.current ? { date: league.current.date, pending: league.current.pending.length, all: league.current.all.length } : null,
      live: this.live ? { clock: this.live.clock, paused: this.live.pausedAt !== undefined, games: this.live.games.length, connected: this.live.connected, present: this.live.present, queue: this.live.queue.length } : null,
      seats: league?.seats.map((s) => ({ playerId: s.playerId, status: s.status, missed: s.missed ?? 0 })),
      sockets: this.ctx.getWebSockets().length,
      replays: Number(this.sql.exec('SELECT COUNT(*) AS n FROM replays').toArray()[0]?.n ?? 0),
      notices: JSON.parse(this.get('notices') ?? '[]') as unknown[],
    }
  }

  /** Registros de reprodução guardados (chaves e impressão digital) e o registro de uma partida. */
  protected replays(key?: string): Response {
    if (key) {
      const row = this.sql.exec('SELECT v FROM replays WHERE k = ?', key).toArray()[0]
      return row ? new Response(String(row.v), { headers: { 'Content-Type': 'application/json' } }) : Response.json({ error: 'not-found' }, { status: 404 })
    }
    return Response.json(this.sql.exec('SELECT k FROM replays ORDER BY k').toArray().map((r) => String(r.k)))
  }

  // ------------------------------------------------------- vagas e saguão (B8.3)
  private lobby(): { playerId: string; teamId: string }[] {
    return JSON.parse(this.get('lobby') ?? '[]') as { playerId: string; teamId: string }[]
  }

  /** Monta o mundo da liga: o fictício nasce da semente; o real é lido do bucket dos pacotes (versão fixada na criação da liga). */
  protected async buildWorld(record: LeagueRecord): Promise<SeasonState | 'bad-world'> {
    if (record.world.source === 'ficticio') return createLeagueWorld(record.seed)
    const object = await this.env.PACKAGES?.get(`mundo-real/${record.world.version}/pacote.json.gz`)
    if (!object) return 'bad-world'
    const text = await new Response(object.body.pipeThrough(new DecompressionStream('gzip'))).text()
    return createLeagueWorld(record.seed, JSON.parse(text) as DataPackage)
  }

  /** Pedidos do Worker da frente (só ele alcança o objeto): criar a sala, entrar, sair, iniciar e apagar. */
  protected async internal(path: string, body: Record<string, unknown>): Promise<Response> {
    const now = this.now()
    const ok = () => Response.json({ ok: true })
    const no = (error: string, status = 200) => Response.json({ ok: false, error }, { status })
    if (path === '/internal/init') {
      const record = body as unknown as LeagueRecord
      const world = await this.buildWorld(record)
      if (world === 'bad-world') return no('bad-world')
      this.league = undefined
      this.live = undefined
      this.world = world
      this.create({ record, leagueId: record.id, kind: record.kind, createdAt: now }, undefined, world)
      this.set('lobby', '[]')
      return ok()
    }
    if (path === '/internal/destroy') {
      await this.ctx.storage.deleteAlarm()
      await this.ctx.storage.deleteAll()
      this.league = undefined
      this.world = undefined
      this.meta = undefined
      this.live = undefined
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'liga encerrada')
      return ok()
    }
    if (!this.ensureWorld()) return no('not-found', 404)
    const world = this.world as SeasonState
    const meta = this.meta as RoomMeta
    const playerId = String(body.playerId ?? '')
    if (path === '/internal/seat/add') {
      const teamId = String(body.teamId ?? '')
      if (this.league) {
        const res = addSeat(this.league, world, playerId, teamId, now)
        if (!res.ok) return no(res.error)
        this.league = res.league
        this.persist()
        await this.schedule(now)
        return ok()
      }
      const members = this.lobby()
      if (!world.teams.some((t) => t.id === teamId)) return no('unknown-team')
      if (members.some((m) => m.playerId === playerId)) return no('already-seated')
      if (members.some((m) => m.teamId === teamId)) return no('team-taken')
      this.set('lobby', JSON.stringify([...members, { playerId, teamId }]))
      return ok()
    }
    if (path === '/internal/seat/remove') {
      if (this.league) {
        const res = removeSeat(this.league, world, playerId)
        if (!res.ok) return no(res.error)
        this.league = res.league
        this.persist()
        await this.schedule(now)
        return ok()
      }
      this.set('lobby', JSON.stringify(this.lobby().filter((m) => m.playerId !== playerId)))
      return ok()
    }
    // ---- andamento da liga (B8.4)
    if (path === '/internal/state') {
      if (!this.league) return Response.json({ ok: true, phase: 'lobby' })
      return Response.json({ ok: true, phase: 'running', view: leagueView(this.league, world, now, () => meta.createdAt) })
    }
    if (path === '/internal/ready') {
      if (!this.league) return no('bad-state')
      if (!this.league.seats.some((x) => x.playerId === playerId)) return no('not-seated')
      if (this.league.current) return no('bad-state')
      this.league = setPlayerReady(this.league, playerId, body.ready === true, now)
      this.persist()
      await this.run()
      return ok()
    }
    if (path === '/internal/advance' || path === '/internal/pause' || path === '/internal/resume') {
      const l = this.league
      if (!l) return no('bad-state')
      const paused = l.clock.pausedAt !== undefined
      if (path === '/internal/advance' && (paused || l.current || l.clock.events.length === 0)) return no('bad-state')
      if (path === '/internal/pause' && paused) return no('bad-state')
      if (path === '/internal/resume' && !paused) return no('bad-state')
      await this.admin(path.replace('/internal', '/admin'), { by: String(body.by ?? 'adm') })
      return ok()
    }
    if (path === '/internal/pace') {
      const l = this.league
      const pace = String(body.pace ?? '') as PaceId
      if (!l || !(pace in PACES) || l.current) return no('bad-state')
      this.league = replanForPace(l, world, pace)
      if (meta.record) {
        this.meta = { ...meta, record: { ...meta.record, pace } }
        this.set('meta', JSON.stringify(this.meta))
      }
      this.persist()
      await this.schedule(now)
      return ok()
    }
    if (path === '/internal/start') {
      if (this.league || !meta.record) return no('bad-state')
      const r = meta.record
      this.league = startLeague(defaultLeagueConfig({ ...DEFAULT_CONFIG(r.id), pace: r.pace, band: bandOf(r.band), tzOffsetMin: r.tzOffsetMin }, r.directResult), world, this.lobby(), now)
      this.persist({ world: true })
      await this.run()
      return ok()
    }
    return no('not-found', 404)
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    try {
      if (url.pathname.startsWith('/internal/') && req.method === 'POST') return await this.internal(url.pathname, (await req.json().catch(() => ({}))) as Record<string, unknown>)
      if (url.pathname === '/ws' && req.headers.get('Upgrade') === 'websocket') return await this.upgrade(req)
      if (url.pathname === '/replays') return this.replays(url.searchParams.get('key') ?? undefined)
      if (url.pathname.startsWith('/admin/')) return await this.admin(url.pathname, req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {})
      return new Response('not found', { status: 404 })
    } catch (e) {
      return new Response(String((e as Error)?.stack ?? e), { status: 500 })
    }
  }
}

export { fingerprintResult, replayOf }
