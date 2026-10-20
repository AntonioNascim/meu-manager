/**
 * Força dos maiores clubes de cada liga europeia (o topo é o que decide a copa principal): média dos 11 titulares e reputação dos 6 primeiros
 * por força, no começo e depois de N anos de mundo de 282 clubes. Uso: node --expose-gc tools/run.mjs topClubs [--years 10] [--seed 7]
 */
import { createYouth } from '../src/data/generateYouth'
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { advanceSeason } from '../src/engine/offseason'
import { playerOverall } from '../src/engine/overall'
import { advanceUntil, createSeason, pyramidOf } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => (args.includes(`--${name}`) ? (args[args.indexOf(`--${name}`) + 1] as string) : fallback)
const years = Number(opt('years', '10'))
const seed = Number(opt('seed', '7'))
const COUNTRIES = ['England', 'Spain', 'Italy', 'Germany', 'France']

const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(seed))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(seed, pkg)
const state = createSeason({ year: world.startYear, seed, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: opt('focus', 'England'), ...(world.cups ? { cupSpecs: world.cups } : {}) })

function report(label: string, s: SeasonState) {
  const byId = new Map(s.players.map((p) => [p.id, p]))
  console.log(`\n${label}`)
  for (const country of COUNTRIES) {
    const comp = s.season.competitions.find((c) => pyramidOf(c) === s.season.competitions.find((x) => x.country === country)?.pyramid && c.tier === 1)
    if (!comp) continue
    const teams = comp.teamIds.map((id) => s.teams.find((t) => t.id === id)!)
    const rows = teams.map((t) => ({ rep: t.reputation, str: t.tactic.startingXI.reduce((a, id) => a + playerOverall(byId.get(id)!), 0) / 11 })).sort((a, b) => b.str - a.str)
    console.log(`${country.padEnd(8)} ${rows.slice(0, 6).map((r) => `${r.str.toFixed(1)}(r${r.rep})`).join(' ')} | média da liga ${(rows.reduce((a, r) => a + r.str, 0) / rows.length).toFixed(1)}`)
  }
}

report('Início', state)
const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
let current = state
for (let y = 1; y <= years; y++) {
  current = advanceUntil(current, `${world.startYear + y}-06-30`, { market: true, turn }).state
  if (process.argv.includes('--yearly')) yearly(`${world.startYear + y}`, current)
  else if (y === years) report(`Depois de ${years} anos`, current)
}

/** Por ano, os 3 clubes mais fortes de cada país: força, reputação, caixa, receita da última temporada fechada, idade média do onze e títulos da copa europeia principal (para achar o que sustenta uma dinastia). */
function yearly(label: string, s: SeasonState) {
  const byId = new Map(s.players.map((p) => [p.id, p]))
  const titles = new Map<string, number>()
  for (const e of s.cupHistory?.['cont-eu-1'] ?? []) titles.set(e.winnerId, (titles.get(e.winnerId) ?? 0) + 1)
  console.log(`
${label}`)
  for (const country of COUNTRIES) {
    const comp = s.season.competitions.find((c) => pyramidOf(c) === s.season.competitions.find((x) => x.country === country)?.pyramid && c.tier === 1)
    if (!comp) continue
    const rows = comp.teamIds.map((id) => s.teams.find((t) => t.id === id)!).map((t) => {
      const xi = t.tactic.startingXI.map((id) => byId.get(id)!).filter(Boolean)
      const past = t.finances.pastSeasons.at(-1)
      return { t, str: xi.reduce((a, p) => a + playerOverall(p), 0) / Math.max(1, xi.length), age: xi.reduce((a, p) => a + p.age, 0) / Math.max(1, xi.length), income: past?.income ?? 0 }
    }).sort((a, b) => b.str - a.str)
    console.log(`${country.padEnd(8)} ${rows.slice(0, 3).map((r) => `${r.t.id.replace('team-', '')} f${r.str.toFixed(1)} r${r.t.reputation} caixa${(r.t.finances.balance / 1e6).toFixed(0)}M rec${(r.income / 1e6).toFixed(0)}M idade${r.age.toFixed(1)} T${titles.get(r.t.id) ?? 0}`).join(' | ')}`)
  }
}
