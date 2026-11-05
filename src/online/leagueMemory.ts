/** Armazenamento de ligas em memória (testes). */
import type { LeagueRecord, LeagueRow, LeagueStore, MemberRecord } from './leagueApi'

export class MemoryLeagueStore implements LeagueStore {
  leagues = new Map<string, LeagueRecord>()
  private rows: MemberRecord[] = []

  async create(league: LeagueRecord) {
    if (this.leagues.has(league.id) || (league.code && [...this.leagues.values()].some((l) => l.code === league.code))) return false
    this.leagues.set(league.id, { ...league })
    return true
  }
  async get(id: string) {
    const l = this.leagues.get(id)
    return l ? { ...l } : undefined
  }
  async findByCode(code: string) {
    const l = [...this.leagues.values()].find((x) => x.code === code)
    return l ? { ...l } : undefined
  }
  async update(id: string, patch: Partial<Omit<LeagueRecord, 'id'>>) {
    const l = this.leagues.get(id)
    if (l) this.leagues.set(id, { ...l, ...patch })
  }
  async delete(id: string) {
    this.leagues.delete(id)
    this.rows = this.rows.filter((m) => m.leagueId !== id)
  }
  private row(l: LeagueRecord): LeagueRow {
    return { ...l, humans: this.rows.filter((m) => m.leagueId === l.id).length }
  }
  async listOpen(limit: number, before?: number) {
    return [...this.leagues.values()]
      .filter((l) => l.kind === 'open' && !l.hidden && l.status !== 'closed' && !l.entryClosed && (before === undefined || l.createdAt < before))
      .map((l) => this.row(l))
      .filter((l) => l.humans < l.maxHumans)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  }
  async mine(playerId: string) {
    const ids = new Set(this.rows.filter((m) => m.playerId === playerId).map((m) => m.leagueId))
    return [...this.leagues.values()].filter((l) => ids.has(l.id) && l.status !== 'closed').map((l) => this.row(l))
  }
  async members(leagueId: string) {
    return this.rows.filter((m) => m.leagueId === leagueId).map((m) => ({ ...m }))
  }
  async addMember(member: MemberRecord) {
    if (this.rows.some((m) => m.leagueId === member.leagueId && (m.playerId === member.playerId || m.teamId === member.teamId))) return false
    this.rows.push({ ...member })
    return true
  }
  async removeMember(leagueId: string, playerId: string) {
    this.rows = this.rows.filter((m) => !(m.leagueId === leagueId && m.playerId === playerId))
  }
  async countCreated(playerId: string) {
    return [...this.leagues.values()].filter((l) => l.adminId === playerId && l.status !== 'closed').length
  }
  async countMemberships(playerId: string) {
    const ids = new Set(this.rows.filter((m) => m.playerId === playerId).map((m) => m.leagueId))
    return [...this.leagues.values()].filter((l) => ids.has(l.id) && l.status !== 'closed').length
  }
}
