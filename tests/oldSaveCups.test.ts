import { describe, expect, it } from 'vitest'
import { createYouth } from '../src/data/generateYouth'
import { defaultCupSpecsForCompetitions } from '../src/data/package/packageCups'
import { advanceSeason } from '../src/engine/offseason'
import { createSeason, simulateToSeasonEnd } from '../src/engine/season'
import { FULL_WORLD, buildScaleWorld } from '../src/diagnostics/scaleWorld'
import { advanceToMatchday, createGame, nextEventOf, playPendingAuto, startNextSeason } from '../src/store/game'
import type { Game } from '../src/store/game'

/** Um save de antes das copas: sem `cups`, `cupSpecs` e `cupHistory`, e sem jogos de copa. */
function oldSave(game: Game): Game {
  const { cups: _a, cupSpecs: _b, cupHistory: _c, ...season } = game.season
  const matches = game.season.matches.filter((m) => !m.cup)
  return { ...game, season: { ...season, matches, season: { ...game.season.season, matchIds: matches.map((m) => m.id) } } }
}

function playToEnd(game: Game): Game {
  let g = game
  while (nextEventOf(g).type !== 'season-end') {
    g = playPendingAuto(advanceToMatchday(g))
    if (g.dismissal) throw new Error('demitido')
  }
  return g
}

describe('saves de antes das copas ganham as copas na próxima virada', () => {
  const start = oldSave(createGame(5, 'team-imp'))
  // O técnico não é demitido na prova: a meta é a mais folgada possível.
  const easy = (g: Game): Game => ({ ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === 'team-imp' ? { ...t, objective: { targetPosition: 20, sackingPosition: 20 } } : t)) } })
  const lenient: Game = easy(start)

  it('a temporada em andamento não muda: continua sem copas até a virada', () => {
    expect(start.season.cups).toBeUndefined()
    expect(start.season.cupSpecs).toBeUndefined()
    let g = lenient
    for (let i = 0; i < 6; i++) g = playPendingAuto(advanceToMatchday(g))
    expect(g.season.cups).toBeUndefined()
    expect(g.season.matches.some((m) => m.cup)).toBe(false)
    expect(g.season.matches.every((m) => !m.competitionId.startsWith('cup'))).toBe(true)
  })

  it('na virada, o mundo ganha a Copa Nacional e a Supercopa Nacional da nova temporada', () => {
    const ended = playToEnd(lenient)
    expect(ended.season.cups).toBeUndefined()
    const next = startNextSeason(ended)
    expect(next.season.cupSpecs?.map((s) => s.id)).toEqual(['cup-br', 'supercup-br'])
    expect(next.season.cups?.map((c) => c.id)).toEqual(['cup-br', 'supercup-br'])
    expect(next.season.cups?.[0]?.entrants).toHaveLength(60)
    expect(next.season.matches.filter((m) => m.cup).length).toBeGreaterThan(20)
    // E a partir daí as copas se repetem a cada temporada com o campeão no histórico.
    const afterCups = playToEnd(easy(next))
    expect(afterCups.season.cupHistory?.['cup-br']).toHaveLength(1)
    expect(startNextSeason(afterCups).season.cups?.[0]?.year).toBe(afterCups.season.season.year + 1)
  }, 120_000)

  it('quem escolheu jogar só com ligas não ganha copas na virada', () => {
    const noCups = createGame(5, 'team-imp', { cups: false })
    expect(noCups.season.cupSpecs).toEqual([])
    const ended = playToEnd({ ...noCups, season: { ...noCups.season, teams: noCups.season.teams.map((t) => (t.id === 'team-imp' ? { ...t, objective: { targetPosition: 20, sackingPosition: 20 } } : t)) } })
    const next = startNextSeason(ended)
    expect(next.season.cups).toBeUndefined()
    expect(next.season.matches.some((m) => m.cup)).toBe(false)
  }, 120_000)
})

describe('copas padrão de cada país num mundo com várias ligas', () => {
  const built = buildScaleWorld(FULL_WORLD.filter((l) => ['br-1', 'br-2', 'br-3', 'en-1', 'es-1', 'pt-1', 'ar-1'].includes(l.id)), 3)

  it('a virada traz as copas de cada país que tem copas padrão', () => {
    const start = createSeason({ year: 2026, seed: 'velho', teams: built.teams, players: built.players, academy: built.academy, competitions: built.competitions, focus: 'br' })
    expect(start.cups).toBeUndefined()
    const ended = simulateToSeasonEnd(start)
    const next = advanceSeason(ended, { createYouth, defaultCupSpecs: defaultCupSpecsForCompetitions }).state
    const ids = next.cups?.map((c) => c.id).sort()
    expect(ids).toEqual(['cup-ar', 'cup-br', 'cup-en', 'cup-es', 'cup-pt', 'league-cup-pt', 'supercup-ar', 'supercup-br', 'supercup-es'])
  }, 240_000)

  it('sem a opção, a virada continua como antes (sem copas)', () => {
    const start = createSeason({ year: 2026, seed: 'velho', teams: built.teams, players: built.players, academy: built.academy, competitions: built.competitions, focus: 'br' })
    const next = advanceSeason(simulateToSeasonEnd(start), { createYouth }).state
    expect(next.cups).toBeUndefined()
  }, 240_000)
})
