import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { createRng } from '../src/engine/rng'
import {
  StandingsCache,
  advanceToNextEvent,
  buildLeagueRounds,
  circleRounds,
  computeStandings,
  createSeason,
  isMidweekRound,
  nextEvent,
  roundSlots,
  venueViolations,
  addDays,
  daysBetween,
  weekday,
} from '../src/engine/season'
import type { Match, MatchResult, TeamMatchStats } from '../src/engine/types'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`)

describe('datas', () => {
  it('soma dias e acha o dia da semana', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(weekday('2026-04-11')).toBe(6) // sábado
    expect(weekday('2026-04-12')).toBe(0) // domingo
    expect(daysBetween('2026-04-11', '2026-04-25')).toBe(14)
  })
})

describe('método do círculo', () => {
  const rounds = circleRounds(ids(20))

  it('20 times: 19 rodadas, cada time joga uma vez por rodada', () => {
    expect(rounds).toHaveLength(19)
    for (const round of rounds) {
      expect(round).toHaveLength(10)
      expect(new Set(round.flat()).size).toBe(20)
    }
  })

  it('todos os pares se enfrentam exatamente uma vez no turno', () => {
    const pairs = rounds.flat().map(([a, b]) => [a, b].sort().join('-'))
    expect(new Set(pairs).size).toBe(190)
    expect(pairs).toHaveLength(190)
  })

  it('número ímpar de times não é aceito', () => {
    expect(() => circleRounds(ids(5))).toThrow()
  })
})

describe('tabela da liga (turno e returno)', () => {
  for (const seed of [1, 2, 3, 4, 5, 99]) {
    const rounds = buildLeagueRounds(ids(20), createRng(seed))

    it(`seed ${seed}: 38 rodadas, 19 jogos em casa e 19 fora para cada time`, () => {
      expect(rounds).toHaveLength(38)
      for (const team of ids(20)) {
        const games = rounds.map((r) => r.filter((f) => f.homeTeamId === team || f.awayTeamId === team))
        for (const g of games) expect(g).toHaveLength(1)
        expect(rounds.flat().filter((f) => f.homeTeamId === team)).toHaveLength(19)
        expect(rounds.flat().filter((f) => f.awayTeamId === team)).toHaveLength(19)
      }
    })

    it(`seed ${seed}: o returno espelha o turno com o mando invertido`, () => {
      for (let r = 0; r < 19; r++) {
        const first = rounds[r] ?? []
        const second = rounds[r + 19] ?? []
        expect(second.map((f) => [f.awayTeamId, f.homeTeamId])).toEqual(first.map((f) => [f.homeTeamId, f.awayTeamId]))
      }
    })

    it(`seed ${seed}: ninguém joga 3 vezes seguidas em casa ou fora (nem na virada do returno)`, () => {
      expect(venueViolations(rounds)).toBe(0)
      // Conferência independente da função acima.
      for (const team of ids(20)) {
        const venue = rounds.map((r) => (r.some((f) => f.homeTeamId === team) ? 'H' : 'A'))
        expect(venue.join('')).not.toMatch(/HHH|AAA/)
      }
    })
  }

  it('nenhuma seed falha: 300 tabelas, todas sem sequência longa de mando, rápidas', () => {
    const t0 = performance.now()
    for (let seed = 1; seed <= 300; seed++) {
      const rounds = buildLeagueRounds(ids(20), createRng(`robusto-${seed}`))
      expect(rounds).toHaveLength(38)
      expect(venueViolations(rounds)).toBe(0)
    }
    expect((performance.now() - t0) / 300).toBeLessThan(50)
  })

  it('mesma seed, mesma tabela; seed diferente, tabela diferente', () => {
    const a = buildLeagueRounds(ids(20), createRng(7))
    expect(buildLeagueRounds(ids(20), createRng(7))).toEqual(a)
    expect(buildLeagueRounds(ids(20), createRng(8))).not.toEqual(a)
  })
})

describe('calendário', () => {
  const world = generateWorld({ seed: 11 })
  const state = createSeason({ year: 2026, seed: 'cal', teams: world.teams, players: world.players })

  it('Série A e Série B na mesma temporada: 380 jogos cada', () => {
    expect(state.season.competitions.map((c) => c.id)).toEqual(['serie-a', 'serie-b'])
    expect(state.matches.filter((m) => m.competitionId === 'serie-a')).toHaveLength(380)
    expect(state.matches.filter((m) => m.competitionId === 'serie-b')).toHaveLength(380)
    expect(state.season.matchIds).toHaveLength(760)
    expect(new Set(state.matches.map((m) => m.id)).size).toBe(760)
  })

  it('rodadas em ordem cronológica, nos fins de semana, com algumas na quarta', () => {
    const slots = roundSlots(2026, 38)
    for (let i = 1; i < slots.length; i++) {
      expect((slots[i]?.days[0] ?? '') > (slots[i - 1]?.days[0] ?? '')).toBe(true)
    }
    const midweek = slots.filter((s) => s.kind === 'midweek')
    expect(midweek.length).toBeGreaterThanOrEqual(5)
    expect(midweek.length).toBeLessThan(12)
    for (const s of midweek) {
      expect(isMidweekRound(s.round)).toBe(true)
      expect(s.days.map(weekday)).toEqual([3])
    }
    for (const s of slots.filter((x) => x.kind === 'weekend')) {
      for (const d of s.days) expect([0, 6]).toContain(weekday(d))
    }
    // A última rodada tem todos os jogos juntos, no domingo.
    expect(slots[37]?.days).toHaveLength(1)
  })

  it('as duas séries jogam nas mesmas datas, e cada time joga uma vez por dia', () => {
    const datesOf = (id: string) => new Set(state.matches.filter((m) => m.competitionId === id).map((m) => m.date))
    expect(datesOf('serie-a')).toEqual(datesOf('serie-b'))
    const perDay = new Map<string, number>()
    for (const m of state.matches) {
      for (const t of [m.homeTeamId, m.awayTeamId]) {
        const key = `${m.date}|${t}`
        perDay.set(key, (perDay.get(key) ?? 0) + 1)
      }
    }
    expect(Math.max(...perDay.values())).toBe(1)
  })

  it('o intervalo entre as rodadas de um mesmo time nunca passa de uma semana', () => {
    for (const team of world.teams.slice(0, 3)) {
      const dates = state.matches.filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id).map((m) => m.date)
      for (let i = 1; i < dates.length; i++) {
        const gap = daysBetween(dates[i - 1] as string, dates[i] as string)
        expect(gap).toBeGreaterThanOrEqual(1)
        expect(gap).toBeLessThanOrEqual(8)
      }
    }
  })

  it('começa por jogar, é determinístico e as partidas têm seeds distintas', () => {
    expect(state.season.phase).toBe('pre-season')
    expect(state.matches.every((m) => m.status === 'scheduled' && m.result === undefined)).toBe(true)
    expect(createSeason({ year: 2026, seed: 'cal', teams: world.teams, players: world.players })).toEqual(state)
    expect(new Set(state.matches.map((m) => m.seed)).size).toBeGreaterThan(755)
  })
})

// --- Classificação -----------------------------------------------------------------------------

const stats = (yellowCards = 0, redCards = 0): TeamMatchStats => ({
  possession: 50, shots: 10, shotsOnTarget: 4, corners: 4, fouls: 10, yellowCards, redCards, xg: 1,
})

let counter = 0
function game(
  round: number,
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
  cards: { hy?: number; hr?: number; ay?: number; ar?: number } = {},
): Match {
  const result: MatchResult = {
    homeGoals, awayGoals, events: [], playerResults: [],
    homeStats: stats(cards.hy, cards.hr), awayStats: stats(cards.ay, cards.ar),
  }
  return {
    id: `g${counter++}`, competitionId: 'x', round, date: '2026-04-11', homeTeamId: home, awayTeamId: away,
    status: 'finished', seed: 1, result,
  }
}

describe('classificação', () => {
  it('soma pontos, jogos, gols, saldo e cartões das partidas finalizadas', () => {
    const matches = [game(1, 'A', 'B', 2, 0, { hy: 1, ar: 1 }), game(2, 'B', 'C', 1, 1, { hy: 2 }), game(3, 'C', 'A', 0, 3)]
    const table = computeStandings(['A', 'B', 'C'], matches)
    const a = table.find((r) => r.teamId === 'A')
    expect(table.map((r) => r.teamId)).toEqual(['A', 'B', 'C'])
    expect(a).toMatchObject({ played: 2, wins: 2, points: 6, goalsFor: 5, goalsAgainst: 0, goalDifference: 5, yellowCards: 1 })
    expect(table.find((r) => r.teamId === 'B')).toMatchObject({ played: 2, points: 1, goalDifference: -2, yellowCards: 2, redCards: 1 })
  })

  it('ignora partidas ainda não jogadas', () => {
    const pending: Match = { ...game(2, 'A', 'B', 9, 9), status: 'scheduled' }
    delete pending.result
    const table = computeStandings(['A', 'B'], [game(1, 'A', 'B', 1, 0), pending])
    expect(table[0]).toMatchObject({ teamId: 'A', played: 1, goalsFor: 1 })
  })

  it('desempate 1: mais vitórias vence mais pontos iguais', () => {
    // A: 1 vitória e 2 derrotas = 3 pts; B: 3 empates = 3 pts.
    const matches = [game(1, 'A', 'X', 1, 0), game(2, 'A', 'Y', 0, 1), game(3, 'A', 'Z', 0, 1), game(1, 'B', 'X', 0, 0), game(2, 'B', 'Y', 0, 0), game(3, 'B', 'Z', 0, 0)]
    const table = computeStandings(['A', 'B', 'X', 'Y', 'Z'], matches)
    const order = table.map((r) => r.teamId)
    expect(table.find((r) => r.teamId === 'A')?.points).toBe(table.find((r) => r.teamId === 'B')?.points)
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'))
  })

  it('desempate 2 e 3: saldo de gols e depois gols marcados', () => {
    const base = [game(1, 'A', 'X', 3, 0), game(1, 'B', 'Y', 1, 0), game(1, 'C', 'Z', 4, 3)]
    // Todos com 3 pontos e 1 vitória: saldo A +3, B +1, C +1; entre B e C, C marcou mais.
    const table = computeStandings(['A', 'B', 'C', 'X', 'Y', 'Z'], base)
    expect(table.slice(0, 3).map((r) => r.teamId)).toEqual(['A', 'C', 'B'])
  })


  it('desempate 4: confronto direto, antes dos cartões', () => {
    // A e B empatam em pontos, vitórias, saldo e gols; B venceu A. Y fica na frente por saldo.
    const matches = [game(1, 'B', 'A', 1, 0), game(2, 'A', 'X', 1, 0), game(3, 'B', 'Y', 0, 1)]
    const table = computeStandings(['A', 'B', 'X', 'Y'], matches)
    expect(table.map((r) => r.teamId)).toEqual(['Y', 'B', 'A', 'X'])
    const a = table.find((r) => r.teamId === 'A')
    const b = table.find((r) => r.teamId === 'B')
    expect([a?.points, a?.wins, a?.goalDifference, a?.goalsFor]).toEqual([b?.points, b?.wins, b?.goalDifference, b?.goalsFor])
    // Mesmo com B tendo mais cartões, o confronto direto vem antes.
    const carded = [game(1, 'B', 'A', 1, 0, { hr: 2, hy: 5 }), ...matches.slice(1)]
    expect(computeStandings(['A', 'B', 'X', 'Y'], carded).map((r) => r.teamId)).toEqual(['Y', 'B', 'A', 'X'])
  })

  it('desempate 5 e 6: menos vermelhos, depois menos amarelos', () => {
    const draw = (cards: Parameters<typeof game>[5]) => [game(1, 'A', 'B', 0, 0, cards), game(2, 'A', 'X', 1, 0), game(2, 'B', 'Y', 1, 0)]
    const order = (m: Match[]) => computeStandings(['A', 'B', 'X', 'Y'], m).map((r) => r.teamId).slice(0, 2)
    expect(order(draw({ hr: 1 }))).toEqual(['B', 'A']) // A teve um vermelho
    expect(order(draw({ ar: 1 }))).toEqual(['A', 'B'])
    expect(order(draw({ hy: 3, ay: 2 }))).toEqual(['B', 'A']) // sem vermelhos: menos amarelos
    expect(order(draw({ hr: 1, ay: 9 }))).toEqual(['B', 'A']) // vermelho pesa mais que amarelos
  })

  it('desempate 7: sorteio, sempre o mesmo para a mesma seed', () => {
    const matches = [game(1, 'A', 'B', 0, 0), game(2, 'A', 'X', 1, 0), game(2, 'B', 'Y', 1, 0)]
    const order = (drawSeed: string) => computeStandings(['A', 'B', 'X', 'Y'], matches, { drawSeed }).map((r) => r.teamId).slice(0, 2)
    expect(order('s1')).toEqual(order('s1'))
    const results = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map((s) => order(s).join('')))
    expect(results.size).toBe(2) // A à frente ou B à frente, conforme a seed
  })
})

// --- Avançar no tempo e temporada inteira ---------------------------------------------------------

describe('avançar até o próximo evento', () => {
  const world = generateWorld({ seed: 21 })
  const start = createSeason({ year: 2026, seed: 'adv', teams: world.teams, players: world.players })

  it('vai ao próximo dia de jogos, simula só aquele dia e não altera o estado anterior', () => {
    const first = nextEvent(start)
    expect(first.type).toBe('matchday')
    const step = advanceToNextEvent(start)
    const date = first.type === 'matchday' ? first.date : ''
    expect(step.state.season.currentDate).toBe(date)
    expect(step.state.season.phase).toBe('in-season')
    expect(step.played.length).toBeGreaterThan(0)
    expect(step.played.every((m) => m.date === date && m.status === 'finished' && m.result)).toBe(true)
    expect(step.state.matches.filter((m) => m.status === 'finished')).toHaveLength(step.played.length)
    // Entrada intacta (sem mutação escondida).
    expect(start.matches.every((m) => m.status === 'scheduled')).toBe(true)
    expect(start.season.phase).toBe('pre-season')
  })

  it('o evento seguinte é sempre uma data posterior, e as datas só crescem', () => {
    let state = start
    let last = ''
    let steps = 0
    for (let event = nextEvent(state); event.type === 'matchday' && steps < 3; event = nextEvent(state)) {
      expect(event.date > last).toBe(true)
      last = event.date
      state = advanceToNextEvent(state).state
      steps++
    }
    expect(steps).toBe(3)
  })

  it('mesma temporada e mesmos elencos geram os mesmos resultados', () => {
    const a = advanceToNextEvent(start).played.map((m) => [m.id, m.result?.homeGoals, m.result?.awayGoals])
    const b = advanceToNextEvent(start).played.map((m) => [m.id, m.result?.homeGoals, m.result?.awayGoals])
    expect(a).toEqual(b)
  })
})

describe('cache da classificação por rodada', () => {
  const teams = ['A', 'B', 'C', 'D']
  const rounds = [
    [game(1, 'A', 'B', 2, 0), game(1, 'C', 'D', 1, 1)],
    [game(2, 'A', 'C', 0, 1), game(2, 'B', 'D', 3, 0)],
    [game(3, 'A', 'D', 1, 1), game(3, 'B', 'C', 0, 0)],
  ]
  const all = rounds.flat()

  it('cada rodada bate com o cálculo direto até ela', () => {
    const cache = new StandingsCache(teams)
    for (const round of [3, 1, 2, 0]) {
      expect(cache.table(all, round)).toEqual(computeStandings(teams, all, { upToRound: round }))
    }
    expect(cache.table(all, 0).every((r) => r.played === 0)).toBe(true)
  })

  it('reaproveita a tabela guardada e recalcula quando saem novos resultados', () => {
    const cache = new StandingsCache(teams)
    const afterTwo = all.filter((m) => m.round <= 2)
    const first = cache.table(afterTwo, 2)
    expect(cache.table(afterTwo, 2)).toBe(first)
    const later = cache.table(all, 3)
    expect(later).not.toBe(first)
    expect(later.reduce((n, r) => n + r.played, 0)).toBe(12)
    // Voltar a uma rodada anterior com os dados novos ainda dá a tabela daquela rodada.
    expect(cache.table(all, 2)).toEqual(first)
  })

  it('só conta partidas finalizadas', () => {
    const cache = new StandingsCache(teams)
    const pending = all.map((m) => (m.round === 3 ? { ...m, status: 'scheduled' as const } : m))
    expect(cache.table(pending, 3).reduce((n, r) => n + r.played, 0)).toBe(8)
    expect(cache.table(all, 3).reduce((n, r) => n + r.played, 0)).toBe(12)
  })
})