/**
 * Temporada inteira das duas séries pelo calendário (760 partidas, alguns segundos).
 * Fica no projeto de balanceamento para manter o 
pm test rápido.
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import {
  StandingsCache,
  advanceToNextEvent,
  computeStandings,
  createSeason,
  createSimulationContext,
  defaultCompetitions,
  nextEvent,
  simulateToSeasonEnd,
} from '../../src/engine/season'
describe('temporada inteira pelo calendário (Série A e Série B)', () => {
  const world = generateWorld({ seed: 31 })
  const context = createSimulationContext(world.teams, world.players)
  const start = createSeason({ year: 2026, seed: 'full', competitions: defaultCompetitions(world.teams) })
  const t0 = performance.now()
  const end = simulateToSeasonEnd(start, context)
  const seconds = (performance.now() - t0) / 1000

  // Classificação final no terminal (aparece em npm run test:balance).
  const nameOf = new Map(world.teams.map((t) => [t.id, t.name]))
  const pad = (v: string | number, n: number) => String(v).padStart(n)
  for (const competition of start.season.competitions) {
    const table = computeStandings(competition.teamIds, end.matches.filter((m) => m.competitionId === competition.id))
    console.log(
      [
        competition.name + ' ' + start.season.year,
        ' #  time                          J   V   E   D  GP  GC  SG  Pts',
        ...table.map(
          (r, i) =>
            pad(i + 1, 2) + '  ' + (nameOf.get(r.teamId) ?? '').padEnd(28) +
            [r.played, r.wins, r.draws, r.losses, r.goalsFor, r.goalsAgainst, r.goalDifference, r.points].map((v) => pad(v, 4)).join(''),
        ),
      ].join('\n'),
    )
  }

  it('todas as 760 partidas são jogadas e a temporada termina', () => {
    expect(end.matches).toHaveLength(760)
    expect(end.matches.every((m) => m.status === 'finished' && m.result)).toBe(true)
    expect(end.season.phase).toBe('end-of-season')
    expect(nextEvent(end).type).toBe('season-end')
    expect(advanceToNextEvent(end, context).played).toHaveLength(0)
    expect(seconds).toBeLessThan(30)
  })

  for (const competition of start.season.competitions) {
    it(`${competition.name}: todo time joga 38 partidas, 19 em casa e 19 fora`, () => {
      const matches = end.matches.filter((m) => m.competitionId === competition.id)
      expect(competition.teamIds).toHaveLength(20)
      for (const teamId of competition.teamIds) {
        expect(matches.filter((m) => m.homeTeamId === teamId)).toHaveLength(19)
        expect(matches.filter((m) => m.awayTeamId === teamId)).toHaveLength(19)
      }
    })

    it(`${competition.name}: cada confronto acontece duas vezes, com os mandos invertidos`, () => {
      const matches = end.matches.filter((m) => m.competitionId === competition.id)
      const keys = new Set(matches.map((m) => `${m.homeTeamId}>${m.awayTeamId}`))
      expect(keys.size).toBe(380)
      for (const m of matches) expect(keys.has(`${m.awayTeamId}>${m.homeTeamId}`)).toBe(true)
    })

    it(`${competition.name}: a classificação final fecha com as partidas`, () => {
      const matches = end.matches.filter((m) => m.competitionId === competition.id)
      const table = computeStandings(competition.teamIds, matches)
      expect(table).toHaveLength(20)
      for (const row of table) {
        expect(row.played).toBe(38)
        expect(row.wins + row.draws + row.losses).toBe(38)
        expect(row.points).toBe(3 * row.wins + row.draws)
        expect(row.goalDifference).toBe(row.goalsFor - row.goalsAgainst)
      }
      const goals = matches.reduce((n, m) => n + (m.result?.homeGoals ?? 0) + (m.result?.awayGoals ?? 0), 0)
      expect(table.reduce((n, r) => n + r.goalsFor, 0)).toBe(goals)
      expect(table.reduce((n, r) => n + r.goalsAgainst, 0)).toBe(goals)
      expect(table.reduce((n, r) => n + r.wins, 0)).toBe(table.reduce((n, r) => n + r.losses, 0))
      for (let i = 1; i < table.length; i++) {
        expect((table[i - 1]?.points ?? 0) >= (table[i]?.points ?? 0)).toBe(true)
      }
    })
  }

  it('cache por rodada: bate com o cálculo direto, reaproveita e se invalida sozinho', () => {
    const competition = start.season.competitions[0]!
    const cache = new StandingsCache(competition.teamIds)
    const mine = end.matches.filter((m) => m.competitionId === competition.id)

    for (const round of [1, 10, 19, 38]) {
      expect(cache.table(mine, round)).toEqual(computeStandings(competition.teamIds, mine, { upToRound: round }))
    }
    expect(cache.table(mine, 38)).toBe(cache.table(mine, 38)) // reaproveitada

    // Rodada 1 sem jogos => tabela zerada; depois de jogada => muda.
    const unplayed = mine.map((m) => (m.round === 1 ? { ...m, status: 'scheduled' as const } : m))
    const before = cache.table(unplayed, 1)
    expect(before.every((r) => r.played === 0)).toBe(true)
    expect(cache.table(mine, 1).every((r) => r.played === 1)).toBe(true)
  })

  it('a temporada simulada passo a passo dá o mesmo resultado que a direta', () => {
    let state = start
    for (let i = 0; i < 400 && nextEvent(state).type === 'matchday'; i++) state = advanceToNextEvent(state, context).state
    expect(state.matches.map((m) => m.result?.homeGoals)).toEqual(end.matches.map((m) => m.result?.homeGoals))
  })
})
