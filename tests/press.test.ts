import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { applyCommand, parseCommand } from '../src/engine/league'
import { PRESS_LOG_MAX, PRESS_QUESTIONS, answerPress, pressFacts, pressOpen } from '../src/engine/press'
import type { Match } from '../src/engine/types'
import { advanceToMatchday, boardOf, createGame, finishPendingMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { createLeagueWorld } from '../src/store/leagueWorld'
import { Press } from '../src/ui/screens/Press'

const USER = 'team-imp'

/** Joga `n` jogos do time e devolve o jogo no dia do seguinte (partida ainda por jogar). */
function playRounds(n: number): Game {
  let game = createGame(3, USER, { cups: false })
  for (let i = 0; i < n; i++) {
    while (!game.pendingUserMatch) game = advanceToMatchday(game)
    const live = beginLive(game)
    live.match.playUntil(120)
    game = finishPendingMatch(game, live.match.result())
    clearLive()
  }
  while (!game.pendingUserMatch) game = advanceToMatchday(game)
  return game
}
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('imprensa: notícias derivadas', () => {
  it('as manchetes saem dos fatos (último resultado, posição) em ordem do mais novo, sem guardar nada', () => {
    const g = playRounds(3)
    const facts = pressFacts(g.season, USER, { position: 4, size: 20 })
    expect(facts.length).toBeGreaterThanOrEqual(2)
    expect(facts.map((f) => f.kind)).toEqual(expect.arrayContaining(['result', 'position']))
    const result = facts.find((f) => f.kind === 'result')!
    const last = g.season.matches.filter((m: Match) => m.status === 'finished' && (m.homeTeamId === USER || m.awayTeamId === USER)).sort((a, b) => b.date.localeCompare(a.date))[0]!
    expect(result.kind === 'result' && result.matchId).toBe(last.id)
    const dates = facts.map((f) => f.date)
    expect([...dates].sort().reverse()).toEqual(dates)
    expect(pressFacts(g.season, USER, { position: 4, size: 20 })).toEqual(facts)
    expect(facts.length).toBeLessThanOrEqual(8)
  })

  it('antes de qualquer jogo quase não há notícia', () => {
    const g = createGame(3, USER, { cups: false })
    expect(pressFacts(g.season, USER).filter((f) => f.kind === 'result')).toHaveLength(0)
  })
})

describe('imprensa: coletivas', () => {
  it('na véspera (ou no dia) do jogo a coletiva "eve" está aberta; depois do jogo, a do resultado', () => {
    const g = playRounds(2)
    const eve = pressOpen(g.season, USER)
    expect(eve?.occasion).toBe('eve')
    expect(eve?.key).toBe(`${g.pendingUserMatch!.id}:eve`)
    expect(eve!.question).toBeGreaterThanOrEqual(0)
    expect(eve!.question).toBeLessThan(PRESS_QUESTIONS)
    // a pergunta vem da semente: a mesma sempre
    expect(pressOpen(g.season, USER)).toEqual(eve)
    const live = beginLive(g)
    live.match.playUntil(120)
    const done = finishPendingMatch(g, live.match.result())
    clearLive()
    const after = pressOpen(done.season, USER)
    expect(['win', 'draw', 'loss']).toContain(after?.occasion)
  })

  it('responder registra o tom, fecha aquela coletiva e não muda nada no jogo', () => {
    const g = playRounds(2)
    const team = g.season.teams.find((t) => t.id === USER)!
    const before = boardOf(g)
    const next = answerPress(g.season, team, 'confident')
    expect(next.press).toHaveLength(1)
    expect(next.press![0]).toMatchObject({ tone: 'confident', occasion: 'eve', date: g.season.season.currentDate })
    // só o registro muda: o clube é o mesmo em todo o resto
    expect({ ...next, press: undefined }).toEqual({ ...team, press: undefined })
    const played: Game = { ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === USER ? next : t)) } }
    expect(boardOf(played)).toEqual(before)
    expect(g.season.players).toBe(played.season.players)
    expect(pressOpen(played.season, USER, next.press!.map((a) => a.key))).toBeUndefined()
    expect(() => answerPress(played.season, next, 'humble')).toThrow(/coletiva/)
    expect(() => answerPress(g.season, team, 'gritar')).toThrow(/inválida/)
  })

  it('só guarda as últimas 30 respostas', () => {
    const g = playRounds(1)
    const team = g.season.teams.find((t) => t.id === USER)!
    const old = Array.from({ length: PRESS_LOG_MAX + 5 }, (_, i) => ({ key: `m${i}:win`, occasion: 'win' as const, question: 0, tone: 'humble' as const, date: '2026-01-01', matchId: `m${i}` }))
    const next = answerPress(g.season, { ...team, press: old }, 'defend')
    expect(next.press).toHaveLength(PRESS_LOG_MAX)
    expect(next.press!.at(-1)!.tone).toBe('defend')
  })

  it('o comando confere o corpo e, sem coletiva aberta, recusa', () => {
    expect(parseCommand({ type: 'press', tone: 'humble' })).toEqual({ type: 'press', tone: 'humble' })
    expect(parseCommand({ type: 'press', tone: 'gritar' })).toBeUndefined()
    expect(parseCommand({ type: 'press', tone: 'humble', x: 1 })).toBeUndefined()
    const world = createLeagueWorld(11, undefined, { cups: false })
    const my = world.season.competitions[0]!.teamIds[0]!
    expect(applyCommand(world, my, { type: 'press', tone: 'humble' })).toMatchObject({ ok: false, error: 'press-closed' })
  })
})

describe('tela de Imprensa', () => {
  it('mostra as abas, as manchetes com veículo fictício e a coletiva da vez com três respostas', () => {
    const g = playRounds(2)
    const html = renderToStaticMarkup(createElement(Press, { game: g }))
    const t = text(html)
    for (const s of ['Imprensa', 'Notícias', 'Coletiva', 'O que você disse', 'fictícios']) expect(t).toContain(s)
    expect(html).toContain('data-testid="headline"')
    expect(html.match(/data-testid="headline"/g)!.length).toBeGreaterThanOrEqual(1)
  })
})
