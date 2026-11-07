import { beforeEach, describe, expect, it } from 'vitest'
import { createGame, setUserTactic, setUserTicketPrice, setUserTrainingPlan, startUserIndividualTraining, cancelUserIndividualTraining } from '../src/store/game'
import { getGame, setGame } from '../src/store/gameStore'
import { perform } from '../src/store/actions'
import { leagueGame } from '../src/store/leagueGame'
import { closeLeague } from '../src/store/leagueSession'

const solo = () => createGame(9, 'team-imp', { cups: false })

describe('perform no jogo solo (C2): mesma regra das funções de sempre', () => {
  beforeEach(() => setGame(null))

  it('plano de treino, ingresso e treino individual dão o mesmo mundo que as funções do jogo', async () => {
    const g0 = solo()
    setGame(g0)
    expect(await perform({ type: 'training-plan', plan: { intensity: 'light', focus: 'defensive' } })).toEqual({ ok: true })
    expect(getGame()!.season.training).toEqual(setUserTrainingPlan(g0, { intensity: 'light', focus: 'defensive' }).season.training)
    expect(await perform({ type: 'ticket-price', price: 42 })).toEqual({ ok: true })
    expect(getGame()!.season.teams).toEqual(setUserTicketPrice(getGame()!, 42).season.teams)
    const mine = g0.season.players.find((p) => p.teamId === g0.userTeamId && p.position !== 'GK')!
    const g1 = getGame()!
    expect(await perform({ type: 'individual-training', playerId: mine.id, goal: { type: 'group', group: 'physical' } })).toEqual({ ok: true })
    expect(getGame()!.season.training.individual).toEqual(startUserIndividualTraining(g1, mine.id, { type: 'group', group: 'physical' }).season.training.individual)
    expect(await perform({ type: 'cancel-individual-training' })).toEqual({ ok: true })
    expect(getGame()!.season.training.individual).toEqual(cancelUserIndividualTraining(getGame()!).season.training.individual)
  })

  it('tática: aceita a do elenco e recusa a com jogador de fora, como setUserTactic', async () => {
    const g0 = solo()
    setGame(g0)
    const team = g0.season.teams.find((t) => t.id === g0.userTeamId)!
    expect(await perform({ type: 'tactic', tactic: team.tactic })).toEqual({ ok: true })
    expect(() => setUserTactic(g0, team.tactic)).not.toThrow()
    const stranger = g0.season.players.find((p) => p.teamId !== g0.userTeamId && p.teamId !== null)!
    const bad = { ...team.tactic, startingXI: [stranger.id, ...team.tactic.startingXI.slice(1)] }
    expect((await perform({ type: 'tactic', tactic: bad })).ok).toBe(false)
    expect(() => setUserTactic(g0, bad)).toThrow()
  })

  it('sem jogo aberto não faz nada; jogo online sem sessão devolve o erro', async () => {
    expect(await perform({ type: 'cancel-individual-training' })).toEqual({ ok: false, error: 'no-mirror' })
    const g0 = solo()
    setGame(leagueGame(g0.season, g0.userTeamId, { leagueId: 'x', rev: 1, connection: 'online' }))
    closeLeague()
    setGame(leagueGame(g0.season, g0.userTeamId, { leagueId: 'x', rev: 1, connection: 'online' }))
    expect(await perform({ type: 'cancel-individual-training' })).toEqual({ ok: false, error: 'no-mirror' })
  })
})
