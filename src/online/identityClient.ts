/**
 * Cliente da identidade (Fase 6, B8.1): cadastro, volta com o código e troca de apelido. TypeScript puro: `fetch`, relógio e sorteio entram por parâmetro.
 * Todo pedido é assinado com a chave do aparelho (a mesma de `signedRequest.ts`).
 */
import type { NameIssue } from './nameFilter'
import type { Identity } from './identity'
import { signRequest } from './signedRequest'

export interface IdentityClientDeps {
  base: string
  fetchFn: typeof fetch
  now: () => number
  randomBytes: (n: number) => Uint8Array
  timeoutMs?: number
}

export type RegisterResult =
  | { ok: true; created: boolean; nickname?: string }
  | { ok: false; reason: 'bad-nickname'; issue: NameIssue }
  /** Desafio recusado. Ao entrar com um código, isto quer dizer que a conta não existe (o servidor só pede o desafio para contas novas). */
  | { ok: false; reason: 'turnstile-failed' | 'rate-limited' | 'offline' | 'unauthorized' | 'server' }

export type NicknameResult =
  | { ok: true; nickname: string }
  | { ok: false; reason: 'bad-nickname'; issue: NameIssue }
  | { ok: false; reason: 'rate-limited' | 'offline' | 'unauthorized' | 'unknown-identity' | 'server' }

export async function signedCall(deps: IdentityClientDeps, identity: Identity, method: string, path: string, body: string): Promise<{ status: number; json: Record<string, unknown> } | 'offline'> {
  const authorization = signRequest(identity, { method, path, body }, deps.now(), deps.randomBytes)
  try {
    const res = await deps.fetchFn(`${deps.base}${path}`, {
      method,
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(deps.timeoutMs ?? 20_000) : undefined,
    })
    let json: Record<string, unknown> = {}
    try {
      json = (await res.json()) as Record<string, unknown>
    } catch {
      /* sem corpo */
    }
    return { status: res.status, json }
  } catch {
    return 'offline'
  }
}

/** Cria a conta (ou reconhece a que já existe). `turnstileToken` só é conferido para contas novas. */
export async function registerIdentity(deps: IdentityClientDeps, identity: Identity, turnstileToken: string, nickname?: string): Promise<RegisterResult> {
  const res = await signedCall(deps, identity, 'POST', '/api/identity', JSON.stringify({ turnstileToken, ...(nickname !== undefined ? { nickname } : {}) }))
  if (res === 'offline') return { ok: false, reason: 'offline' }
  if (res.status === 200 || res.status === 201) return { ok: true, created: res.json.created === true, nickname: typeof res.json.nickname === 'string' ? res.json.nickname : undefined }
  if (res.status === 400 && res.json.error === 'bad-nickname') return { ok: false, reason: 'bad-nickname', issue: res.json.issue as NameIssue }
  if (res.status === 403) return { ok: false, reason: 'turnstile-failed' }
  if (res.status === 429) return { ok: false, reason: 'rate-limited' }
  if (res.status === 401) return { ok: false, reason: 'unauthorized' }
  return { ok: false, reason: 'server' }
}

/** Troca o apelido no servidor. */
export async function changeNickname(deps: IdentityClientDeps, identity: Identity, nickname: string): Promise<NicknameResult> {
  const res = await signedCall(deps, identity, 'PUT', '/api/me', JSON.stringify({ nickname }))
  if (res === 'offline') return { ok: false, reason: 'offline' }
  if (res.status === 200) return { ok: true, nickname: String(res.json.nickname) }
  if (res.status === 400 && res.json.error === 'bad-nickname') return { ok: false, reason: 'bad-nickname', issue: res.json.issue as NameIssue }
  if (res.status === 429) return { ok: false, reason: 'rate-limited' }
  if (res.status === 401) return { ok: false, reason: 'unauthorized' }
  if (res.status === 404) return { ok: false, reason: 'unknown-identity' }
  return { ok: false, reason: 'server' }
}
