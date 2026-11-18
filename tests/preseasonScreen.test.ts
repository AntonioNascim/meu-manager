import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { applyPreseason, friendlyCandidates, planPreseason } from '../src/engine/preseason'
import { addDays } from '../src/engine/season/dates'
import { advanceToMatchday, createGame, finishPendingMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { Training } from '../src/ui/screens/squad/Training'
import { PreseasonCard } from '../src/ui/screens/squad/Preseason'

const USER = 'team-imp'
const html = (g: Game) => renderToStaticMarkup(createElement(PreseasonCard, { game: g }))
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('tela da pré-temporada', () => {
  it('no começo mostra as três decisões: local com custo e efeito, dias e adversários com cachê', () => {
    const g = createGame(3, USER, { cups: false })
    const out = html(g)
    expect(out).toContain('data-testid="preseason-wizard"')
    expect(out.match(/data-testid="preseason-place"/g)).toHaveLength(3)
    expect(out.match(/data-testid="preseason-opponent"/g)!.length).toBeGreaterThanOrEqual(10)
    expect(out).toContain('data-testid="preseason-days"')
    const t = text(out)
    expect(t).toContain('No CT')
    expect(t).toContain('Numa praça do país')
    expect(t).toContain('Excursão no exterior')
    expect(t).toContain('6% da receita mensal')
    expect(t).toContain('15% da receita mensal')
    expect(t).toContain('cachê')
    expect(t).toContain('+1 de moral, até +3')
    // a aba Treino traz o assistente
    expect(text(renderToStaticMarkup(createElement(Training, { game: g })))).toContain('Pré-temporada')
  })

  it('depois de confirmada mostra o resumo, e com os amistosos jogados o placar, o público, a renda e o cachê', () => {
    const base = createGame(3, USER, { cups: false })
    const opponents = friendlyCandidates(base.season, USER).slice(0, 3).map((t) => t.id)
    const planned: Game = { ...base, season: planPreseason(base.season, USER, { place: 'country', days: 14, opponents }) }
    const before = html(planned)
    expect(before).toContain('data-testid="preseason-summary"')
    expect(before).not.toContain('data-testid="preseason-wizard"')
    expect(before.match(/data-testid="friendly"/g)).toHaveLength(3)
    expect(text(before)).toContain('a jogar')
    const played: Game = { ...planned, season: applyPreseason(planned.season, planned.season.season.currentDate, addDays(planned.season.season.currentDate, 20)) }
    const after = text(html(played))
    expect(after).toMatch(/\d+ x \d+/)
    expect(after).toContain('pagantes')
    expect(after).toContain('cachês pagos')
    expect(after).not.toContain('a jogar')
  })

  it('depois do primeiro jogo da temporada o assistente some (e o resumo fica, se houve)', () => {
    let g: Game = createGame(3, USER, { cups: false })
    g = { ...g, season: planPreseason(g.season, USER, { place: 'camp', days: 12, opponents: [] }) }
    while (!g.pendingUserMatch) g = advanceToMatchday(g)
    const live = beginLive(g)
    live.match.playUntil(120)
    g = finishPendingMatch(g, live.match.result())
    clearLive()
    expect(html(g)).not.toContain('data-testid="preseason-wizard"')
    const none: Game = createGame(3, USER, { cups: false })
    let n = none
    while (!n.pendingUserMatch) n = advanceToMatchday(n)
    const l2 = beginLive(n)
    l2.match.playUntil(120)
    n = finishPendingMatch(n, l2.match.result())
    clearLive()
    expect(html(n)).toBe('')
  })
})
