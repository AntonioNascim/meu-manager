/**
 * API do Meu Manager (Fase 6). Liga as peças puras de `src/online` ao Cloudflare:
 *   POST /api/identity  cria (ou reconhece) a identidade — pedido assinado + Turnstile
 *   GET  /api/me        quem sou eu — pedido assinado
 *   GET/PUT/POST/DELETE /api/saves..., GET/DELETE /api/account...  saves na nuvem e conta (B4; ver src/online/cloudSaveApi.ts)
 *   /api/leagues...    ligas online (B8.3): criar, diretório, convite por código, entrar, sair, ADM (ver src/online/leagueApi.ts)
 *   GET  /packages/index.json e /packages/<id>/<versão>/pacote.json.gz   pacotes de dados (R2), públicos e sem assinatura
 * Limites e códigos de uso único ficam num Durable Object (`Guard`, em 8 fatias), porque a memória de um Worker some a cada reinício.
 * O endereço de quem pede é usado só no instante do pedido, para limitar abuso; nunca é gravado nem registrado.
 */
import { SqlGuard, type SqlLike } from '../src/online/guard'
import { changeNickname, cloudflareTurnstile, MAX_BODY_BYTES, registerIdentity, requireIdentity, type ApiDeps, type ApiRequest, type ApiResult } from '../src/online/identityApi'
import type { LimitAction, LimitResult, RateLimit } from '../src/online/rateLimit'
import type { NonceStore } from '../src/online/signedRequest'
import { bodyLimitFor, handleCloudRequest, isCloudPath, type CloudApiDeps } from '../src/online/cloudSaveApi'
import { type BlobStore, type ListedObject, type StoredObject } from '../src/online/cloudSave'
import { D1IdentityStore, type D1Like } from './d1Store'
import { D1LeagueStore } from './leagueStore'
import { LeagueRoom } from './leagueRoom'
import type { PaceId } from '../src/engine/league/pace'
import type { LeagueView } from '../src/engine/league/view'
import type { ClubAction, ClubError, ClubView } from '../src/engine/league/club'
import type { FreeAgentRow, SquadRow, TradeBody, TradeOffer } from '../src/engine/league/trade'
import type { BuyerRow, MineBody, PreRow } from '../src/engine/league/sellmarket'
import { fileReport, parseReport, type ModerationDeps } from '../src/online/moderation'
import { D1ModerationStore } from './moderationStore'
import { serveAdmin } from './admin'
import type { AiOffersBody, MarketRow } from '../src/engine/league/aimarket'
import type { CupsBody } from '../src/engine/league/cupsView'
import { adminAction, changePace, clubDecision, clubState, cupsState, parseSearchFilters, tradeAct, tradeRead, type TradeOp, type TradeActKind, type SaleOutcome, controlLeague, createLeague, getLeague, joinLeague, leagueState, leaveAllLeagues, leaveLeague, listOpenLeagues, liveTicket, myLeagues, resolveCode, setReady, type ControlAction, type AdminAction, type LeagueDeps, type LeagueRecord, type LeagueResult, type RoomFailure, type RoomPort } from '../src/online/leagueApi'

/** Pedaços do ambiente do Cloudflare que usamos. */
interface DurableObjectStubLike {
  fetch(url: string, init: { method?: string; body?: string; headers?: Record<string, string> }): Promise<Response>
}
/** O pedaço do R2 que usamos. */
interface R2Like {
  get(key: string): Promise<{ body: ReadableStream; size: number; httpEtag: string } | null>
}
/** O R2 completo que os saves usam (bucket privado `meu-manager-saves`: sem domínio público e sem r2.dev; só este Worker lê e grava). */
interface R2Full {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; etag: string; size: number; uploaded: Date } | null>
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } }): Promise<unknown | null>
  delete(keys: string | string[]): Promise<void>
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string; size: number; uploaded: Date }[]; truncated: boolean; cursor?: string }>
}
interface Env {
  DB: D1Like
  /** Bucket `meu-manager-pacotes`: um arquivo por versão (que nunca muda) e o `index.json`. */
  PACKAGES: R2Like
  /** Bucket `meu-manager-saves`: pedaços e manifestos dos saves (privado). */
  SAVES: R2Full
  GUARD: { idFromName(name: string): unknown; get(id: unknown): DurableObjectStubLike }
  /** Uma sala por liga (Durable Object `LeagueRoom`): dona do mundo e das vagas. */
  LEAGUES: { idFromName(name: string): unknown; get(id: unknown): DurableObjectStubLike }
  /** Segredo do Turnstile: guardado no painel do Cloudflare (Worker › Configurações › Variáveis e segredos), nunca no repositório. */
  TURNSTILE_SECRET?: string
  /** Segredo do painel de moderação (B9), também no painel do Cloudflare. Sem ele, `/admin` não existe. */
  ADMIN_TOKEN?: string
  ALLOWED_ORIGINS: string
}

/** Liga o R2 à interface que a lógica dos saves usa. Gravação condicional: o R2 devolve `null` quando o etag não é o esperado. */
function r2Blobs(bucket: R2Full): BlobStore {
  return {
    async get(key): Promise<StoredObject | null> {
      const object = await bucket.get(key)
      if (!object) return null
      return { bytes: new Uint8Array(await object.arrayBuffer()), etag: object.etag, size: object.size, uploaded: object.uploaded.getTime() }
    },
    async put(key, bytes, cond) {
      const onlyIf = cond?.ifMatch !== undefined ? { etagMatches: cond.ifMatch } : cond?.ifAbsent ? { etagDoesNotMatch: '*' } : undefined
      const result = await bucket.put(key, bytes, onlyIf ? { onlyIf } : undefined)
      return result !== null
    },
    async delete(keys) {
      for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000))
    },
    async list(prefix): Promise<ListedObject[]> {
      const out: ListedObject[] = []
      let cursor: string | undefined
      do {
        const page = await bucket.list({ prefix, cursor, limit: 1000 })
        for (const o of page.objects) out.push({ key: o.key, size: o.size, uploaded: o.uploaded.getTime() })
        cursor = page.truncated ? page.cursor : undefined
      } while (cursor)
      return out
    },
  }
}

const GUARD_SHARDS = 8

function shardOf(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % GUARD_SHARDS
}

/** Fala com o Durable Object que guarda limites e nonces da fatia daquela chave. */
class RemoteGuard implements RateLimit, NonceStore {
  constructor(private env: Env) {}

  private async call<T>(shardKey: string, body: unknown): Promise<T> {
    const stub = this.env.GUARD.get(this.env.GUARD.idFromName(`guard-${shardOf(shardKey)}`))
    const res = await stub.fetch('https://guard/', { method: 'POST', body: JSON.stringify(body) })
    return (await res.json()) as T
  }

  hit(action: LimitAction, key: string, now: number): Promise<LimitResult> {
    return this.call<LimitResult>(key, { op: 'hit', action, key, now })
  }

  async claim(playerId: string, nonce: string, ttlMs: number): Promise<boolean> {
    return (await this.call<{ ok: boolean }>(playerId, { op: 'claim', playerId, nonce, ttlMs })).ok
  }
}

/** Durable Object: um pedaço dos limites e nonces, em SQLite (sobrevive a reinícios). */
export class Guard {
  private guard: SqlGuard
  constructor(private state: { storage: { sql: SqlLike; getAlarm(): Promise<number | null>; setAlarm(at: number): Promise<void> } }) {
    this.guard = new SqlGuard(state.storage.sql)
  }

  /** Limpeza horária de contadores e nonces vencidos (os endereços de IP não ficam no disco além da janela mais longa, 24 h). */
  async alarm(): Promise<void> {
    if (this.guard.purge(Date.now()) > 0) await this.state.storage.setAlarm(Date.now() + 3_600_000)
  }

  async fetch(req: Request): Promise<Response> {
    const m = (await req.json()) as { op: string; action: LimitAction; key: string; now: number; playerId: string; nonce: string; ttlMs: number }
    if (m.op === 'hit') {
      const result = this.guard.hit(m.action, m.key, m.now)
      if ((await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(Date.now() + 3_600_000)
      return Response.json(result)
    }
    if (m.op === 'claim') return Response.json({ ok: this.guard.claim(m.playerId, m.nonce, m.ttlMs) })
    return new Response('bad op', { status: 400 })
  }
}

/** Fala com a sala de uma liga (só o Worker alcança o Durable Object). */
class DoRooms implements RoomPort {
  constructor(private env: Env) {}

  private async call(leagueId: string, path: string, body: unknown): Promise<{ ok: true } | { ok: false; error: RoomFailure }> {
    try {
      const stub = this.env.LEAGUES.get(this.env.LEAGUES.idFromName(leagueId))
      const res = await stub.fetch(`https://room${path}`, { method: 'POST', body: JSON.stringify(body) })
      const json = (await res.json()) as { ok: boolean; error?: RoomFailure }
      return json.ok ? { ok: true } : { ok: false, error: json.error ?? 'unavailable' }
    } catch {
      return { ok: false, error: 'unavailable' }
    }
  }
  init(league: LeagueRecord) {
    return this.call(league.id, '/internal/init', league)
  }
  addSeat(leagueId: string, playerId: string, teamId: string) {
    return this.call(leagueId, '/internal/seat/add', { playerId, teamId })
  }
  removeSeat(leagueId: string, playerId: string) {
    return this.call(leagueId, '/internal/seat/remove', { playerId })
  }
  start(leagueId: string) {
    return this.call(leagueId, '/internal/start', {})
  }
  async state(leagueId: string, playerId?: string) {
    try {
      const stub = this.env.LEAGUES.get(this.env.LEAGUES.idFromName(leagueId))
      const res = await stub.fetch('https://room/internal/state', { method: 'POST', body: JSON.stringify({ playerId: playerId ?? '' }) })
      const json = (await res.json()) as { ok: boolean; error?: RoomFailure; phase?: 'lobby' | 'running'; view?: LeagueView; awaiting?: number }
      return json.ok ? { ok: true as const, phase: json.phase ?? 'lobby', ...(json.view ? { view: json.view } : {}), ...(json.awaiting ? { awaiting: json.awaiting } : {}) } : { ok: false as const, error: json.error ?? 'unavailable' }
    } catch {
      return { ok: false as const, error: 'unavailable' as const }
    }
  }
  ready(leagueId: string, playerId: string, ready: boolean) {
    return this.call(leagueId, '/internal/ready', { playerId, ready })
  }
  control(leagueId: string, action: ControlAction, by: string) {
    return this.call(leagueId, `/internal/${action}`, { by })
  }
  setPace(leagueId: string, pace: PaceId) {
    return this.call(leagueId, '/internal/pace', { pace })
  }
  async cups(leagueId: string, playerId: string) {
    try {
      const stub = this.env.LEAGUES.get(this.env.LEAGUES.idFromName(leagueId))
      const res = await stub.fetch('https://room/internal/cups', { method: 'POST', body: JSON.stringify({ playerId }) })
      const json = (await res.json()) as { ok: boolean; error?: RoomFailure; cups?: CupsBody }
      return json.ok && json.cups ? { ok: true as const, cups: json.cups } : { ok: false as const, error: json.error ?? ('unavailable' as const) }
    } catch {
      return { ok: false as const, error: 'unavailable' as const }
    }
  }
  async trade(leagueId: string, playerId: string, op: TradeOp) {
    try {
      const stub = this.env.LEAGUES.get(this.env.LEAGUES.idFromName(leagueId))
      const res = await stub.fetch('https://room/internal/trade', { method: 'POST', body: JSON.stringify({ playerId, op }) })
      const json = (await res.json()) as { ok: boolean; error?: RoomFailure; refused?: string; minimumSalary?: number; body?: TradeBody; squad?: SquadRow[]; free?: FreeAgentRow[]; offer?: TradeOffer; rows?: MarketRow[]; ai?: AiOffersBody; mine?: MineBody; buyers?: BuyerRow[]; pre?: PreRow[]; sale?: SaleOutcome }
      if (json.ok) return { ok: true as const, ...(json.body ? { body: json.body } : {}), ...(json.squad ? { squad: json.squad } : {}), ...(json.free ? { free: json.free } : {}), ...(json.offer ? { offer: json.offer } : {}), ...(json.rows ? { rows: json.rows } : {}), ...(json.ai ? { ai: json.ai } : {}), ...(json.mine ? { mine: json.mine } : {}), ...(json.buyers ? { buyers: json.buyers } : {}), ...(json.pre ? { pre: json.pre } : {}), ...(json.sale ? { sale: json.sale } : {}) }
      if (json.refused) return { ok: false as const, refused: json.refused, ...(json.minimumSalary !== undefined ? { minimumSalary: json.minimumSalary } : {}) }
      return { ok: false as const, error: json.error ?? ('unavailable' as const) }
    } catch {
      return { ok: false as const, error: 'unavailable' as const }
    }
  }
  async club(leagueId: string, playerId: string) {
    try {
      const stub = this.env.LEAGUES.get(this.env.LEAGUES.idFromName(leagueId))
      const res = await stub.fetch('https://room/internal/club', { method: 'POST', body: JSON.stringify({ playerId }) })
      const json = (await res.json()) as { ok: boolean; error?: RoomFailure; view?: ClubView }
      return json.ok && json.view ? { ok: true as const, view: json.view } : { ok: false as const, error: json.error ?? ('unavailable' as const) }
    } catch {
      return { ok: false as const, error: 'unavailable' as const }
    }
  }
  async clubAction(leagueId: string, playerId: string, action: ClubAction) {
    try {
      const stub = this.env.LEAGUES.get(this.env.LEAGUES.idFromName(leagueId))
      const res = await stub.fetch('https://room/internal/club/action', { method: 'POST', body: JSON.stringify({ playerId, action }) })
      const json = (await res.json()) as { ok: boolean; error?: RoomFailure; view?: ClubView; refused?: ClubError; minimumSalary?: number }
      if (json.ok && json.view) return { ok: true as const, view: json.view }
      if (json.refused) return { ok: false as const, refused: json.refused, ...(json.minimumSalary !== undefined ? { minimumSalary: json.minimumSalary } : {}) }
      return { ok: false as const, error: json.error ?? ('unavailable' as const) }
    } catch {
      return { ok: false as const, error: 'unavailable' as const }
    }
  }
  async ticket(leagueId: string, playerId: string) {
    try {
      const stub = this.env.LEAGUES.get(this.env.LEAGUES.idFromName(leagueId))
      const res = await stub.fetch('https://room/internal/ticket', { method: 'POST', body: JSON.stringify({ playerId }) })
      const json = (await res.json()) as { ok: boolean; error?: RoomFailure; ticket?: string; expiresInMs?: number }
      return json.ok && json.ticket ? { ok: true as const, ticket: json.ticket, expiresInMs: json.expiresInMs ?? 30000 } : { ok: false as const, error: json.error ?? ('unavailable' as const) }
    } catch {
      return { ok: false as const, error: 'unavailable' as const }
    }
  }
  async destroy(leagueId: string) {
    await this.call(leagueId, '/internal/destroy', {})
  }
}

/** Dependências das rotas de liga, em cima das da identidade. */
function leagueDeps(env: Env, base: ApiDeps): LeagueDeps {
  return { ...base, leagues: new D1LeagueStore(env.DB), rooms: new DoRooms(env), identities: base.store, randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)) }
}

function respondLeague(result: LeagueResult<unknown>, cors: Record<string, string>): Response {
  const headers: Record<string, string> = { ...cors }
  if (result.status === 429 && 'retryAfterMs' in result.body) headers['Retry-After'] = String(Math.ceil(result.body.retryAfterMs / 1000))
  return Response.json(result.body, { status: result.status, headers })
}

const ADMIN_ACTIONS: readonly string[] = ['kick', 'close-entry', 'open-entry', 'rotate-code', 'start', 'make-admin']

/** Rotas de ligas. Devolve `undefined` se o caminho não é de liga. */
async function serveLeagues(request: ApiRequest, url: URL, env: Env, base: ApiDeps, cors: Record<string, string>): Promise<Response | undefined> {
  const m = /^\/api\/leagues(?:\/([A-Za-z0-9]+))?(?:\/([a-z-]+))?$/.exec(url.pathname)
  if (!m) return undefined
  const [, first, second] = m
  const deps = leagueDeps(env, base)
  const method = request.method
  if (!first) return method === 'POST' ? respondLeague(await createLeague(request, deps), cors) : undefined
  if (first === 'open' && !second && method === 'GET') {
    const before = Number(url.searchParams.get('before'))
    return respondLeague(await listOpenLeagues(request, deps, Number.isFinite(before) && before > 0 ? before : undefined), cors)
  }
  if (first === 'mine' && !second && method === 'GET') return respondLeague(await myLeagues(request, deps), cors)
  if (first === 'code' && !second && method === 'POST') {
    let code = ''
    try {
      code = String((JSON.parse(String(request.body)) as { code?: unknown }).code ?? '')
    } catch {
      /* corpo ruim: o código vazio é recusado abaixo */
    }
    return respondLeague(await resolveCode(request, deps, code.slice(0, 32)), cors)
  }
  if (!second && method === 'GET') return respondLeague(await getLeague(request, deps, first), cors)
  if (second === 'state' && method === 'GET') return respondLeague(await leagueState(request, deps, first), cors)
  if (second === 'ready' && method === 'POST') return respondLeague(await setReady(request, deps, first), cors)
  if ((second === 'advance' || second === 'pause' || second === 'resume') && method === 'POST') return respondLeague(await controlLeague(request, deps, first, second), cors)
  if (second === 'cups' && method === 'GET') return respondLeague(await cupsState(request, deps, first), cors)
  if (second === 'trade' && method === 'GET') return respondLeague(await tradeRead(request, deps, first, { op: 'body' }), cors)
  if (second === 'trade-squad' && method === 'GET') {
    const team = url.searchParams.get('team') ?? ''
    return /^[A-Za-z0-9_.:-]{1,64}$/.test(team) ? respondLeague(await tradeRead(request, deps, first, { op: 'squad', teamId: team }), cors) : Response.json({ error: 'bad-body' }, { status: 400, headers: cors })
  }
  if (second === 'trade-free' && method === 'GET') {
    const pos = url.searchParams.get('pos') ?? undefined
    return pos === undefined || /^[A-Z]{2,3}$/.test(pos) ? respondLeague(await tradeRead(request, deps, first, { op: 'free', ...(pos ? { position: pos } : {}) }), cors) : Response.json({ error: 'bad-body' }, { status: 400, headers: cors })
  }
  if (second === 'trade-search' && method === 'GET') {
    const filters = parseSearchFilters(url.searchParams)
    return filters ? respondLeague(await tradeRead(request, deps, first, { op: 'search', filters }), cors) : Response.json({ error: 'bad-body' }, { status: 400, headers: cors })
  }
  if (second === 'trade-listings' && method === 'GET') return respondLeague(await tradeRead(request, deps, first, { op: 'listings' }), cors)
  if (second === 'trade-ai' && method === 'GET') return respondLeague(await tradeRead(request, deps, first, { op: 'ai' }), cors)
  if (second === 'trade-mine' && method === 'GET') return respondLeague(await tradeRead(request, deps, first, { op: 'mine' }), cors)
  if (second === 'trade-buyers' && method === 'GET') {
    const who = url.searchParams.get('player') ?? ''
    const kind = url.searchParams.get('kind')
    return /^[A-Za-z0-9_.:-]{1,64}$/.test(who) && (kind === 'purchase' || kind === 'loan') ? respondLeague(await tradeRead(request, deps, first, { op: 'buyers', playerId: who, kind }), cors) : Response.json({ error: 'bad-body' }, { status: 400, headers: cors })
  }
  if (second === 'trade-pre' && method === 'GET') {
    const q = url.searchParams.get('q') ?? ''
    const pos = url.searchParams.get('pos') ?? undefined
    return q.length <= 40 && (pos === undefined || /^[A-Z]{2,3}$/.test(pos)) ? respondLeague(await tradeRead(request, deps, first, { op: 'pre-targets', ...(q.trim() ? { query: q.trim() } : {}), ...(pos ? { position: pos } : {}) }), cors) : Response.json({ error: 'bad-body' }, { status: 400, headers: cors })
  }
  const ACTS = ['offer', 'respond', 'withdraw', 'sign', 'report', 'ai-offer', 'ai-respond', 'ai-withdraw', 'list', 'unlist', 'sell', 'pre-offer']
  if (method === 'POST' && second?.startsWith('trade-') && ACTS.includes(second.slice(6))) {
    return respondLeague(await tradeAct(request, deps, first, second.slice(6) as TradeActKind), cors)
  }
  if (second === 'club' && method === 'GET') return respondLeague(await clubState(request, deps, first), cors)
  if (second === 'club' && method === 'POST') return respondLeague(await clubDecision(request, deps, first), cors)
  if (second === 'live-ticket' && method === 'POST') return respondLeague(await liveTicket(request, deps, first), cors)
  if (second === 'pace' && method === 'POST') return respondLeague(await changePace(request, deps, first), cors)
  if (second === 'join' && method === 'POST') return respondLeague(await joinLeague(request, deps, first), cors)
  if (second === 'leave' && method === 'POST') return respondLeague(await leaveLeague(request, deps, first), cors)
  if (second && ADMIN_ACTIONS.includes(second) && method === 'POST') return respondLeague(await adminAction(request, deps, first, second as AdminAction), cors)
  return undefined
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin')
  const headers: Record<string, string> = { Vary: 'Origin', 'Cache-Control': 'no-store' }
  if (origin && env.ALLOWED_ORIGINS.split(',').includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = 'authorization, content-type'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    headers['Access-Control-Max-Age'] = '600'
  }
  return headers
}

const PACKAGE_FILE = /^\/packages\/([a-z0-9][a-z0-9-]{0,40})\/(\d{4}\.(?:0[1-9]|1[0-2])(?:\.\d{1,3})?)\/pacote\.json\.gz$/

/** Pacotes de dados: só leitura. O índice muda (cache curto); cada versão nunca muda (cache de um ano). */
async function servePackage(req: Request, url: URL, env: Env, cors: Record<string, string>): Promise<Response | undefined> {
  if (!url.pathname.startsWith('/packages/')) return undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') return Response.json({ error: 'method-not-allowed' }, { status: 405, headers: cors })
  let key: string
  let headers: Record<string, string>
  if (url.pathname === '/packages/index.json') {
    key = 'index.json'
    headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
  } else {
    const m = PACKAGE_FILE.exec(url.pathname)
    if (!m) return Response.json({ error: 'not-found' }, { status: 404, headers: cors })
    key = `${m[1]}/${m[2]}/pacote.json.gz`
    // application/gzip e sem Content-Encoding: o navegador entrega os bytes comprimidos como estão, e o hash do índice vale para eles.
    headers = { 'Content-Type': 'application/gzip', 'Cache-Control': 'public, max-age=31536000, immutable' }
  }
  const object = await env.PACKAGES.get(key)
  if (!object) return Response.json({ error: 'not-found' }, { status: 404, headers: cors })
  return new Response(req.method === 'HEAD' ? null : object.body, { headers: { ...cors, ...headers, ETag: object.httpEtag, 'Content-Length': String(object.size) } })
}

function respond(result: ApiResult<unknown>, cors: Record<string, string>): Response {
  const headers: Record<string, string> = { ...cors }
  if (result.status === 429 && 'retryAfterMs' in result.body) headers['Retry-After'] = String(Math.ceil(result.body.retryAfterMs / 1000))
  return Response.json(result.body, { status: result.status, headers })
}

function identityDeps(env: Env, guard: RemoteGuard): ApiDeps & { store: D1IdentityStore } {
  return { store: new D1IdentityStore(env.DB), turnstile: cloudflareTurnstile(env.TURNSTILE_SECRET ?? ''), limiter: guard, nonces: guard, now: Date.now }
}

/** Lê o corpo com teto de verdade (não confia no Content-Length): passou do teto, para de ler. */
async function readCapped(req: Request, limit: number): Promise<Uint8Array | undefined> {
  if (limit === 0) return new Uint8Array(0)
  if (Number(req.headers.get('content-length') ?? 0) > limit) return undefined
  const reader = req.body?.getReader()
  if (!reader) return new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel()
      return undefined
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) (out.set(c, at), (at += c.length))
  return out
}

/** Saves na nuvem e conta. Toda rota confere limite, assinatura e cadastro antes de tocar no R2. */
async function serveCloud(req: Request, url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const body = await readCapped(req, bodyLimitFor(req.method, url.pathname))
  if (!body) return Response.json({ error: 'too-large' }, { status: 413, headers: cors })
  const deps: CloudApiDeps = { ...identityDeps(env, new RemoteGuard(env)), blobs: r2Blobs(env.SAVES), deleteIdentity: async (id) => {
      // Sai de todas as ligas antes (cada clube volta à IA; se era o ADM, o humano mais antigo assume).
      await leaveAllLeagues(leagueDeps(env, identityDeps(env, new RemoteGuard(env))), id)
      await new D1IdentityStore(env.DB).delete(id)
    } }
  const result = await handleCloudRequest(
    { method: req.method, path: url.pathname + url.search, body, ip: req.headers.get('CF-Connecting-IP') ?? 'unknown', authorization: req.headers.get('Authorization') },
    url,
    deps,
  )
  if (!result) return Response.json({ error: 'not-found' }, { status: 404, headers: cors })
  if ('bytes' in result) return new Response(result.bytes as BodyInit, { headers: { ...cors, 'Content-Type': 'application/octet-stream' } })
  return Response.json(result.json, { status: result.status, headers: { ...cors, ...result.headers } })
}

export default {

  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const url = new URL(req.url)
    const pkg = await servePackage(req, url, env, cors)
    if (pkg) return pkg
    const adminDeps = (): ModerationDeps => {
      const g = new RemoteGuard(env)
      const base = identityDeps(env, g)
      return { identities: base.store, leagues: new D1LeagueStore(env.DB), mod: new D1ModerationStore(env.DB), now: Date.now, randomId: () => crypto.randomUUID(), leaveAll: (id) => leaveAllLeagues(leagueDeps(env, base), id) }
    }
    const admin = await serveAdmin(req, url, env, new RemoteGuard(env), adminDeps)
    if (admin) return admin
    if (!env.TURNSTILE_SECRET) return Response.json({ error: 'not-configured' }, { status: 503, headers: cors })

    if (isCloudPath(url.pathname)) return serveCloud(req, url, env, cors)

    // O corpo é lido com teto: nada de aceitar megabytes numa rota que espera uns poucos bytes.
    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > MAX_BODY_BYTES * 2) return Response.json({ error: 'bad-body' }, { status: 413, headers: cors })
    const body = req.method === 'GET' ? '' : await req.text()

    const guard = new RemoteGuard(env)
    const deps: ApiDeps = {
      store: new D1IdentityStore(env.DB),
      turnstile: cloudflareTurnstile(env.TURNSTILE_SECRET),
      limiter: guard,
      nonces: guard,
      now: Date.now,
    }
    const request: ApiRequest = {
      method: req.method,
      path: url.pathname + url.search,
      body,
      ip: req.headers.get('CF-Connecting-IP') ?? 'unknown',
      authorization: req.headers.get('Authorization'),
    }

    // WebSocket da partida ao vivo: o ticket de uso único (pedido assinado em .../live-ticket) é a autenticação; o limite por IP segura quem tenta adivinhar.
    const ws = /^\/api\/leagues\/([A-Za-z0-9]+)\/live$/.exec(url.pathname)
    if (ws && req.headers.get('Upgrade') === 'websocket') {
      const hit = await guard.hit('liveConnectIp', request.ip, Date.now())
      if (!hit.allowed) return Response.json({ error: 'rate-limited' }, { status: 429, headers: cors })
      const stub = env.LEAGUES.get(env.LEAGUES.idFromName(ws[1] as string))
      // Só o necessário segue para a sala: nada de cabeçalhos do cliente (a sala confia só no ticket).
      return stub.fetch(`https://room/ws?ticket=${encodeURIComponent(url.searchParams.get('ticket') ?? '')}`, { headers: { Upgrade: 'websocket' } })
    }
    if (url.pathname === '/api/identity' && req.method === 'POST') return respond(await registerIdentity(request, deps), cors)
    if (url.pathname === '/api/me' && req.method === 'GET') {
      const auth = await requireIdentity(request, 'read', deps)
      if (!auth.ok) return respond(auth.result, cors)
      return Response.json({ playerId: auth.record.playerId, nickname: auth.record.nickname ?? null, createdAt: auth.record.createdAt }, { headers: cors })
    }
    if (url.pathname === '/api/report' && req.method === 'POST') {
      const auth = await requireIdentity(request, 'report', deps, 'reportIp')
      if (!auth.ok) return respond(auth.result, cors)
      let raw: unknown
      try {
        raw = JSON.parse(String(request.body))
      } catch {
        raw = undefined
      }
      const parsed = parseReport(raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined)
      if (!parsed) return Response.json({ error: 'bad-body' }, { status: 400, headers: cors })
      const out = await fileReport(adminDeps(), auth.record.playerId, parsed)
      return out.ok ? Response.json({ ok: true }, { headers: cors }) : Response.json({ error: out.error }, { status: out.error === 'not-found' ? 404 : out.error === 'duplicate' ? 409 : 400, headers: cors })
    }
    if (url.pathname === '/api/me' && req.method === 'PUT') return respond(await changeNickname(request, deps), cors)
    const leagues = await serveLeagues(request, url, env, deps, cors)
    if (leagues) return leagues
    return Response.json({ error: 'not-found' }, { status: 404, headers: cors })
  },
}

/** O Cloudflare exige que as classes de Durable Object saiam do módulo principal. */
export { LeagueRoom }
