import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { FINANCE } from '../src/engine/config'
import {
  annualSponsorship,
  bestTicketPrice,
  defaultTicketPrice,
  matchAttendance,
  monthStartsBetween,
  monthlyPayroll,
  settleMonth,
  setTicketPrice,
  summarizeLedger,
  ticketDemand,
} from '../src/engine/finance'
import { advanceToNextEvent, completeMatch, createSeason, playUserMatchAuto, simulateToSeasonEnd, userMatchInput } from '../src/engine/season'
import { advanceToMatchday, createGame, playPendingAuto, setUserTicketPrice, userTeam } from '../src/store/game'
import type { Game } from '../src/store/game'
import { Finance } from '../src/ui/screens/Finance'

const world = generateWorld({ seed: 5 })
const teamOf = (abbr: string) => world.teams.find((t) => t.abbreviation === abbr)!
const imp = teamOf('IMP')
const tam = teamOf('TAM')
const season = () => createSeason({ year: 2026, seed: 5, teams: world.teams, players: world.players })
const sumLedger = (t: { finances: { ledger: { amount: number }[] } }) => t.finances.ledger.reduce((s, e) => s + e.amount, 0)

describe('bilheteria', () => {
  it('o preço padrão cresce com a reputação', () => {
    expect(defaultTicketPrice(19)).toBeGreaterThan(defaultTicketPrice(10))
    expect(defaultTicketPrice(10)).toBeGreaterThan(defaultTicketPrice(3))
    expect(imp.ticketPrice).toBe(defaultTicketPrice(imp.reputation))
  })

  it('preço maior reduz a procura; o público nunca passa da capacidade nem fica negativo', () => {
    const rival = { reputation: 10 }
    expect(ticketDemand(tam, rival, 40)).toBeLessThan(ticketDemand(tam, rival, 20))
    for (const t of world.teams) {
      for (const price of [FINANCE.ticket.min, t.ticketPrice, 100, FINANCE.ticket.max]) {
        const a = matchAttendance(t, rival, price)
        expect(a).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThanOrEqual(t.stadium.capacity)
      }
    }
  })

  it('rival de reputação maior leva mais gente ao estádio', () => {
    expect(ticketDemand(tam, { reputation: 18 })).toBeGreaterThan(ticketDemand(tam, { reputation: 4 }))
  })

  it('o preço que enche o estádio é o de maior receita (ingresso mais caro só rende com estádio cheio)', () => {
    for (const t of [imp, tam, teamOf('SGA'), teamOf('ARZ')]) {
      const rival = { reputation: 10 }
      const revenueAt = (p: number) => matchAttendance(t, rival, p) * p
      const best = bestTicketPrice(t)
      let top = 0
      for (let p = FINANCE.ticket.min; p <= FINANCE.ticket.max; p++) top = Math.max(top, revenueAt(p))
      expect(revenueAt(best)).toBeGreaterThanOrEqual(top * 0.97)
    }
  })

  it('só aceita preço dentro dos limites', () => {
    expect(setTicketPrice(imp, 50).ticketPrice).toBe(50)
    expect(() => setTicketPrice(imp, 0)).toThrow()
    expect(() => setTicketPrice(imp, FINANCE.ticket.max + 1)).toThrow()
    expect(() => setTicketPrice(imp, Number.NaN)).toThrow()
  })
})

describe('patrocínio e fechamento do mês', () => {
  it('patrocínio cresce com a reputação', () => {
    expect(annualSponsorship(imp)).toBeGreaterThan(annualSponsorship(teamOf('SGA')))
    expect(annualSponsorship(teamOf('SGA'))).toBeGreaterThan(annualSponsorship(tam))
  })

  it('no mês entra o patrocínio e saem salários e operação; o saldo acompanha', () => {
    const squad = world.players.filter((p) => p.teamId === imp.id)
    const closed = settleMonth(imp, squad, '2026-02-01', false)
    const by = summarizeLedger(closed.finances.ledger).byCategory
    expect(by.sponsorship).toBeGreaterThan(0)
    expect(by.salaries).toBe(-monthlyPayroll(squad))
    expect(by.operations).toBeLessThan(0)
    expect(closed.finances.balance).toBe(imp.finances.balance + sumLedger(closed))
  })

  it('clube da IA com saldo muito acima do teto reinveste o excesso; o do jogador não', () => {
    const rich = { ...imp, finances: { ...imp.finances, balance: 5_000_000_000 } }
    const squad = world.players.filter((p) => p.teamId === imp.id)
    const ai = settleMonth(rich, squad, '2026-02-01', true)
    const user = settleMonth(rich, squad, '2026-02-01', false)
    expect(ai.finances.balance).toBeLessThan(user.finances.balance - 1_000_000_000)
  })

  it('acha os primeiros dias de mês no intervalo, sem contar o dia de partida', () => {
    expect(monthStartsBetween('2026-01-01', '2026-04-11')).toEqual(['2026-02-01', '2026-03-01', '2026-04-01'])
    expect(monthStartsBetween('2026-04-11', '2026-04-12')).toEqual([])
    expect(monthStartsBetween('2026-04-30', '2026-05-01')).toEqual(['2026-05-01'])
  })
})

describe('finanças ao longo da temporada', () => {
  it('o saldo de todo clube é o saldo inicial mais os lançamentos', () => {
    const end = simulateToSeasonEnd(season())
    for (const t of end.teams) {
      const start = world.teams.find((x) => x.id === t.id)!
      expect(t.finances.balance).toBe(start.finances.balance + sumLedger(t))
    }
  })

  it('o mandante recebe a bilheteria do jogo e o público fica registrado na partida', () => {
    const step = advanceToNextEvent(season())
    const match = step.played[0]!
    expect(match.attendance).toBeGreaterThan(0)
    const home = step.state.teams.find((t) => t.id === match.homeTeamId)!
    const gate = home.finances.ledger.filter((e) => e.category === 'ticket-sales')
    expect(gate).toHaveLength(1)
    expect(gate[0]!.amount).toBe(match.attendance! * home.ticketPrice)
    const away = step.state.teams.find((t) => t.id === match.awayTeamId)!
    expect(away.finances.ledger.some((e) => e.category === 'ticket-sales')).toBe(false)
  })

  it('a pré-temporada paga os meses que passam até a primeira rodada', () => {
    const step = advanceToNextEvent(season())
    const ledger = step.state.teams[0]!.finances.ledger
    // 1º de fevereiro, março e abril, antes da rodada de 11 de abril.
    expect(ledger.filter((e) => e.category === 'sponsorship')).toHaveLength(3)
    expect(ledger.filter((e) => e.category === 'salaries').every((e) => e.amount < 0)).toBe(true)
  })

  it('as bilheterias da temporada somam público × preço de cada jogo em casa', () => {
    const end = simulateToSeasonEnd(season())
    const t = end.teams.find((x) => x.id === imp.id)!
    const games = end.matches.filter((m) => m.homeTeamId === t.id)
    expect(games).toHaveLength(19)
    expect(summarizeLedger(t.finances.ledger).byCategory['ticket-sales']).toBe(games.reduce((s, m) => s + m.attendance! * t.ticketPrice, 0))
  })
})

function playUntilHome(game: Game, teamId: string): Game {
  let g = game
  for (let i = 0; i < 80; i++) {
    g = advanceToMatchday(g)
    if (g.pendingUserMatch?.homeTeamId === teamId) return g
    g = playPendingAuto(g)
  }
  throw new Error('sem jogo em casa')
}

describe('time do jogador', () => {
  it('registra a bilheteria uma só vez ao concluir a partida, com o público do jogo', () => {
    const game = playUntilHome(createGame(5, 'team-imp'), 'team-imp')
    const pending = game.pendingUserMatch!
    const input = userMatchInput(game.season, pending, game.userTeamId)
    const before = userTeam(game).finances.ledger.filter((e) => e.category === 'ticket-sales').length
    const done = playPendingAuto(game)
    const ledger = userTeam(done).finances.ledger.filter((e) => e.category === 'ticket-sales')
    expect(ledger).toHaveLength(before + 1)
    expect(done.season.matches.find((m) => m.id === pending.id)!.attendance).toBe(input.attendance)
    expect(ledger.at(-1)!.amount).toBe(input.attendance! * userTeam(game).ticketPrice)
  })

  it('jogo fora de casa não rende bilheteria ao time do jogador', () => {
    let game = createGame(5, 'team-imp')
    for (let i = 0; i < 80; i++) {
      game = advanceToMatchday(game)
      if (game.pendingUserMatch?.awayTeamId === 'team-imp') break
      game = playPendingAuto(game)
    }
    expect(game.pendingUserMatch?.awayTeamId).toBe('team-imp')
    const done = playPendingAuto(game)
    const home = done.season.teams.find((t) => t.id === game.pendingUserMatch!.homeTeamId)!
    expect(home.finances.ledger.filter((e) => e.category === 'ticket-sales').length).toBeGreaterThan(0)
    expect(userTeam(done).finances.ledger.filter((e) => e.category === 'ticket-sales').length).toBe(
      userTeam(game).finances.ledger.filter((e) => e.category === 'ticket-sales').length,
    )
  })

  it('o preço definido muda o público do próximo jogo em casa', () => {
    const game = createGame(5, 'team-tam')
    const cheap = setUserTicketPrice(game, 10)
    const dear = setUserTicketPrice(game, 60)
    expect(userTeam(cheap).ticketPrice).toBe(10)
    expect(matchAttendance(userTeam(cheap), { reputation: 10 })).toBeGreaterThan(matchAttendance(userTeam(dear), { reputation: 10 }))
    expect(() => setUserTicketPrice(game, 0)).toThrow()
  })

  it('completeMatch lança uma só bilheteria por partida concluída', () => {
    let step = advanceToNextEvent(season(), { userTeamId: 'team-imp' })
    while (!step.pendingUserMatch) step = advanceToNextEvent(step.state, { userTeamId: 'team-imp' })
    const m = step.pendingUserMatch
    const finished = { ...m, status: 'finished' as const, result: playUserMatchAuto(step.state, m, 'team-imp').result! }
    const out = completeMatch(step.state, finished)
    const home = out.teams.find((t) => t.id === m.homeTeamId)!
    expect(home.finances.ledger.filter((e) => e.category === 'ticket-sales')).toHaveLength(1)
  })
})

describe('tela de finanças', () => {
  it('mostra saldo, preço do ingresso, categorias e lançamentos', () => {
    let game = createGame(5, 'team-imp')
    for (let i = 0; i < 4; i++) game = playPendingAuto(advanceToMatchday(game))
    const html = renderToStaticMarkup(createElement(Finance, { game }))
    expect(html).toContain('Saldo')
    expect(html).toContain('Preço do ingresso')
    expect(html).toContain('Patrocínio')
    expect(html).toContain('Salários')
    expect(html).toContain('Últimos lançamentos')
  })

  it('antes de qualquer lançamento avisa que não há histórico', () => {
    const html = renderToStaticMarkup(createElement(Finance, { game: createGame(5, 'team-imp') }))
    expect(html).toContain('Nenhum lançamento ainda')
  })
})

describe('cota de TV por divisão', () => {
  it('é bem maior na Série A, entra todo mês e conta na receita esperada', async () => {
    const { annualTvRights, expectedAnnualRevenue } = await import('../src/engine/finance')
    expect(annualTvRights(imp)).toBeGreaterThanOrEqual(4 * annualTvRights(tam))
    expect(annualTvRights(tam)).toBeGreaterThan(0)
    const month = settleMonth(imp, world.players.filter((p) => p.teamId === imp.id), '2026-02-01', false)
    const tv = month.finances.ledger.find((e) => e.category === 'tv-rights')!
    expect(tv.amount).toBe(Math.round(annualTvRights(imp) / 12))
    expect(expectedAnnualRevenue(imp)).toBeGreaterThan(annualSponsorship(imp) + annualTvRights(imp))
  })
})
