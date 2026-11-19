import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { squadRoom } from '../src/engine/squadRoom'
import { setCaptain } from '../src/engine/tacticEdit'
import { createGame, squadOf, userTeam } from '../src/store/game'
import { Locker } from '../src/ui/screens/squad/Locker'
import { Squad } from '../src/ui/screens/Squad'

const USER = 'team-imp'
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('aba Vestiário do Elenco', () => {
  it('mostra moral, entrosamento, reclamações, os grupos da hierarquia e o aviso de que é só leitura', () => {
    const g = createGame(3, USER, { cups: false })
    const html = renderToStaticMarkup(createElement(Locker, { game: g }))
    const t = text(html)
    for (const s of ['Vestiário', 'Moral do grupo', 'Entrosamento', 'Reclamações', 'Referências', 'Respeitados', 'A faixa de capitão é de', 'não muda o resultado dos jogos']) expect(t).toContain(s)
    expect(html.match(/data-testid="locker-row"/g)).toHaveLength(squadOf(g, USER).length)
    expect(html.match(/data-testid="locker-group"/g)!.length).toBeGreaterThanOrEqual(3)
    expect(t).toContain('Formando')
  })

  it('"Dar a braçadeira" só aparece para titulares com peso que ainda não são capitães', () => {
    const g = createGame(3, USER, { cups: false })
    const team = userTeam(g)
    const room = squadRoom(team, squadOf(g, USER), team)
    const expected = room.rows.filter((r) => !r.captain && r.starter && (r.role === 'reference' || r.role === 'respected')).length
    expect(renderToStaticMarkup(createElement(Locker, { game: g })).match(/data-testid="give-armband"/g)?.length ?? 0).toBe(expected)
    expect(expected).toBeGreaterThan(0)
    // o capitão novo precisa ser titular
    const other = team.tactic.startingXI.find((id) => id !== team.tactic.captainId)!
    expect(setCaptain(team.tactic, other).captainId).toBe(other)
    const bench = squadOf(g, USER).find((p) => !team.tactic.startingXI.includes(p.id))!
    expect(() => setCaptain(team.tactic, bench.id)).toThrow(/titular/)
  })

  it('o Elenco tem a aba Vestiário', () => {
    const g = createGame(3, USER, { cups: false })
    expect(text(renderToStaticMarkup(createElement(Squad, { game: g })))).toContain('Vestiário')
  })
})
