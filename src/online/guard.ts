/**
 * Limites de pedidos e códigos de uso único guardados em SQL (Fase 6, B2). No Cloudflare roda dentro de um Durable Object, cujo SQLite sobrevive
 * a reinícios; os testes usam o `node:sqlite`. Só precisa de um `exec` com `toArray()`, que é o que o SQLite do Durable Object oferece.
 */
import { decide, longestWindow, type LimitAction, type LimitResult, type RateLimit } from './rateLimit'
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

  claim(playerId: string, nonce: string, ttlMs: number): boolean {
    const now = this.clock()
    this.sql.exec('DELETE FROM nonces WHERE until <= ?', now)
    const k = `${playerId}:${nonce}`
    if (this.sql.exec('SELECT until FROM nonces WHERE k = ?', k).toArray().length > 0) return false
    this.sql.exec('INSERT INTO nonces (k, until) VALUES (?, ?)', k, now + ttlMs)
    return true
  }
}
