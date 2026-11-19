import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NEEDS, squadNeeds } from '../src/engine/market/needs'
import type { Player, Team } from '../src/engine/types'
import { createGame, squadOf, userTeam } from '../src/store/game'
import { Market } from '../src/ui/screens/Market'

const USER = 'team-imp'
const base = () => {
  const g = createGame(3, USER, { cups: false })
  return { g, team: userTeam(g) as Team, squad: squadOf(g, USER) }
}
const statusOf = (team: Team, squad: Player[], group: 'GK' | 'DEF' | 'MID' | 'FWD') => squadNeeds(team, squad).find((n) => n.group === group)!

describe('onde falta gente (só leitura)', () => {
  it('devolve os quatro setores com contagens coerentes e não mexe no elenco', () => {
    const { team, squad } = base()
    const before = JSON.stringify([team, squad])
    const needs = squadNeeds(team, squad)
    expect(needs.map((n) => n.group).sort()).toEqual(['DEF', 'FWD', 'GK', 'MID'])
    for (const n of needs) {
      expect(n.available).toBeLessThanOrEqual(n.total)
      expect(['covered', 'thin', 'missing']).toContain(n.need)
    }
    expect(needs.reduce((s, n) => s + n.total, 0)).toBe(squad.length)
    expect(JSON.stringify([team, squad])).toBe(before)
  })

  it('poucos goleiros: um goleiro só é "em falta"; dois é o mínimo', () => {
    const { team, squad } = base()
    const gks = squad.filter((p) => p.position === 'GK')
    const keep = (n: number) => squad.filter((p) => p.position !== 'GK' || gks.slice(0, n).some((g) => g.id === p.id))
    expect(statusOf(team, keep(1), 'GK')).toMatchObject({ need: 'missing', reason: 'few' })
    expect(statusOf(team, keep(NEEDS.minimum.GK), 'GK').need).not.toBe('missing')
  })

  it('lesionados e suspensos cortam o setor: cobertura vira "no limite" e depois "em falta"', () => {
    const { team, squad } = base()
    const def = squad.filter((p) => ['CB', 'RB', 'LB'].includes(p.position))
    expect(def.length).toBeGreaterThanOrEqual(NEEDS.minimum.DEF)
    const hurt = (n: number) => squad.map((p) => (def.slice(0, def.length - NEEDS.starters.DEF - 1 + 0).length >= 0 && def.slice(0, n).some((d) => d.id === p.id) ? { ...p, condition: { ...p.condition, injuryDaysLeft: 10 } } : p))
    const some = statusOf(team, hurt(def.length - NEEDS.starters.DEF), 'DEF')
    expect(some.need).toBe('thin')
    expect(some.reason).toBe('injured')
    const most = statusOf(team, hurt(def.length - NEEDS.starters.DEF + 1), 'DEF')
    expect(most.need).toBe('missing')
    const suspended = squad.map((p) => (def.slice(0, def.length - NEEDS.starters.DEF + 1).some((d) => d.id === p.id) ? { ...p, condition: { ...p.condition, suspensionGames: 1 } } : p))
    expect(statusOf(team, suspended, 'DEF').need).toBe('missing')
  })

  it('o Resumo do mercado mostra os quatro setores com a situação e o atalho para a busca', () => {
    const g = createGame(3, USER, { cups: false })
    const html = renderToStaticMarkup(createElement(Market, { game: g, initialTab: 'overview' }))
    const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(html).toContain('data-testid="squad-needs"')
    expect(html.match(/data-testid="need"/g)).toHaveLength(4)
    for (const s of ['Onde falta gente', 'Goleiros', 'Defensores', 'Meio-campistas', 'Atacantes', 'disponíveis de']) expect(t).toContain(s)
  })
})
