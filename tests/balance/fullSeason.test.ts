/**
 * Temporada inteira das três séries pelo calendário (1140 partidas das 3 séries, alguns segundos).
 * Fica no projeto de balanceamento para manter o npm test rápido.
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import {
  StandingsCache,
  advanceToNextEvent,
  computeStandings,
  createSeason,
  daysBetween,
  nextEvent,
  progressDays,
  simulateToSeasonEnd,
} from '../../src/engine/season'
describe('temporada inteira pelo calendário (Série A, B e C)', () => {
  const world = generateWorld({ seed: 31 })
  const start = createSeason({ year: 2026, seed: 'full', teams: world.teams, players: world.players })
  const t0 = performance.now()
  const end = simulateToSeasonEnd(start)
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

  it('todas as 1140 partidas são jogadas e a temporada termina', () => {
    expect(end.matches).toHaveLength(1140)
    expect(end.matches.every((m) => m.status === 'finished' && m.result)).toBe(true)
    expect(end.season.phase).toBe('end-of-season')
    expect(nextEvent(end).type).toBe('season-end')
    expect(advanceToNextEvent(end).played).toHaveLength(0)
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
    for (let i = 0; i < 400 && nextEvent(state).type === 'matchday'; i++) state = advanceToNextEvent(state).state
    expect(state.matches.map((m) => m.result?.homeGoals)).toEqual(end.matches.map((m) => m.result?.homeGoals))
  })
})

describe('condição dos jogadores durante a temporada inteira', () => {
  const world = generateWorld({ seed: 32 })
  let state = createSeason({ year: 2026, seed: 'cond-full', teams: world.teams, players: world.players })

  let unavailablePlayed = 0
  let matchSides = 0
  let rotatedOut = 0
  let suspensionsServed = 0
  let injuriesStarted = 0
  const teamById = new Map(world.teams.map((t) => [t.id, t]))
  const fitnessAtKickoff: number[] = []

  while (nextEvent(state).type === 'matchday') {
    // Estado do dia do jogo: já com os dias passados (recuperação e fim das lesões) e antes da partida.
    const event = nextEvent(state)
    const days = event.type === 'matchday' ? daysBetween(state.season.currentDate, event.date) : 0
    const before = new Map(progressDays(state.players, days).map((p) => [p.id, p]))
    const step = advanceToNextEvent(state)
    for (const m of step.played) {
      for (const teamId of [m.homeTeamId, m.awayTeamId]) {
        const results = (m.result?.playerResults ?? []).filter((r) => r.teamId === teamId && r.minutesPlayed > 0)
        matchSides++
        for (const r of results) {
          const p = before.get(r.playerId)
          if (p && (p.condition.suspensionGames > 0 || p.condition.injuryDaysLeft > 0)) unavailablePlayed++
        }
        const base = teamById.get(teamId)?.tactic.startingXI ?? []
        rotatedOut += base.filter((id) => !results.some((r) => r.playerId === id)).length
        for (const r of results.filter((x) => x.minutesPlayed >= 60)) fitnessAtKickoff.push(before.get(r.playerId)?.condition.fitness ?? 100)
      }
      for (const r of m.result?.playerResults ?? []) if (r.injuryDays) injuriesStarted++
    }
    for (const p of step.state.players) {
      const was = before.get(p.id)
      if (was && was.condition.suspensionGames > 0 && p.condition.suspensionGames < was.condition.suspensionGames) suspensionsServed++
    }
    state = step.state
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  console.log(
    `condição na temporada (mundo 32): condição média dos titulares ao entrar ${mean(fitnessAtKickoff).toFixed(1)} | titulares oficiais fora do jogo ${(rotatedOut / matchSides).toFixed(2)} por jogo por time | lesões ${(injuriesStarted / 40).toFixed(1)} por time | suspensões cumpridas ${suspensionsServed}`,
  )

  it('ninguém joga lesionado ou suspenso', () => {
    expect(unavailablePlayed).toBe(0)
  })

  it('há lesões e suspensões ao longo do ano, em quantidade realista', () => {
    expect(injuriesStarted / 40).toBeGreaterThan(2)
    expect(injuriesStarted / 40).toBeLessThan(14)
    expect(suspensionsServed).toBeGreaterThan(20)
  })

  it('o elenco é rodado: os titulares oficiais nem sempre jogam, mas quase sempre', () => {
    expect(rotatedOut / matchSides).toBeGreaterThan(0.2)
    expect(rotatedOut / matchSides).toBeLessThan(2.5)
  })

  it('os titulares entram cansados às vezes, mas em geral com boa condição', () => {
    expect(mean(fitnessAtKickoff)).toBeGreaterThan(75)
    expect(mean(fitnessAtKickoff)).toBeLessThan(99)
  })

  it('terminada a temporada, todos os 1140 jogos foram jogados', () => {
    expect(state.matches.every((m) => m.status === 'finished')).toBe(true)
  })
})
