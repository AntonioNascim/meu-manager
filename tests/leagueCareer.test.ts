import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { LeagueRoom } from '../server/leagueRoom'
import { DEFAULT_CONFIG, careerView, createLeague, defaultLeagueConfig, dismissalCheck, freeClubsFor, parsePrefs, teamDetail } from '../src/engine/league'
import { createLeagueWorld } from '../src/store/leagueWorld'

const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const world = createLeagueWorld(41, undefined, { cups: false })
const comp = world.season.competitions[0]!
const MY = comp.teamIds[0]!

describe('demissão, carreira, detalhe e preferências (C6)', () => {
  it('a diretoria demite por finanças como no solo; time saudável não é demitido', () => {
    expect(dismissalCheck(world, MY)).toBeUndefined()
    const broke = { ...world, teams: world.teams.map((t) => (t.id === MY ? { ...t, finances: { ...t.finances, balance: -5e12 } } : t)) }
    expect(dismissalCheck(broke, MY)).toMatchObject({ reason: 'finances' })
  })

  it('os clubes livres são de reputação igual ou menor, sem técnico humano, os maiores primeiro', () => {
    const rep = world.teams.find((t) => t.id === MY)!.reputation
    const humans = new Set([comp.teamIds[1]!])
    const rows = freeClubsFor(world, humans, MY)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.reputation <= rep && !humans.has(r.teamId))).toBe(true)
    expect(rows.map((r) => r.reputation)).toEqual([...rows.map((r) => r.reputation)].sort((a, b) => b - a))
    expect(freeClubsFor(world, humans, 'inexistente')).toEqual([])
  })

  it('a carreira mostra cada passagem, com as temporadas fechadas enquanto ele esteve lá', () => {
    const w = { ...world, teams: world.teams.map((t) => (t.id === MY ? { ...t, history: [{ year: 2025, tier: 1, finalPosition: 3, champion: false }, { year: 2026, tier: 1, finalPosition: 1, champion: true }, { year: 2027, tier: 1, finalPosition: 9, champion: false }] } : t)) }
    const rows = careerView(w, [{ teamId: MY, since: '2026-01-01', until: '2026-12-31', ended: 'dismissed' }, { teamId: comp.teamIds[3]!, since: '2027-01-02' }])
    expect(rows).toHaveLength(2)
    expect(rows[0]!.teamId).toBe(comp.teamIds[3]) // a mais recente primeiro
    expect(rows[0]!.current).toBeDefined()
    expect(rows[1]!.seasons.map((s) => s.year)).toEqual([2026])
    expect(rows[1]!.ended).toBe('dismissed')
  })

  it('o detalhe traz a condição real do elenco e a tática do clube', () => {
    const victim = world.players.find((p) => p.teamId === comp.teamIds[2])!
    const w = { ...world, players: world.players.map((p) => (p.id === victim.id ? { ...p, condition: { ...p.condition, fitness: 41, morale: 12 } } : p)) }
    const d = teamDetail(w, comp.teamIds[2]!)!
    expect(d.conditions[victim.id]).toMatchObject({ fitness: 41, morale: 12 })
    expect(Object.keys(d.conditions).length).toBe(world.players.filter((p) => p.teamId === comp.teamIds[2]).length)
    expect(d.tactic.startingXI).toHaveLength(11)
    expect(teamDetail(w, 'nada')).toBeUndefined()
  })

  it('as preferências são conferidas: favoritos, três espaços e campos conhecidos', () => {
    const xi = Array.from({ length: 11 }, (_, i) => `p${i}`)
    const ok = { favorites: ['a', 'b', 'a'], lineups: [{ name: 'Minha', formationId: '4-4-2', style: 'possession', startingXI: xi }, null, null] }
    expect(parsePrefs(ok)?.favorites).toEqual(['a', 'b'])
    expect(parsePrefs({ ...ok, extra: 1 })).toBeUndefined()
    expect(parsePrefs({ favorites: ['a b'], lineups: [null, null, null] })).toBeUndefined()
    expect(parsePrefs({ favorites: [], lineups: [null, null] })).toBeUndefined()
    expect(parsePrefs({ favorites: [], lineups: [{ ...ok.lineups[0], style: 'x' }, null, null] })).toBeUndefined()
    expect(parsePrefs({ favorites: Array.from({ length: 400 }, (_, i) => `p${i}`), lineups: [null, null, null] })).toBeUndefined()
  })
})

class TestRoom extends LeagueRoom {
  constructor() {
    const db = new DatabaseSync(':memory:')
    const sql = {
      exec(q: string, ...b: unknown[]) {
        const rows = db.prepare(q).all(...(b as never[])) as Record<string, unknown>[]
        return { toArray: () => rows }
      },
    }
    super({ storage: { sql, transactionSync: <T>(fn: () => T) => fn(), setAlarm: async () => {}, deleteAlarm: async () => {}, getAlarm: async () => null }, getWebSockets: () => [] } as never, {})
  }
  setup(): void {
    const league = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('sala-carreira'), true), world, [{ teamId: MY, playerId: 'ana' }], T0)
    this.create({ leagueId: 'sala-carreira', kind: 'friends', createdAt: T0 }, league, world)
    ;(this as unknown as { stintStart(p: string, t: string): void }).stintStart('ana', MY)
  }
  breakClub(): void {
    this.world = { ...(this.world as typeof world), teams: (this.world as typeof world).teams.map((t) => (t.id === MY ? { ...t, finances: { ...t.finances, balance: -5e12 } } : t)) }
    ;(this as unknown as { checkDismissals(): void }).checkDismissals()
    this.persist({ world: true })
  }
  async q(op: string, args: Record<string, unknown> = {}, playerId = 'ana'): Promise<Record<string, unknown>> {
    const res = await this.fetch(new Request('https://room/internal/query', { method: 'POST', body: JSON.stringify({ playerId, op, args }) }))
    const text = await res.text()
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error(op + ': ' + text.slice(0, 300))
    }
  }
}

describe('sala da liga: demissão e escolha de outro clube (C6)', () => {
  it('demitido, o técnico perde a vaga, vê os clubes livres e assume um; clube maior é recusado', async () => {
    const room = new TestRoom()
    room.setup()
    expect(await room.q('dismissal')).toMatchObject({ ok: true, body: {} })
    room.breakClub()
    const d = (await room.q('dismissal')) as { body: { dismissal: { teamId: string; reason: string }; options: { teamId: string; reputation: number }[] } }
    expect(d.body.dismissal).toMatchObject({ teamId: MY, reason: 'finances' })
    expect(d.body.options.length).toBeGreaterThan(0)
    // Sem vaga de clube: o espelho não existe mais para ele.
    const mirror = await room.fetch(new Request('https://room/internal/mirror', { method: 'POST', body: JSON.stringify({ playerId: 'ana', since: null, page: 0 }) }))
    expect(await mirror.json()).toMatchObject({ ok: false, error: 'not-seated' })
    const bigger = world.teams.filter((t) => t.reputation > world.teams.find((x) => x.id === MY)!.reputation)[0]
    if (bigger) expect(await room.q('rechoose', { teamId: bigger.id })).toMatchObject({ ok: false, refused: 'not-eligible' })
    const pick = d.body.options.find((o) => o.teamId !== MY)!
    expect(await room.q('rechoose', { teamId: pick.teamId })).toMatchObject({ ok: true })
    expect(await room.q('dismissal')).toMatchObject({ body: {} })
    const career = (await room.q('career')) as { body: { rows: { teamId: string; ended?: string }[] } }
    expect(career.body.rows.map((r) => r.teamId)).toEqual([pick.teamId, MY])
    expect(career.body.rows[1]!.ended).toBe('dismissed')
    // Quem tem clube já não pode escolher de novo.
    expect(await room.q('rechoose', { teamId: pick.teamId })).toMatchObject({ ok: false })
  })

  it('detalhe só para quem tem clube; preferências guardadas por conta e recusadas se malformadas', async () => {
    const room = new TestRoom()
    room.setup()
    const other = comp.teamIds[2]!
    expect(await room.q('detail', { teamId: other })).toMatchObject({ ok: true })
    expect(await room.q('detail', { teamId: other }, 'intruso')).toMatchObject({ ok: false, error: 'not-seated' })
    const xi = Array.from({ length: 11 }, (_, i) => `p${i}`)
    const prefs = { favorites: ['p1', 'p2'], lineups: [{ name: 'A', formationId: '4-4-2', style: 'possession', startingXI: xi }, null, null] }
    expect(await room.q('prefs-set', { prefs })).toMatchObject({ ok: true })
    expect(await room.q('prefs-get')).toMatchObject({ ok: true, body: { favorites: ['p1', 'p2'] } })
    expect(await room.q('prefs-get', {}, 'outro')).toMatchObject({ body: { favorites: [] } })
    expect(await room.q('prefs-set', { prefs: { favorites: 'x' } })).toMatchObject({ ok: false, error: 'bad-body' })
  })
})
