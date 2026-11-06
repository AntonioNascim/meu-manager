import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { LeagueRoom, MAX_TICKETS_PER_PLAYER, TICKET_TTL_MS } from '../server/leagueRoom'

/** Sala com SQLite de verdade (node:sqlite) e relógio controlado: só o que importa para os tickets do WebSocket. */
class TestRoom extends LeagueRoom {
  t = 1_000_000
  constructor() {
    const db = new DatabaseSync(':memory:')
    const sql = {
      exec(q: string, ...b: unknown[]) {
        const rows = db.prepare(q).all(...(b as never[])) as Record<string, unknown>[]
        return { toArray: () => rows }
      },
    }
    const ctx = { storage: { sql, transactionSync: <T>(fn: () => T) => fn() }, getWebSockets: () => [] }
    super(ctx as never, {})
  }
  protected now(): number {
    return this.t
  }
  issue(playerId: string): string {
    return this.issueTicket(playerId, this.t)
  }
  open(ticket: string): string | undefined {
    return this.socketPlayer(new Request(`https://room/ws?ticket=${ticket}`))
  }
}

describe('ticket do WebSocket (sala)', () => {
  it('vale uma vez só', () => {
    const r = new TestRoom()
    const t = r.issue('ana')
    expect(r.open(t)).toBe('ana')
    expect(r.open(t)).toBeUndefined()
  })

  it('vence em 30 s', () => {
    const r = new TestRoom()
    const t = r.issue('ana')
    r.t += TICKET_TTL_MS + 1
    expect(r.open(t)).toBeUndefined()
  })

  it('ticket inventado ou mal formado não entra', () => {
    const r = new TestRoom()
    expect(r.open('0'.repeat(48))).toBeUndefined()
    expect(r.open('xyz')).toBeUndefined()
    expect(r.open('')).toBeUndefined()
  })

  it('dois pedidos quase juntos do mesmo técnico não se invalidam (reconexão em cima de outra)', () => {
    const r = new TestRoom()
    const a = r.issue('ana')
    const b = r.issue('ana')
    expect(a).not.toBe(b)
    expect(r.open(b)).toBe('ana')
    expect(r.open(a)).toBe('ana')
  })

  it('um técnico não pode acumular tickets sem fim; o de outro técnico não é afetado', () => {
    const r = new TestRoom()
    const bia = r.issue('bia')
    const mine: string[] = []
    for (let i = 0; i < MAX_TICKETS_PER_PLAYER + 3; i++) {
      r.t += 10
      mine.push(r.issue('ana'))
    }
    expect(r.open(mine[0]!)).toBeUndefined()
    expect(r.open(mine.at(-1)!)).toBe('ana')
    expect(r.open(bia)).toBe('bia')
  })
})
