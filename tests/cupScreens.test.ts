import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { startMatch } from '../src/engine/match'
import { userMatchInput } from '../src/engine/season'
import { createGame, finishPendingMatch, advanceGame, playPendingAuto } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { Dashboard } from '../src/ui/screens/Dashboard'
import { MatchScreen, buildLog } from '../src/ui/screens/Match'
import { Standings } from '../src/ui/screens/Standings'
import { scoreText } from '../src/ui/screens/standings/cupData'

const noop = () => {}
// Um time da Série C: estreia na Primeira fase da copa, a 4 de fevereiro.
const smallTeam = (g: Game) => g.season.teams.filter((t) => t.tier === 3).sort((a, b) => a.reputation - b.reputation)[0]!
const withUser = (): Game => {
  const probe = createGame(3, 'team-imp')
  return createGame(3, smallTeam(probe).id)
}

/** Avança até a próxima partida de copa do jogador (a liga abre em janeiro, antes da copa, e esses jogos são jogados direto). */
function untilPending(game: Game): Game {
  let g = game
  for (let i = 0; i < 80 && !g.pendingUserMatch?.cup; i++) g = g.pendingUserMatch ? playPendingAuto(g) : advanceGame(g)
  return g
}

describe('copas nas telas', () => {
  it('o painel mostra a copa em que o time joga e o próximo jogo com a fase', () => {
    const game = withUser()
    const html = renderToStaticMarkup(createElement(Dashboard, { game, onNavigate: noop }))
    expect(html).toContain('data-testid="cup-card"')
    expect(html).toContain('Copa Nacional')
    expect(html).toContain('Primeira fase')
  })

  it('a Tabela tem a seção Copas com o chaveamento, os jogos e a artilharia', () => {
    const game = untilPending(withUser())
    const bracket = renderToStaticMarkup(createElement(Standings, { game, initialSection: 'cups' }))
    expect(bracket).toContain('Copa Nacional')
    expect(bracket).toContain('Primeira fase')
    expect(bracket).toContain('Chaveamento')
    expect(bracket).toContain('Passaram direto')
    expect(bracket).toContain('Seu time está na copa')
  })

  it('a tela da partida diz a copa e a fase, e o jogo de copa vai até o fim, com prorrogação e pênaltis se preciso', () => {
    let game = untilPending(withUser())
    expect(game.pendingUserMatch?.cup).toBeDefined()
    const html = renderToStaticMarkup(createElement(MatchScreen, { game, onNavigate: noop }))
    expect(html).toContain('Copa Nacional')
    expect(html).toContain('Primeira fase')
    clearLive()
    const live = beginLive(game)
    live.match.playUntil(120)
    expect(live.match.finished).toBe(true)
    const result = live.match.result()
    expect(result.homeGoals !== result.awayGoals || result.penalties !== undefined).toBe(true)
    game = finishPendingMatch(game, result)
    clearLive()
    expect(game.pendingUserMatch).toBeUndefined()
    const done = game.season.matches.find((m) => m.status === 'finished' && m.cup && (m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId))!
    expect(done.result).toBeDefined()
    expect(scoreText(done)).toContain(' x ')
  })

  it('a narração mostra a prorrogação e os pênaltis', () => {
    // Procura um jogo do mata-mata que vá aos pênaltis com as regras de copa.
    const game = untilPending(withUser())
    const input = userMatchInput(game.season, game.pendingUserMatch!, game.userTeamId)
    let found = false
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const live = startMatch({ ...input, seed, knockout: { extraTime: true, penalties: true } })
      live.playUntil(120)
      const snap = live.snapshot()
      if (!snap.penalties) continue
      found = true
      const lines = buildLog(snap, true).map((l) => l.text).join('\n')
      expect(lines).toContain('prorrogação')
      expect(lines).toContain('Pênaltis:')
      expect(lines).toContain('nos pênaltis')
      expect(snap.shootout!.length).toBeGreaterThanOrEqual(6)
    }
    expect(found).toBe(true)
  })

  it('a temporada de copa segue: avançar e jogar tudo automaticamente nunca trava a partida de copa', () => {
    let g = withUser()
    for (let i = 0; i < 12; i++) g = playPendingAuto(advanceGame(g))
    expect(g.season.matches.some((m) => m.cup && m.status === 'finished')).toBe(true)
    expect(g.season.cups![0]!.log.length).toBeGreaterThan(0)
  })
})

describe('artilharia da liga sem os gols da copa', () => {
  it('os gols e cartões de copa saem das listas da liga e entram na artilharia da copa', async () => {
    const { leaders } = await import('../src/ui/screens/standings/data')
    const { cupScorers } = await import('../src/ui/screens/standings/cupData')
    const game = withUser()
    const team = game.season.teams.find((t) => t.tier === 1)!
    const player = game.season.players.find((p) => p.teamId === team.id)!
    const edited: Game = { ...game, season: { ...game.season, players: game.season.players.map((p) => (p.id === player.id ? { ...p, seasonStats: { ...p.seasonStats, goals: 5, cupGoals: 3, yellowCards: 4, cupYellowCards: 4 } } : p)) } }
    const competition = edited.season.season.competitions.find((c) => c.teamIds.includes(team.id))!
    expect(leaders(edited, competition, 'goals').find((l) => l.player.id === player.id)?.value).toBe(2)
    expect(leaders(edited, competition, 'yellow').find((l) => l.player.id === player.id)).toBeUndefined()
    expect(cupScorers(edited, 'cup-br')).toEqual([])
  })
})
