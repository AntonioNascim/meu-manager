/**
 * Joga temporadas seguidas com o pacote de exemplo das 15 ligas (importado como o jogo importa) e confere o limite de
 * estrangeiros. Uso: node tools/run.mjs packageYears [--years 3] [--seed 7]
 */
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { foreignCount } from '../src/engine/foreign'
import { advanceSeason } from '../src/engine/offseason'
import { advanceUntil, createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { createYouth } from '../src/data/generateYouth'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const years = Number(opt('years', '3'))
const seed = Number(opt('seed', '7'))
const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(seed))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(seed, pkg)
const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
let state = createSeason({ year: world.startYear, seed, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil' })
for (let y = 0; y < years; y++) {
  const t = performance.now()
  // Cada país vira a temporada no último dia dela; a cada 30 de junho todos já viraram a do ano.
  const ended = advanceUntil(state, `${world.startYear + y + 1}-06-30`, { market: true, turn }).state
  const rows = ended.teams
    .filter((team) => team.foreignLimit?.squad !== undefined)
    .map((team) => `${team.country}: ${foreignCount(ended.players.filter((p) => p.teamId === team.id), team)}/${team.foreignLimit!.squad}`)
  const over = ended.teams.filter((team) => team.foreignLimit?.squad !== undefined && foreignCount(ended.players.filter((p) => p.teamId === team.id), team) > team.foreignLimit.squad)
  console.log(`${ended.season.year}: ${((performance.now() - t) / 1000).toFixed(0)} s | clubes com limite de elenco: ${rows.length}, acima do limite: ${over.length}`)
  state = ended
}
