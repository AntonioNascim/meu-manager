/**
 * Ajudantes dos testes de balanceamento: simulam muitas partidas (ou temporadas inteiras)
 * e resumem as métricas comparadas com as metas do CLAUDE.md.
 */
import type { World } from '../../src/data/generateWorld'
import { simulateMatch } from '../../src/engine/match'
import { computeStandings, createSeason, simulateToSeasonEnd } from '../../src/engine/season'
import { playerOverall } from '../../src/engine/overall'
import { createRng } from '../../src/engine/rng'
import type { Competition, MatchResult, Player, Team } from '../../src/engine/types'

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

function squads(world: World): Map<string, Player[]> {
  const map = new Map<string, Player[]>()
  for (const t of world.teams) map.set(t.id, [])
  for (const p of world.players) if (p.teamId) map.get(p.teamId)?.push(p)
  return map
}

function summarize(results: MatchResult[], ms: number): BalanceSummary {
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

/** `n` partidas entre times sorteados da mesma série (alternando A e B). */
export function simulateRandomMatches(world: World, n: number, seed: string | number = 'balance'): BalanceSummary {
  const rng = createRng(seed)
  const bySquad = squads(world)
  const series = [1, 2].map((tier) => world.teams.filter((t) => t.tier === tier))
  const results: MatchResult[] = []
  const t0 = performance.now()
  for (let i = 0; i < n; i++) {
    const teams = series[i % series.length] as Team[]
    const home = rng.pick(teams)
    let away = rng.pick(teams)
    while (away === home) away = rng.pick(teams)
    results.push(
      simulateMatch({
        home: { team: home, players: bySquad.get(home.id) ?? [] },
        away: { team: away, players: bySquad.get(away.id) ?? [] },
        seed: rng.int(0, 2 ** 31 - 1),
      }),
    )
  }
  return summarize(results, performance.now() - t0)
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

/** Linha da tabela de metas para exibir no terminal. */
export function formatSummary(label: string, s: BalanceSummary): string {
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`
  return [
    label.padEnd(26),
    s.goalsPerMatch.toFixed(2).padStart(6),
    pct(s.homeWinRate).padStart(8),
    pct(s.drawRate).padStart(8),
    pct(s.awayWinRate).padStart(8),
    s.shotsPerTeam.toFixed(1).padStart(6),
  ].join(' | ')
}
