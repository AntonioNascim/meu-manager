/**
 * Calibragem com o pacote real (Fase 5D): joga N temporadas do mundo real (370 clubes) e compara com os últimos 30 anos da vida real.
 * Imprime, por liga, os campeões ano a ano (nome do clube), títulos por clube e a maior fatia de um clube; por copa continental e
 * mundial, campeões por clube e por país; e, por país, a trajetória de reputação e de força dos gigantes (os 6 clubes de maior reputação
 * no início), para ver se continuam grandes por décadas sem dominar tudo.
 *
 * Uso: PACOTE_REAL=1 node --expose-gc tools/run.mjs realRun [--years 30] [--seed 7] [--focus Brazil] [--ids en-1,es-1]
 * Termina com erro se alguma meta de `tools/realTargets.ts` for violada (só com 20 temporadas ou mais): o workflow usa isso como aviso.
 */
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import type { World } from '../src/data/generateWorld'
import { playerOverall } from '../src/engine/overall'
import { pyramidOf } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { continentalObserver } from './continentalRun'
import type { ContinentalRun } from './continentalRun'
import { simulateLeagueYears } from './leagueYears'
import type { LeagueRun } from './leagueYears'
import { measurementPackage } from './worldPackage'
import { checkRealTargets, REAL_CUP_REFERENCE, REAL_LEAGUE_REFERENCE } from './realTargets'
import type { RealResults, TitleRow } from './realTargets'

export interface TrailRow {
  year: number
  rep: number
  str: number
  id: string
}

export interface RealSimulation {
  world: World
  runs: LeagueRun[]
  continental: ContinentalRun
  /** Reputação e força de cada clube da primeira divisão, ano a ano, por liga. */
  trail: Map<string, TrailRow[]>
  nameOf: Map<string, string>
  countryOf: Map<string, string>
  years: number
  seconds: number
}

/** Joga `years` temporadas do pacote de medição (o real com `PACOTE_REAL=1`) com o relógio único do mundo. */
export function simulateReal(years: number, seed: number, focus = 'Brazil'): RealSimulation {
  const { pkg } = validatePackage(measurementPackage(seed))
  if (!pkg) throw new Error('pacote inválido')
  const world = loadWorld(seed, pkg)
  const nameOf = new Map(world.teams.map((t) => [t.id, t.name]))
  const countryOf = new Map<string, string>()
  for (const c of world.competitions ?? []) for (const t of c.teams) countryOf.set(t.id, c.country ?? c.id)

  const trail = new Map<string, TrailRow[]>()
  const watched = continentalObserver()
  const observer = {
    before(s: SeasonState, pyramid: string) {
      watched.observer.before(s, pyramid)
      const year = s.cycles[pyramid]?.year ?? 0
      const byId = new Map(s.players.map((p) => [p.id, p]))
      for (const comp of s.season.competitions) {
        if (pyramidOf(comp) !== pyramid || comp.tier !== 1) continue
        for (const id of comp.teamIds) {
          const t = s.teams.find((x) => x.id === id)!
          const xi = t.tactic.startingXI.map((pid) => byId.get(pid)!).filter(Boolean)
          trail.set(comp.id, [...(trail.get(comp.id) ?? []), { year, rep: t.reputation, str: xi.reduce((a, p) => a + playerOverall(p), 0) / Math.max(1, xi.length), id }])
        }
      }
    },
    after: watched.observer.after,
  }
  const t0 = Date.now()
  const runs = simulateLeagueYears(
    { year: world.startYear, seed: `real-${seed}`, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus, ...(world.cups ? { cupSpecs: world.cups } : {}) },
    years,
    observer,
  )
  return { world, runs, continental: watched.run, trail, nameOf, countryOf, years, seconds: Math.round((Date.now() - t0) / 1000) }
}

/** Campeões de cada liga (com mais de 4 clubes), de cada copa continental ou mundial, e a trajetória dos 6 gigantes de cada liga. */
export function summarizeReal(sim: RealSimulation, only: readonly string[] = []): RealResults {
  const leagues: Record<string, TitleRow[]> = {}
  for (const id of [...new Set(sim.runs.flatMap((r) => r.leagues.map((l) => l.id)))]) {
    if (only.length && !only.includes(id)) continue
    const series = sim.runs.flatMap((r) => r.leagues.filter((l) => l.id === id).map((l) => ({ year: r.year, ...l })))
    if (series.length === 0 || series[0]!.clubs <= 4) continue
    leagues[id] = series.map((l) => ({ year: l.year, club: sim.nameOf.get(l.championId) ?? l.championId, country: sim.countryOf.get(l.championId) ?? '?' }))
  }
  const cups: Record<string, TitleRow[]> = {}
  for (const cup of [...new Set(sim.continental.editions.map((e) => e.cup))].sort()) {
    cups[cup] = sim.continental.editions.filter((e) => e.cup === cup).sort((a, b) => a.year - b.year).map((e) => ({ year: e.year, club: sim.nameOf.get(e.winnerId) ?? e.winnerId, country: e.winnerPyramid }))
  }
  const giants: RealResults['giants'] = {}
  for (const [comp, rows] of sim.trail) {
    if (only.length && !only.includes(comp)) continue
    const firstYear = Math.min(...rows.map((r) => r.year))
    const lastYear = Math.max(...rows.map((r) => r.year))
    const rank = (list: TrailRow[]) => [...list].sort((a, b) => b.rep - a.rep || b.str - a.str)
    const big = rank(rows.filter((r) => r.year === firstYear)).slice(0, 6).map((r) => r.id)
    const topNow = new Set(rank(rows.filter((r) => r.year === lastYear)).slice(0, 6).map((r) => r.id))
    const at = (y: number) => big.map((id) => rows.find((r) => r.id === id && r.year === y)?.rep ?? 0)
    giants[comp] = { first: at(firstYear), last: at(lastYear), inTopStr: big.filter((id) => topNow.has(id)).length }
  }
  return { leagues, cups, giants, years: sim.years }
}

if (process.argv[1]?.includes('realRun')) {
  const args = process.argv.slice(2)
  const opt = (name: string, fallback: string) => (args.includes(`--${name}`) ? (args[args.indexOf(`--${name}`) + 1] as string) : fallback)
  const years = Number(opt('years', '30'))
  const seed = Number(opt('seed', '7'))
  const only = opt('ids', '').split(',').filter(Boolean)
  const sim = simulateReal(years, seed, opt('focus', 'Brazil'))
  const { world, nameOf } = sim
  console.log(`# Mundo real: ${world.teams.length} clubes, ${years} temporadas, semente ${seed} (${sim.seconds} s)\n`)

  const results = summarizeReal(sim, only)
  console.log('## Campeões das ligas')
  for (const [id, rows] of Object.entries(results.leagues)) {
    const counts = new Map<string, number>()
    for (const w of rows) counts.set(w.club, (counts.get(w.club) ?? 0) + 1)
    const ranked = [...counts].sort((a, b) => b[1] - a[1])
    const first = sim.runs.flatMap((r) => r.leagues).find((l) => l.id === id)!
    console.log(`\n### ${id} ${first.name} (${first.clubs} clubes): ${counts.size} campeões diferentes; mais títulos: ${ranked.slice(0, 4).map(([c, n]) => `${c} ${n}`).join(', ')} (máx ${((100 * ranked[0]![1]) / rows.length).toFixed(0)}%)`)
    console.log(rows.map((w) => `${w.year}: ${w.club}`).join(' | '))
  }

  console.log('\n## Copas continentais e mundiais')
  for (const [cup, rows] of Object.entries(results.cups)) {
    const byClub = new Map<string, number>()
    const byCountry = new Map<string, number>()
    for (const e of rows) {
      byClub.set(e.club, (byClub.get(e.club) ?? 0) + 1)
      byCountry.set(e.country, (byCountry.get(e.country) ?? 0) + 1)
    }
    console.log(`\n### ${cup}: ${rows.length} edições, ${byClub.size} campeões diferentes`)
    console.log(`por país: ${[...byCountry].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    console.log(`por clube: ${[...byClub].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    console.log(rows.map((e) => `${e.year}: ${e.club}`).join(' | '))
  }

  console.log('\n## Gigantes: reputação e força dos 6 maiores de cada liga (por reputação inicial)')
  for (const [comp, rows] of sim.trail) {
    if (only.length && !only.includes(comp)) continue
    const firstYear = Math.min(...rows.map((r) => r.year))
    const lastYear = Math.max(...rows.map((r) => r.year))
    const big = [...rows.filter((r) => r.year === firstYear)].sort((a, b) => b.rep - a.rep || b.str - a.str).slice(0, 6).map((r) => r.id)
    const marks = [0, 5, 10, 20, lastYear - firstYear].filter((d, i, a) => d <= lastYear - firstYear && a.indexOf(d) === i)
    const line = marks.map((d) => {
      const r = big.map((id) => rows.find((x) => x.id === id && x.year === firstYear + d)).filter(Boolean) as TrailRow[]
      return `+${d}a rep ${(r.reduce((s, x) => s + x.rep, 0) / (r.length || 1)).toFixed(1)} força ${(r.reduce((s, x) => s + x.str, 0) / (r.length || 1)).toFixed(1)}`
    })
    console.log(`${comp.padEnd(5)} ${line.join(' | ')} | dos 6 gigantes de ${firstYear}, ${results.giants[comp]?.inTopStr ?? '?'} seguem entre os 6 de maior reputação em ${lastYear} | ${big.map((id) => nameOf.get(id)).join(', ')}`)
  }

  const problems = checkRealTargets(results, only)
  console.log(`\n## Metas contra a vida real (referências em tools/realTargets.ts; ${Object.keys(REAL_LEAGUE_REFERENCE).length} ligas e ${Object.keys(REAL_CUP_REFERENCE).length} copas${years < 20 ? '; só valem com 20 temporadas ou mais' : ''})`)
  console.log(problems.length === 0 ? 'Todas as metas foram cumpridas.' : problems.map((p) => `ALERTA ${p}`).join('\n'))
  if (problems.length > 0) process.exitCode = 1
}
