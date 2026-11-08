/**
 * Confere o calendário comum da liga online (Fase 6D): monta o mundo da liga com técnicos de países diferentes (um clube de cada) e mostra, para a
 * primeira temporada, em quantos eventos TODOS os técnicos jogam juntos. Compara o calendário de cada país (antes) com o comum (depois).
 *   node tools/run.mjs onlineCalendar [--seed 7] [--paises Brazil,England,Argentina,Spain,Italy,Japan]
 *   PACOTE_REAL=1 node tools/run.mjs onlineCalendar        (pacote real)
 */
import type { DataPackage } from '../src/data/package/types'
import { loadWorld } from '../src/data/package/defaultPackage'
import { createLeagueWorld } from '../src/store/leagueWorld'
import { measurementPackage } from './worldPackage'

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback
}
const seed = Number(arg('seed', '7'))
const countries = arg('paises', 'Brazil,England,Argentina,Spain,Italy,Japan').split(',')

const pkg: DataPackage = measurementPackage(seed)
const info = loadWorld(seed, pkg)
// Um técnico por país: o primeiro clube da primeira divisão.
const humans: { country: string; team: string }[] = []
for (const country of countries) {
  const comp = (info.competitions ?? []).find((c) => (c.country ?? 'Brazil') === country && c.tier === 1)
  const team = comp?.teams[0]
  if (team) humans.push({ country, team: team.id })
}
console.log(`Técnicos: ${humans.map((h) => `${h.country}:${h.team}`).join(', ')}`)

function measure(shared: boolean): void {
  const world = createLeagueWorld(seed, pkg, { shared })
  const compOf = new Map<string, { id: string; last: string }>()
  for (const h of humans) {
    const c = world.season.competitions.find((x) => x.teamIds.includes(h.team)) as (typeof world.season.competitions)[number]
    const last = world.matches.filter((m) => m.competitionId === c.id && m.cup === undefined).reduce((d, m) => (m.date > d ? m.date : d), '')
    compOf.set(h.team, { id: c.id, last })
  }
  const first = world.season.currentDate
  const year = Number(first.slice(0, 4))
  const until = `${year + 1}-06-30`
  const dates = new Map<string, { league: Set<string>; cup: Set<string> }>()
  for (const m of world.matches) {
    if (m.date > until) continue
    const home = humans.find((h) => h.team === m.homeTeamId)
    const away = humans.find((h) => h.team === m.awayTeamId)
    for (const h of [home, away]) {
      if (!h) continue
      const entry = dates.get(m.date) ?? { league: new Set<string>(), cup: new Set<string>() }
      ;(m.cup !== undefined ? entry.cup : entry.league).add(h.team)
      dates.set(m.date, entry)
    }
  }
  const events = [...dates.entries()].sort(([a], [b]) => a.localeCompare(b))
  let leagueEvents = 0
  let leagueAligned = 0
  let cupEvents = 0
  let cupAll = 0
  let allActive = 0
  for (const [date, e] of events) {
    const active = humans.filter((h) => (compOf.get(h.team)?.last ?? '') >= date)
    if (e.league.size > 0) {
      leagueEvents++
      if (active.every((h) => e.league.has(h.team))) leagueAligned++
    }
    if (e.cup.size > 0 && e.league.size === 0) {
      cupEvents++
      if (humans.every((h) => e.cup.has(h.team))) cupAll++
    }
    if (active.length > 0 && active.every((h) => e.league.has(h.team) || e.cup.has(h.team))) allActive++
  }
  const late = world.matches.filter((m) => m.date > `${year}-12-31`).length
  const cupDates = events.filter(([, e]) => e.cup.size > 0)
  const cupBy = new Map<number, number>()
  for (const [, e] of cupDates) cupBy.set(e.cup.size, (cupBy.get(e.cup.size) ?? 0) + 1)
  console.log(`  partidas do mundo depois de 31/12 (fora da temporada): ${late}`)
  console.log(`  datas de copa com N técnicos jogando: ${[...cupBy.entries()].sort(([a], [b]) => a - b).map(([n, c]) => n + ':' + c).join(' ')}`)
  const ends = humans.map((h) => `${h.country} ${compOf.get(h.team)?.last}`).join(' | ')
  console.log(`\n${shared ? 'CALENDÁRIO COMUM' : 'CALENDÁRIO DE CADA PAÍS'} (temporada de ${first} a ${until})`)
  console.log(`  datas com jogo de algum técnico: ${events.length}`)
  console.log(`  datas de rodada de liga: ${leagueEvents}; todos os técnicos de liga ainda ativa jogam juntos em ${leagueAligned} (${leagueEvents ? Math.round((100 * leagueAligned) / leagueEvents) : 0}%)`)
  console.log(`  datas só de copa: ${cupEvents}; todos os técnicos jogam copa na mesma data em ${cupAll}`)
  console.log(`  datas em que todos os técnicos ativos jogam (liga ou copa): ${allActive} de ${events.length}`)
  console.log(`  fim da liga de cada técnico: ${ends}`)
}
measure(false)
measure(true)
