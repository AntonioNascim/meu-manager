/**
 * API do Meu Manager (Fase 6). Liga as peças puras de `src/online` ao Cloudflare:
 *   POST /api/identity  cria (ou reconhece) a identidade — pedido assinado + Turnstile
 *   GET  /api/me        quem sou eu — pedido assinado
 * Limites e códigos de uso único ficam num Durable Object (`Guard`, em 8 fatias), porque a memória de um Worker some a cada reinício.
 * O endereço de quem pede é usado só no instante do pedido, para limitar abuso; nunca é gravado nem registrado.
 */
import { SqlGuard, type SqlLike } from '../src/online/guard'
import { cloudflareTurnstile, MAX_BODY_BYTES, registerIdentity, requireIdentity, type ApiDeps, type ApiRequest, type ApiResult } from '../src/online/identityApi'
import type { LimitAction, LimitResult, RateLimit } from '../src/online/rateLimit'
import type { NonceStore } from '../src/online/signedRequest'
import { D1IdentityStore, type D1Like } from './d1Store'

/** Pedaços do ambiente do Cloudflare que usamos. */
interface DurableObjectStubLike {
  fetch(url: string, init: { method: string; body: string }): Promise<Response>
}
interface Env {
  DB: D1Like
  GUARD: { idFromName(name: string): unknown; get(id: unknown): DurableObjectStubLike }
  /** Segredo do Turnstile: guardado no painel do Cloudflare (Worker › Configurações › Variáveis e segredos), nunca no repositório. */
  TURNSTILE_SECRET?: string
  ALLOWED_ORIGINS: string
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
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers['Access-Control-Max-Age'] = '600'
  }
  return headers
}

function respond(result: ApiResult<unknown>, cors: Record<string, string>): Response {
  const headers: Record<string, string> = { ...cors }
  if (result.status === 429 && 'retryAfterMs' in result.body) headers['Retry-After'] = String(Math.ceil(result.body.retryAfterMs / 1000))
  return Response.json(result.body, { status: result.status, headers })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const url = new URL(req.url)
    if (!env.TURNSTILE_SECRET) return Response.json({ error: 'not-configured' }, { status: 503, headers: cors })

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
