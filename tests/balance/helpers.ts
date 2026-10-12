/**
 * Ajudantes dos testes de balanceamento: simulam muitas partidas (ou temporadas inteiras)
 * e resumem as métricas comparadas com as metas do CLAUDE.md.
 */
import type { World } from '../../src/data/generateWorld'
import { simulateMatch } from '../../src/engine/match'
import { createRng } from '../../src/engine/rng'
import type { MatchResult, Player, Team } from '../../src/engine/types'
import { summarize } from '../../tools/seasons'
import type { BalanceSummary } from '../../tools/seasons'

export type { BalanceSummary, SeasonRow, SeasonSummary } from '../../tools/seasons'
export { simulateSeasons } from '../../tools/seasons'

function squads(world: World): Map<string, Player[]> {
  const map = new Map<string, Player[]>()
  for (const t of world.teams) map.set(t.id, [])
  for (const p of world.players) if (p.teamId) map.get(p.teamId)?.push(p)
  return map
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
