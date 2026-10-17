/**
 * Calendário e custo das copas no mundo de 282 clubes (pacote de exemplo das 15 ligas): joga uma temporada com as copas padrão de cada
 * país e outra sem copas (`cups: []`), imprime o período da liga e de cada fase de cada copa, confere conflitos de data e mede o tempo.
 * Uso: node tools/run.mjs cupCalendar [--seed 7]
 */
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { stageList } from '../src/engine/cups'
import { createSeason, simulateToSeasonEnd } from '../src/engine/season'
import { addDays, weekday } from '../src/engine/season/dates'
import type { Match } from '../src/engine/types'

const args = process.argv.slice(2)
const seed = Number(args[args.indexOf('--seed') + 1] || 7)

function season(withCups: boolean) {
  const raw = buildScalePackage(seed)
  const { pkg } = validatePackage(JSON.parse(JSON.stringify(withCups ? raw : { ...raw, cups: [] })))
  if (!pkg) throw new Error('pacote inválido')
  const world = loadWorld(seed, pkg)
  const t = performance.now()
  const start = createSeason({ year: world.startYear, seed, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', ...(world.cups ? { cupSpecs: world.cups } : {}) })
  const created = performance.now() - t
  const t1 = performance.now()
  const ended = simulateToSeasonEnd(start, { market: true })
  return { start, ended, created, ms: performance.now() - t1 }
}

const range = (dates: string[]) => `${dates[0]} a ${dates[dates.length - 1]}`
const without = season(false)
const withCups = season(true)
console.log(`Sem copas: criar ${without.created.toFixed(0)} ms, temporada ${(without.ms / 1000).toFixed(1)} s, ${without.ended.matches.length} jogos`)
console.log(`Com copas: criar ${withCups.created.toFixed(0)} ms, temporada ${(withCups.ms / 1000).toFixed(1)} s, ${withCups.ended.matches.length} jogos (${withCups.ended.matches.filter((m) => m.cup).length} de copa), +${(((withCups.ms - without.ms) / without.ms) * 100).toFixed(0)}%`)

const s = withCups.ended
console.log('\nLigas (primeiro e último jogo):')
for (const c of s.season.competitions.filter((x) => x.tier === 1 || x.pyramid === 'br')) {
  const dates = s.matches.filter((m) => m.competitionId === c.id).map((m) => m.date).sort()
  console.log(`  ${c.name.padEnd(16)} ${range(dates)} (${c.roundCount} rodadas)`)
}
console.log('\nCopas (fases):')
for (const cup of s.cups ?? []) {
  const matches = s.matches.filter((m) => m.competitionId === cup.id)
  console.log(`  ${cup.name} (${cup.entrants.length} clubes, ${matches.length} jogos)`)
  stageList(cup.spec).forEach((st, i) => {
    const dates = [...new Set(matches.filter((m) => m.cup?.stage === i).map((m) => m.date))].sort()
    const neutral = matches.some((m) => m.cup?.stage === i && m.cup.neutral) ? ' neutro' : ''
    const hosts = matches.filter((m) => m.cup?.stage === i && m.cup.leg !== 2)
    const lowerHome = hosts.filter((m) => (s.teams.find((t) => t.id === m.homeTeamId)?.tier ?? 1) > (s.teams.find((t) => t.id === m.awayTeamId)?.tier ?? 1)).length
    console.log(`    ${String(i).padStart(2)} ${st.name.padEnd(18)} ${dates.length ? range(dates) : '-'} (${hosts.length} jogos${neutral}${lowerHome ? `, ${lowerHome} com a divisão inferior em casa` : ''})`)
  })
  console.log(`    campeão: ${s.teams.find((t) => t.id === cup.winnerId)?.name ?? '-'}`)
}

// Conflitos: nenhum clube joga duas vezes no mesmo dia e as copas caem em quartas-feiras longe dos jogos de liga.
const byTeam = new Map<string, Match[]>()
for (const m of s.matches) for (const id of [m.homeTeamId, m.awayTeamId]) byTeam.set(id, [...(byTeam.get(id) ?? []), m])
let sameDay = 0
let adjacent = 0
let notWednesday = 0
for (const [, list] of byTeam) {
  const days = new Map<string, Match>()
  for (const m of list) {
    if (days.has(m.date)) sameDay++
    days.set(m.date, m)
  }
  for (const m of list) {
    if (!m.cup) continue
    if (weekday(m.date) !== 3) notWednesday++
    for (const d of [-1, 1]) if (days.get(addDays(m.date, d)) && !days.get(addDays(m.date, d))?.cup) adjacent++
  }
}
console.log(`\nConflitos: ${sameDay} jogos no mesmo dia, ${adjacent} jogos de copa colados num jogo de liga, ${notWednesday} jogos de copa fora de quarta-feira`)
