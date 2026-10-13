import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FINANCE } from '../src/engine/config'
import { addEntry, averageGate, cashOutlook, monthlyPayroll, sustainablePayroll } from '../src/engine/finance'
import { advanceSeason } from '../src/engine/offseason'
import { createYouth } from '../src/data/generateYouth'
import { simulateToSeasonEnd } from '../src/engine/season'
import type { FinanceEntry, Team } from '../src/engine/types'
import { advanceToMatchday, createGame, playPendingAuto, squadOf, userTeam } from '../src/store/game'
import type { Game } from '../src/store/game'
import { Finance } from '../src/ui/screens/Finance'
import { SeasonBalance, Statement, TicketSheet } from '../src/ui/screens/finance/Sheets'

const USER = 'team-imp'
const fresh = createGame(5, USER)
const play = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) g = playPendingAuto(advanceToMatchday(g))
  return g
}
const withTeam = (g: Game, change: (t: Team) => Team): Game => ({ ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === g.userTeamId ? change(t) : t)) } })

describe('panorama do caixa', () => {
  const team = userTeam(fresh)
  const payroll = monthlyPayroll(squadOf(fresh, USER))
  const today = '2026-05-01'
  const end = '2026-12-06'

  it('folha, folga e resultado do mês', () => {
    const o = cashOutlook(team, payroll, today, end)
    expect(o.payroll).toBe(payroll)
    expect(o.slack).toBe(team.finances.salaryBudget - payroll)
    expect(o.sustainable).toBe(sustainablePayroll(team))
  })

  it('caixa folgado e resultado positivo: o caixa se sustenta e não há alerta', () => {
    const rich = withTeam(fresh, (t) => ({ ...t, finances: { ...t.finances, balance: 500e6 } }))
    const o = cashOutlook(userTeam(rich), payroll * 0.2, today, end)
    expect(o.monthlyNet).toBeGreaterThan(0)
    expect(o.runwayMonths).toBeNull()
    expect(o.coversSeason).toBe(true)
    expect(o.alerts).toEqual([])
  })

  it('folha muito acima da sustentável dispara o alerta de folha', () => {
    const o = cashOutlook(team, sustainablePayroll(team) * 2, today, end)
    expect(o.alerts).toContain('payroll')
    expect(o.monthlyNet).toBeLessThan(0)
  })

  it('caixa pequeno com déficit mensal: diz até quando paga, e quando não chega ao fim da temporada vira alerta de dívida', () => {
    const poor = { ...team, finances: { ...team.finances, balance: 3_000_000 } }
    const heavy = sustainablePayroll(team) * 2
    const o = cashOutlook(poor, heavy, today, end)
    expect(o.runwayMonths).not.toBeNull()
    expect(o.coversUntil && o.coversUntil > today).toBe(true)
    expect(o.coversSeason).toBe(false)
    expect(o.projectedEndBalance).toBeLessThan(0)
    expect(o.alerts).toContain('debt')
    expect(o.dismissalDebt).toBeGreaterThan(0)
    const negative = cashOutlook({ ...team, finances: { ...team.finances, balance: -1 } }, heavy, today, end)
    expect(negative.coversUntil).toBe(today)
    expect(negative.alerts).toContain('debt')
  })

  it('renda média em casa e a última renda vêm da bilheteria lançada', () => {
    const gate = (amount: number): FinanceEntry => ({ date: '2026-04-12', category: 'ticket-sales', amount })
    let f = team.finances
    expect(averageGate(f.ledger)).toEqual({ average: 0, games: 0, last: null })
    for (const a of [100, 300, 200]) f = addEntry(f, gate(a))
    expect(averageGate(f.ledger)).toEqual({ average: 200, games: 3, last: 200 })
  })
})

describe('extrato e balanço', () => {
  it('o extrato guarda no máximo FINANCE.ledgerMax lançamentos e o saldo continua certo', () => {
    let f = userTeam(fresh).finances
    const start = f.balance
    for (let i = 0; i < FINANCE.ledgerMax + 50; i++) f = addEntry(f, { date: '2026-05-01', category: 'operations', amount: -10 })
    expect(f.ledger).toHaveLength(FINANCE.ledgerMax)
    expect(f.balance).toBe(start - 10 * (FINANCE.ledgerMax + 50))
  })

  it('guarda o resultado por categoria da temporada que passou e o balanço compara as duas', () => {
    const ended = simulateToSeasonEnd(createGame(5, USER).season)
    const { state } = advanceSeason(ended, { createYouth })
    const past = state.teams.find((t) => t.id === USER)?.finances.pastSeasons.at(-1)
    expect(past?.byCategory?.['tv-rights']).toBeGreaterThan(0)
    expect(past?.byCategory?.salaries).toBeLessThan(0)
    const game: Game = { ...fresh, season: state }
    const html = renderToStaticMarkup(createElement(SeasonBalance, { game, onClose: () => {} }))
    for (const text of ['Receitas', 'Despesas', 'Resultado', 'Bilheteria', 'Cota de TV', 'Salários', '2026', '2027']) expect(html).toContain(text)
  })

  it('o balanço da primeira temporada explica que a comparação vem depois', () => {
    expect(renderToStaticMarkup(createElement(SeasonBalance, { game: fresh, onClose: () => {} }))).toContain('depois da primeira virada')
  })

  it('o extrato lista cada lançamento com data, do mais recente ao mais antigo', () => {
    const g = play(fresh, 3)
    const html = renderToStaticMarkup(createElement(Statement, { game: g, onClose: () => {} }))
    expect(html).toContain('Bilheteria')
    expect(html).toMatch(/\d+ de [a-zç]+/)
  })

  it('o controle do ingresso mostra preço, público, lotação e o preço que enche o estádio', () => {
    const html = renderToStaticMarkup(createElement(TicketSheet, { game: fresh, onClose: () => {} }))
    for (const text of ['Ingresso', 'Público', 'Lotação', 'Renda por jogo', 'enche o estádio']) expect(html).toContain(text)
  })
})

describe('tela de finanças: alertas e avisos', () => {
  it('sem risco não mostra o cartão de alerta e traz o aviso verde do caixa', () => {
    const rich = withTeam(fresh, (t) => ({ ...t, finances: { ...t.finances, balance: 900e6 } }))
    const html = renderToStaticMarkup(createElement(Finance, { game: rich }))
    expect(html).not.toContain('Atenção com o caixa')
    expect(html).toContain('border-win/40')
  })

  it('folha acima da sustentável e caixa indo para a dívida: o alerta explica a situação e o aviso fica vermelho', () => {
    const poor = withTeam(fresh, (t) => ({ ...t, finances: { ...t.finances, balance: -5_000_000 } }))
    const g: Game = { ...poor, season: { ...poor.season, players: poor.season.players.map((p) => (p.teamId === USER ? { ...p, contract: { ...p.contract, salary: p.contract.salary * 4 } } : p)) } }
    const html = renderToStaticMarkup(createElement(Finance, { game: g }))
    expect(html).toContain('Atenção com o caixa')
    expect(html).toContain('passa dos')
    expect(html).toContain('demite o técnico')
    expect(html).toContain('border-loss/50')
  })
})
