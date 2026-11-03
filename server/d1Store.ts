/** Identidades no D1 (Fase 6, B2). */
import type { IdentityRecord, IdentityStore } from '../src/online/identityApi'

/** O pedaço do D1 que usamos (o tipo completo vem do Cloudflare; aqui só o que importa). */
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>
      run(): Promise<{ meta: { changes: number } }>
    }
  }
}

export class D1IdentityStore implements IdentityStore {
  constructor(private db: D1Like) {}

  async get(playerId: string): Promise<IdentityRecord | undefined> {
    const row = await this.db.prepare('SELECT player_id, created_at, last_seen, nickname FROM identities WHERE player_id = ?').bind(playerId).first<{
      player_id: string
      created_at: number
      last_seen: number
      nickname: string | null
    }>()
    return row ? { playerId: row.player_id, createdAt: row.created_at, lastSeen: row.last_seen, nickname: row.nickname ?? undefined } : undefined
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
}
