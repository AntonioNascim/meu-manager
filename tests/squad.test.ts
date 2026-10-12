import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { playerOverall } from '../src/engine/overall'
import { POSITIONS } from '../src/engine/types'
import type { Player } from '../src/engine/types'
import { createGame, squadOf } from '../src/store/game'
import { bandFor, conditionBand, formBand } from '../src/ui/colors'
import { PlayerDetail } from '../src/ui/components/PlayerDetail'
import { Squad, sortSquad } from '../src/ui/screens/Squad'

const game = createGame(3, 'team-imp')
const squad = squadOf(game, 'team-imp')

describe('ordenação do elenco', () => {
  it('por posição agrupa goleiros primeiro e atacantes por último', () => {
    const sorted = sortSquad(squad, 'position', 1)
    const order = sorted.map((p) => POSITIONS.indexOf(p.position))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(sorted[0]?.position).toBe('GK')
  })

  it('por força, idade, condição, forma e nome, nas duas direções', () => {
    const overall = sortSquad(squad, 'overall', -1).map(playerOverall)
    expect(overall).toEqual([...overall].sort((a, b) => b - a))
    expect(sortSquad(squad, 'overall', 1).map(playerOverall)).toEqual([...overall].reverse())
    const ages = sortSquad(squad, 'age', 1).map((p) => p.age)
    expect(ages).toEqual([...ages].sort((a, b) => a - b))
    const tired = squad.map((p, i) => ({ ...p, condition: { ...p.condition, fitness: 100 - i, form: i % 7 } }))
    expect(sortSquad(tired, 'fitness', 1).map((p) => p.condition.fitness)).toEqual(tired.map((p) => p.condition.fitness).sort((a, b) => a - b))
    const forms = sortSquad(tired, 'form', -1).map((p) => p.condition.form)
    expect(forms).toEqual([...forms].sort((a, b) => b - a))
    const names = sortSquad(squad, 'name', 1).map((p) => p.nickname ?? p.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')))
  })

  it('não altera a lista original', () => {
    const before = squad.map((p) => p.id)
    sortSquad(squad, 'age', -1)
    expect(squad.map((p) => p.id)).toEqual(before)
  })
})

describe('cores por faixa', () => {
  it('atributos: vermelho até 39, laranja, amarelo, verde e azul a partir de 85', () => {
    expect([30, 45, 60, 75, 90].map((v) => bandFor(v).bg)).toEqual(['bg-rose-500', 'bg-amber-500', 'bg-lime-400', 'bg-green-500', 'bg-cyan-400'])
    expect(bandFor(85).bg).toBe('bg-cyan-400')
    expect(bandFor(84.9).bg).toBe('bg-green-500')
  })
  it('condição e forma pioram com valores menores', () => {
    expect(conditionBand(95).bg).not.toBe(conditionBand(40).bg)
    expect(formBand(8).bg).not.toBe(formBand(5).bg)
  })
})

describe('telas de elenco', () => {
  it('a lista mostra todos os jogadores com posição e força', () => {
    const html = renderToStaticMarkup(createElement(Squad, { game }))
    expect(html.match(/<li/g)).toHaveLength(squad.length)
    expect(html).toContain('GOL')
    for (const tab of ['Jogadores', 'Escalação', 'Números']) expect(html).toContain(tab)
    expect(html).not.toContain('Base')
    expect(html).not.toContain('Treino')
  })

  const detail = (p: Player) => renderToStaticMarkup(createElement(PlayerDetail, { player: p, onClose: () => {} }))

  it('o detalhe mostra atributos, condição, lesão, suspensão e forma', () => {
    const p = squad.find((x) => x.position === 'ST') as Player
    const hurt: Player = { ...p, condition: { ...p.condition, injuryDaysLeft: 12, suspensionGames: 1, fitness: 64, form: 7.4, recentRatings: [7.4, 7.0] } }
    const html = detail(hurt)
    for (const text of ['Finalização', 'Condição física', '64%', 'Lesionado · 12 d', 'Suspenso · 1 jogo', 'Forma', '7.4', 'Força por posição']) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain('Reflexos')
  })

  it('goleiro mostra os atributos de goleiro; jogador de linha, não', () => {
    const keeper = squad.find((x) => x.position === 'GK') as Player
    expect(detail(keeper)).toContain('Reflexos')
    expect(detail(keeper)).toContain('Saída do gol')
  })
})
