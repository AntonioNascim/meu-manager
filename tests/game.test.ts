import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import {
  advanceGame,
  createGame,
  lastUserMatch,
  nextUserMatch,
  playPendingAuto,
  standingsOf,
  userCompetition,
} from '../src/store/game'
import { Dashboard } from '../src/ui/screens/Dashboard'
import { NewGame } from '../src/ui/screens/NewGame'

const world = generateWorld({ seed: 11 })
const idA = world.teams.find((t) => t.tier === 1)?.id as string
const idB = world.teams.find((t) => t.tier === 2)?.id as string

describe('jogo novo', () => {
  it('cria a temporada com um time da Série A ou da B', () => {
    for (const id of [idA, idB]) {
      const g = createGame(11, id)
      expect(g.userTeamId).toBe(id)
      expect(userCompetition(g).teamIds).toContain(id)
      expect(g.season.matches).toHaveLength(760)
      expect(nextUserMatch(g)?.status).toBe('scheduled')
      expect(lastUserMatch(g)).toBeUndefined()
    }
  })

  it('recusa um time que não existe', () => {
    expect(() => createGame(11, 'nao-existe')).toThrow()
  })
})

describe('avançar', () => {
  const g0 = createGame(12, idA)

  it('a partida do jogador fica pendente até ser jogada', () => {
    const g1 = advanceGame(g0)
    expect(g1.pendingUserMatch).toBeDefined()
    expect(g1.lastDay.length).toBeGreaterThan(0)
    expect(advanceGame(g1)).toBe(g1)
    const g2 = playPendingAuto(g1)
    expect(g2.pendingUserMatch).toBeUndefined()
    expect(lastUserMatch(g2)?.id).toBe(g1.pendingUserMatch?.id)
    expect(nextUserMatch(g2)?.date).not.toBe(g1.pendingUserMatch?.date)
  })

  it('a classificação do jogador muda depois de jogar', () => {
    let g = g0
    // Alguns avanços caem em dias sem jogo do time (o outro dia do fim de semana).
    for (let i = 0; i < 30 && (standingsOf(g, userCompetition(g)).find((r) => r.teamId === idA)?.played ?? 0) < 3; i++) g = playPendingAuto(advanceGame(g))
    const table = standingsOf(g, userCompetition(g))
    expect(table.find((r) => r.teamId === idA)?.played).toBe(3)
  })
})

describe('telas (renderização)', () => {
  it('a tela de novo jogo lista os 20 times da Série A', () => {
    const html = renderToStaticMarkup(createElement(NewGame))
    expect(html).toContain('Série A')
    expect(html).toContain('Série B')
    expect(html.match(/<li/g)).toHaveLength(20)
  })

  it('o painel mostra próximo jogo, posição e o botão Avançar', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { game: createGame(12, idA), onNavigate: () => {} }))
    expect(html).toContain('Próximo jogo')
    expect(html).toContain('Classificação')
    expect(html).toContain('Avançar')
    expect(html).not.toContain('Último jogo')
    const played = playPendingAuto(advanceGame(createGame(12, idA)))
    expect(renderToStaticMarkup(createElement(Dashboard, { game: played, onNavigate: () => {} }))).toContain('Último jogo')
  })
})
