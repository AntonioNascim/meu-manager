/**
 * Calibragem com o pacote real (Fase 5D): joga N temporadas do mundo real (370 clubes) e compara com os últimos 30 anos da vida real.
 * Imprime, por liga, os campeões ano a ano (nome do clube), títulos por clube e a maior fatia de um clube; por copa continental e
 * mundial, campeões por clube e por país; e, por país, a trajetória de reputação e de força dos gigantes (os 6 clubes de maior reputação
 * no início), para ver se continuam grandes por décadas sem dominar tudo.
 *
 * Uso: PACOTE_REAL=1 node --expose-gc tools/run.mjs realRun [--years 30] [--seed 7] [--focus Brazil] [--ids en-1,es-1]
 * Termina com erro se alguma meta de `REAL_TARGETS` (tools/realTargets.ts) for violada: o workflow usa isso como aviso.
 */
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { playerOverall } from '../src/engine/overall'
import { pyramidOf } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { continentalObserver } from './continentalRun'
import { simulateLeagueYears } from './leagueYears'
import { measurementPackage } from './worldPackage'
import { checkRealTargets, REAL_LEAGUE_REFERENCE, REAL_CUP_REFERENCE } from './realTargets'
import type { TitleRow } from './realTargets'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => (args.includes(`--${name}`) ? (args[args.indexOf(`--${name}`) + 1] as string) : fallback)

if (process.argv[1]?.includes('realRun')) {
  const years = Number(opt('years', '30'))
  const seed = Number(opt('seed', '7'))
  const only = opt('ids', '').split(',').filter(Boolean)
  const { pkg } = validatePackage(measurementPackage(seed))
  if (!pkg) throw new Error('pacote inválido')
  const world = loadWorld(seed, pkg)
  const nameOf = new Map(world.teams.map((t) => [t.id, t.name]))
  const countryOf = new Map<string, string>()
  for (const c of world.competitions ?? []) for (const id of c.teams.map((t) => t.id)) countryOf.set(id, c.country ?? c.id)

  // Reputação e força dos gigantes ano a ano (no último dia da temporada de cada país).
  const trail = new Map<string, { year: number; rep: number; str: number; id: string }[]>()
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
          const row = { year, rep: t.reputation, str: xi.reduce((a, p) => a + playerOverall(p), 0) / Math.max(1, xi.length), id }
          trail.set(comp.id, [...(trail.get(comp.id) ?? []), row])
        }
      }
    },
    after: watched.observer.after,
  }
  const t0 = Date.now()
  const runs = simulateLeagueYears(
    { year: world.startYear, seed: `real-${seed}`, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: opt('focus', 'Brazil'), ...(world.cups ? { cupSpecs: world.cups } : {}) },
    years,
    observer,
  )
  console.log(`# Mundo real: ${world.teams.length} clubes, ${years} temporadas, semente ${seed} (${Math.round((Date.now() - t0) / 1000)} s)\n`)

  const leagueTitles: Record<string, TitleRow[]> = {}
  console.log('## Campeões das ligas')
  for (const id of [...new Set(runs.flatMap((r) => r.leagues.map((l) => l.id)))]) {
    if (only.length && !only.includes(id)) continue
    const series = runs.flatMap((r) => r.leagues.filter((l) => l.id === id).map((l) => ({ year: r.year, ...l })))
    if (series.length === 0 || series[0]!.clubs <= 4) continue
    const winners = series.map((l) => ({ year: l.year, club: nameOf.get(l.championId) ?? l.championId, id: l.championId, country: countryOf.get(l.championId) ?? '?' }))
    const counts = new Map<string, number>()
    for (const w of winners) counts.set(w.club, (counts.get(w.club) ?? 0) + 1)
    const ranked = [...counts].sort((a, b) => b[1] - a[1])
    leagueTitles[id] = winners.map((w) => ({ year: w.year, club: w.club, country: w.country }))
    console.log(`\n### ${id} ${series[0]!.name} (${series[0]!.clubs} clubes): ${counts.size} campeões diferentes; mais títulos: ${ranked.slice(0, 4).map(([c, n]) => `${c} ${n}`).join(', ')} (máx ${((100 * ranked[0]![1]) / winners.length).toFixed(0)}%)`)
    console.log(winners.map((w) => `${w.year}: ${w.club}`).join(' | '))
  }

  console.log('\n## Copas continentais e mundiais')
  const cupTitles: Record<string, TitleRow[]> = {}
  for (const cup of [...new Set(watched.run.editions.map((e) => e.cup))].sort()) {
    const list = watched.run.editions.filter((e) => e.cup === cup).sort((a, b) => a.year - b.year)
    const byClub = new Map<string, number>()
    const byCountry = new Map<string, number>()
    for (const e of list) {
      const club = nameOf.get(e.winnerId) ?? e.winnerId
      byClub.set(club, (byClub.get(club) ?? 0) + 1)
      byCountry.set(e.winnerPyramid, (byCountry.get(e.winnerPyramid) ?? 0) + 1)
    }
    cupTitles[cup] = list.map((e) => ({ year: e.year, club: nameOf.get(e.winnerId) ?? e.winnerId, country: e.winnerPyramid }))
    console.log(`\n### ${cup}: ${list.length} edições, ${byClub.size} campeões diferentes`)
    console.log(`por país: ${[...byCountry].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    console.log(`por clube: ${[...byClub].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    console.log(list.map((e) => `${e.year}: ${nameOf.get(e.winnerId) ?? e.winnerId}`).join(' | '))
  }

  console.log('\n## Gigantes: reputação e força dos 6 maiores de cada liga (por reputação inicial)')
  const giants: Record<string, { first: number[]; last: number[]; inTopStr: number }> = {}
  for (const [comp, rows] of trail) {
    if (only.length && !only.includes(comp)) continue
    const firstYear = Math.min(...rows.map((r) => r.year))
    const lastYear = Math.max(...rows.map((r) => r.year))
    const initial = rows.filter((r) => r.year === firstYear).sort((a, b) => b.rep - a.rep || b.str - a.str)
    const big = initial.slice(0, 6).map((r) => r.id)
    const at = (y: number) => big.map((id) => rows.find((r) => r.id === id && r.year === y))
    const marks = [0, 5, 10, 20, lastYear - firstYear].filter((d, i, a) => d <= lastYear - firstYear && a.indexOf(d) === i)
    const line = marks.map((d) => {
      const r = at(firstYear + d).filter(Boolean) as { rep: number; str: number }[]
      return `+${d}a rep ${(r.reduce((s, x) => s + x.rep, 0) / (r.length || 1)).toFixed(1)} força ${(r.reduce((s, x) => s + x.str, 0) / (r.length || 1)).toFixed(1)}`
    })
    const lastRows = rows.filter((r) => r.year === lastYear)
    const topNow = new Set([...lastRows].sort((a, b) => b.rep - a.rep || b.str - a.str).slice(0, 6).map((r) => r.id))
    const kept = big.filter((id) => topNow.has(id)).length
    giants[comp] = {
      first: at(firstYear).map((r) => r?.rep ?? 0),
      last: at(lastYear).map((r) => r?.rep ?? 0),
      inTopStr: kept,
    }
    console.log(`${comp.padEnd(5)} ${line.join(' | ')} | dos 6 gigantes de ${firstYear}, ${kept} seguem entre os 6 de maior reputação em ${lastYear} | ${big.map((id) => nameOf.get(id)).join(', ')}`)
  }

  const problems = checkRealTargets({ leagues: leagueTitles, cups: cupTitles, giants, years }, only)
  console.log(`\n## Metas contra a vida real (referências em tools/realTargets.ts; ${Object.keys(REAL_LEAGUE_REFERENCE).length} ligas e ${Object.keys(REAL_CUP_REFERENCE).length} copas)`)
  console.log(problems.length === 0 ? 'Todas as metas foram cumpridas.' : problems.map((p) => `ALERTA ${p}`).join('\n'))
  if (problems.length > 0) process.exitCode = 1
}

