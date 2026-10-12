/**
 * Resumo de partidas e temporadas inteiras pelo calendário real. Usado pela ferramenta de análise
 * (npm run analyze) e pelos testes de balanceamento.
 */
import type { World } from '../src/data/generateWorld'
import { computeStandings, createSeason, simulateToSeasonEnd } from '../src/engine/season'
import { playerOverall } from '../src/engine/overall'
import type { Competition, MatchResult, Player, Team } from '../src/engine/types'

export interface BalanceSummary {
  matches: number
  goalsPerMatch: number
  homeWinRate: number
  drawRate: number
  awayWinRate: number
  shotsPerTeam: number
  shotsOnTargetPerTeam: number
  cornersPerTeam: number
  foulsPerTeam: number
  yellowsPerMatch: number
  redsPerMatch: number
  msPerMatch: number
}

export interface SeasonRow {
  team: Team
  /** Força média dos titulares (referência para ver se o mais forte vai bem). */
  strength: number
  points: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}

export interface SeasonSummary extends BalanceSummary {
  /** Classificação final por pontos, saldo e gols marcados. */
  table: SeasonRow[]
}

export function summarize(results: MatchResult[], ms: number): BalanceSummary {
  const n = results.length
  const sum = (f: (r: MatchResult) => number) => results.reduce((a, r) => a + f(r), 0)
  return {
    matches: n,
    goalsPerMatch: sum((r) => r.homeGoals + r.awayGoals) / n,
    homeWinRate: sum((r) => (r.homeGoals > r.awayGoals ? 1 : 0)) / n,
    drawRate: sum((r) => (r.homeGoals === r.awayGoals ? 1 : 0)) / n,
    awayWinRate: sum((r) => (r.homeGoals < r.awayGoals ? 1 : 0)) / n,
    shotsPerTeam: sum((r) => r.homeStats.shots + r.awayStats.shots) / n / 2,
    shotsOnTargetPerTeam: sum((r) => r.homeStats.shotsOnTarget + r.awayStats.shotsOnTarget) / n / 2,
    cornersPerTeam: sum((r) => r.homeStats.corners + r.awayStats.corners) / n / 2,
    foulsPerTeam: sum((r) => r.homeStats.fouls + r.awayStats.fouls) / n / 2,
    yellowsPerMatch: sum((r) => r.homeStats.yellowCards + r.awayStats.yellowCards) / n,
    redsPerMatch: sum((r) => r.homeStats.redCards + r.awayStats.redCards) / n,
    msPerMatch: ms / n,
  }
}

/**
 * Temporada completa pelo calendário real (as duas séries, turno e returno, 380 jogos cada), com
 * recuperação física, rodízio da IA, lesões, suspensões, forma e moral entre as rodadas.
 */
export function simulateSeasons(world: World, seed: string | number = 'season'): Record<1 | 2, SeasonSummary> {
  const byId = new Map(world.players.map((p) => [p.id, p]))
  const start = createSeason({ year: 2026, seed, teams: world.teams, players: world.players })
  const t0 = performance.now()
  const end = simulateToSeasonEnd(start)
  const ms = performance.now() - t0

  const summaryFor = (tier: 1 | 2): SeasonSummary => {
    const competition = end.season.competitions.find((c) => c.tier === tier) as Competition
    const matches = end.matches.filter((m) => m.competitionId === competition.id)
    const table = computeStandings(competition.teamIds, matches).map((row) => {
      const team = world.teams.find((t) => t.id === row.teamId) as Team
      return {
        team,
        strength: team.tactic.startingXI.reduce((sum, id) => sum + playerOverall(byId.get(id) as Player), 0) / 11,
        points: row.points,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
      } satisfies SeasonRow
    })
    return { ...summarize(matches.map((m) => m.result as MatchResult), ms / 2), table }
  }
  return { 1: summaryFor(1), 2: summaryFor(2) }
}
