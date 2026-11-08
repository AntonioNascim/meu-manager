import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LeagueDismissed } from '../src/ui/screens/online/leagues/LeagueDismissed'
import { OnlineCareer } from '../src/ui/screens/online/OnlineCareer'

describe('telas da demissão e da carreira online (C6)', () => {
  const state = {
    leagueId: 'liga-1',
    dismissal: { teamId: 'team-1', date: '2026-05-10', reason: 'results' as const, confidence: 12, position: 17 },
    options: [
      { teamId: 'team-8', name: 'Clube Oito', reputation: 8, tier: 1, competition: 'Série A' },
      { teamId: 'team-9', name: 'Clube Nove Futebol Clube', shortName: 'Nove', reputation: 6, tier: 2, competition: 'Série B' },
    ],
  }

  it('a demissão explica o motivo e lista os clubes livres com a liga e a reputação', () => {
    const html = renderToStaticMarkup(createElement(LeagueDismissed, { state, onLeave: () => undefined }))
    expect(html).toContain('Você foi demitido')
    expect(html).toContain('17º lugar')
    expect(html).toContain('Clube Oito')
    expect(html).toContain('Nove')
    expect(html).toContain('Série B')
    expect(html).toContain('reputação 6')
    expect(html).toContain('free-club-team-8')
    expect(html).toContain('a vaga na liga continua')
  })

  it('sem clube livre a tela diz o que fazer', () => {
    const html = renderToStaticMarkup(createElement(LeagueDismissed, { state: { ...state, options: [] }, onLeave: () => undefined }))
    expect(html).toContain('Nenhum clube livre agora')
  })

  it('a carreira começa carregando, sem inventar histórico', () => {
    const html = renderToStaticMarkup(createElement(OnlineCareer, { leagueId: 'liga-1' }))
    expect(html).toContain('Carregando a carreira')
  })
})
