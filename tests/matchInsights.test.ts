import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProjectionLine } from '../src/ui/screens/match/Insights'
import type { AnyProjection } from '../src/ui/screens/match/projection'

const text = (p: AnyProjection | null, prognosis = null as never) => renderToStaticMarkup(createElement(ProjectionLine, { projection: p, prognosis })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('linha "se terminar assim"', () => {
  it('liga: posição, seta, zona e vaga continental', () => {
    const t = text({ kind: 'league', position: 3, size: 20, points: 10, zone: null, continental: { cupId: 'lib', cupName: 'Copa Libertadores', entry: 'groups' }, current: 6 })
    expect(t).toContain('Se terminar assim')
    expect(t).toContain('3º')
    expect(t).toContain('de 20')
    expect(t).toContain('▲3')
    expect(t).toContain('Copa Libertadores (fase de grupos)')
  })

  it('liga: líder e rebaixamento', () => {
    expect(text({ kind: 'league', position: 1, size: 20, points: 9, zone: 'leader', continental: { cupId: 'lib', cupName: 'Copa Libertadores', entry: 'knockout' }, current: 1 })).toContain('na liderança')
    expect(text({ kind: 'league', position: 19, size: 20, points: 1, zone: 'relegation', continental: null, current: 17 })).toContain('na zona de rebaixamento')
  })

  it('grupo e fase de liga de copa', () => {
    expect(text({ kind: 'group', cupName: 'Copa X', group: 'B', position: 2, size: 4, direct: 0, playoff: 0, status: 'advance' })).toContain('Grupo B')
    expect(text({ kind: 'group', cupName: 'Copa X', group: 'B', position: 2, size: 4, direct: 0, playoff: 0, status: 'advance' })).toContain('classificado')
    expect(text({ kind: 'league-phase', cupName: 'Copa Y', group: '', position: 20, size: 36, direct: 8, playoff: 16, status: 'out' })).toContain('eliminado')
  })

  it('mata-mata: classificado, eliminado e prorrogação, com o agregado', () => {
    const base = { kind: 'knockout' as const, cupName: 'Copa X', stageName: 'Semifinal', firstLeg: false }
    expect(text({ ...base, goalsFor: 3, goalsAgainst: 2, status: 'through' })).toContain('3 x 2')
    expect(text({ ...base, goalsFor: 3, goalsAgainst: 2, status: 'through' })).toContain('classificado')
    expect(text({ ...base, goalsFor: 1, goalsAgainst: 2, status: 'out' })).toContain('eliminado')
    expect(text({ ...base, goalsFor: 2, goalsAgainst: 2, status: 'tied-extra-time' })).toContain('prorrogação')
    expect(text({ ...base, firstLeg: true, goalsFor: 1, goalsAgainst: 0, status: 'ahead' })).toContain('na ida')
  })

  it('prognóstico de mata-mata e de liga', () => {
    const ko = (status: 'through' | 'out' | 'tied-extra-time') => ({ kind: 'knockout' as const, cupName: 'C', stageName: 'F', firstLeg: false, goalsFor: 0, goalsAgainst: 0, status })
    const t = text(null, { win: ko('through'), draw: ko('tied-extra-time'), lose: ko('out') } as never)
    expect(t).toContain('Se vencer')
    expect(t).toContain('classificado')
    expect(t).toContain('eliminado')
    const league = (position: number) => ({ kind: 'league' as const, position, size: 20, points: 0, zone: null, continental: null, current: 5 })
    expect(text(null, { win: league(2), draw: league(5), lose: league(9) } as never)).toContain('Posição na tabela depois do jogo')
  })

  it('sem projeção nem prognóstico não desenha nada', () => expect(text(null)).toBe(''))
})
