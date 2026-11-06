/**
 * Limites de pedidos e códigos de uso único guardados em SQL (Fase 6, B2). No Cloudflare roda dentro de um Durable Object, cujo SQLite sobrevive
 * a reinícios; os testes usam o `node:sqlite`. Só precisa de um `exec` com `toArray()`, que é o que o SQLite do Durable Object oferece.
 */
import { RATE_LIMITS, decide, longestWindow, type LimitAction, type LimitResult, type RateLimit } from './rateLimit'
import type { NonceStore } from './signedRequest'

export interface SqlLike {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] }
}

export class SqlGuard implements RateLimit, NonceStore {
  constructor(
    private sql: SqlLike,
    private clock: () => number = Date.now,
  ) {
    sql.exec('CREATE TABLE IF NOT EXISTS hits (id TEXT NOT NULL, at INTEGER NOT NULL)')
    sql.exec('CREATE INDEX IF NOT EXISTS hits_id ON hits (id, at)')
    sql.exec('CREATE TABLE IF NOT EXISTS nonces (k TEXT PRIMARY KEY, until INTEGER NOT NULL) WITHOUT ROWID')
  }

  hit(action: LimitAction, key: string, now: number): LimitResult {
    const id = `${action}:${key}`
    this.sql.exec('DELETE FROM hits WHERE id = ? AND at <= ?', id, now - longestWindow(action))
    const times = this.sql.exec('SELECT at FROM hits WHERE id = ?', id).toArray().map((r) => Number(r.at))
    const result = decide(action, times, now)
    if (result.allowed) this.sql.exec('INSERT INTO hits (id, at) VALUES (?, ?)', id, now)
    return result
  }

  /**
   * Apaga TODOS os registros vencidos (os de chaves que nunca mais voltaram também): sem isto o endereço de IP de quem fez um pedido uma vez ficaria no
   * disco para sempre, e o aviso de privacidade promete que os contadores somem em até 24 horas. Devolve quantas linhas de contadores restam.
   */
  purge(now: number): number {
    for (const action of Object.keys(RATE_LIMITS) as LimitAction[]) this.sql.exec('DELETE FROM hits WHERE id LIKE ? AND at <= ?', `${action}:%`, now - longestWindow(action))
    // Contador de uma ação que já não existe: vale a regra mais longa.
    this.sql.exec('DELETE FROM hits WHERE at <= ?', now - Math.max(...(Object.keys(RATE_LIMITS) as LimitAction[]).map(longestWindow)))
    this.sql.exec('DELETE FROM nonces WHERE until <= ?', now)
    return Number(this.sql.exec('SELECT COUNT(*) AS n FROM hits').toArray()[0]?.n ?? 0)
  }

  claim(playerId: string, nonce: string, ttlMs: number): boolean {
    const now = this.clock()
    this.sql.exec('DELETE FROM nonces WHERE until <= ?', now)
    const k = `${playerId}:${nonce}`
    if (this.sql.exec('SELECT until FROM nonces WHERE k = ?', k).toArray().length > 0) return false
    this.sql.exec('INSERT INTO nonces (k, until) VALUES (?, ?)', k, now + ttlMs)
    return true
  }
}
