import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FINANCE } from '../src/engine/config'
import { budgetTotal, fundsDecision, monthlyPayroll, requestFunds, salaryShare, settleMonth, splitLimits } from '../src/engine/finance'
import { OfferError, makeOffer, expectedSalary, executeTransfer } from '../src/engine/market'
import { renewUserContract } from '../src/engine/offseason'
import { advanceSeason } from '../src/engine/offseason'
import { createYouth } from '../src/data/generateYouth'
import { simulateToSeasonEnd } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import type { Player, Team } from '../src/engine/types'
import { createGame, requestUserFunds, setUserSalaryBudget, squadOf, userFundsDecision, userTeam } from '../src/store/game'
import type { Game } from '../src/store/game'
import { MIGRATIONS, SAVE_VERSION, makeEnvelope, migrateSave, validateGame } from '../src/store/saveFormat'
import { Finance } from '../src/ui/screens/Finance'
import { fundsMessage } from '../src/ui/screens/finance/Budget'

const USER = 'team-imp'
const game: Game = createGame(5, USER)
const team = (g: Game) => userTeam(g)
const payrollOf = (g: Game) => monthlyPayroll(squadOf(g, g.userTeamId))
const withFinances = (g: Game, change: Partial<Team['finances']>): Game => ({
  ...g,
  season: { ...g.season, teams: g.season.teams.map((t) => (t.id === g.userTeamId ? { ...t, finances: { ...t.finances, ...change } } : t)) },
})

describe('divisão do orçamento entre salários e compras', () => {
  it('arrastar para os salários sobe um lado e desce o outro, e o total fica igual', () => {
    const f = team(game).finances
    const total = budgetTotal(f)
    const up = setUserSalaryBudget(game, f.salaryBudget + 200_000)
    const g = team(up).finances
    expect(g.salaryBudget).toBe(f.salaryBudget + 200_000)
    expect(g.transferBudget).toBe(f.transferBudget - 200_000 * FINANCE.budget.salaryMonths)
    expect(budgetTotal(g)).toBe(total)
    expect(salaryShare(g)).toBeGreaterThan(salaryShare(f))
    // E no sentido contrário (até a folha de hoje).
    const back = team(setUserSalaryBudget(up, f.salaryBudget)).finances
    expect(back.salaryBudget).toBe(f.salaryBudget)
    expect(back.transferBudget).toBe(f.transferBudget)
    expect(back.budgetShift).toBe(0)
  })

  it('os limites: salários nunca abaixo da folha de hoje e compras nunca negativas', () => {
    const f = team(game).finances
    const payroll = payrollOf(game)
    const limits = splitLimits(f, payroll)
    expect(limits.minSalary).toBeLessThanOrEqual(f.salaryBudget)
    expect(limits.minSalary).toBeGreaterThanOrEqual(Math.min(f.salaryBudget, payroll))
    const low = team(setUserSalaryBudget(game, 0)).finances
    expect(low.salaryBudget).toBe(limits.minSalary)
    expect(low.salaryBudget).toBeGreaterThanOrEqual(Math.min(f.salaryBudget, payroll))
    const high = team(setUserSalaryBudget(game, 1e9)).finances
    expect(high.transferBudget).toBeGreaterThanOrEqual(0)
    expect(high.transferBudget).toBeLessThan(FINANCE.budget.salaryMonths * 1_000)
    expect(budgetTotal(high)).toBeLessThanOrEqual(budgetTotal(f))
  })

  it('a divisão sobrevive ao fechamento do mês (as compras são refeitas descontando o que foi movido) e zera na virada', () => {
    const moved = setUserSalaryBudget(game, team(game).finances.salaryBudget + 100_000)
    const t = team(moved)
    const month = settleMonth(t, squadOf(moved, USER), '2026-02-01', false)
    const natural = Math.round((month.finances.balance * FINANCE.transferShare) / 10_000) * 10_000
    expect(month.finances.transferBudget).toBe(Math.max(0, natural - t.finances.budgetShift))
    expect(month.finances.salaryBudget).toBe(t.finances.salaryBudget)
    const ended = simulateToSeasonEnd(moved.season)
    const { state } = advanceSeason(ended, { createYouth, userTeamId: USER })
    const after = state.teams.find((x) => x.id === USER)!.finances
    expect(after.budgetShift).toBe(0)
    expect(after.purchaseBonus).toBe(0)
    expect(after.fundsRequests).toEqual([])
  })

  it('contratação e renovação respeitam o orçamento de salários: sem folga, a proposta e a renovação são barradas', () => {
    const tight = setUserSalaryBudget(game, 0)
    const state: SeasonState = { ...tight.season, players: tight.season.players.filter((p) => !(p.teamId === USER && p.age > 31)) }
    const target = state.players.find((p) => p.teamId && p.teamId !== USER && !p.contract.loanedFrom) as Player
    const room = splitLimits(state.teams.find((t) => t.id === USER)!.finances, monthlyPayroll(state.players.filter((p) => p.teamId === USER)))
    const salary = Math.max(room.minSalary, state.teams.find((t) => t.id === USER)!.finances.salaryBudget) + 1_000_000
    expect(() => makeOffer(state, USER, { kind: 'purchase', playerId: target.id, fee: 1_000, salary, contractEnd: '2029-12-31' })).toThrow(OfferError)
    const mine = state.players.find((p) => p.teamId === USER && !p.contract.loanedFrom) as Player
    expect(() => renewUserContract(state, USER, { playerId: mine.id, salary: mine.contract.salary + 5_000_000, years: 2 })).toThrow(OfferError)
    expect(expectedSalary(target)).toBeGreaterThan(0)
  })

  it('aumentar o orçamento de salários abre espaço para contratar', () => {
    const big = setUserSalaryBudget(game, 1e9)
    const state: SeasonState = { ...big.season, players: big.season.players.filter((p) => !(p.teamId === USER && p.age > 29)) }
    const t = state.teams.find((x) => x.id === USER)!
    const free = state.players.find((p) => p.teamId === null) ?? (state.players.find((p) => p.teamId && p.teamId !== USER) as Player)
    expect(t.finances.salaryBudget).toBeGreaterThan(team(game).finances.salaryBudget)
    expect(() => makeOffer(state, USER, { kind: 'purchase', playerId: free.id, fee: free.teamId ? 1_000 : 0, salary: 1_000_000, contractEnd: '2029-12-31' })).not.toThrow(/salary-budget/)
  })
})

describe('pedir verba à diretoria', () => {
  const rich = withFinances(game, { balance: 200e6, transferBudget: 10e6 })

  it('libera um valor extra para compras, conforme a confiança e o caixa, e nunca mais do que o caixa aguenta', () => {
    const r = requestFunds(rich.season, USER, 70)
    expect(r.granted).toBe(true)
    const t = r.state.teams.find((x) => x.id === USER)!.finances
    expect(t.transferBudget).toBe(10e6 + r.amount)
    expect(t.purchaseBonus).toBe(r.amount)
    expect(t.fundsRequests).toHaveLength(1)
    expect(r.amount).toBeLessThanOrEqual(r.detail.headroom)
    // Mais confiança, mais verba; o caixa continua cobrindo a reserva de salários.
    const more = fundsDecision(rich.season, USER, 100)
    const less = fundsDecision(rich.season, USER, 50)
    expect(more.amount).toBeGreaterThanOrEqual(less.amount)
    expect(t.balance - (t.transferBudget - 0)).toBeGreaterThan(-1)
    expect(r.detail.balance - r.detail.reserve - 10e6 - r.amount).toBeGreaterThanOrEqual(-1)
  })

  it('uma vez por janela: o segundo pedido é recusado com o motivo; em outra janela dá de novo', () => {
    const first = requestFunds(rich.season, USER, 70)
    const again = requestFunds(first.state, USER, 70)
    expect(again.granted).toBe(false)
    expect(again.reason).toBe('already-asked')
    expect(again.state).toBe(first.state)
    const midYear: SeasonState = { ...first.state, season: { ...first.state.season, currentDate: '2026-07-10' } }
    expect(requestFunds(midYear, USER, 70).granted).toBe(true)
  })

  it('recusa com a janela fechada, confiança baixa ou caixa sem folga, sem mexer em nada', () => {
    const closed: SeasonState = { ...rich.season, season: { ...rich.season.season, currentDate: '2026-05-20' } }
    expect(requestFunds(closed, USER, 70).reason).toBe('window-closed')
    const low = requestFunds(rich.season, USER, FINANCE.funds.minConfidence - 1)
    expect(low.reason).toBe('low-confidence')
    expect(low.state).toBe(rich.season)
    const broke = withFinances(game, { balance: 3e6, transferBudget: 1e6 })
    const denied = requestFunds(broke.season, USER, 90)
    expect(denied.reason).toBe('no-cash')
    expect(denied.amount).toBe(0)
    expect(denied.state).toBe(broke.season)
  })

  it('pela loja: o pedido entra no jogo e as mensagens explicam o motivo', () => {
    const ok = requestUserFunds(rich)
    expect(ok.result.granted).toBe(ok.game !== rich)
    if (ok.result.granted) expect(fundsMessage(ok.result, 1e6)).toContain('liberou')
    const refused = requestUserFunds(withFinances(game, { balance: 3e6, transferBudget: 1e6 }))
    expect(refused.game).toEqual(withFinances(game, { balance: 3e6, transferBudget: 1e6 }))
    expect(fundsMessage(refused.result, 0)).toContain('atrasar os salários')
    expect(userFundsDecision(game).detail.confidence).toBeGreaterThan(0)
    const again = requestUserFunds(ok.game)
    expect(fundsMessage(again.result, 0)).toContain('uma vez por janela')
  })

  it('a verba extra sobrevive ao fechamento do mês enquanto não é gasta e é consumida pelas compras', () => {
    const r = requestFunds(rich.season, USER, 70)
    const t = r.state.teams.find((x) => x.id === USER)!
    const month = settleMonth(t, r.state.players.filter((p) => p.teamId === USER), '2026-02-01', false)
    expect(month.finances.transferBudget).toBeGreaterThanOrEqual(t.finances.purchaseBonus)
    const target = r.state.players.find((p) => p.teamId && p.teamId !== USER) as Player
    const spent = executeTransfer(r.state, { playerId: target.id, toTeamId: USER, fee: r.amount + 10e6, salary: 20_000, contractEnd: '2029-12-31', kind: 'purchase', date: '2026-02-01' })
    const after = spent.teams.find((x) => x.id === USER)!.finances
    expect(after.purchaseBonus).toBe(0)
    expect(after.transferBudget).toBe(0)
  })
})

describe('tela e save', () => {
  it('a tela traz a barra do orçamento e o botão Pedir verba', () => {
    const html = renderToStaticMarkup(createElement(Finance, { game }))
    for (const text of ['Pedir verba', 'Dividir o orçamento entre salários e compras', 'Salários', 'Compras', 'Folga', 'Orçamento']) expect(html).toContain(text)
    expect(html).toContain('type="range"')
  })

  it('save versão 7: a migração 6→7 cria os campos do orçamento em todos os times', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(7)
    expect(MIGRATIONS[6]).toBeTypeOf('function')
    const old = JSON.parse(JSON.stringify(makeEnvelope(game, '2026-01-01T00:00:00Z')))
    for (const t of old.game.season.teams) {
      delete t.finances.budgetShift
      delete t.finances.purchaseBonus
      delete t.finances.fundsRequests
    }
    old.version = 6
    const migrated = migrateSave(old)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(validateGame(migrated.game)).toEqual([])
    for (const t of migrated.game.season.teams) expect(t.finances).toMatchObject({ budgetShift: 0, purchaseBonus: 0, fundsRequests: [] })
  })
})
