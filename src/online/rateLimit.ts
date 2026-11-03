/**
 * Limite de pedidos por janela deslizante (Fase 6, B2; proposta 6.1). Puro: o tempo entra como parâmetro.
 * Valores iniciais da proposta; a B9 ajusta.
 */
export type LimitRule = { limit: number; windowMs: number }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const RATE_LIMITS = {
  createIdentity: [{ limit: 5, windowMs: DAY }],
  read: [{ limit: 120, windowMs: MINUTE }],
  write: [{ limit: 30, windowMs: MINUTE }],
  saveUpload: [{ limit: 6, windowMs: MINUTE }, { limit: 200, windowMs: DAY }],
  createLeague: [{ limit: 3, windowMs: DAY }],
  joinByCode: [{ limit: 10, windowMs: HOUR }],
} as const satisfies Record<string, readonly LimitRule[]>

export type LimitAction = keyof typeof RATE_LIMITS

export type LimitResult = { allowed: true } | { allowed: false; retryAfterMs: number }

/** Guarda os instantes dos pedidos recentes de cada chave (identidade ou IP) e ação. */
export class RateLimiter {
  private hits = new Map<string, number[]>()

  /** Conta o pedido se couber em todas as regras da ação; senão não conta e diz quanto esperar. */
  hit(action: LimitAction, key: string, now: number): LimitResult {
    const rules: readonly LimitRule[] = RATE_LIMITS[action]
    const id = `${action}:${key}`
    const longest = Math.max(...rules.map((r) => r.windowMs))
    const times = (this.hits.get(id) ?? []).filter((t) => now - t < longest)
    let wait = 0
    for (const rule of rules) {
      const inWindow = times.filter((t) => now - t < rule.windowMs)
      if (inWindow.length >= rule.limit) wait = Math.max(wait, inWindow[inWindow.length - rule.limit]! + rule.windowMs - now)
    }
    if (wait > 0) {
      this.hits.set(id, times)
      return { allowed: false, retryAfterMs: wait }
    }
    times.push(now)
    this.hits.set(id, times)
    return { allowed: true }
  }
}
