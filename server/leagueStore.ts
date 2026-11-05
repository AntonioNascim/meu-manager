/** Ligas no D1 (Fase 6, B8.3): o índice das ligas e dos técnicos (a sala da liga é a dona das vagas). */
import type { LeagueRecord, LeagueRow, LeagueStore, MemberRecord, WorldRef } from '../src/online/leagueApi'
import type { D1Like } from './d1Store'

interface Row {
  id: string
  name: string
  kind: string
  code: string | null
  admin_id: string
  pace: string
  band: string
  tz_offset: number
  world: string
  seed: number
  max_humans: number
  status: string
  entry_closed: number
  hidden: number
  direct: number
  created_at: number
  humans?: number
}

const toRecord = (r: Row): LeagueRecord => ({
  id: r.id,
  name: r.name,
  kind: r.kind as LeagueRecord['kind'],
  ...(r.code ? { code: r.code } : {}),
  adminId: r.admin_id,
  pace: r.pace as LeagueRecord['pace'],
  band: r.band as LeagueRecord['band'],
  tzOffsetMin: r.tz_offset,
  world: JSON.parse(r.world) as WorldRef,
  seed: r.seed,
  maxHumans: r.max_humans,
  status: r.status as LeagueRecord['status'],
  entryClosed: r.entry_closed === 1,
  hidden: r.hidden === 1,
  directResult: r.direct === 1,
  createdAt: r.created_at,
})

const HUMANS = '(SELECT COUNT(*) FROM league_members m WHERE m.league_id = l.id) AS humans'

export class D1LeagueStore implements LeagueStore {
  constructor(private db: D1Like) {}

  async create(l: LeagueRecord): Promise<boolean> {
    const res = await this.db
      .prepare('INSERT OR IGNORE INTO leagues (id, name, kind, code, admin_id, pace, band, tz_offset, world, seed, max_humans, status, entry_closed, hidden, direct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(l.id, l.name, l.kind, l.code ?? null, l.adminId, l.pace, l.band, l.tzOffsetMin, JSON.stringify(l.world), l.seed, l.maxHumans, l.status, l.entryClosed ? 1 : 0, l.hidden ? 1 : 0, l.directResult ? 1 : 0, l.createdAt)
      .run()
    return res.meta.changes === 1
  }

  async get(id: string): Promise<LeagueRecord | undefined> {
    const r = await this.db.prepare('SELECT * FROM leagues WHERE id = ?').bind(id).first<Row>()
    return r ? toRecord(r) : undefined
  }

  async findByCode(code: string): Promise<LeagueRecord | undefined> {
    const r = await this.db.prepare('SELECT * FROM leagues WHERE code = ?').bind(code).first<Row>()
    return r ? toRecord(r) : undefined
  }

  async update(id: string, patch: Partial<Omit<LeagueRecord, 'id'>>): Promise<void> {
    const sets: string[] = []
    const values: unknown[] = []
    const add = (column: string, value: unknown) => (sets.push(`${column} = ?`), values.push(value))
    if (patch.name !== undefined) add('name', patch.name)
    if (patch.code !== undefined) add('code', patch.code)
    if (patch.adminId !== undefined) add('admin_id', patch.adminId)
    if (patch.status !== undefined) add('status', patch.status)
    if (patch.entryClosed !== undefined) add('entry_closed', patch.entryClosed ? 1 : 0)
    if (patch.hidden !== undefined) add('hidden', patch.hidden ? 1 : 0)
    if (sets.length === 0) return
    await this.db.prepare(`UPDATE leagues SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id).run()
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM league_members WHERE league_id = ?').bind(id).run()
    await this.db.prepare('DELETE FROM leagues WHERE id = ?').bind(id).run()
  }

  async listOpen(limit: number, before?: number): Promise<LeagueRow[]> {
    const res = await this.db
      .prepare(
        `SELECT l.*, ${HUMANS} FROM leagues l WHERE l.kind = 'open' AND l.hidden = 0 AND l.status != 'closed' AND l.entry_closed = 0 AND (? IS NULL OR l.created_at < ?) AND (SELECT COUNT(*) FROM league_members m WHERE m.league_id = l.id) < l.max_humans ORDER BY l.created_at DESC LIMIT ?`,
      )
      .bind(before ?? null, before ?? null, limit)
      .all<Row>()
    return res.results.map((r) => ({ ...toRecord(r), humans: r.humans ?? 0 }))
  }

  async mine(playerId: string): Promise<LeagueRow[]> {
    const res = await this.db
      .prepare(`SELECT l.*, ${HUMANS} FROM leagues l WHERE l.status != 'closed' AND l.id IN (SELECT league_id FROM league_members WHERE player_id = ?) ORDER BY l.created_at DESC`)
      .bind(playerId)
      .all<Row>()
    return res.results.map((r) => ({ ...toRecord(r), humans: r.humans ?? 0 }))
  }

  async members(leagueId: string): Promise<MemberRecord[]> {
    const res = await this.db.prepare('SELECT league_id, player_id, team_id, joined_at FROM league_members WHERE league_id = ? ORDER BY joined_at').bind(leagueId).all<{ league_id: string; player_id: string; team_id: string; joined_at: number }>()
    return res.results.map((r) => ({ leagueId: r.league_id, playerId: r.player_id, teamId: r.team_id, joinedAt: r.joined_at }))
  }

  async addMember(m: MemberRecord): Promise<boolean> {
    const res = await this.db.prepare('INSERT OR IGNORE INTO league_members (league_id, player_id, team_id, joined_at) VALUES (?, ?, ?, ?)').bind(m.leagueId, m.playerId, m.teamId, m.joinedAt).run()
    return res.meta.changes === 1
  }

  async removeMember(leagueId: string, playerId: string): Promise<void> {
    await this.db.prepare('DELETE FROM league_members WHERE league_id = ? AND player_id = ?').bind(leagueId, playerId).run()
  }

  async countCreated(playerId: string): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM leagues WHERE admin_id = ? AND status != 'closed'").bind(playerId).first<{ n: number }>()
    return r?.n ?? 0
  }

  async countMemberships(playerId: string): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM league_members m JOIN leagues l ON l.id = m.league_id WHERE m.player_id = ? AND l.status != 'closed'").bind(playerId).first<{ n: number }>()
    return r?.n ?? 0
  }
}
