import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createYouth } from '../src/data/generateYouth'
import { chooseSponsor, placeBet } from '../src/engine/sponsor'
import { advanceSeason } from '../src/engine/offseason'
import { simulateToSeasonEnd } from '../src/engine/season'
import { createGame } from '../src/store/game'
import type { Game } from '../src/store/game'
import { BetCard, SponsorCard } from '../src/ui/screens/finance/Sponsor'
import { Finance } from '../src/ui/screens/Finance'

const USER = 'team-imp'
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const game = (): Game => createGame(3, USER, { cups: false })
const withSeason = (g: Game, fn: (s: Game['season']) => Game['season']): Game => ({ ...g, season: fn(g.season) })

describe('cartões de patrocinador e aposta', () => {
  it('o patrocinador mostra as três ofertas com o valor mensal e o bônus; a escolhida fica marcada', () => {
    const g = game()
    const html = renderToStaticMarkup(createElement(SponsorCard, { game: g }))
    expect(html.match(/data-testid="sponsor-offer"/g)).toHaveLength(3)
    const t = text(html)
    for (const s of ['Patrocinador', 'Fixo, sem bônus', 'Fixo menor + bônus por posição', 'Fixo médio + bônus por superar a meta', '/mês', 'Escolha até o 1º jogo', 'Bônus de']) expect(t).toContain(s)
    expect(html).toMatch(/aria-checked="true"[^>]*data-offer="1"|data-offer="1"[^>]*aria-checked="true"/)
    const two = withSeason(g, (s) => chooseSponsor(s, USER, 2))
    expect(renderToStaticMarkup(createElement(SponsorCard, { game: two }))).toMatch(/aria-checked="true"[^>]*data-offer="2"|data-offer="2"[^>]*aria-checked="true"/)
  })

  it('a aposta mostra as três metas com o prêmio, e depois de feita mostra a escolhida', () => {
    const g = game()
    const html = renderToStaticMarkup(createElement(BetCard, { game: g }))
    expect(html.match(/data-testid="bet-option"/g)).toHaveLength(3)
    const t = text(html)
    for (const s of ['Aposta do ano', 'Prêmio', 'Fazer', 'Vencer', 'jogos em casa', 'Sofrer no máximo', 'Opcional']) expect(t).toContain(s)
    const placed = withSeason(g, (s) => placeBet(s, USER, 'home-wins'))
    const after = renderToStaticMarkup(createElement(BetCard, { game: placed }))
    expect(after).toContain('data-testid="bet-chosen"')
    expect(after).not.toContain('data-testid="bet-option"')
  })

  it('as Finanças trazem os dois cartões', () => {
    const html = renderToStaticMarkup(createElement(Finance, { game: game() }))
    expect(html).toContain('data-testid="sponsor-card"')
    expect(html).toContain('data-testid="bet-card"')
  })
})

describe('uma temporada inteira com patrocinador e aposta', () => {
  it('na virada paga o que foi cumprido, registra, apaga o contrato e a aposta, e a IA não muda', () => {
    const g = game()
    let s = chooseSponsor(g.season, USER, 2)
    s = placeBet(s, USER, 'points')
    const finished = simulateToSeasonEnd(s, { market: true })
    const before = finished.teams.find((t) => t.id === USER)!
    const { state, report } = advanceSeason(finished, { createYouth, userTeamId: USER })
    const after = state.teams.find((t) => t.id === USER)!
    expect(after.sponsor).toBeUndefined()
    expect(after.bet).toBeUndefined()
    expect(after.rewards).toMatchObject({ year: report.year, offer: 2 })
    expect(after.rewards!.position).toBe(report.finalPositions[USER]!.position)
    // o que entrou no extrato bate com o registro
    const paid = after.finances.ledger.filter((e) => e.date >= before.finances.ledger.at(-1)!.date && /Bônus do patrocinador|Aposta do ano/.test(e.description ?? '')).reduce((a, e) => a + e.amount, 0)
    expect(paid).toBe((after.rewards!.bonus ?? 0) + (after.rewards!.prize ?? 0))
    // clubes da IA: nenhum ganhou contrato nem aposta
    expect(state.teams.filter((t) => t.id !== USER).every((t) => t.sponsor === undefined && t.bet === undefined && t.rewards === undefined)).toBe(true)
  })
})
