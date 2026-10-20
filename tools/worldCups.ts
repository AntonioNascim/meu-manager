/**
 * Copas mundiais e da América do Norte no mundo de teste ampliado (3D): valida o pacote de exemplo, lista as copas novas com os clubes de
 * cada vaga, joga até uma data e imprime o calendário (fases, dias, conflitos) e os campeões.
 * Uso: node tools/run.mjs worldCups [--seed 7] [--until 2026-12-31] [--focus Brazil]
 */
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { stageList } from '../src/engine/cups'
import { advanceUntil, createSeason } from '../src/engine/season'
import { addDays } from '../src/engine/season/dates'
import type { Match } from '../src/engine/types'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => (args.includes(`--${name}`) ? (args[args.indexOf(`--${name}`) + 1] as string) : fallback)
const seed = Number(opt('seed', '7'))
const until = opt('until', '2026-12-31')

const raw = buildScalePackage(seed)
const { pkg, report } = validatePackage(JSON.parse(JSON.stringify(raw)))
console.log(`Pacote: ${raw.clubs.length} clubes, ${raw.leagues.length} ligas, ${raw.countries.length} países, ${raw.cups?.length ?? 0} copas; erros ${report.errors.length}, avisos ${report.warnings.length}`)
for (const w of report.warnings) console.log(`  aviso ${w.code} ${w.path} ${w.detail ?? ''}`)
for (const e of report.errors) console.log(`  ERRO ${e.code} ${e.path} ${e.detail ?? ''}`)
if (!pkg) process.exit(1)

const world = loadWorld(seed, pkg)
const t0 = performance.now()
const start = createSeason({ year: world.startYear, seed, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: opt('focus', 'Brazil'), ...(world.cups ? { cupSpecs: world.cups } : {}) })
console.log(`Temporada criada em ${(performance.now() - t0).toFixed(0)} ms: ${start.matches.length} jogos, ${start.cups?.length ?? 0} copas já criadas`)
console.log('Copas do mundo (definições):')
for (const spec of world.cups ?? []) console.log(`  ${spec.id.padEnd(14)} ${spec.name.padEnd(48)} ${spec.world ? `mundial a cada ${spec.world.every} ano(s), a partir de ${spec.world.from[1]}/${spec.world.from[0]}` : spec.region ? `continental ${spec.region}` : spec.country ?? ''}`)

const t1 = performance.now()
const ended = advanceUntil(start, until, { market: true }).state
console.log(`\nAté ${until}: ${((performance.now() - t1) / 1000).toFixed(1)} s, ${ended.matches.length} jogos`)
const name = (id: string) => ended.teams.find((t) => t.id === id)?.name ?? id
const countryOf = (id: string) => ended.season.competitions.find((c) => c.teamIds.includes(id))?.name ?? '?'
for (const cup of (ended.cups ?? []).filter((c) => c.pyramid === undefined)) {
  const matches = ended.matches.filter((m) => m.competitionId === cup.id)
  console.log(`\n${cup.name} (${cup.id}, edição ${cup.year}): ${cup.entrants.length} clubes, ${matches.length} jogos`)
  const byLeague = new Map<string, number>()
  for (const e of cup.entrants) byLeague.set(countryOf(e.teamId), (byLeague.get(countryOf(e.teamId)) ?? 0) + 1)
  console.log(`  clubes por liga: ${[...byLeague].map(([k, v]) => `${k} ${v}`).join(', ')}`)
  stageList(cup.spec).forEach((st, i) => {
    const dates = [...new Set(matches.filter((m) => m.cup?.stage === i).map((m) => m.date))].sort()
    console.log(`  ${String(i).padStart(2)} ${st.name.padEnd(20)} ${dates.length ? `${dates[0]} a ${dates[dates.length - 1]}` : '-'}`)
  })
  console.log(`  campeão: ${cup.winnerId ? `${name(cup.winnerId)} (${countryOf(cup.winnerId)})` : '-'}${cup.runnerUpId ? `, vice: ${name(cup.runnerUpId)}` : ''}`)
}

// Conflitos: nenhum clube joga duas vezes no mesmo dia; conta jogos de copa mundial ou da América do Norte colados num jogo de liga.
const byTeam = new Map<string, Match[]>()
for (const m of ended.matches) for (const id of [m.homeTeamId, m.awayTeamId]) byTeam.set(id, [...(byTeam.get(id) ?? []), m])
let sameDay = 0
let adjacent = 0
const target = new Set((ended.cups ?? []).filter((c) => c.pyramid === undefined).map((c) => c.id))
for (const list of byTeam.values()) {
  const days = new Map<string, Match[]>()
  for (const m of list) days.set(m.date, [...(days.get(m.date) ?? []), m])
  for (const [date, here] of days) {
    if (here.length > 1) sameDay++
    for (const m of here) if (target.has(m.competitionId) && (days.has(addDays(date, -1)) || days.has(addDays(date, 1)))) adjacent++
  }
}
console.log(`\nConflitos: ${sameDay} clubes-dia com dois jogos; ${adjacent} jogos de copa continental ou mundial colados num jogo do clube`)
