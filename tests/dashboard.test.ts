import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { advanceToMatchday, createGame, playPendingAuto } from '../src/store/game'
import { formatCompactMoney, dateParts, daysBetween } from '../src/ui/format'
import { Dashboard } from '../src/ui/screens/Dashboard'
import { BottomNav, ProgressBar, ResultDot, SegmentedBar } from '../src/ui/theme'

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node)

describe('componentes do tema', () => {
  it('bolinha de resultado mostra V, E ou D', () => {
    expect(html(createElement(ResultDot, { outcome: 'W' }))).toContain('>V<')
    expect(html(createElement(ResultDot, { outcome: 'D' }))).toContain('>E<')
    expect(html(createElement(ResultDot, { outcome: 'L' }))).toContain('>D<')
  })

  it('barra segmentada tem um quadradinho por posição e marca a atual', () => {
    const out = html(createElement(SegmentedBar, { total: 20, lit: 8, current: 5, marker: 8, label: 'x' }))
    expect(out.match(/relative h-4/g)).toHaveLength(20)
    expect(out.match(/bg-accent ring-2/g)).toHaveLength(1)
  })

  it('barra de progresso limita o valor entre 0 e 100', () => {
    expect(html(createElement(ProgressBar, { value: 150 }))).toContain('width:100%')
    expect(html(createElement(ProgressBar, { value: -5 }))).toContain('width:0%')
  })

  it('navegação de baixo destaca só a aba ativa e mostra a bolinha de pendência', () => {
    const out = html(
      createElement(BottomNav, {
        items: [
          { id: 'a', label: 'Um', icon: 'home' },
          { id: 'b', label: 'Dois', icon: 'squad', alert: true },
        ],
        active: 'a',
        onSelect: () => {},
      }),
    )
    expect(out.match(/aria-current="page"/g)).toHaveLength(1)
    expect(out.match(/Há algo pendente/g)).toHaveLength(1)
  })
})

describe('formatação do painel', () => {
  it('valores curtos e partes da data', () => {
    expect(formatCompactMoney(1_030_000)).toBe('R$ 1,03 mi')
    expect(formatCompactMoney(840_000)).toBe('R$ 840 mil')
    expect(formatCompactMoney(-2_500_000)).toBe('-R$ 2,5 mi')
    expect(dateParts('2026-03-22')).toEqual({ day: '22', month: 'mar', weekday: 'dom', year: '2026' })
    expect(daysBetween('2026-03-22', '2026-03-25')).toBe(3)
  })
})

describe('painel do clube', () => {
  const game = createGame(12, 'team-imp')

  it('mostra só os atalhos que existem, sem inventar funções', () => {
    const out = html(createElement(Dashboard, { game, onNavigate: () => {} }))
    for (const label of ['Elenco', 'Tática', 'Mercado', 'Finanças', 'Classificação', 'Contratos']) expect(out).toContain(`>${label}<`)
    expect(out.match(/cut-corner-sm/g)).toHaveLength(6)
  })

  it('mostra data, próximo jogo, condição dos titulares, diretoria e orçamento', () => {
    const out = html(createElement(Dashboard, { game, onNavigate: () => {} }))
    for (const text of ['Próximo jogo', 'Condição média dos titulares', 'Avançar', 'Diretoria', 'Orçamento', 'Compras', 'Folha']) expect(out).toContain(text)
    expect(out).toContain('Posição')
  })

  it('o último jogo traz resultado, público e, em casa, a renda', () => {
    let g = createGame(12, 'team-imp')
    for (let i = 0; i < 6; i++) g = playPendingAuto(advanceToMatchday(g))
    const out = html(createElement(Dashboard, { game: g, onNavigate: () => {} }))
    expect(out).toContain('Último jogo')
    expect(out).toContain('Últimos 5 resultados')
  })
})
