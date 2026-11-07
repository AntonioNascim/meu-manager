import { describe, expect, it } from 'vitest'
import { createGame, setUserTrainingPlan } from '../src/store/game'
import { getGame, setGame, updateGame } from '../src/store/gameStore'
import { leagueGame } from '../src/store/leagueGame'
import { startAutosave } from '../src/store/autosave'

describe('jogo online na interface (C3)', () => {
  it('numa liga online uma mudança do mundo por updateGame é ignorada (só vale por comando)', () => {
    const solo = createGame(9, 'team-imp', { cups: false })
    const online = leagueGame(solo.season, solo.userTeamId, { leagueId: 'x', rev: 1, connection: 'online' })
    setGame(online)
    updateGame((g) => setUserTrainingPlan(g, { intensity: 'intense', focus: 'physical' }))
    expect(getGame()).toBe(online)
    // Preferências do técnico (favoritos) seguem locais e valem.
    updateGame((g) => ({ ...g, favorites: ['p1'] }))
    expect(getGame()!.favorites).toEqual(['p1'])
    expect(getGame()!.season).toBe(online.season)
    setGame(null)
  })

  it('no jogo solo updateGame continua valendo', () => {
    const solo = createGame(9, 'team-imp', { cups: false })
    setGame(solo)
    updateGame((g) => setUserTrainingPlan(g, { intensity: 'intense', focus: 'physical' }))
    expect(getGame()!.season.training.plans[solo.userTeamId]).toEqual({ intensity: 'intense', focus: 'physical' })
    setGame(null)
  })

  it('o autosave liga sem quebrar com um jogo online aberto', () => {
    const solo = createGame(9, 'team-imp', { cups: false })
    const off = startAutosave(1)
    setGame(leagueGame(solo.season, solo.userTeamId, { leagueId: 'x', rev: 1, connection: 'online' }))
    off()
    setGame(null)
  })
})
