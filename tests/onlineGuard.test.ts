import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { SqlGuard, type SqlLike } from '../src/online/guard'
import { RATE_LIMITS, RateLimiter, type LimitAction } from '../src/online/rateLimit'

/** O mesmo formato do `sql.exec` do Durable Object, em cima do SQLite do Node. */
function memorySql(): SqlLike {
  const db = new DatabaseSync(':memory:')
  return {
    exec(query, ...bindings) {
      const stmt = db.prepare(query)
      const rows = /^\s*select/i.test(query) ? (stmt.all(...(bindings as never[])) as Record<string, unknown>[]) : (stmt.run(...(bindings as never[])), [])
      return { toArray: () => rows }
    },
  }
}

describe('SqlGuard: limites em SQL', () => {
  it('decide igual ao limitador em memória, em sequências variadas de pedidos', () => {
    const actions = Object.keys(RATE_LIMITS) as LimitAction[]
    for (const action of actions) {
      const a = new SqlGuard(memorySql())
      const b = new RateLimiter()
      let t = 1_000_000
      let x = 12345
      for (let i = 0; i < 400; i++) {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0
        t += (x >>> 20) % 9000
        const key = `k${(x >>> 8) % 3}`
        expect(a.hit(action, key, t)).toEqual(b.hit(action, key, t))
      }
    }
  })

  it('cada chave e cada ação têm a sua conta, e o pedido recusado não conta', () => {
    const g = new SqlGuard(memorySql())
    const limit = RATE_LIMITS.createIdentity[0].limit
    for (let i = 0; i < limit; i++) expect(g.hit('createIdentity', 'ip:1', 1000 + i).allowed).toBe(true)
    expect(g.hit('createIdentity', 'ip:1', 2000).allowed).toBe(false)
    expect(g.hit('createIdentity', 'ip:2', 2000).allowed).toBe(true)
    expect(g.hit('read', 'ip:1', 2000).allowed).toBe(true)
    const wait = g.hit('createIdentity', 'ip:1', 3000)
    expect(wait.allowed).toBe(false)
    if (!wait.allowed) expect(g.hit('createIdentity', 'ip:1', 3000 + wait.retryAfterMs).allowed).toBe(true)
  })

  it('o histórico antigo é esquecido (a tabela não cresce sem fim)', () => {
    const sql = memorySql()
    const g = new SqlGuard(sql)
    for (let i = 0; i < 100; i++) g.hit('read', 'p', i * 1000)
    g.hit('read', 'p', 10 * 60_000)
    expect(sql.exec('SELECT COUNT(*) AS n FROM hits').toArray()[0]!.n).toBeLessThanOrEqual(2)
  })
})

describe('SqlGuard: códigos de uso único', () => {
  it('o mesmo código só passa uma vez, até vencer', () => {
    let now = 5000
    const g = new SqlGuard(memorySql(), () => now)
    expect(g.claim('p', 'n1', 1000)).toBe(true)
    expect(g.claim('p', 'n1', 1000)).toBe(false)
    expect(g.claim('q', 'n1', 1000)).toBe(true)
    now += 1001
    expect(g.claim('p', 'n1', 1000)).toBe(true)
  })

  it('sobrevive a "reiniciar" o guarda (a mesma base de dados)', () => {
    const sql = memorySql()
    expect(new SqlGuard(sql, () => 1).claim('p', 'n', 10_000)).toBe(true)
    expect(new SqlGuard(sql, () => 2).claim('p', 'n', 10_000)).toBe(false)
    expect(new SqlGuard(sql).hit('createIdentity', 'ip', 1).allowed).toBe(true)
  })
})

describe('SqlGuard: limpeza dos contadores (o IP não fica no disco)', () => {
  it('apaga os registros vencidos de chaves que nunca mais voltaram, e só eles', () => {
    const sql = memorySql()
    const guard = new SqlGuard(sql)
    const T = 10_000_000
    // Dois endereços fazem um pedido uma vez e nunca mais voltam; um terceiro faz um pedido agora.
    guard.hit('createIdentity', '203.0.113.7', T)
    guard.hit('read', '203.0.113.8', T)
    guard.hit('saveBlobIp', '203.0.113.9', T + 23 * 3_600_000)
    // Antes de vencer nada some.
    expect(guard.purge(T + 30_000)).toBe(3)
    // Depois de 24 h + um pouco, os dois primeiros somem (o `read` já vencia em 1 min); o terceiro ainda vale.
    expect(guard.purge(T + 24 * 3_600_000 + 1_000)).toBe(1)
    // Passados mais 24 h, não sobra nenhum endereço no disco.
    expect(guard.purge(T + 49 * 3_600_000)).toBe(0)
    expect(sql.exec('SELECT COUNT(*) AS n FROM hits').toArray()[0]!.n).toBe(0)
  })

  it('apaga também os códigos de uso único vencidos', () => {
    const sql = memorySql()
    let now = 1_000
    const guard = new SqlGuard(sql, () => now)
    expect(guard.claim('p', 'n1', 60_000)).toBe(true)
    now += 120_000
    guard.purge(now)
    expect(sql.exec('SELECT COUNT(*) AS n FROM nonces').toArray()[0]!.n).toBe(0)
  })
})
