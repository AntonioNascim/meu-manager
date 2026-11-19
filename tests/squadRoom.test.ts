import { describe, expect, it } from 'vitest'
import { ROOM, squadRoom } from '../src/engine/squadRoom'
import type { Player, Team } from '../src/engine/types'
import { createGame } from '../src/store/game'

const USER = 'team-imp'
const fixture = () => {
  const g = createGame(3, USER, { cups: false })
  const team = g.season.teams.find((t) => t.id === USER) as Team
  const squad = g.season.players.filter((p) => p.teamId === USER)
  return { g, team, squad }
}
const withStats = (squad: Player[], games: number): Player[] => squad.map((p, i) => ({ ...p, seasonStats: { ...p.seasonStats, appearances: Math.max(0, games - (i % 5)) } }))

describe('vestiário (só leitura)', () => {
  it('toda a hierarquia sai do elenco: 5 referências, 10 respeitados e o resto do grupo ou em teste, com pesos de 0 a 100 em ordem', () => {
    const { team, squad } = fixture()
    const room = squadRoom(team, withStats(squad, 12))
    expect(room.rows).toHaveLength(squad.length)
    expect(room.rows.filter((r) => r.role === 'reference')).toHaveLength(ROOM.references)
    expect(room.rows.filter((r) => r.role === 'respected')).toHaveLength(Math.min(ROOM.respected, squad.length - ROOM.references))
    const weights = room.rows.map((r) => r.weight)
    expect([...weights].sort((a, b) => b - a)).toEqual(weights)
    expect(Math.max(...weights)).toBeLessThanOrEqual(100)
    expect(Math.min(...weights)).toBeGreaterThanOrEqual(0)
    const roles = new Set(room.rows.map((r) => r.role))
    expect(roles.has('reference')).toBe(true)
    // as referências pesam mais que os demais
    const ref = room.rows.filter((r) => r.role === 'reference')
    const rest = room.rows.filter((r) => r.role === 'member' || r.role === 'trial')
    expect(Math.min(...ref.map((r) => r.weight))).toBeGreaterThanOrEqual(Math.max(...rest.map((r) => r.weight)))
  })

  it('o capitão e os titulares vêm da tática; a moral do grupo é a média do elenco', () => {
    const { team, squad } = fixture()
    const room = squadRoom(team, withStats(squad, 8))
    expect(room.captainId).toBe(team.tactic.captainId)
    expect(room.rows.filter((r) => r.captain)).toHaveLength(1)
    expect(room.rows.filter((r) => r.starter)).toHaveLength(11)
    const avg = squad.reduce((s, p) => s + p.condition.morale, 0) / squad.length
    expect(room.morale).toBeCloseTo(avg, 0)
    const sad = squad.map((p, i) => (i < 4 ? { ...p, condition: { ...p.condition, morale: 30 } } : p))
    expect(squadRoom(team, sad).lowMorale).toBeGreaterThanOrEqual(4)
  })

  it('salário abaixo do que o mercado paga a alguém da força dele vira queixa (só referências e respeitados)', () => {
    const { team, squad } = fixture()
    const room0 = squadRoom(team, withStats(squad, 12))
    const star = room0.rows.find((r) => r.role === 'reference')!.playerId
    const cheap = withStats(squad, 12).map((p) => (p.id === star ? { ...p, contract: { ...p.contract, salary: 1_000 } } : p))
    const row = squadRoom(team, cheap).rows.find((r) => r.playerId === star)!
    expect(row.complaint).toBe('salary')
    const young = withStats(squad, 12)
      .sort((a, b) => a.age - b.age)
      .find((p) => squadRoom(team, withStats(squad, 12)).rows.find((r) => r.playerId === p.id)?.role === 'trial')
    if (young) {
      const lowPaid = withStats(squad, 12).map((p) => (p.id === young.id ? { ...p, contract: { ...p.contract, salary: 1 } } : p))
      expect(squadRoom(team, lowPaid).rows.find((r) => r.playerId === young.id)?.complaint).not.toBe('salary')
    }
  })

  it('reserva com nível de titular reclama de minutos só depois de alguns jogos do time', () => {
    const { team, squad } = fixture()
    const bench = squad.filter((p) => !team.tactic.startingXI.includes(p.id)).sort((a, b) => b.age - a.age)
    const strong = bench[0]!
    const boosted = (games: number) => withStats(squad, games).map((p) => (p.id === strong.id ? { ...p, attributes: Object.fromEntries(Object.keys(p.attributes).map((k) => [k, 95])) as Player['attributes'], age: 30, contract: { ...p.contract, salary: 1e9 }, seasonStats: { ...p.seasonStats, appearances: 3 } } : p))
    expect(squadRoom(team, boosted(2)).rows.find((r) => r.playerId === strong.id)?.complaint).toBeUndefined()
    expect(squadRoom(team, boosted(14)).rows.find((r) => r.playerId === strong.id)?.complaint).toBe('minutes')
    expect(squadRoom(team, boosted(14)).complaints).toBeGreaterThanOrEqual(1)
  })

  it('entrosamento: formando no começo, e cresce com os jogos dos titulares juntos', () => {
    const { team, squad } = fixture()
    expect(squadRoom(team, squad).chemistry).toBe('forming')
    expect(squadRoom(team, squad).togetherShare).toBeNull()
    const xi = new Set(team.tactic.startingXI)
    const stats = (games: number, played: number) => squad.map((p) => ({ ...p, seasonStats: { ...p.seasonStats, appearances: xi.has(p.id) ? played : games } }))
    expect(squadRoom(team, stats(10, 10)).chemistry).toBe('tight')
    expect(squadRoom(team, stats(10, 6)).chemistry).toBe('building')
    expect(squadRoom(team, stats(10, 3)).chemistry).toBe('irregular')
    expect(squadRoom(team, stats(2, 2)).chemistry).toBe('forming')
  })

  it('não mexe no elenco nem no time: o resultado é só leitura', () => {
    const { team, squad } = fixture()
    const before = JSON.stringify([team, squad])
    squadRoom(team, squad)
    expect(JSON.stringify([team, squad])).toBe(before)
  })
})
