/** Conferência do pacote real (Fase 5D, item 3): rodadas, datas e copas de cada liga. Uso: PACOTE_REAL=1 node tools/run.mjs realCheck */
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { stageList } from '../src/engine/cups'
import { createSeason } from '../src/engine/season'
import type { CupSpec } from '../src/engine/types'
import { measurementPackage } from './worldPackage'

const { pkg } = validatePackage(measurementPackage(7))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(7, pkg)
const s = createSeason({ year: 2026, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: world.cups as CupSpec[] })
console.log('# Ligas')
for (const c of s.season.competitions) {
  const games = s.matches.filter((m) => m.competitionId === c.id)
  const dates = games.map((m) => m.date).sort()
  console.log(`${c.id.padEnd(5)} ${String(c.teamIds.length).padStart(2)} clubes, rodadas ${c.roundCount ?? '?'}${c.rounds === 1 ? ' (turno único)' : ''}, ${games.length} jogos, de ${dates[0]} a ${dates.at(-1)}`)
}
console.log('# Copas (edição de 2026)')
for (const cup of s.cups ?? []) {
  const stages = stageList(cup.spec)
  console.log(`${cup.id.padEnd(12)} ${cup.spec.name.padEnd(34)} ${String(cup.entrants.length).padStart(2)} clubes, ${stages.length} fases: ${stages.map((x) => x.name).join(' > ')}`)
}
