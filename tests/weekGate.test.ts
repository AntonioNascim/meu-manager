import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { advanceToMatchday, createGame, finishPendingMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { applyCommand, parseCommand } from '../src/engine/league'
import { addDays } from '../src/engine/season/dates'
import { agendaOf, clearAgenda, committeeAgenda, delegateMissing, ensureWeek, setDelegateAlways, setSession, trainingWindow, weekStatus } from '../src/engine/training'
import type { SeasonState } from '../src/engine/season/calendar'
import { Dashboard } from '../src/ui/screens/Dashboard'

const USER = 'team-imp'
const PLAN = { intensity: 'normal', focus: 'balanced' } as const

/** Depois do 3º jogo do time: há dias de treino até o próximo. */
function afterThirdGame(): Game {
  let game = createGame(3, USER, { cups: false })
  for (let i = 0; i < 3; i++) {
    while (!game.pendingUserMatch) game = advanceToMatchday(game)
    const live = beginLive(game)
    live.match.playUntil(120)
    game = finishPendingMatch(game, live.match.result())
    clearLive()
  }
  return game
}

describe('semana de treino obrigatória (estado)', () => {
  const game = afterThirdGame()
  const state = game.season

  it('sem agenda a semana não está pronta e lista os dias que faltam', () => {
    const s = weekStatus(state, USER)
    expect(s.window.length).toBeGreaterThan(0)
    expect(s.missing).toEqual(s.window)
    expect(s.ready).toBe(false)
    expect(s.delegateAlways).toBe(false)
  })

  it('montar todos os dias deixa a semana pronta; tirar um dia a desfaz', () => {
    let s: SeasonState = state
    const window = trainingWindow(s, USER)
    for (const d of window) s = setSession(s, USER, d, { drill: 'rondo', intensity: 'normal' })
    expect(weekStatus(s, USER).ready).toBe(true)
    s = setSession(s, USER, window[0] as string, null)
    expect(weekStatus(s, USER)).toMatchObject({ ready: false, missing: [window[0]] })
    expect(weekStatus(clearAgenda(s, USER), USER).ready).toBe(false)
  })

  it('delegar à comissão (semana inteira) deixa a semana pronta', () => {
    const window = trainingWindow(state, USER)
    const s = setAgendaFromCommittee(state, window)
    expect(weekStatus(s, USER).ready).toBe(true)
  })

  it('"completar só o que falta" mantém o que o técnico montou', () => {
    const window = trainingWindow(state, USER)
    const mine = { drill: 'finishing-box', intensity: 'intense' } as const
    const s0 = setSession(state, USER, window[0] as string, mine)
    const s1 = delegateMissing(s0, USER, PLAN)
    expect(agendaOf(s1.training, USER)[window[0] as string]).toEqual(mine)
    expect(weekStatus(s1, USER).ready).toBe(true)
  })

  it('"Delegar sempre" só age quando ligado e só no que falta', () => {
    expect(weekStatus(ensureWeek(state, USER, PLAN), USER).ready).toBe(false)
    const on = setDelegateAlways(state, USER, true)
    expect(weekStatus(on, USER).delegateAlways).toBe(true)
    expect(weekStatus(ensureWeek(on, USER, PLAN), USER).ready).toBe(true)
    const off = setDelegateAlways(on, USER, false)
    expect(weekStatus(off, USER).delegateAlways).toBe(false)
    expect(off.training.delegateAlways).toBeUndefined()
  })

  it('a semana só vale para o time: outro time não interfere', () => {
    const on = setDelegateAlways(state, USER, true)
    expect(weekStatus(on, 'team-xyz').delegateAlways).toBe(false)
  })
})

describe('janela com jogos em dias seguidos', () => {
  it('jogo no dia seguinte: nenhuma sessão é pedida e a semana está pronta', () => {
    const game = afterThirdGame()
    const next = game.season.matches.filter((m) => (m.homeTeamId === USER || m.awayTeamId === USER) && m.status !== 'finished').sort((a, b) => a.date.localeCompare(b.date))[0]
    expect(next).toBeDefined()
    // aproxima o próximo jogo do time para o dia seguinte ao de hoje
    const tomorrow = addDays(game.season.season.currentDate, 1)
    const matches = game.season.matches.map((m) => (m.id === next!.id ? { ...m, date: tomorrow } : m))
    const state = { ...game.season, matches }
    expect(trainingWindow(state, USER)).toEqual([])
    expect(weekStatus(state, USER).ready).toBe(true)
  })

  it('jogo daqui a 3 dias (quarta a sábado): 2 dias de treino', () => {
    const game = afterThirdGame()
    const next = game.season.matches.filter((m) => (m.homeTeamId === USER || m.awayTeamId === USER) && m.status !== 'finished').sort((a, b) => a.date.localeCompare(b.date))[0]!
    const in3 = addDays(game.season.season.currentDate, 3)
    const matches = game.season.matches.map((m) => (m.id === next.id ? { ...m, date: in3 } : m))
    const window = trainingWindow({ ...game.season, matches }, USER)
    expect(window).toEqual([addDays(game.season.season.currentDate, 1), addDays(game.season.season.currentDate, 2)])
  })

  it('o dia do jogo nunca é dia de treino e a janela tem no máximo 7 dias', () => {
    const game = afterThirdGame()
    const next = game.season.matches.filter((m) => (m.homeTeamId === USER || m.awayTeamId === USER) && m.status !== 'finished').sort((a, b) => a.date.localeCompare(b.date))[0]!
    const far = addDays(game.season.season.currentDate, 22)
    const matches = game.season.matches.map((m) => (m.id === next.id ? { ...m, date: far } : m))
    const window = trainingWindow({ ...game.season, matches }, USER)
    expect(window.length).toBe(7)
    expect(window).not.toContain(far)
  })
})

describe('comando "delegar sempre" (solo e online)', () => {
  it('só aceita o corpo certo', () => {
    expect(parseCommand({ type: 'training-delegate-always', on: true })).toEqual({ type: 'training-delegate-always', on: true })
    expect(parseCommand({ type: 'training-delegate-always', on: 'sim' })).toBeUndefined()
    expect(parseCommand({ type: 'training-delegate-always', on: true, extra: 1 })).toBeUndefined()
  })

  it('liga e desliga na semana do clube', () => {
    const state = afterThirdGame().season
    const on = applyCommand(state, USER, { type: 'training-delegate-always', on: true })
    expect(on.ok).toBe(true)
    if (on.ok) expect(weekStatus(on.world, USER).delegateAlways).toBe(true)
  })
})

describe('tela do painel', () => {
  it('sem a semana montada o Avançar fica bloqueado e o aviso aparece', () => {
    const game = afterThirdGame()
    const html = renderToStaticMarkup(createElement(Dashboard, { game, onNavigate: () => {} }))
    expect(html).toContain('data-testid="week-gate"')
    expect(html).toContain('Monte a semana de treino antes de avançar')
    expect(html).toContain('Delegar à comissão')
    expect(html).toContain('Delegar sempre')
    expect(html).toMatch(/data-testid="advance"[^>]*disabled|disabled=""[^>]*data-testid="advance"/)
  })

  it('com "Delegar sempre" ligado o botão libera e o aviso muda', () => {
    const game = afterThirdGame()
    const on = { ...game, season: setDelegateAlways(game.season, USER, true) }
    const html = renderToStaticMarkup(createElement(Dashboard, { game: on, onNavigate: () => {} }))
    expect(html).toContain('data-testid="week-gate-auto"')
    expect(html).not.toMatch(/data-testid="advance"[^>]*disabled=""/)
  })

  it('com a semana pronta não há aviso', () => {
    const game = afterThirdGame()
    const window = trainingWindow(game.season, USER)
    const season = setAgendaFromCommittee(game.season, window)
    const html = renderToStaticMarkup(createElement(Dashboard, { game: { ...game, season }, onNavigate: () => {} }))
    expect(html).not.toContain('data-testid="week-gate"')
  })
})

function setAgendaFromCommittee(state: SeasonState, window: readonly string[]): SeasonState {
  let s = state
  for (const [d, session] of Object.entries(committeeAgenda(PLAN, window))) s = setSession(s, USER, d, session)
  return s
}
