import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createGame } from '../src/store/game'
import { Titles, titlesOf } from '../src/ui/screens/standings/Titles'

const base = createGame(12, 'team-imp', { cups: false })
const other = base.season.teams.find((t) => t.id !== base.userTeamId)?.id as string

describe('Conquistas do clube (calculadas do histórico)', () => {
  it('sem títulos mostra o aviso', () => {
    expect(titlesOf(base)).toEqual([])
    expect(renderToStaticMarkup(createElement(Titles, { game: base }))).toContain('Ainda não há títulos')
  })

  it('conta só os campeonatos em que o seu clube foi campeão e as copas que ele ganhou, do mais recente ao mais antigo', () => {
    const game = {
      ...base,
      seasonLog: [
        { year: 2024, champions: [base.userTeamId, other], promoted: [], relegated: [], userTeamId: base.userTeamId, userTier: 1, userPosition: 1 },
        { year: 2025, champions: [other, base.userTeamId], promoted: [], relegated: [], userTeamId: base.userTeamId, userTier: 1, userPosition: 5 },
      ],
      season: { ...base.season, cupHistory: { 'cup-x': [{ year: 2025, winnerId: base.userTeamId, runnerUpId: other }, { year: 2024, winnerId: other, runnerUpId: base.userTeamId }] } },
    } as unknown as typeof base
    const titles = titlesOf(game)
    expect(titles.map((t) => t.year)).toEqual([2025, 2025, 2024])
    expect(titles.filter((t) => t.year === 2024)).toHaveLength(1)
    expect(renderToStaticMarkup(createElement(Titles, { game }))).toContain('data-testid="titles"')
  })
})
