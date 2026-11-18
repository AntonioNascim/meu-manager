import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createGame, nextUserMatch } from '../src/store/game'
import { ScoutingSection } from '../src/ui/screens/standings/ScoutingSection'
import { OUTLOOK, outlookOf, sectorLevels, sectorVerdict, starOf } from '../src/ui/screens/standings/scouting'

const USER = 'team-imp'

describe('leitura do adversário', () => {
  it('o prognóstico soma 100% e respeita as metas do motor para times iguais (mandante ~45%, empate ~27%)', () => {
    const home = outlookOf(70, 70, true)
    expect(home.win + home.draw + home.lose).toBeCloseTo(1, 9)
    expect(home.win).toBeGreaterThan(0.38)
    expect(home.win).toBeLessThan(0.52)
    expect(home.draw).toBeGreaterThan(0.22)
    expect(home.draw).toBeLessThan(0.3)
    const away = outlookOf(70, 70, false)
    expect(away.win).toBeLessThan(home.win)
    expect(away.lose).toBeGreaterThan(home.lose)
  })

  it('quem é mais forte vence mais, o empate encolhe com a diferença e nada passa de 0 a 1', () => {
    const even = outlookOf(70, 70, true)
    const strong = outlookOf(80, 65, true)
    const weak = outlookOf(60, 80, true)
    expect(strong.win).toBeGreaterThan(even.win)
    expect(weak.win).toBeLessThan(even.win)
    expect(strong.draw).toBeLessThan(even.draw)
    for (const o of [even, strong, weak]) for (const v of [o.win, o.draw, o.lose]) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1)
    expect(OUTLOOK.drawPeak).toBeLessThan(0.3)
  })

  it('craque e setores vêm do elenco', () => {
    const game = createGame(3, USER, { cups: false })
    const rival = nextUserMatch(game)!
    const otherId = rival.homeTeamId === USER ? rival.awayTeamId : rival.homeTeamId
    const star = starOf(game, otherId)!
    expect(star.overall).toBeGreaterThan(40)
    const levels = sectorLevels(game, otherId)
    expect(Object.keys(levels).sort()).toEqual(['attack', 'defence', 'goalkeeper', 'midfield'])
    expect(Object.values(levels).every((v) => v > 0)).toBe(true)
    const v = sectorVerdict(game, otherId)
    expect(levels[v.strongest]).toBeGreaterThanOrEqual(levels[v.weakest])
  })

  it('a seção mostra prognóstico, craque e setores do próximo adversário', () => {
    const base = createGame(3, USER, { cups: false })
    // olheiro de nível 3: libera craque e setores (o nível 0 mostra só o prognóstico, pela força geral)
    const game = { ...base, season: { ...base.season, teams: base.season.teams.map((t) => (t.id === USER ? { ...t, scouting: { level: 3 as const, next: 3 as const } } : t)) } }
    const rival = nextUserMatch(game)!
    const otherId = rival.homeTeamId === USER ? rival.awayTeamId : rival.homeTeamId
    const html = renderToStaticMarkup(createElement(ScoutingSection, { game, teamId: otherId }))
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(html).toContain('data-testid="outlook"')
    expect(text).toContain('Vitória')
    expect(text).toContain('Empate')
    expect(text).toContain('Derrota')
    expect(text).toContain('O craque')
    expect(text).toContain('Meio-campo')
    // time que não é o próximo adversário: sem prognóstico
    const other = game.season.teams.find((t) => t.id !== USER && t.id !== otherId)!
    expect(renderToStaticMarkup(createElement(ScoutingSection, { game, teamId: other.id }))).not.toContain('data-testid="outlook"')
  })
})
