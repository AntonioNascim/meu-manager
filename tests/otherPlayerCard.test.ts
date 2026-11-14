import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Player } from '../src/engine/types'
import { createGame } from '../src/store/game'
import { OtherPlayerCard } from '../src/ui/components/OtherPlayerCard'

const USER = 'team-imp'
const game = createGame(7, USER)

describe('cartão de jogador de outro clube', () => {
  it('tem o cartão do jogador e "Fazer proposta" no lugar das ações do elenco', () => {
    const target = game.season.players.find((p) => p.teamId && p.teamId !== USER) as Player
    const html = renderToStaticMarkup(createElement(OtherPlayerCard, { game, player: target }))
    for (const text of ['Força', 'Posição', 'Idade', 'Valor de mercado', 'Fazer proposta']) expect(html).toContain(text)
    for (const text of ['Dispensar', 'Renovar', 'Conversar']) expect(html).not.toContain(text)
  })

  it('jogador livre ganha "Contratar"', () => {
    const free = { ...(game.season.players.find((p) => p.teamId && p.teamId !== USER) as Player), teamId: null }
    const html = renderToStaticMarkup(createElement(OtherPlayerCard, { game, player: free }))
    expect(html).toContain('Contratar')
    expect(html).not.toContain('Fazer proposta')
  })
})
