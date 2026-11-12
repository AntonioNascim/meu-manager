import { describe, expect, it } from 'vitest'
import { coachName, drawnCoachName } from '../src/ui/coachName'
import { createGame } from '../src/store/game'

describe('nome do técnico', () => {
  it('usa o nome escolhido no Novo jogo', () => {
    const game = createGame(7, 'team-imp', { coachName: '  Maria Souza  ' })
    expect(game.coach?.name).toBe('Maria Souza')
    expect(coachName(game)).toBe('Maria Souza')
  })

  it('save antigo (sem nome) usa o sorteado pela semente', () => {
    const game = createGame(7, 'team-imp')
    const old = { seed: game.seed, coach: { reputation: game.coach?.reputation ?? 5 } }
    expect(coachName(old)).toBe(drawnCoachName(7))
  })

  it('na liga online vale o apelido da conta', () => {
    const online = { seed: 0, coach: { reputation: 5 }, online: {} as never }
    expect(coachName(online, 'Zeca10')).toBe('Zeca10')
  })
})
