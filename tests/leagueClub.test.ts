import { describe, expect, it } from 'vitest'
import { applyClubAction, clubView } from '../src/engine/league'
import { ACADEMY } from '../src/engine/config'
import { createGame } from '../src/store/game'

const world = createGame(6, 'team-imp', { cups: false }).season
const teamId = world.season.competitions[0]!.teamIds[3]!
const other = world.season.competitions[0]!.teamIds[4]!

describe('Meu clube na liga online (B8.7)', () => {
  it('a visão traz meta, contratos que vencem com o pedido de salário e a base esperando decisão', () => {
    const v = clubView(world, teamId)!
    expect(v.objective.targetPosition).toBeGreaterThan(0)
    expect(v.squadSize).toBeGreaterThan(17)
    expect(v.expiring.length).toBeGreaterThan(0)
    for (const p of v.expiring) {
      expect(p.endDate <= v.seasonEnd).toBe(true)
      expect(p.demand).toBeGreaterThan(0)
    }
    expect(v.academyPending).toEqual([])
    expect(clubView(world, 'team-que-nao-existe')).toBeUndefined()
  })

  it('renovar estica o contrato e usa o pedido do jogador; outro clube e salário absurdo são recusados', () => {
    const v = clubView(world, teamId)!
    const p = v.expiring[0]!
    const r = applyClubAction(world, teamId, { type: 'renew', playerId: p.playerId, years: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const after = r.world.players.find((x) => x.id === p.playerId)!
      expect(after.contract.endDate > v.seasonEnd).toBe(true)
      expect(after.contract.salary).toBe(p.demand)
      expect(clubView(r.world, teamId)!.expiring.some((x) => x.playerId === p.playerId)).toBe(false)
    }
    expect(applyClubAction(world, other, { type: 'renew', playerId: p.playerId, years: 2 })).toEqual({ ok: false, error: 'unavailable' })
    expect(applyClubAction(world, teamId, { type: 'renew', playerId: p.playerId, years: 2, salary: (p.demand as number) * 10 })).toEqual({ ok: false, error: 'invalid' })
    expect(applyClubAction(world, teamId, { type: 'renew', playerId: p.playerId, years: 9 }).ok).toBe(false)
  })

  it('salário abaixo do aceitável é recusado e diz o mínimo', () => {
    const p = clubView(world, teamId)!.expiring[0]!
    const r = applyClubAction(world, teamId, { type: 'renew', playerId: p.playerId, years: 1, salary: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.minimumSalary).toBeGreaterThan(1)
  })

  it('promover e dispensar só valem para o jovem do próprio clube que já fez 20 anos', () => {
    const youth = world.academy.find((y) => y.teamId === teamId)!
    expect(applyClubAction(world, teamId, { type: 'promote', playerId: youth.id })).toEqual({ ok: false, error: 'not-eligible' })
    const grown = { ...world, academy: world.academy.map((y) => (y.id === youth.id ? { ...y, age: ACADEMY.graduationAge } : y)) }
    expect(clubView(grown, teamId)!.academyPending.map((y) => y.playerId)).toEqual([youth.id])
    expect(applyClubAction(grown, other, { type: 'promote', playerId: youth.id })).toEqual({ ok: false, error: 'not-found' })
    const promoted = applyClubAction(grown, teamId, { type: 'promote', playerId: youth.id })
    expect(promoted.ok).toBe(true)
    if (promoted.ok) {
      expect(promoted.world.players.find((p) => p.id === youth.id)?.teamId).toBe(teamId)
      expect(promoted.world.academy.some((y) => y.id === youth.id)).toBe(false)
    }
    const released = applyClubAction(grown, teamId, { type: 'release-youth', playerId: youth.id })
    expect(released.ok).toBe(true)
    if (released.ok) expect(released.world.players.some((p) => p.id === youth.id)).toBe(false)
  })
})
