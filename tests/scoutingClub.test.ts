import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SCOUT } from '../src/engine/config'
import { expectedAnnualRevenue, settleMonth } from '../src/engine/finance'
import { applyCommand, applyPayload, buildFull, emptyMirror, parseCommand, toSeasonState } from '../src/engine/league'
import { applyScouting, scoutCost, scoutLevelOf, scoutNextOf, setScoutingLevel } from '../src/engine/scouting'
import { potentialRange } from '../src/engine/training'
import type { Team } from '../src/engine/types'
import { createGame, nextUserMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { createLeagueWorld } from '../src/store/leagueWorld'
import { ScoutingCard } from '../src/ui/screens/finance/Scouting'
import { ScoutingSection } from '../src/ui/screens/standings/ScoutingSection'
import { TeamPage } from '../src/ui/screens/standings/TeamPage'

const USER = 'team-imp'
const teamOf = (g: Game, id = USER) => g.season.teams.find((t) => t.id === id) as Team
const withLevel = (g: Game, level: 0 | 1 | 2 | 3): Game => ({ ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === USER ? { ...t, scouting: { level, next: level } } : t)) } })
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('olheiro: custo mensal proporcional ao clube', () => {
  it('custa 0,4%, 1% e 2% da receita mensal esperada, em múltiplos de R$ 1.000, e o nível 0 não custa', () => {
    const game = createGame(3, USER, { cups: false })
    for (const team of game.season.teams.slice(0, 25)) {
      const monthly = expectedAnnualRevenue(team) / 12
      expect(scoutCost(team, 0)).toBe(0)
      for (const level of [1, 2, 3] as const) {
        expect(Math.abs(scoutCost(team, level) - monthly * (SCOUT.costShare[level] as number))).toBeLessThanOrEqual(500)
        expect(scoutCost(team, level) % 1000).toBe(0)
      }
      expect(scoutCost(team, 1)).toBeLessThanOrEqual(scoutCost(team, 2))
      expect(scoutCost(team, 2)).toBeLessThanOrEqual(scoutCost(team, 3))
    }
  })

  it('pesa parecido para grandes e pequenos: a parcela da receita é a mesma', () => {
    const game = createGame(3, USER, { cups: false })
    const sorted = [...game.season.teams].sort((a, b) => expectedAnnualRevenue(b) - expectedAnnualRevenue(a))
    const big = sorted[0] as Team
    const small = sorted[sorted.length - 1] as Team
    expect(scoutCost(big, 3)).toBeGreaterThan(scoutCost(small, 3) * 3)
    const share = (t: Team) => scoutCost(t, 3) / (expectedAnnualRevenue(t) / 12)
    expect(share(big)).toBeCloseTo(0.02, 2)
    expect(share(small)).toBeCloseTo(0.02, 2)
  })
})

describe('olheiro: a troca vale no mês seguinte', () => {
  it('escolher só marca o próximo nível; o fechamento do mês aplica e cobra', () => {
    const game = createGame(3, USER, { cups: false })
    const team = teamOf(game)
    const players = game.season.players.filter((p) => p.teamId === USER)
    const chosen = setScoutingLevel(team, 2)
    expect(scoutLevelOf(chosen)).toBe(0)
    expect(scoutNextOf(chosen)).toBe(2)
    const settled = settleMonth(chosen, players, '2027-02-01', false)
    expect(scoutLevelOf(settled)).toBe(2)
    expect(settled.finances.ledger.some((e) => e.description === 'Olheiros (nível 2)' && e.amount === -scoutCost(team, 2))).toBe(true)
    const again = settleMonth(settled, players, '2027-03-01', false)
    expect(again.finances.ledger.filter((e) => e.description === 'Olheiros (nível 2)')).toHaveLength(2)
  })

  it('voltar ao nível 0 também espera o mês e depois não cobra mais', () => {
    const game = createGame(3, USER, { cups: false })
    const players = game.season.players.filter((p) => p.teamId === USER)
    let t = settleMonth(setScoutingLevel(teamOf(game), 3), players, '2027-02-01', false)
    t = setScoutingLevel(t, 0)
    expect(scoutLevelOf(t)).toBe(3)
    t = settleMonth(t, players, '2027-03-01', false)
    expect(scoutLevelOf(t)).toBe(0)
    expect(t.scouting).toBeUndefined()
    expect(t.finances.ledger.filter((e) => e.description === 'Olheiros (nível 3)')).toHaveLength(1)
  })

  it('sem olheiro o fechamento do mês é exatamente o de antes', () => {
    const game = createGame(3, USER, { cups: false })
    const team = teamOf(game)
    const players = game.season.players.filter((p) => p.teamId === USER)
    const a = settleMonth(team, players, '2027-02-01', false)
    const b = settleMonth(setScoutingLevel(team, 0), players, '2027-02-01', false)
    expect(b).toEqual(a)
    expect(applyScouting(team)).toEqual({ team, cost: 0, level: 0 })
    expect(() => setScoutingLevel(team, 7 as never)).toThrow()
  })
})

describe('olheiro: efeito no potencial', () => {
  it('o nível 0 é a estimativa de sempre e a margem de erro encolhe com o nível', () => {
    const game = createGame(3, USER, { cups: false })
    const young = game.season.players.filter((p) => p.age <= 20).slice(0, 80)
    expect(young.length).toBeGreaterThan(20)
    const width = (level: 0 | 1 | 2 | 3) => young.reduce((s, p) => s + (potentialRange(p, level).high - potentialRange(p, level).low), 0) / young.length
    for (const p of young.slice(0, 10)) expect(potentialRange(p, 0)).toEqual(potentialRange(p))
    expect(width(1)).toBeLessThan(width(0))
    expect(width(2)).toBeLessThan(width(1))
    expect(width(3)).toBeLessThan(width(2))
    expect(width(3)).toBeLessThan(width(0) * 0.45)
    const err = (level: 0 | 1 | 2 | 3) => young.reduce((s, p) => s + Math.abs((potentialRange(p, level).low + potentialRange(p, level).high) / 2 - p.hidden.potential), 0) / young.length
    expect(err(3)).toBeLessThan(err(0))
  })
})

describe('olheiro: comando e espelho (solo e online)', () => {
  it('só aceita nível de 0 a 3 e aplica no clube do técnico', () => {
    expect(parseCommand({ type: 'scouting', level: 2 })).toEqual({ type: 'scouting', level: 2 })
    expect(parseCommand({ type: 'scouting', level: 4 })).toBeUndefined()
    expect(parseCommand({ type: 'scouting', level: '2' })).toBeUndefined()
    expect(parseCommand({ type: 'scouting', level: 1, teamId: 'x' })).toBeUndefined()
    const world = createLeagueWorld(11, undefined, { cups: false })
    const my = world.season.competitions[0]!.teamIds[0]!
    const out = applyCommand(world, my, { type: 'scouting', level: 3 })
    expect(out.ok).toBe(true)
    if (out.ok) {
      const t = out.world.teams.find((x) => x.id === my)!
      expect(scoutNextOf(t)).toBe(3)
      expect(scoutLevelOf(t)).toBe(0)
      const first = buildFull(out.world, my, 1, 0)
      let m = applyPayload(emptyMirror(), first)
      for (let page = 1; page < (first.pages ?? 1); page++) m = applyPayload(m, buildFull(out.world, my, 1, page))
      expect(scoutNextOf(toSeasonState(m)!.teams.find((x) => x.id === my))).toBe(3)
    }
  })
})

describe('olheiro: telas', () => {
  it('o cartão mostra os quatro níveis com custo e o efeito em uma linha, e avisa que a troca espera o mês', () => {
    const game = createGame(3, USER, { cups: false })
    const html = renderToStaticMarkup(createElement(ScoutingCard, { game }))
    expect(html.match(/data-testid="scout-level"/g)).toHaveLength(4)
    const t = text(html)
    expect(t).toContain('Sem olheiro')
    expect(t).toContain('Mostra o craque do adversário')
    expect(t).toContain('formação provável')
    expect(t).toContain('força de cada setor')
    expect(t).toContain('/mês')
    expect(html).not.toContain('data-testid="scout-pending"')
    const pending: Game = { ...game, season: { ...game.season, teams: game.season.teams.map((x) => (x.id === USER ? setScoutingLevel(x, 2) : x)) } }
    expect(renderToStaticMarkup(createElement(ScoutingCard, { game: pending }))).toContain('data-testid="scout-pending"')
  })

  it('a leitura do adversário libera mais com o nível: 0 só a força, 1 o craque, 3 os setores', () => {
    const base = createGame(3, USER, { cups: false })
    const m = nextUserMatch(base)!
    const other = m.homeTeamId === USER ? m.awayTeamId : m.homeTeamId
    const html = (level: 0 | 1 | 2 | 3) => renderToStaticMarkup(createElement(ScoutingSection, { game: withLevel(base, level), teamId: other }))
    expect(html(0)).toContain('data-testid="outlook"')
    expect(html(0)).not.toContain('data-testid="star"')
    expect(html(0)).not.toContain('data-testid="sectors"')
    expect(html(0)).toContain('data-testid="scout-locked"')
    expect(html(1)).toContain('data-testid="star"')
    expect(html(1)).not.toContain('data-testid="sectors"')
    expect(html(3)).toContain('data-testid="sectors"')
    expect(html(3)).not.toContain('data-testid="scout-locked"')
  })

  it('a formação e o estilo do adversário só aparecem do nível 2', () => {
    const base = createGame(3, USER, { cups: false })
    const m = nextUserMatch(base)!
    const other = m.homeTeamId === USER ? m.awayTeamId : m.homeTeamId
    const page = (level: 0 | 1 | 2 | 3, id = other) => renderToStaticMarkup(createElement(TeamPage, { game: withLevel(base, level), teamId: id, onBack: () => {}, onTeam: () => {} }))
    expect(page(1)).toContain('data-testid="tactic-locked"')
    expect(page(1)).not.toContain('data-testid="tactic-section"')
    expect(page(2)).toContain('data-testid="tactic-section"')
    expect(page(0, USER)).toContain('data-testid="tactic-section"')
  })
})
