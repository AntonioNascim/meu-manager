/**
 * Cliente dos saves na nuvem (Fase 6, B4): fala com as rotas de `cloudSaveApi.ts` assinando cada pedido com a identidade do aparelho.
 * TypeScript puro: `fetch`, relógio e sorteio entram por parâmetro (nos testes, o "servidor" é o próprio código do servidor na memória).
 */
import type { CloudManifest, SlotListing } from './cloudSave'
import type { Identity } from './identity'
import { signRequest } from './signedRequest'

/** Sem rede, tempo esgotado ou servidor fora do ar: o envio fica na fila e tenta de novo depois. */
export class NetworkError extends Error {}
/** Outro aparelho gravou antes (a revisão não bate). `current` é o resumo do que está na nuvem. */
export class ConflictError extends Error {
  constructor(readonly current: CloudManifest | null) {
    super('conflict')
  }
}
/** O manifesto citou pedaços que o servidor não tem (por exemplo, limpos como órfãos): é só enviar de novo. */
export class MissingError extends Error {
  constructor(readonly hashes: string[]) {
    super('missing')
  }
}
export class QuotaError extends Error {
  constructor(readonly limit: number) {
    super('quota')
  }
}
export class RateLimitedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('rate-limited')
  }
}
/** `unknown-identity`: este aparelho tem chave, mas o servidor não conhece (ainda não registrou). `unauthorized`: assinatura recusada (relógio errado, por exemplo). */
export class AuthError extends Error {
  constructor(readonly reason: string) {
    super(reason)
  }
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`api-${status}`)
  }
}

export interface CloudClientDeps {
  base: string
  identity: Identity
  fetchFn: typeof fetch
  now: () => number
  randomBytes: (n: number) => Uint8Array
  /** Tempo máximo de cada pedido. */
  timeoutMs?: number
}

export interface SavesListing {
  saves: SlotListing[]
  expiresAt: number
}

export class CloudClient {
  constructor(private deps: CloudClientDeps) {}

  private async call(method: string, path: string, body: string | Uint8Array = ''): Promise<Response> {
    const { base, identity, fetchFn, now, randomBytes, timeoutMs = 30_000 } = this.deps
    const authorization = signRequest(identity, { method, path, body }, now(), randomBytes)
    let res: Response
    try {
      res = await fetchFn(`${base}${path}`, {
        method,
        headers: { Authorization: authorization, ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/octet-stream' }) },
        body: method === 'GET' || method === 'DELETE' ? undefined : (body as BodyInit),
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(timeoutMs) : undefined,
      })
    } catch {
      throw new NetworkError('Sem conexão com o servidor.')
    }
    if (res.ok) return res
    let json: unknown
    try {
      json = await res.json()
    } catch {
      json = undefined
    }
    const error = (json as { error?: string } | undefined)?.error
    if (res.status === 409 && error === 'conflict') throw new ConflictError((json as { current: CloudManifest | null }).current)
    if (res.status === 422 && error === 'missing') throw new MissingError((json as { hashes: string[] }).hashes)
    if (res.status === 413 && error === 'quota') throw new QuotaError((json as { limit: number }).limit)
    if (res.status === 429) throw new RateLimitedError(Number((json as { retryAfterMs?: number } | undefined)?.retryAfterMs ?? Number(res.headers.get('Retry-After') ?? 60) * 1000))
    if (res.status === 401) throw new AuthError(String((json as { reason?: string } | undefined)?.reason ?? 'unauthorized'))
    if (res.status === 404 && error === 'unknown-identity') throw new AuthError('unknown-identity')
    // 5xx e respostas sem corpo conhecido: o servidor está com problema, tratamos como "sem conexão" (tenta de novo depois).
    if (res.status >= 500) throw new NetworkError(`Servidor indisponível (${res.status}).`)
    throw new ApiError(res.status, json)
  }

  async list(): Promise<SavesListing> {
    return (await (await this.call('GET', '/api/saves')).json()) as SavesListing
  }

  async manifest(slot: number): Promise<CloudManifest | null> {
    return ((await (await this.call('GET', `/api/saves/${slot}`)).json()) as { manifest: CloudManifest | null }).manifest
  }

  async missing(slot: number, hashes: string[]): Promise<string[]> {
    const body = JSON.stringify({ hashes })
    return ((await (await this.call('POST', `/api/saves/${slot}/missing`, body)).json()) as { missing: string[] }).missing
  }

  async putBlob(slot: number, hash: string, bytes: Uint8Array): Promise<void> {
    await this.call('PUT', `/api/saves/${slot}/blob/${hash}`, bytes)
  }

  async getBlob(slot: number, hash: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.call('GET', `/api/saves/${slot}/blob/${hash}`)).arrayBuffer())
  }

  async commit(slot: number, input: { expectedRev: number; manifest: Omit<CloudManifest, 'rev' | 'updatedAt'>; force?: boolean }): Promise<{ rev: number; updatedAt: number }> {
    return (await (await this.call('PUT', `/api/saves/${slot}/manifest`, JSON.stringify(input))).json()) as { rev: number; updatedAt: number }
  }

  async deleteSlot(slot: number): Promise<void> {
    await this.call('DELETE', `/api/saves/${slot}`)
  }

  /** "Exportar meus dados". */
  async exportAccount(): Promise<unknown> {
    return (await this.call('GET', '/api/account/export')).json()
  }

  /** "Apagar minha conta": apaga saves e cadastro no servidor. Irreversível. */
  async deleteAccount(): Promise<void> {
    await this.call('DELETE', '/api/account')
  }
}
