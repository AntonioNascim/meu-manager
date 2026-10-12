import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { generateWorld } from '../src/data/generateWorld'
import { advanceGame, advanceToMatchday, boardOf, createGame, playPendingAuto, userTeam } from '../src/store/game'
import { Dashboard } from '../src/ui/screens/Dashboard'
import { Dismissed } from '../src/ui/screens/Dismissed'
import { evaluateBoard, expectedPointsPerGame } from '../src/engine/board'
import type { BoardInput } from '../src/engine/board'

const base: BoardInput = {
  objective: { targetPosition: 8, sackingPosition: 14 },
  row: { played: 20, points: 0 },
  position: 8,
  teamCount: 20,
  totalGames: 38,
  balance: 50_000_000,
  monthlyCost: 4_000_000,
}
const withPoints = (points: number, extra: Partial<BoardInput> = {}) => evaluateBoard({ ...base, row: { played: 20, points }, ...extra })
const onTarget = Math.round(expectedPointsPerGame(8, 20) * 20)

describe('diretoria', () => {
  it('pontos esperados caem da primeira à última posição', () => {
    expect(expectedPointsPerGame(1, 20)).toBeGreaterThan(expectedPointsPerGame(10, 20))
    expect(expectedPointsPerGame(10, 20)).toBeGreaterThan(expectedPointsPerGame(20, 20))
  })

  it('na meta a confiança é a de referência; mais pontos, mais confiança', () => {
    expect(withPoints(onTarget).confidence).toBeGreaterThan(65)
    expect(withPoints(onTarget).confidence).toBeLessThan(75)
    expect(withPoints(onTarget + 10).confidence).toBeGreaterThan(withPoints(onTarget).confidence)
    expect(withPoints(onTarget).status).toBe('safe')
    expect(withPoints(onTarget).dismissal).toBeUndefined()
  })

  it('muito abaixo do limite de demissão, depois do período de graça, demite por resultados', () => {
    const bad = withPoints(8)
    expect(bad.confidence).toBeLessThan(8)
    expect(bad.dismissal).toBe('results')
    expect(bad.status).toBe('danger')
  })

  it('no começo da temporada a diretoria não demite nem julga por inteiro', () => {
    const early = evaluateBoard({ ...base, row: { played: 3, points: 0 }, position: 20 })
    expect(early.dismissal).toBeUndefined()
    expect(early.confidence).toBeGreaterThan(40)
    expect(evaluateBoard({ ...base, row: undefined, position: 8 }).confidence).toBe(70)
  })

  it('dívida pesada tira confiança e, passando do limite, demite por finanças', () => {
    expect(withPoints(onTarget, { balance: -4_000_000 }).confidence).toBeLessThan(withPoints(onTarget).confidence)
    expect(withPoints(onTarget, { balance: -13_000_000 }).dismissal).toBe('finances')
  })

  it('no fim da temporada, terminar abaixo do limite demite mesmo com a confiança acima do mínimo', () => {
    const end = evaluateBoard({ ...base, row: { played: 38, points: 38 * expectedPointsPerGame(14, 20) + 1 }, position: 15 })
    expect(end.dismissal).toBe('results')
    const ok = evaluateBoard({ ...base, row: { played: 38, points: 52 }, position: 14 })
    expect(ok.dismissal).toBeUndefined()
  })
})

describe('diretoria no jogo', () => {
  const weakest = [...generateWorld({ seed: 5 }).teams].filter((t) => t.tier === 1).sort((a, b) => a.reputation - b.reputation)[0]!

  it('uma meta impossível leva à demissão: o jogo para e a tela de demissão aparece', () => {
    let g = createGame(5, weakest.id)
    g = { ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === weakest.id ? { ...t, objective: { targetPosition: 1, sackingPosition: 2 } } : t)) } }
    expect(boardOf(g).dismissal).toBeUndefined()
    expect(renderToStaticMarkup(createElement(Dashboard, { game: g, onNavigate: () => {} }))).toContain('Diretoria')
    for (let i = 0; i < 30 && !g.dismissal; i++) g = playPendingAuto(advanceToMatchday(g))
    expect(g.dismissal).toBeDefined()
    expect(g.dismissal!.reason).toBe('results')
    expect(advanceGame(g)).toBe(g)
    expect(advanceToMatchday(g)).toBe(g)
    expect(renderToStaticMarkup(createElement(Dismissed, { game: g }))).toContain('demitido')
  })

  it('um time com a meta realista não é demitido nas primeiras rodadas', () => {
    let g = createGame(5, weakest.id)
    for (let i = 0; i < 6; i++) g = playPendingAuto(advanceToMatchday(g))
    expect(g.dismissal).toBeUndefined()
    expect(userTeam(g).objective.sackingPosition).toBeGreaterThan(userTeam(g).objective.targetPosition)
  })
})
