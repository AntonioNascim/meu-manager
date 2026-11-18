import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { advanceToMatchday, createGame, finishPendingMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { committeeAgenda, delegateAgenda, trainingWindow } from '../src/engine/training'
import { DRILL_IDS } from '../src/engine/types'
import { DRILL_LABELS, DRILL_GROUP_LABELS } from '../src/ui/labels'
import { Training } from '../src/ui/screens/squad/Training'
import { TrainingWeek } from '../src/ui/screens/squad/TrainingWeek'

const USER = 'team-imp'

function midSeason(): Game {
  let game = createGame(3, USER, { cups: false })
  for (let i = 0; i < 2; i++) {
    while (!game.pendingUserMatch) game = advanceToMatchday(game)
    const live = beginLive(game)
    live.match.playUntil(120)
    game = finishPendingMatch(game, live.match.result())
    clearLive()
  }
  return game
}
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('tela da semana de treino', () => {
  it('mostra os dias até o jogo, o campinho, os grupos de exercícios e os botões da comissão', () => {
    const game = midSeason()
    const w = trainingWindow(game.season, USER)
    const out = html(createElement(TrainingWeek, { game }))
    expect(out).toContain('data-testid="training-week"')
    expect(out.match(/data-testid="training-day"/g)?.length).toBe(w.length)
    expect(out).toContain('data-testid="training-field"')
    expect(text(out)).toContain('Semana de treino')
    expect(text(out)).toContain('Delegar à comissão')
    expect(text(out)).toContain('Limpar a semana')
    expect(text(out)).toContain('O que a semana ensaia')
    // sem treino montado: todos os dias seguem o plano e nada foi ensaiado
    expect(text(out)).toContain('Plano')
    expect(text(out)).toContain('Sem trabalhar')
    // a lista mostra os exercícios do primeiro grupo
    expect(out.match(/data-testid="drill"/g)?.length).toBe(7)
    expect(text(out)).toContain('Onze contra onze')
  })

  it('com a semana delegada, os dias mostram o exercício e os medidores sobem', () => {
    const game = midSeason()
    const delegated: Game = { ...game, season: delegateAgenda(game.season, USER, { intensity: 'normal', focus: 'technical' }) }
    const out = html(createElement(TrainingWeek, { game: delegated }))
    const w = trainingWindow(game.season, USER)
    const names = Object.values(committeeAgenda({ intensity: 'normal', focus: 'technical' }, w)).map((s) => (s.drill === 'rest' ? 'Folga' : DRILL_LABELS[s.drill].name))
    for (const n of new Set(names)) expect(text(out)).toContain(n)
    // a véspera é bola parada leve (o dia aberto traz a cena do exercício)
    expect(text(out)).toContain('Escanteios a favor')
    expect(out).not.toContain('Sem trabalhar</span><span')
  })

  it('a aba Treino traz a semana e o plano padrão da comissão', () => {
    const out = text(html(createElement(Training, { game: midSeason() })))
    expect(out).toContain('Semana de treino')
    expect(out).toContain('Plano da comissão')
    expect(out).toContain('Treino individual')
  })

  it('todo exercício tem nome, descrição e grupo em português', () => {
    for (const id of DRILL_IDS) {
      expect(DRILL_LABELS[id].name.length, id).toBeGreaterThan(2)
      expect(DRILL_LABELS[id].description.length, id).toBeGreaterThan(10)
    }
    expect(Object.keys(DRILL_GROUP_LABELS)).toHaveLength(7)
  })

  it('no dia do jogo não há semana para montar', () => {
    let game = createGame(3, USER, { cups: false })
    while (!game.pendingUserMatch) game = advanceToMatchday(game)
    // o jogo é hoje (ainda não jogado)
    const out = text(html(createElement(TrainingWeek, { game })))
    expect(out).toContain('O jogo é hoje')
  })
})
