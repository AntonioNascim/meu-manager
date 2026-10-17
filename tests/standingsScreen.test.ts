import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { advanceToMatchday, createGame, playPendingAuto, standingsOf, userCompetition } from '../src/store/game'
import type { Game } from '../src/store/game'
import { Standings, latestPlayedRound, zoneOf } from '../src/ui/screens/Standings'

function playDays(game: Game, days: number): Game {
  let g = game
  for (let i = 0; i < days; i++) g = playPendingAuto(advanceToMatchday(g))
  return g
}

const serieA = { promotionSlots: 0, relegationSlots: 4 }
const serieB = { promotionSlots: 4, relegationSlots: 0 }

describe('zonas da classificação', () => {
  it('Série A: rebaixamento nos 4 últimos, sem acesso', () => {
    const zones = Array.from({ length: 20 }, (_, i) => zoneOf(i + 1, 20, serieA))
    expect(zones.filter((z) => z === 'relegation')).toHaveLength(4)
    expect(zones.slice(16)).toEqual(['relegation', 'relegation', 'relegation', 'relegation'])
    expect(zones.slice(0, 16).every((z) => z === null)).toBe(true)
  })

  it('Série B: acesso nos 4 primeiros, sem rebaixamento', () => {
    const zones = Array.from({ length: 20 }, (_, i) => zoneOf(i + 1, 20, serieB))
    expect(zones.slice(0, 4)).toEqual(['promotion', 'promotion', 'promotion', 'promotion'])
    expect(zones.slice(4).every((z) => z === null)).toBe(true)
  })
})

describe('tela de classificação', () => {
  const imp = 'team-imp'

  it('mostra a Série A com 20 times, a zona de rebaixamento e o time do jogador em destaque', () => {
    const game = playDays(createGame(3, imp, { cups: false }), 6)
    const html = renderToStaticMarkup(createElement(Standings, { game }))
    expect(html.match(/<li/g)).toHaveLength(20)
    expect(html.match(/aria-label="Zona de rebaixamento"/g)).toHaveLength(4)
    expect(html).not.toContain('Zona de acesso"')
    expect(html).toContain('Imperial Futebol Clube')
    expect(html).toContain('bg-accent/10')
    expect(html).toContain('Série B')
  })

  it('a Série B, quando o jogador comanda um time dela, abre nela e marca o acesso e o rebaixamento', () => {
    const bTeam = generateWorld({ seed: 3 }).teams.find((t) => t.tier === 2)?.id as string
    const g = playDays(createGame(3, bTeam, { cups: false }), 6)
    expect(userCompetition(g).tier).toBe(2)
    const html = renderToStaticMarkup(createElement(Standings, { game: g }))
    expect(html.match(/aria-label="Zona de acesso"/g)).toHaveLength(4)
    expect(html.match(/aria-label="Zona de rebaixamento"/g)).toHaveLength(4)
  })

  it('a Série C, quando o jogador comanda um time dela, abre nela e marca só o acesso', () => {
    const cTeam = generateWorld({ seed: 3 }).teams.find((t) => t.tier === 3)?.id as string
    const g = playDays(createGame(3, cTeam, { cups: false }), 6)
    expect(userCompetition(g).tier).toBe(3)
    const html = renderToStaticMarkup(createElement(Standings, { game: g }))
    expect(html.match(/aria-label="Zona de acesso"/g)).toHaveLength(4)
    expect(html).not.toContain('Zona de rebaixamento"')
  })

  it('a ordem da tabela é a da classificação calculada das partidas', () => {
    const game = playDays(createGame(3, imp, { cups: false }), 8)
    const rows = standingsOf(game, userCompetition(game))
    const html = renderToStaticMarkup(createElement(Standings, { game }))
    const names = rows.map((r) => game.season.teams.find((t) => t.id === r.teamId)?.name as string)
    const positions = names.map((n) => html.indexOf(n))
    expect(positions.every((p, i) => p >= 0 && (i === 0 || p > (positions[i - 1] as number)))).toBe(true)
  })
})

describe('rodada mais recente', () => {
  it('começa na rodada 1 e acompanha o último jogo disputado', () => {
    const game = createGame(3, 'team-imp', { cups: false })
    const matches = game.season.matches.filter((m) => m.competitionId === 'serie-a')
    expect(latestPlayedRound(matches)).toBe(1)
    const played = playDays(game, 10)
    const round = latestPlayedRound(played.season.matches.filter((m) => m.competitionId === 'serie-a'))
    expect(round).toBeGreaterThan(3)
    expect(played.season.matches.filter((m) => m.competitionId === 'serie-a' && m.round < round).every((m) => m.status === 'finished')).toBe(true)
  })
})
