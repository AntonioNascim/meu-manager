/**
 * Limite de pedidos por janela deslizante (Fase 6, B2; proposta 6.1). Puro: o tempo entra como parâmetro.
 * Valores iniciais da proposta; a B9 ajusta.
 */
export type LimitRule = { limit: number; windowMs: number }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const RATE_LIMITS = {
  // 30 por IP por dia: nas redes de operadora (CGNAT) muita gente divide o mesmo endereço; a proteção principal é o Turnstile.
  createIdentity: [{ limit: 30, windowMs: DAY }],
  read: [{ limit: 120, windowMs: MINUTE }],
  write: [{ limit: 30, windowMs: MINUTE }],
  saveUpload: [{ limit: 6, windowMs: MINUTE }, { limit: 200, windowMs: DAY }],
  // Cada pedaço do save é um envio; o primeiro envio de um save tem uns 100 (o dia comum, uns poucos).
  saveBlob: [{ limit: 300, windowMs: MINUTE }, { limit: 2000, windowMs: DAY }],
  // Tetos por IP das rotas de save: muito mais folgados que os por identidade, porque muita gente divide o mesmo IP (CGNAT das operadoras).
  saveUploadIp: [{ limit: 300, windowMs: MINUTE }, { limit: 20000, windowMs: DAY }],
  saveBlobIp: [{ limit: 3000, windowMs: MINUTE }, { limit: 200000, windowMs: DAY }],
  deleteAccount: [{ limit: 3, windowMs: DAY }],
  createLeague: [{ limit: 3, windowMs: DAY }],
  joinByCode: [{ limit: 10, windowMs: HOUR }],
} as const satisfies Record<string, readonly LimitRule[]>

export type LimitAction = keyof typeof RATE_LIMITS

export type LimitResult = { allowed: true } | { allowed: false; retryAfterMs: number }

/** Quem conta os pedidos: em memória (testes) ou em disco (Durable Object). Pode ser síncrono ou não. */
export interface RateLimit {
  /** Conta o pedido se couber em todas as regras da ação; senão não conta e diz quanto esperar. */
  hit(action: LimitAction, key: string, now: number): LimitResult | Promise<LimitResult>
}

/** A janela mais longa da ação: pedidos mais antigos que isso podem ser esquecidos. */
export const longestWindow = (action: LimitAction): number => Math.max(...(RATE_LIMITS[action] as readonly LimitRule[]).map((r) => r.windowMs))

/** A regra de decisão, igual para qualquer armazenamento. `times` são os instantes dos pedidos já contados. */
export function decide(action: LimitAction, times: readonly number[], now: number): LimitResult {
  let wait = 0
  for (const rule of RATE_LIMITS[action] as readonly LimitRule[]) {
    const inWindow = times.filter((t) => now - t < rule.windowMs).sort((a, b) => a - b)
    if (inWindow.length >= rule.limit) wait = Math.max(wait, inWindow[inWindow.length - rule.limit]! + rule.windowMs - now)
  }
  return wait > 0 ? { allowed: false, retryAfterMs: wait } : { allowed: true }
}

/** Guarda os instantes dos pedidos recentes de cada chave (identidade ou IP) e ação, na memória. */
export class RateLimiter implements RateLimit {
  private hits = new Map<string, number[]>()

  hit(action: LimitAction, key: string, now: number): LimitResult {
    const id = `${action}:${key}`
    const longest = longestWindow(action)
    const times = (this.hits.get(id) ?? []).filter((t) => now - t < longest)
    const result = decide(action, times, now)
    if (result.allowed) times.push(now)
    this.hits.set(id, times)
    return result
  }
}
