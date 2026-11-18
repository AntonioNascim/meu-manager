import { describe, expect, it } from 'vitest'
import { computeStandings } from '../src/engine/season/standings'
import { advanceToMatchday, createGame, finishPendingMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { otherGamesOf } from '../src/ui/screens/match/otherGames'
import { leagueOf, projectNow, prognosisOf } from '../src/ui/screens/match/projection'

const USER = 'team-imp'

/** Joga duas rodadas e para no dia do 3º jogo do time (a tabela já tem pontos e há outros jogos no mesmo dia). */
function toThirdMatchDay(): Game {
  let game = createGame(3, USER, { cups: false })
  for (let i = 0; i < 3; i++) {
    while (!game.pendingUserMatch) game = advanceToMatchday(game)
    if (i === 2) break
    const live = beginLive(game)
    live.match.playUntil(120)
    game = finishPendingMatch(game, live.match.result())
    clearLive()
  }
  return game
}

describe('se terminar assim', () => {
  it('o prognóstico é coerente: vencer nunca fica atrás de empatar, que nunca fica atrás de perder', () => {
    const game = toThirdMatchDay()
    const p = prognosisOf(game, game.pendingUserMatch, USER)
    expect(p).not.toBeNull()
    const { win, draw, lose } = p as NonNullable<typeof p>
    expect(win.position).toBeLessThanOrEqual(draw.position)
    expect(draw.position).toBeLessThanOrEqual(lose.position)
    expect(win.points).toBe(draw.points + 2)
    expect(draw.points).toBe(lose.points + 1)
    expect(win.size).toBe(20)
  })

  it('no minuto 0 com 0 a 0 é o mesmo que "se empatar" (os outros jogos do dia ainda não contam)', () => {
    const game = toThirdMatchDay()
    const match = game.pendingUserMatch
    const now = projectNow(game, match, USER, { home: 0, away: 0 }, 0)
    expect(now).toEqual(prognosisOf(game, match, USER)?.draw)
  })

  it('a tabela-base não usa os outros jogos do dia, que o motor já decidiu', () => {
    const game = toThirdMatchDay()
    const match = game.pendingUserMatch
    expect(otherGamesOf(game).length).toBeGreaterThan(0)
    const competition = leagueOf(game, match)
    const ids = new Set([match?.id, ...otherGamesOf(game).map((m) => m.id)])
    const base = game.season.matches.filter((m) => m.competitionId === competition?.id && m.status === 'finished' && !ids.has(m.id))
    const table = computeStandings((competition as NonNullable<typeof competition>).teamIds, base)
    expect(projectNow(game, match, USER, { home: 0, away: 0 }, 0)?.current).toBe(table.findIndex((r) => r.teamId === USER) + 1)
  })

  it('no minuto 90 com o placar final dá exatamente a posição da tabela depois de registrar a partida', () => {
    const game = toThirdMatchDay()
    const match = game.pendingUserMatch as NonNullable<Game['pendingUserMatch']>
    const live = beginLive(game)
    live.match.playUntil(120)
    const result = live.match.result()
    clearLive()
    const projected = projectNow(game, match, USER, { home: result.homeGoals, away: result.awayGoals }, 90)
    const after = finishPendingMatch(game, result)
    const competition = leagueOf(game, match) as NonNullable<ReturnType<typeof leagueOf>>
    const table = computeStandings(competition.teamIds, after.season.matches.filter((m) => m.competitionId === competition.id))
    expect(projected?.position).toBe(table.findIndex((r) => r.teamId === USER) + 1)
    expect(projected?.points).toBe(table.find((r) => r.teamId === USER)?.points)
  })

  it('jogo de copa não tem projeção', () => {
    const game = toThirdMatchDay()
    const fake = { ...(game.pendingUserMatch as NonNullable<Game['pendingUserMatch']>), cup: { stage: 0, leg: 1 } } as never
    expect(prognosisOf(game, fake, USER)).toBeNull()
    expect(projectNow(game, fake, USER, { home: 0, away: 0 }, 10)).toBeNull()
  })
})
