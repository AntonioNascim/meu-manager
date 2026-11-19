import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FAN, coachStanding, fanMood, moodBandOf } from '../src/engine/clubView'
import type { Match } from '../src/engine/types'
import { advanceToMatchday, boardOf, createGame, finishPendingMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { ClubScreen } from '../src/ui/screens/ClubScreen'

const USER = 'team-imp'
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const game = (gf: number, ga: number, day: number): Match =>
  ({ id: `m${day}`, competitionId: 'c', round: day, date: `2027-02-${String(day).padStart(2, '0')}`, homeTeamId: USER, awayTeamId: 'x', status: 'finished', seed: 1, result: { homeGoals: gf, awayGoals: ga, events: [], homeStats: {}, awayStats: {}, playerResults: [] } }) as unknown as Match

describe('humor da torcida (só leitura)', () => {
  it('sem jogos é neutro e com vitórias sobe, com derrotas desce', () => {
    expect(fanMood([], USER, 5, 5)).toMatchObject({ games: 0, band: 'with-team' })
    const wins = fanMood([1, 2, 3, 4, 5].map((d) => game(2, 0, d)), USER, 3, 6)
    const losses = fanMood([1, 2, 3, 4, 5].map((d) => game(0, 2, d)), USER, 15, 6)
    expect(wins.value).toBeGreaterThan(75)
    expect(wins.band).toBe('enthusiastic')
    expect(losses.value).toBeLessThan(35)
    expect(losses.band).toBe('angry')
    expect(wins.games).toBe(FAN.recent)
  })

  it('só conta os últimos 5 jogos e a posição contra a meta pesa, com teto', () => {
    const old = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => game(d <= 3 ? 0 : 1, d <= 3 ? 3 : 0, d))
    expect(fanMood(old, USER, 6, 6).value).toBeGreaterThan(fanMood(old.slice(0, 5), USER, 6, 6).value)
    const ms = [1, 2, 3].map((d) => game(1, 1, d))
    const high = fanMood(ms, USER, 1, 15).value
    const low = fanMood(ms, USER, 20, 1).value
    expect(high).toBeGreaterThan(low)
    expect(high - low).toBeLessThanOrEqual(2 * FAN.positionCap + 1)
    expect([moodBandOf(80), moodBandOf(60), moodBandOf(40), moodBandOf(10)]).toEqual(['enthusiastic', 'with-team', 'uneasy', 'angry'])
  })

  it('o mercado vê o técnico pela reputação: quanto maior, mais clubes ele alcança', () => {
    const teams = Array.from({ length: 20 }, (_, i) => ({ reputation: i + 1 }))
    const small = coachStanding(5, teams)
    const big = coachStanding(15, teams)
    expect(big.reachable).toBeGreaterThan(small.reachable)
    expect(big.total).toBe(20)
    expect(big.reach).toBeGreaterThan(small.reach)
  })
})

describe('tela O clube', () => {
  it('mostra como te veem, a diretoria, a arquibancada, o ano e o mercado, sem mudar o jogo', () => {
    let g: Game = createGame(3, USER, { cups: false })
    for (let i = 0; i < 2; i++) {
      while (!g.pendingUserMatch) g = advanceToMatchday(g)
      const live = beginLive(g)
      live.match.playUntil(120)
      g = finishPendingMatch(g, live.match.result())
      clearLive()
    }
    const before = boardOf(g)
    const html = renderToStaticMarkup(createElement(ClubScreen, { game: g }))
    const t = text(html)
    for (const s of ['Como te veem', 'Diretoria', 'Torcida', 'Vestiário', 'A diretoria', 'Pede', 'A arquibancada', 'Público médio em casa', 'O ano', 'O mercado vê você', 'Reputação como técnico']) expect(t).toContain(s)
    for (const id of ['view-board', 'view-fans', 'view-locker', 'club-timeline']) expect(html).toContain(`data-testid="${id}"`)
    expect(boardOf(g)).toEqual(before)
  })
})
