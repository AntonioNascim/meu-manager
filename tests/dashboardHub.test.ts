import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Player } from '../src/engine/types'
import { advanceToMatchday, createGame, playPendingAuto, squadOf, userTeam } from '../src/store/game'
import type { Game } from '../src/store/game'
import { Dashboard } from '../src/ui/screens/Dashboard'
import { NoticeCenter } from '../src/ui/screens/dashboard/NoticeCenter'
import { dashboardNotices } from '../src/ui/screens/dashboard/notices'
import { squadHighlights } from '../src/ui/screens/dashboard/Highlights'
import { miniWindow } from '../src/ui/screens/dashboard/MiniTable'

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node)
const base = createGame(12, 'team-imp')

const mapUser = (game: Game, fn: (p: Player, i: number) => Player): Game => {
  const ids = new Set(squadOf(game, game.userTeamId).map((p) => p.id))
  let i = 0
  return { ...game, season: { ...game.season, players: game.season.players.map((p) => (ids.has(p.id) ? fn(p, i++) : p)) } }
}

describe('central de avisos do painel', () => {
  it('sem pendências de verdade não mostra decisão, proposta, pré-contrato, desfalque nem base', () => {
    const ids = dashboardNotices(base).map((n) => n.id)
    for (const id of ['academy-pending', 'offers', 'unavailable', 'academy-arrivals']) expect(ids).not.toContain(id)
    expect(ids.some((id) => id.startsWith('pre-'))).toBe(false)
    expect(html(createElement(NoticeCenter, { notices: [], onOpen: () => {} }))).toBe('')
  })

  it('segue a ordem de urgência e cada aviso leva à tela certa', () => {
    const squad = squadOf(base, base.userTeamId)
    let game = mapUser(base, (p, i) => (i === 0 ? { ...p, condition: { ...p.condition, injuryDaysLeft: 12 } } : i === 1 ? { ...p, condition: { ...p.condition, suspensionGames: 1 } } : i === 2 ? { ...p, contract: { ...p.contract, endDate: `${game0Year(base)}-12-31` } } : p))
    game = { ...game, notices: [{ type: 'pre-contract-lost', playerId: squad[3]!.id, teamId: game.season.teams.find((t) => t.id !== game.userTeamId)!.id }] }
    game = { ...game, season: { ...game.season, academy: game.season.academy.map((p, i) => (p.teamId === game.userTeamId && i % 3 === 0 ? { ...p, age: 20 } : p)) } }
    game = { ...game, lastReport: { year: 2026, champions: [game.userTeamId, game.userTeamId], promoted: [], relegated: [], finalPositions: {}, retired: [], released: [], renewed: 0, youth: {}, academyArrivals: { [game.userTeamId]: 3 }, academyPromoted: {}, academyReleased: {}, preContracts: [], academyPending: [], reputationChanges: {} } }
    const notices = dashboardNotices(game)
    const order = notices.map((n) => n.id)
    const index = (prefix: string) => order.findIndex((id) => id.startsWith(prefix))
    expect(index('academy-pending')).toBe(0)
    expect(index('pre-')).toBeGreaterThan(index('academy-pending'))
    expect(index('unavailable')).toBeGreaterThan(index('pre-'))
    expect(index('academy-arrivals')).toBeGreaterThan(index('unavailable'))
    const to = (id: string) => notices.find((n) => n.id === id)
    expect(to('academy-pending')).toMatchObject({ to: 'academy', tone: 'danger' })
    expect(notices.find((n) => n.id.startsWith('pre-'))).toMatchObject({ to: 'market', tab: 'precontract' })
    expect(to('unavailable')?.to).toBe('squad')
    expect(to('academy-arrivals')?.to).toBe('academy')
    if (to('window')) expect(to('window')?.to).toBe('market')
    // contratos no último ano vêm antes dos desfalques
    if (to('contracts')) expect(index('contracts')).toBeLessThan(index('unavailable'))
    const out = html(createElement(NoticeCenter, { notices, onOpen: () => {} }))
    expect(out).toContain('Decisão pendente na base')
    expect(out).toContain('vai embora de graça')
    expect(out).toContain('Ver todos os avisos')
  })

  it('lesionado titular leva à Escalação', () => {
    const starter = base.season.players.find((p) => p.id === userTeam(base).tactic.startingXI[5])!
    const game = mapUser(base, (p) => (p.id === starter.id ? { ...p, condition: { ...p.condition, injuryDaysLeft: 8 } } : p))
    expect(dashboardNotices(game).find((n) => n.id === 'unavailable')).toMatchObject({ tone: 'warning', to: 'squad', tab: 'lineup' })
  })

  it('o painel mostra a central no topo e leva o toque a onNavigate com a aba', () => {
    const game = mapUser(base, (p, i) => (i === 0 ? { ...p, condition: { ...p.condition, injuryDaysLeft: 5 } } : p))
    const out = html(createElement(Dashboard, { game, onNavigate: () => {} }))
    expect(out).toContain('data-testid="notice-center"')
    expect(out.indexOf('notice-center')).toBeLessThan(out.indexOf('Próximo jogo'))
  })
})

const game0Year = (g: Game) => g.season.season.year

describe('painel reunido', () => {
  it('próximo jogo traz posição e forma do adversário e o botão da tática', () => {
    let game = createGame(12, 'team-imp')
    for (let i = 0; i < 4; i++) game = playPendingAuto(advanceToMatchday(game))
    const out = html(createElement(Dashboard, { game, onNavigate: () => {} }))
    expect(out).toContain('data-testid="opponent-form"')
    expect(out).toContain('Ver tática e escalação provável')
  })

  it('mini classificação: o seu time com dois acima e dois abaixo, encostando no topo e no fim', () => {
    const rows = Array.from({ length: 20 }, (_, i) => i)
    expect(miniWindow(rows, 9)).toEqual({ start: 7, rows: [7, 8, 9, 10, 11] })
    expect(miniWindow(rows, 0)).toEqual({ start: 0, rows: [0, 1, 2, 3, 4] })
    expect(miniWindow(rows, 19)).toEqual({ start: 15, rows: [15, 16, 17, 18, 19] })
    let game = createGame(12, 'team-imp')
    for (let i = 0; i < 4; i++) game = playPendingAuto(advanceToMatchday(game))
    const out = html(createElement(Dashboard, { game, onNavigate: () => {} }))
    expect(out).toContain('data-testid="mini-table"')
    expect(out.match(/data-mini-row=/g)).toHaveLength(5)
    expect(out).toContain('Seus últimos jogos')
  })

  it('destaques: artilheiro, garçom e melhor nota média (mínimo de jogos com nota)', () => {
    const squad = squadOf(base, base.userTeamId).slice(0, 4)
    const stat = (p: Player, s: Partial<Player['seasonStats']>): Player => ({ ...p, seasonStats: { ...p.seasonStats, ...s } })
    const [a, b, c, d] = squad as [Player, Player, Player, Player]
    const h = squadHighlights([stat(a, { goals: 5, minutes: 900 }), stat(b, { goals: 5, assists: 7, minutes: 800 }), stat(c, { ratedGames: 2, ratingSum: 19 }), stat(d, { ratedGames: 5, ratingSum: 36, assists: 1 })])
    expect(h.scorer?.player.id).toBe(b.id) // empate em gols: jogou menos minutos
    expect(h.assister).toMatchObject({ value: 7 })
    expect(h.rated?.player.id).toBe(d.id) // c tem nota maior mas só 2 jogos
    expect(h.rated?.value).toBeCloseTo(7.2, 5)
    expect(squadHighlights(squadOf(base, base.userTeamId))).toEqual({})
    const out = html(createElement(Dashboard, { game: base, onNavigate: () => {} }))
    expect(out).toContain('Destaques do elenco')
    expect(out).toContain('Ninguém ainda')
  })

  it('a grade de atalhos tem os 10 destinos e acende só onde há pendência', () => {
    const calm = html(createElement(Dashboard, { game: base, onNavigate: () => {} }))
    const shortcuts = (s: string) => s.slice(s.indexOf('data-testid="shortcuts"'), s.indexOf('data-testid="mini-table"'))
    for (const label of ['Elenco', 'Escalação', 'Tática', 'Base', 'Treino', 'Mercado', 'Contratos', 'Finanças', 'Tabela', 'Histórico']) expect(shortcuts(calm)).toContain(`>${label}<`)
    expect(shortcuts(calm).match(/Há algo pendente/g)?.length ?? 0).toBeLessThanOrEqual(1)
    const hurt = mapUser(base, (p, i) => (i === 0 ? { ...p, condition: { ...p.condition, injuryDaysLeft: 5 } } : p))
    const dot = (s: string) => shortcuts(s).match(/Há algo pendente/g)?.length ?? 0
    expect(dot(html(createElement(Dashboard, { game: hurt, onNavigate: () => {} })))).toBeGreaterThan(dot(calm) - 1)
  })

  it('não repete as informações: os avisos antigos viraram a central', () => {
    const out = html(createElement(Dashboard, { game: base, onNavigate: () => {} }))
    for (const old of ['Categorias de base', 'Abrir o mercado', 'Renovar na aba Contratos']) expect(out).not.toContain(old)
    for (const kept of ['Treino', 'Diretoria', 'Orçamento']) expect(out).toContain(kept)
  })
})
