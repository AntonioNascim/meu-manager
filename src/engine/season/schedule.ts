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
 * Liga em turno e returno: 2 × (n − 1) rodadas. A ordem dos times é sorteada pela seed (tabelas
 * diferentes a cada temporada). Os mandos seguem a construção canônica do método do círculo (cada time
 * troca de mando a cada rodada, com no máximo uma repetição no turno); depois a ordem das rodadas é
 * girada para que a virada do turno para o returno também não crie sequência longa. Sempre há giro que serve.
 */
export function buildLeagueRounds(teamIds: readonly TeamId[], rng: Rng): Fixture[][] {
  const pairs = circleRounds(rng.shuffle(teamIds))
  const flip = rng.chance(0.5)

  const canonical: Fixture[][] = pairs.map((round, r) =>
    round.map(([a, b], i) => {
      // O primeiro par é o time fixo; nos demais, alterna pela posição no círculo.
      const aHome = i === 0 ? r % 2 === 0 : i % 2 === 1
      return aHome !== flip ? { homeTeamId: a, awayTeamId: b } : { homeTeamId: b, awayTeamId: a }
    }),
  )

  const candidates: Fixture[][][] = []
  for (let shift = 0; shift < canonical.length; shift++) {
    const full = mirror([...canonical.slice(shift), ...canonical.slice(0, shift)])
    if (venueViolations(full) === 0) candidates.push(full)
  }
  if (candidates.length === 0) throw new Error('Não foi possível ajustar os mandos da tabela')
  return rng.pick(candidates)
}
