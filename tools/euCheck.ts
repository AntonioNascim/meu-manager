/** Depuração: joga ano a ano e mostra o estado das copas continentais e mundiais a cada 1º de setembro. Uso: node --expose-gc tools/run.mjs euCheck [--until 2030] */
import { createYouth } from '../src/data/generateYouth'
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { advanceSeason } from '../src/engine/offseason'
import { advanceUntil, createSeason, phaseOfPyramid } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'

const args = process.argv.slice(2)
const until = Number(args.includes('--until') ? args[args.indexOf('--until') + 1] : 2030)
const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(7))))
const world = loadWorld(7, pkg!)
let state: SeasonState = createSeason({ year: 2026, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: world.cups! })
const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
for (let y = 2026; y <= until; y++) {
  for (const date of [`${y}-09-01`, `${y + 1}-01-02`]) {
    state = advanceUntil(state, date, { market: true, turn }).state
    const cups = (state.cups ?? []).filter((c) => c.pyramid === undefined).map((c) => `${c.id}:${c.year}:${c.winnerId ? 'F' : `${c.log.length}f/${state.matches.filter((m) => m.competitionId === c.id && m.status !== 'finished').length}p`}`)
    const phases = ['England', 'Spain', 'Italy', 'Germany', 'France', 'Portugal', 'Netherlands'].map((p) => `${p.slice(0, 3)}:${phaseOfPyramid(state, p).slice(0, 3)}:${state.cycles[p]?.year}`)
    console.log(date, cups.join(' '), '|', phases.join(' '))
  }
  gc?.()
}
declare const gc: undefined | (() => void)
