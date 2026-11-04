/**
 * API do Meu Manager (Fase 6). Liga as peças puras de `src/online` ao Cloudflare:
 *   POST /api/identity  cria (ou reconhece) a identidade — pedido assinado + Turnstile
 *   GET  /api/me        quem sou eu — pedido assinado
 *   GET/PUT/POST/DELETE /api/saves..., GET/DELETE /api/account...  saves na nuvem e conta (B4; ver src/online/cloudSaveApi.ts)
 *   GET  /packages/index.json e /packages/<id>/<versão>/pacote.json.gz   pacotes de dados (R2), públicos e sem assinatura
 * Limites e códigos de uso único ficam num Durable Object (`Guard`, em 8 fatias), porque a memória de um Worker some a cada reinício.
 * O endereço de quem pede é usado só no instante do pedido, para limitar abuso; nunca é gravado nem registrado.
 */
import { SqlGuard, type SqlLike } from '../src/online/guard'
import { cloudflareTurnstile, MAX_BODY_BYTES, registerIdentity, requireIdentity, type ApiDeps, type ApiRequest, type ApiResult } from '../src/online/identityApi'
import type { LimitAction, LimitResult, RateLimit } from '../src/online/rateLimit'
import type { NonceStore } from '../src/online/signedRequest'
import { bodyLimitFor, handleCloudRequest, isCloudPath, type CloudApiDeps } from '../src/online/cloudSaveApi'
import { RETENTION_MS, deleteAccountData, type BlobStore, type ListedObject, type StoredObject } from '../src/online/cloudSave'
import { D1IdentityStore, type D1Like } from './d1Store'

/** Pedaços do ambiente do Cloudflare que usamos. */
interface DurableObjectStubLike {
  fetch(url: string, init: { method: string; body: string }): Promise<Response>
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
  /** Segredo do Turnstile: guardado no painel do Cloudflare (Worker › Configurações › Variáveis e segredos), nunca no repositório. */
  TURNSTILE_SECRET?: string
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
  constructor(state: { storage: { sql: SqlLike } }) {
    this.guard = new SqlGuard(state.storage.sql)
  }

  async fetch(req: Request): Promise<Response> {
    const m = (await req.json()) as { op: string; action: LimitAction; key: string; now: number; playerId: string; nonce: string; ttlMs: number }
    if (m.op === 'hit') return Response.json(this.guard.hit(m.action, m.key, m.now))
    if (m.op === 'claim') return Response.json({ ok: this.guard.claim(m.playerId, m.nonce, m.ttlMs) })
    return new Response('bad op', { status: 400 })
  }
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
  const deps: CloudApiDeps = { ...identityDeps(env, new RemoteGuard(env)), blobs: r2Blobs(env.SAVES), deleteIdentity: (id) => new D1IdentityStore(env.DB).delete(id) }
  const result = await handleCloudRequest(
    { method: req.method, path: url.pathname + url.search, body, ip: req.headers.get('CF-Connecting-IP') ?? 'unknown', authorization: req.headers.get('Authorization') },
    url,
    deps,
  )
  if (!result) return Response.json({ error: 'not-found' }, { status: 404, headers: cors })
  if ('bytes' in result) return new Response(result.bytes as BodyInit, { headers: { ...cors, 'Content-Type': 'application/octet-stream' } })
  return Response.json(result.json, { status: result.status, headers: { ...cors, ...result.headers } })
}

/** Todo dia: apaga as contas sem nenhum acesso há 12 meses (saves e cadastro). Lotes pequenos; o que sobrar fica para o dia seguinte. */
async function purgeInactive(env: Env): Promise<number> {
  const store = new D1IdentityStore(env.DB)
  const blobs = r2Blobs(env.SAVES)
  const ids = await store.listInactive(Date.now() - RETENTION_MS, 25)
  for (const id of ids) {
    await deleteAccountData({ blobs, now: Date.now }, id)
    await store.delete(id)
  }
  return ids.length
}

export default {
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await purgeInactive(env)
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const url = new URL(req.url)
    const pkg = await servePackage(req, url, env, cors)
    if (pkg) return pkg
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

    if (url.pathname === '/api/identity' && req.method === 'POST') return respond(await registerIdentity(request, deps), cors)
    if (url.pathname === '/api/me' && req.method === 'GET') {
      const auth = await requireIdentity(request, 'read', deps)
      if (!auth.ok) return respond(auth.result, cors)
      return Response.json({ playerId: auth.record.playerId, nickname: auth.record.nickname ?? null, createdAt: auth.record.createdAt }, { headers: cors })
    }
    return Response.json({ error: 'not-found' }, { status: 404, headers: cors })
  },
}
