import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { advanceToNextEvent } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { createGame, turnRunner } from '../src/store/game'
import { SqliteWorldStore, MemoryWorldStore, type WorldSql } from '../src/store/worldStore'

/** O mesmo formato do SQLite do Durable Object (`sql.exec(...).toArray()` e `transactionSync`), em cima do `node:sqlite`. */
function nodeSql(db = new DatabaseSync(':memory:'), hook?: (query: string) => void): WorldSql {
  return {
    exec(query, ...bindings) {
      hook?.(query)
      const stmt = db.prepare(query)
      const rows = /^\s*select/i.test(query) ? (stmt.all(...(bindings as never[])) as Record<string, unknown>[]) : (stmt.run(...(bindings as never[])), [])
      return { toArray: () => rows }
    },
    transaction(fn) {
      db.exec('BEGIN')
      try {
        const out = fn()
        db.exec('COMMIT')
        return out
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  }
}

/** Texto igual byte a byte, sem depender da ordem em que as chaves foram criadas. */
function stable(value: unknown): string {
  return JSON.stringify(JSON.parse(JSON.stringify(value)), (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  )
}

const start = createGame(6, 'team-imp', { cups: false }).season
const OPTIONS = { market: true, turn: turnRunner }
const step = (s: SeasonState): SeasonState => advanceToNextEvent(s, OPTIONS).state

describe('WorldStore: mundo em blocos no SQLite', () => {
  it('guardar e carregar devolve exatamente o mundo', () => {
    const sql = nodeSql()
    new SqliteWorldStore(sql).save(start)
    const loaded = new SqliteWorldStore(sql).load()
    expect(loaded).not.toBeNull()
    expect(stable(loaded)).toBe(stable(start))
  })

  it('sem nada guardado, load devolve null; a memória guarda o mesmo objeto', () => {
    expect(new SqliteWorldStore(nodeSql()).load()).toBeNull()
    const memory = new MemoryWorldStore()
    expect(memory.load()).toBeNull()
    memory.save(start)
    expect(memory.load()).toBe(start)
  })

  it('aceite: com reinícios no meio (recarrega do SQLite e segue dali), o mundo termina igual ao que ficou só em memória', () => {
    const ADVANCES = 70
    let reference = start
    for (let i = 0; i < ADVANCES; i++) reference = step(reference)

    const sql = nodeSql()
    let store = new SqliteWorldStore(sql)
    let state = start
    store.save(state)
    for (let i = 0; i < ADVANCES; i++) {
      state = step(state)
      store.save(state)
      if (i % 9 === 8) {
        // O Durable Object reiniciou: objeto novo, nada em memória, tudo vem do SQLite.
        store = new SqliteWorldStore(sql)
        state = store.load()!
      }
    }
    expect(stable(state)).toBe(stable(reference))
    expect(stable(new SqliteWorldStore(sql).load())).toBe(stable(reference))
  }, 300_000)

  it('grava só o que mudou: o mesmo mundo não grava nenhuma linha, e um avanço grava menos que o mundo todo', () => {
    const sql = nodeSql()
    const store = new SqliteWorldStore(sql)
    const first = store.save(start)
    expect(first.changed).toBe(first.parts)
    expect(store.save(start)).toMatchObject({ changed: 0, rowsWritten: 0 })
    const next = step(start)
    const second = store.save(next)
    expect(second.changed).toBeGreaterThan(0)
    expect(second.changed).toBeLessThanOrEqual(second.parts)
    expect(second.rowsWritten).toBeLessThanOrEqual(first.rowsWritten)
  })

  it('depois de um reinício, quem carregou não regrava o que não mudou; quem não carregou regrava tudo (mas o banco fica certo)', () => {
    const sql = nodeSql()
    new SqliteWorldStore(sql).save(start)
    const loaded = new SqliteWorldStore(sql)
    const state = loaded.load()!
    expect(loaded.save(state)).toMatchObject({ changed: 0, rowsWritten: 0 })
    const blind = new SqliteWorldStore(sql)
    const next = step(state)
    const stats = blind.save(next)
    expect(stats.changed).toBe(stats.parts)
    expect(stable(new SqliteWorldStore(sql).load())).toBe(stable(next))
  })

  it('a gravação é uma transação só: se falhar no meio, o mundo anterior continua inteiro e a próxima gravação funciona', () => {
    const db = new DatabaseSync(':memory:')
    let inserts = 0
    let failAt = Infinity
    const sql = nodeSql(db, (q) => {
      if (/insert or replace into world_part/i.test(q) && ++inserts === failAt) throw new Error('queda no meio')
    })
    const store = new SqliteWorldStore(sql)
    store.save(start)
    const next = step(start)
    inserts = 0
    failAt = 3
    expect(() => store.save(next)).toThrow('queda no meio')
    failAt = Infinity
    expect(stable(new SqliteWorldStore(nodeSql(db)).load())).toBe(stable(start))
    store.save(next)
    expect(stable(new SqliteWorldStore(nodeSql(db)).load())).toBe(stable(next))
  })

  it('texto grande é repartido em linhas de tamanho limitado e volta inteiro; pedaço que encolhe ou some não deixa lixo', () => {
    const db = new DatabaseSync(':memory:')
    const sql = nodeSql(db)
    const store = new SqliteWorldStore(sql, 2_000)
    store.save(start)
    const rows = db.prepare('SELECT MAX(LENGTH(data)) AS m, COUNT(*) AS n FROM world_part').get() as { m: number; n: number }
    expect(rows.m).toBeLessThanOrEqual(2_000)
    expect(rows.n).toBeGreaterThan(20)
    expect(stable(new SqliteWorldStore(sql, 2_000).load())).toBe(stable(start))
    // Um mundo menor (menos partidas): pedaços de partidas somem e os que encolheram perdem as linhas do fim.
    const smaller: SeasonState = { ...start, matches: start.matches.slice(0, 30) }
    store.save(smaller)
    expect(stable(new SqliteWorldStore(sql, 2_000).load())).toBe(stable(smaller))
    const left = db.prepare("SELECT COUNT(*) AS n FROM world_part WHERE name LIKE 'm:%'").get() as { n: number }
    expect(left.n).toBeLessThan(rows.n)
  })

  it('formato desconhecido é recusado, e não carregado errado', () => {
    const sql = nodeSql()
    new SqliteWorldStore(sql).save(start)
    sql.exec("UPDATE world_meta SET v = '99' WHERE k = 'format'")
    expect(() => new SqliteWorldStore(sql).load()).toThrow(/desconhecido/)
  })

  it('linha que falta no meio de um pedaço é detectada', () => {
    const db = new DatabaseSync(':memory:')
    const sql = nodeSql(db)
    new SqliteWorldStore(sql, 2_000).save(start)
    db.exec("DELETE FROM world_part WHERE name = 'season-core' AND seq = 0")
    expect(() => new SqliteWorldStore(sql, 2_000).load()).toThrow(/incompleto|ausente/)
  })
})

describe('WorldStore: uma temporada inteira, com a virada de temporada', () => {
  it('o mundo gravado e recarregado a cada passo chega à virada e ao ano seguinte igual ao que ficou em memória', () => {
    const turned = (s: SeasonState) => s.season.year > start.season.year
    let reference = start
    let steps = 0
    while (!turned(reference) && steps < 400) {
      reference = step(reference)
      steps++
    }
    expect(turned(reference)).toBe(true)

    const sql = nodeSql()
    const stats = { rows: 0, max: 0 }
    let state = start
    let store = new SqliteWorldStore(sql)
    store.save(state)
    for (let i = 0; i < steps; i++) {
      state = step(state)
      const saved = store.save(state)
      stats.rows += saved.rowsWritten
      stats.max = Math.max(stats.max, saved.largestChars)
      if (i % 25 === 24) {
        store = new SqliteWorldStore(sql)
        state = store.load()!
      }
    }
    expect(stable(state)).toBe(stable(reference))
    expect(stable(new SqliteWorldStore(sql).load())).toBe(stable(reference))
    // O maior pedaço cabe folgado em uma linha (limite de 2 MB do SQLite do Durable Object).
    expect(stats.max).toBeLessThan(1_500_000)
  }, 600_000)
})
