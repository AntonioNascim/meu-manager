/**
 * Procura por onde um clube passa do limite de estrangeiros do elenco (o teste `packageLeagues` do test:balance): joga o pacote de 15 ligas dia a dia
 * (passos curtos) e, na primeira vez que um clube passa do limite, mostra quem entrou e quando.
 * Uso: node tools/run.mjs foreignCheck [--step 3]
 */
import { createYouth } from '../src/data/generateYouth'
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { foreignCount } from '../src/engine/foreign'
import { advanceSeason } from '../src/engine/offseason'
import { advanceUntil, createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'

const stepArg = process.argv.indexOf('--step')
const step = stepArg === -1 ? 3 : Number(process.argv[stepArg + 1])

const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(7))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(7, pkg)
let state: SeasonState = createSeason({ year: world.startYear, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil' })
const WATCH = 'team-304'
const turn = (s: SeasonState, pyramid: string) => {
  const r = advanceSeason(s, { createYouth, pyramid })
  const t = s.teams.find((x) => x.id === WATCH)
  if (t && r.state.teams.some((x) => x.id === WATCH) && pyramid === (t.country ?? 'Brazil')) {
    const f = (st: SeasonState) => foreignCount(st.players.filter((p) => p.teamId === WATCH), t)
    console.log('virada', pyramid, s.season.currentDate, WATCH, 'estrangeiros', f(s), '->', f(r.state), '| base promovidos', JSON.stringify(r.report.academyPromoted[WATCH] ?? []).slice(0, 200), '| jovens', r.report.youth[WATCH], '| pre-contratos', JSON.stringify(r.report.preContracts.filter((c) => c.toTeamId === WATCH)))
  }
  return r
}

const over = (s: SeasonState) =>
  s.teams.filter((t) => t.foreignLimit?.squad !== undefined && foreignCount(s.players.filter((p) => p.teamId === t.id), t) > t.foreignLimit.squad)

let date = state.season.currentDate
const end = `${world.startYear + 3}-06-30`
let prev = state
while (date < end) {
  const next = step === 0 ? `${Number(date.slice(0, 4)) + 1}-06-30` : new Date(Date.parse(date) + step * 86_400_000).toISOString().slice(0, 10)
  const r = advanceUntil(state, next, { market: true, turn }).state
  const was = new Map(prev.teams.map((t) => [t.id, foreignCount(prev.players.filter((p) => p.teamId === t.id), t)]))
  const bad = (step === 0 ? over(r) : over(r)).filter((t) => foreignCount(r.players.filter((p) => p.teamId === t.id), t) > (was.get(t.id) ?? 0))
  if (bad.length) {
    for (const t of bad) {
      const before = new Set(prev.players.filter((p) => p.teamId === t.id).map((p) => p.id))
      const now = r.players.filter((p) => p.teamId === t.id)
      const added = now.filter((p) => !before.has(p.id))
      console.log(`${date} -> ${next}: ${t.id} (${t.country}) limite ${t.foreignLimit?.squad} tem ${foreignCount(now, t)}; elenco ${now.length}`)
      for (const p of added) console.log(`  entrou ${p.id} ${p.nationality} idade ${p.age} contrato ${JSON.stringify(p.contract)}`)
      const lost = prev.players.filter((p) => p.teamId === t.id && !now.some((q) => q.id === p.id))
      console.log(`  saíram ${lost.length}; antes ${foreignCount(prev.players.filter((p) => p.teamId === t.id), t)} estrangeiros`)
      for (const p of added) console.log('  mercado', p.id, JSON.stringify(r.market.history.filter((h) => h.playerId === p.id)), 'youthId?', String(p.id).slice(0, 12))
      for (const p of now.filter((q) => q.nationality !== (t.country ?? 'Brazil'))) console.log('  estrangeiro', p.id, p.nationality, 'idade', p.age, 'emprestado de', p.contract.loanedFrom ?? '-', 'estava antes?', before.has(p.id), 'hist', JSON.stringify(r.market.history.filter((h) => h.playerId === p.id).map((h) => h.date + ':' + h.kind + ':' + h.toTeamId)))
      const hist = r.market.history.filter((h) => JSON.stringify(h).includes(t.id)).slice(-4)
      console.log('  histórico recente:', JSON.stringify(hist).slice(0, 600))
    }
    break
  }
  prev = r
  state = r
  date = next
}
console.log(date >= end ? 'nenhuma violação' : 'fim')

// Situação no começo: clubes que já nascem acima do limite (o pacote de teste não respeita o limite que ele mesmo declara).
const start = createSeason({ year: world.startYear, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil' })
for (const t of over(start)) console.log(`começa acima do limite: ${t.id} (${t.country}) limite ${t.foreignLimit?.squad} tem ${foreignCount(start.players.filter((p) => p.teamId === t.id), t)}`)
