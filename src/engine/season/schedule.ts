/**
 * Tabela de jogos de uma liga pelo método do círculo.
 * Turno: n−1 rodadas em que cada time joga uma vez. Returno: espelho do turno com mando invertido.
 */
import { SEASON } from '../config'
import type { Rng } from '../rng'
import type { TeamId } from '../types'

export interface Fixture {
  homeTeamId: TeamId
  awayTeamId: TeamId
}

/** Pares de cada rodada do método do círculo, ainda sem mando definido (n par). */
export function circleRounds(teamIds: readonly TeamId[]): [TeamId, TeamId][][] {
  const n = teamIds.length
  if (n < 2 || n % 2 !== 0) throw new Error('O método do círculo precisa de um número par de times')
  const fixed = teamIds[0] as TeamId
  const rest = teamIds.slice(1)
  const rounds: [TeamId, TeamId][][] = []
  for (let r = 0; r < n - 1; r++) {
    const ring = [fixed, ...rest.slice(r), ...rest.slice(0, r)]
    const pairs: [TeamId, TeamId][] = []
    for (let i = 0; i < n / 2; i++) pairs.push([ring[i] as TeamId, ring[n - 1 - i] as TeamId])
    rounds.push(pairs)
  }
  return rounds
}

/** Quantas vezes algum time repete o mesmo mando mais que `max` jogos seguidos (0 = tabela boa). */
export function venueViolations(rounds: readonly (readonly Fixture[])[], max = SEASON.maxVenueStreak): number {
  const lastHome = new Map<TeamId, boolean>()
  const streak = new Map<TeamId, number>()
  let violations = 0
  for (const round of rounds) {
    for (const f of round) {
      for (const [teamId, home] of [[f.homeTeamId, true], [f.awayTeamId, false]] as const) {
        const run = lastHome.get(teamId) === home ? (streak.get(teamId) ?? 0) + 1 : 1
        lastHome.set(teamId, home)
        streak.set(teamId, run)
        if (run > max) violations++
      }
    }
  }
  return violations
}

function mirror(firstHalf: readonly (readonly Fixture[])[]): Fixture[][] {
  return [
    ...firstHalf.map((round) => round.map((f) => ({ ...f }))),
    ...firstHalf.map((round) => round.map((f) => ({ homeTeamId: f.awayTeamId, awayTeamId: f.homeTeamId }))),
  ]
}

/**
 * Liga em turno e returno: `2 × (n − 1)` rodadas. A ordem dos times é sorteada pela seed (tabelas
 * diferentes a cada temporada) e os mandos são ajustados até ninguém ter mais de
 * `SEASON.maxVenueStreak` jogos seguidos em casa ou fora, contando a virada do turno para o returno.
 */
export function buildLeagueRounds(teamIds: readonly TeamId[], rng: Rng): Fixture[][] {
  const order = rng.shuffle(teamIds)
  const pairs = circleRounds(order)

  // Mando inicial alternado; depois um ajuste aleatório (com a seed) corrige o que sobrar.
  const firstHalf: Fixture[][] = pairs.map((round, r) =>
    round.map(([a, b], i) => ((i + r) % 2 === 0 ? { homeTeamId: a, awayTeamId: b } : { homeTeamId: b, awayTeamId: a })),
  )

  let violations = venueViolations(mirror(firstHalf))
  for (let attempt = 0; violations > 0 && attempt < SEASON.homeAwayMaxAttempts; attempt++) {
    const r = rng.int(0, firstHalf.length - 1)
    const round = firstHalf[r] as Fixture[]
    const i = rng.int(0, round.length - 1)
    const f = round[i] as Fixture
    round[i] = { homeTeamId: f.awayTeamId, awayTeamId: f.homeTeamId }
    const after = venueViolations(mirror(firstHalf))
    if (after <= violations) violations = after
    else round[i] = f
  }
  if (violations > 0) throw new Error('Não foi possível ajustar os mandos da tabela')
  return mirror(firstHalf)
}
