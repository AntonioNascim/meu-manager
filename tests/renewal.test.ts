import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { generateWorld } from '../src/data/generateWorld'
import { createYouth } from '../src/data/generateYouth'
import { advanceSeason, expiringContracts, renewUserContract, renewalDecision, renewalDemand } from '../src/engine/offseason'
import { playerOverall } from '../src/engine/overall'
import { createSeason, simulateToSeasonEnd } from '../src/engine/season'
import { createGame, lastYearContracts, renewUserPlayer } from '../src/store/game'
import { Dashboard } from '../src/ui/screens/Dashboard'

const world = generateWorld({ seed: 33 })
const season = () => createSeason({ year: 2026, seed: 33, teams: world.teams, players: world.players })
const team = world.teams.find((t) => t.abbreviation === 'IMP')!
const squadOf = (players: typeof world.players, id: string) => players.filter((p) => p.teamId === id)

describe('pedido de renovação', () => {
  const star = [...squadOf(world.players, team.id)].sort((a, b) => playerOverall(b) - playerOverall(a))[0]!
  const reserve = [...squadOf(world.players, team.id)].sort((a, b) => playerOverall(a) - playerOverall(b))[0]!

  it('cresce com a força e cai com a reputação do clube', () => {
    expect(renewalDemand(star, team)).toBeGreaterThan(renewalDemand(reserve, team))
    expect(renewalDemand(star, { reputation: 3 })).toBeGreaterThan(renewalDemand(star, { reputation: 18 }))
  })

  it('veterano pede menos que o mesmo jogador no auge; promessa pede mais', () => {
    const peak = { ...star, age: 27 }
    expect(renewalDemand({ ...star, age: 36 }, team)).toBeLessThan(renewalDemand(peak, team))
    const young = { ...star, age: 20, hidden: { ...star.hidden, potential: Math.round(playerOverall(star)) + 20 } }
    const capped = { ...young, hidden: { ...young.hidden, potential: Math.round(playerOverall(star)) } }
    expect(renewalDemand(young, team)).toBeGreaterThan(renewalDemand(capped, team))
  })

  it('recusa salário baixo e diz o mínimo; aceita o pedido', () => {
    const squad = squadOf(world.players, team.id)
    const demand = renewalDemand(star, team)
    const refused = renewalDecision({ player: star, team, squad, salary: Math.round(demand * 0.5) })
    expect(refused.accepted).toBe(false)
    expect(refused.reason).toBe('salary')
    expect(refused.minimumSalary).toBeLessThanOrEqual(demand)
    expect(renewalDecision({ player: star, team, squad, salary: demand }).accepted).toBe(true)
    expect(renewalDecision({ player: star, team, squad, salary: refused.minimumSalary! }).accepted).toBe(true)
  })

  it('quem não tem espaço no time só fica por um salário bem acima do pedido', () => {
    const squad = squadOf(world.players, team.id)
    const bench = { ...reserve, position: 'ST' as const }
    const strongSquad = [...squad.filter((p) => p.id !== reserve.id), ...Array.from({ length: 5 }, (_, i) => ({ ...star, id: `x${i}`, position: 'ST' as const }))]
    const demand = renewalDemand(bench, team)
    const verdict = renewalDecision({ player: bench, team, squad: strongSquad, salary: demand })
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('playing-time')
    expect(renewalDecision({ player: bench, team, squad: strongSquad, salary: Math.ceil(demand * 1.4) }).accepted).toBe(true)
  })
})

describe('renovar pelo jogador', () => {
  it('aceita: novo contrato a partir do fim do atual; recusa: nada muda; erros de regra', () => {
    const s = season()
    const player = expiringContracts(s, team.id, 2027)[0]!
    const demand = renewalDemand(player, team)
    const budget = { ...s, teams: s.teams.map((t) => (t.id === team.id ? { ...t, finances: { ...t.finances, salaryBudget: 1_000_000_000 } } : t)) }
    const refused = renewUserContract(budget, team.id, { playerId: player.id, salary: Math.round(demand * 0.3), years: 3 })
    expect(refused.accepted).toBe(false)
    expect(refused.state).toBe(budget)
    const ok = renewUserContract(budget, team.id, { playerId: player.id, salary: demand, years: 3 })
    expect(ok.accepted).toBe(true)
    const renewed = ok.state.players.find((p) => p.id === player.id)!
    expect(renewed.contract.salary).toBe(demand)
    expect(Number(renewed.contract.endDate.slice(0, 4))).toBe(Math.max(Number(player.contract.endDate.slice(0, 4)), 2026) + 3)
    expect(() => renewUserContract(budget, team.id, { playerId: player.id, salary: demand, years: 9 })).toThrowError('invalid')
    const other = world.players.find((p) => p.teamId !== team.id)!
    expect(() => renewUserContract(budget, team.id, { playerId: other.id, salary: demand, years: 2 })).toThrowError('unavailable')
    const tight = { ...s, teams: s.teams.map((t) => (t.id === team.id ? { ...t, finances: { ...t.finances, salaryBudget: 1 } } : t)) }
    expect(() => renewUserContract(tight, team.id, { playerId: player.id, salary: demand * 100, years: 2 })).toThrowError('salary-budget')
  })

  it('no jogo: o painel avisa sobre contratos no último ano', () => {
    let g = createGame(33, team.id)
    const expiring = lastYearContracts(g)
    g = { ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === team.id ? { ...t, finances: { ...t.finances, salaryBudget: 1_000_000_000 } } : t)) } }
    const html = renderToStaticMarkup(createElement(Dashboard, { game: g, onNavigate: () => {} }))
    expect(html.includes('Contratos no último ano')).toBe(expiring.length > 0)
    if (expiring.length === 0) return
    const p = expiring[0]!
    const { game: after, result } = renewUserPlayer(g, { playerId: p.id, salary: renewalDemand(p, team), years: 2 })
    if (result.accepted) expect(lastYearContracts(after)).toHaveLength(expiring.length - 1)
  })
})

describe('renovação da IA', () => {
  it('renova pelo salário que o jogador pede, com contrato novo, e só quem serve ao time', () => {
    const ended = simulateToSeasonEnd(season(), { market: true })
    const { state, report } = advanceSeason(ended, { createYouth, userTeamId: team.id })
    expect(report.renewed).toBeGreaterThan(0)
    const before = new Map(ended.players.map((p) => [p.id, p]))
    let checked = 0
    for (const p of state.players) {
      const old = before.get(p.id)
      if (!old || !old.teamId || old.teamId === team.id || Number(old.contract.endDate.slice(0, 4)) > 2026 || p.teamId !== old.teamId) continue
      const t = state.teams.find((x) => x.id === p.teamId)!
      expect(p.contract.endDate > '2026-12-31').toBe(true)
      expect(p.contract.salary).toBe(renewalDemand(p, t))
      checked++
    }
    expect(checked).toBeGreaterThan(0)
    expect(report.released.filter((r) => r.teamId !== team.id).length).toBeGreaterThan(0)
  }, 120_000)
})
