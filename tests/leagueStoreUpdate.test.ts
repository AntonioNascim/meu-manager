import { describe, expect, it } from 'vitest'
import { D1LeagueStore } from '../server/leagueStore'

/** Banco de mentira que só guarda o SQL e os valores de cada comando. */
function fakeDb() {
  const calls: { sql: string; values: unknown[] }[] = []
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return { run: async () => void calls.push({ sql, values }), first: async () => null, all: async () => ({ results: [] }) }
        },
      }
    },
  }
  return { db: db as never, calls }
}

describe('D1LeagueStore.update', () => {
  it('grava o ritmo novo (o ritmo mudado pelo ADM não pode voltar ao antigo ao reabrir a liga)', async () => {
    const { db, calls } = fakeDb()
    await new D1LeagueStore(db).update('liga-1', { pace: 'very-fast' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.sql).toContain('pace = ?')
    expect(calls[0]?.values).toEqual(['very-fast', 'liga-1'])
  })

  it('continua gravando os outros campos e não faz nada sem campos', async () => {
    const { db, calls } = fakeDb()
    const store = new D1LeagueStore(db)
    await store.update('liga-1', { status: 'running', entryClosed: true })
    expect(calls[0]?.sql).toContain('status = ?')
    expect(calls[0]?.sql).toContain('entry_closed = ?')
    await store.update('liga-1', {})
    expect(calls).toHaveLength(1)
  })
})
