/**
 * Economia por liga ano a ano: tabelas completas de cada liga (a versão curta sai em `npm run analyze -- years`).
 * Uso: node tools/run.mjs leagueRun [--clubs 60|282] [--years 10] [--seed 7] [--league br-3] [--ids br-1,br-2,en-1]
 * (--ids monta um mundo só com essas ligas, como nos testes de balanceamento)
 */
import { generateWorld } from '../src/data/generateWorld'
import { FULL_WORLD, buildScaleWorld } from '../src/diagnostics/scaleWorld'
import { formatDynasties, formatLeagueSummary, formatTrend, formatLeagueYears, simulateLeagueYears } from './leagueYears'

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const clubs = Number(flag('clubs', '60'))
const years = Number(flag('years', '10'))
const seed = Number(flag('seed', '7'))
const only = flag('league', '')
const ids = flag('ids', '').split(',').filter(Boolean)
const init =
  clubs > 60 || ids.length > 0
    ? (() => {
        const w = buildScaleWorld(ids.length > 0 ? FULL_WORLD.filter((l) => ids.includes(l.id)) : FULL_WORLD, seed)
        return { year: 2026, seed: `years-${seed}`, teams: w.teams, players: w.players, academy: w.academy, competitions: w.competitions, focus: 'br' }
      })()
    : (() => {
        const w = generateWorld({ seed })
        return { year: w.startYear, seed: `years-${seed}`, teams: w.teams, players: w.players, academy: w.academy }
      })()
const runs = simulateLeagueYears(init, years)
const filtered = only ? runs.map((r) => ({ ...r, leagues: r.leagues.filter((l) => l.id === only) })) : runs
console.log(formatLeagueYears(filtered))
console.log(`\nResumo\n${formatLeagueSummary(filtered)}`)
console.log(`\nTendência\n${formatTrend(filtered)}\n\nCampeões e dinastias\n${formatDynasties(filtered)}`)
