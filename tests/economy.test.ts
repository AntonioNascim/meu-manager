import { describe, expect, it } from 'vitest'
import { createGenerationContext, generateTeam } from '../src/data/generateTeam'
import { createYouth } from '../src/data/generateYouth'
import type { TeamDefinition } from '../src/data/teamDefinitions'
import { LEAGUE } from '../src/engine/config'
import { clubLevel, divisionRevenue, exportPremium, salaryScale, valueScale } from '../src/engine/economy'
import { annualSponsorship, annualTvRights, defaultTicketPrice, expectedAnnualRevenue, monthlyOperations, sustainablePayroll } from '../src/engine/finance'
import { playerDecision, premiumPrice } from '../src/engine/market/decision'
import { expectedSalary, marketValue, salaryForOverall } from '../src/engine/market/value'
import { playerOverall } from '../src/engine/overall'
import { createRng } from '../src/engine/rng'
import type { LeagueEconomy, Player, Team } from '../src/engine/types'

const ENGLAND: LeagueEconomy = { revenue: 5, level: 8 }
const PARAGUAY: LeagueEconomy = { revenue: 0.25, level: -5 }

const def = (tier: 1 | 2 | 3, reputation: number, economy?: LeagueEconomy): TeamDefinition => ({ name: 'Clube', abbreviation: 'CLU', city: 'Cidade', state: 'XX', colors: ['#111111', '#f2f2f2'], tier, reputation, ...(economy ? { economy } : {}) })
const make = (d: TeamDefinition, seed = 'economia') => generateTeam(createRng(seed), createGenerationContext(2026), d, 5)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const strength = (g: { team: Team; players: Player[] }) => mean(g.team.tactic.startingXI.map((id) => playerOverall(g.players.find((p) => p.id === id) as Player)))

const brazil = make(def(1, 12))
const england = make(def(1, 12, ENGLAND))
const paraguay = make(def(1, 12, PARAGUAY))
const serieC = make(def(3, 4))

describe('índice de receita da liga', () => {
  it('sem economia o clube é brasileiro: nada muda, nem na Série B', () => {
    expect(brazil.team.economy).toBeUndefined()
    expect(salaryScale({ tier: 1 })).toBe(1)
    expect(salaryScale({ tier: 2 })).toBe(1)
    expect(valueScale({})).toBe(1)
    expect(divisionRevenue({ tier: 2 })).toBeCloseTo(0.15)
    expect(divisionRevenue({ tier: 3 })).toBeCloseTo(0.06)
  })

  it('TV, patrocínio, ingresso, operação e folha sustentável crescem com o índice, na mesma proporção', () => {
    const b = brazil.team
    const e = england.team
    expect(annualTvRights(e)).toBeCloseTo(annualTvRights(b) * 5)
    expect(annualSponsorship(e) / annualSponsorship(b)).toBeCloseTo(5, 1)
    expect(monthlyOperations(e) / monthlyOperations(b)).toBeCloseTo(5, 1)
    expect(defaultTicketPrice(12, e) / defaultTicketPrice(12, b)).toBeCloseTo(5, 1)
    expect(expectedAnnualRevenue(e) / expectedAnnualRevenue(b)).toBeCloseTo(5, 0)
    expect(sustainablePayroll(e) / sustainablePayroll(b)).toBeCloseTo(5, 0)
    expect(expectedAnnualRevenue(paraguay.team) / expectedAnnualRevenue(b)).toBeCloseTo(0.25, 1)
  })

  it('o nível dos jogadores acompanha a liga: a inglesa tem titulares mais fortes que a brasileira e a paraguaia, mais fracos', () => {
    const levels = [0, 1, 2, 3, 4, 5].map((i) => [strength(make(def(1, 12), `n${i}`)), strength(make(def(1, 12, ENGLAND), `n${i}`)), strength(make(def(1, 12, PARAGUAY), `n${i}`))] as const)
    expect(mean(levels.map((l) => l[1])) - mean(levels.map((l) => l[0]))).toBeGreaterThan(6)
    expect(mean(levels.map((l) => l[0])) - mean(levels.map((l) => l[2]))).toBeGreaterThan(3.5)
    expect(clubLevel({ tier: 1, economy: ENGLAND })).toBe(8)
    expect(clubLevel({ tier: 3 })).toBe(LEAGUE.tierLevel[3] as number)
  })

  it('os salários do elenco seguem a liga: cada país paga na sua escala e a Série C, menos', () => {
    const perPlayer = (g: { players: Player[] }) => mean(g.players.map((p) => p.contract.salary / salaryForOverall(playerOverall(p))))
    expect(perPlayer(england)).toBeGreaterThan(perPlayer(brazil) * 2.5)
    expect(perPlayer(paraguay)).toBeLessThan(perPlayer(brazil) * 0.6)
    expect(perPlayer(serieC)).toBeCloseTo(LEAGUE.salaryTierScale[3] as number, 1)
    // O jogador que um clube contrata pede o salário da liga dele.
    const p = brazil.players[3] as Player
    expect(expectedSalary(p, england.team) / expectedSalary(p)).toBeCloseTo(5 ** LEAGUE.salaryExponent, 1)
    expect(expectedSalary(p, serieC.team)).toBeLessThan(expectedSalary(p) * 0.7)
  })

  it('o preço do jogador segue a receita da divisão do clube que o tem: o mesmo jogador custa mais num clube rico e bem menos na Série C', () => {
    const p = brazil.players[5] as Player
    const date = '2026-02-01'
    expect(marketValue(p, date)).toBe(marketValue(p, date, brazil.team))
    expect(marketValue(p, date, england.team)).toBeGreaterThan(marketValue(p, date) * 2.5)
    expect(marketValue(p, date, paraguay.team)).toBeLessThan(marketValue(p, date) * 0.5)
    expect(marketValue(p, date, serieC.team)).toBeLessThan(marketValue(p, date) * 0.2)
  })

  it('a base de cada país nasce com o nível e o salário da liga dele', () => {
    const request = (economy?: LeagueEconomy) => ({ teamId: 'team-x', tier: 1, reputation: 12, positions: Array(40).fill('CM') as 'CM'[], year: 2027, ...(economy ? { economy } : {}) })
    const young = (economy?: LeagueEconomy) => createYouth(request(economy), createRng('base'), new Set())
    expect(mean(young(ENGLAND).map(playerOverall)) - mean(young().map(playerOverall))).toBeGreaterThan(5)
    expect(mean(young(PARAGUAY).map((p) => p.contract.salary / salaryForOverall(playerOverall(p))))).toBeLessThan(0.5)
  })
})

describe('liga no interesse do jogador e prêmio de exportação', () => {
  const player = (): Player => ({ ...(paraguay.players[4] as Player), age: 25 })
  const verdict = (buyer: Team, from: Team) => playerDecision({ player: player(), buyer, buyerSquad: [], from, fromSquad: [], salary: expectedSalary(player(), buyer), kind: 'purchase' })
  const relative = (buyer: Team, from: Team) => ((verdict(buyer, from).minimumSalary ?? Infinity) / expectedSalary(player(), buyer))

  it('quem sobe de liga aceita menos salário e quem desce exige mais', () => {
    const up = relative(england.team, paraguay.team)
    const same = relative({ ...paraguay.team, id: 'outro' }, paraguay.team)
    const down = relative(paraguay.team, england.team)
    expect(up).toBeLessThan(same)
    expect(down).toBeGreaterThan(same)
  })

  it('o dono pede mais de um comprador de liga mais rica (e o mesmo de liga igual ou mais pobre)', () => {
    expect(exportPremium(paraguay.team, england.team)).toBeCloseTo(1 + LEAGUE.exportPremium * Math.log2(20), 5)
    expect(exportPremium(england.team, paraguay.team)).toBe(1)
    expect(exportPremium(brazil.team, serieC.team)).toBe(1)
    expect(exportPremium({ tier: 1 }, { tier: 2 })).toBe(1)
    expect(premiumPrice(10_000_000, paraguay.team, england.team)).toBeGreaterThan(10_000_000)
    expect(premiumPrice(10_000_000, paraguay.team)).toBe(10_000_000)
  })
})
