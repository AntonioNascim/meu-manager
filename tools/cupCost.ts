/**
 * Custo de tempo das copas: a mesma temporada do mundo padrão com e sem as copas (as partidas do time do jogador também são jogadas).
 * Uso: node tools/run.mjs cupCost [--seasons 3]
 */
import { generateWorld } from '../src/data/generateWorld'
import { defaultCupSpecs } from '../src/data/package/cups'
import { createSeason, simulateToSeasonEnd } from '../src/engine/season'

const args = process.argv.slice(2)
const seasons = Number(args[args.indexOf('--seasons') + 1] || 3)
const world = generateWorld({ seed: 5 })
const run = (withCups: boolean, seed: number) => {
  const t = performance.now()
  const state = simulateToSeasonEnd(createSeason({ year: 2026, seed, teams: world.teams, players: world.players, academy: world.academy, ...(withCups ? { cupSpecs: defaultCupSpecs() } : {}) }), { market: process.argv.includes('--market') })
  return { ms: performance.now() - t, matches: state.matches.length, cup: state.matches.filter((m) => m.cup).length, deals: state.market.history.length }
}
run(true, 99) // aquece o JIT
for (const withCups of [false, true]) {
  const runs = Array.from({ length: seasons }, (_, i) => run(withCups, i + 1))
  const ms = runs.reduce((s, r) => s + r.ms, 0) / runs.length
  console.log(`${withCups ? 'com copas' : 'sem copas'}: ${(ms / 1000).toFixed(2)} s por temporada, ${runs[0]!.matches} jogos (${runs[0]!.cup} de copa), ${Math.round(runs.reduce((a, r) => a + r.deals, 0) / runs.length)} negócios`)
}
