/** Identidades no D1 (Fase 6, B2). */
import type { IdentityRecord, IdentityStore } from '../src/online/identityApi'

/** O pedaço do D1 que usamos (o tipo completo vem do Cloudflare; aqui só o que importa). */
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
      run(): Promise<{ meta: { changes: number } }>
    }
  }
}

export class D1IdentityStore implements IdentityStore {
  constructor(private db: D1Like) {}

  async get(playerId: string): Promise<IdentityRecord | undefined> {
    const row = await this.db
      .prepare('SELECT i.player_id, i.created_at, i.last_seen, i.nickname, b.banned_at FROM identities i LEFT JOIN bans b ON b.player_id = i.player_id WHERE i.player_id = ?')
      .bind(playerId)
      .first<{
        player_id: string
        created_at: number
        last_seen: number
        nickname: string | null
        banned_at: number | null
      }>()
    return row ? { playerId: row.player_id, createdAt: row.created_at, lastSeen: row.last_seen, nickname: row.nickname ?? undefined, ...(row.banned_at !== null ? { bannedAt: row.banned_at } : {}) } : undefined
  }

  async create(record: IdentityRecord): Promise<boolean> {
    const res = await this.db
      .prepare('INSERT OR IGNORE INTO identities (player_id, created_at, last_seen, nickname) VALUES (?, ?, ?, ?)')
      .bind(record.playerId, record.createdAt, record.lastSeen, record.nickname ?? null)
      .run()
    return res.meta.changes === 1
  }

  async setLastSeen(playerId: string, at: number): Promise<void> {
    await this.db.prepare('UPDATE identities SET last_seen = ? WHERE player_id = ?').bind(at, playerId).run()
  }

  async setNickname(playerId: string, nickname: string): Promise<void> {
    await this.db.prepare('UPDATE identities SET nickname = ? WHERE player_id = ?').bind(nickname, playerId).run()
  }


  async delete(playerId: string): Promise<void> {
    await this.db.prepare('DELETE FROM identities WHERE player_id = ?').bind(playerId).run()
  }

  async listInactive(before: number, limit: number): Promise<string[]> {
    const res = await this.db.prepare('SELECT player_id FROM identities WHERE last_seen < ? ORDER BY last_seen LIMIT ?').bind(before, limit).all<{ player_id: string }>()
    return res.results.map((r) => r.player_id)
  }
}
