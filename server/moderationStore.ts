/** Denúncias e banimentos no D1 (Fase 6, B9). */
import type { BanRow, ModerationStore, ReportKind, ReportRow, ReportStatus } from '../src/online/moderation'
import type { D1Like } from './d1Store'

interface R {
  id: string
  kind: string
  target: string
  reporter: string
  reason: string
  created_at: number
  status: string
}

export class D1ModerationStore implements ModerationStore {
  constructor(private db: D1Like) {}

  async addReport(r: Omit<ReportRow, 'status'>): Promise<boolean> {
    const res = await this.db
      .prepare("INSERT OR IGNORE INTO reports (id, kind, target, reporter, reason, created_at, status) VALUES (?, ?, ?, ?, ?, ?, 'open')")
      .bind(r.id, r.kind, r.target, r.reporter, r.reason, r.createdAt)
      .run()
    return res.meta.changes === 1
  }

  async openReporters(kind: ReportKind, target: string): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(DISTINCT reporter) AS n FROM reports WHERE kind = ? AND target = ? AND status = 'open'").bind(kind, target).first<{ n: number }>()
    return row?.n ?? 0
  }

  async setStatus(kind: ReportKind, target: string, status: ReportStatus): Promise<void> {
    await this.db.prepare("UPDATE reports SET status = ? WHERE kind = ? AND target = ? AND status = 'open'").bind(status, kind, target).run()
  }

  async list(status: ReportStatus, limit: number): Promise<ReportRow[]> {
    const res = await this.db.prepare('SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT ?').bind(status, limit).all<R>()
    return res.results.map((r) => ({ id: r.id, kind: r.kind as ReportKind, target: r.target, reporter: r.reporter, reason: r.reason as ReportRow['reason'], createdAt: r.created_at, status: r.status as ReportStatus }))
  }

  async ban(row: BanRow): Promise<void> {
    await this.db.prepare('INSERT OR REPLACE INTO bans (player_id, reason, banned_at) VALUES (?, ?, ?)').bind(row.playerId, row.reason, row.bannedAt).run()
  }

  async unban(playerId: string): Promise<boolean> {
    const res = await this.db.prepare('DELETE FROM bans WHERE player_id = ?').bind(playerId).run()
    return res.meta.changes === 1
  }

  async purgeDecided(before: number): Promise<number> {
    const res = await this.db.prepare("DELETE FROM reports WHERE status != 'open' AND created_at < ?").bind(before).run()
    return res.meta.changes
  }

  async forgetPlayer(playerId: string): Promise<void> {
    await this.db.prepare("DELETE FROM reports WHERE reporter = ? OR (kind = 'nickname' AND target = ?)").bind(playerId, playerId).run()
  }

  async listBans(limit: number): Promise<BanRow[]> {
    const res = await this.db.prepare('SELECT player_id, reason, banned_at FROM bans ORDER BY banned_at DESC LIMIT ?').bind(limit).all<{ player_id: string; reason: string; banned_at: number }>()
    return res.results.map((r) => ({ playerId: r.player_id, reason: r.reason, bannedAt: r.banned_at }))
  }

  async counts(): Promise<{ openReports: number; bans: number }> {
    const a = await this.db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").bind().first<{ n: number }>()
    const b = await this.db.prepare('SELECT COUNT(*) AS n FROM bans').bind().first<{ n: number }>()
    return { openReports: a?.n ?? 0, bans: b?.n ?? 0 }
  }
}
