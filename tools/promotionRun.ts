/**
 * Quanto dura a vida de quem sobe: dos clubes que sobem de uma divisão para a de cima, que fração cai de volta na temporada seguinte
 * (e quantos sobem de novo depois). Mede a distância de nível entre as divisões da pirâmide brasileira (B e C).
 * Uso: node tools/run.mjs promotionRun [--years 30] [--seeds 7,11,23] [--ids br-1,br-2,br-3]
 */
import { FULL_WORLD, buildScaleWorld } from '../src/diagnostics/scaleWorld'
import { pyramidOf } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { simulateLeagueYears } from './leagueYears'

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const years = Number(flag('years', '30'))
const seeds = flag('seeds', '7,11,23').split(',').map(Number)
const ids = flag('ids', 'br-1,br-2,br-3').split(',').filter(Boolean)

/** Em que liga cada clube estava, ano a ano (depois da virada do país). */
type Snapshot = Map<string, string>

const tally = new Map<string, { promoted: number; fellNext: number; promotedAgain: number }>()
const bump = (key: string, field: 'promoted' | 'fellNext' | 'promotedAgain') => {
  const row = tally.get(key) ?? { promoted: 0, fellNext: 0, promotedAgain: 0 }
  row[field] += 1
  tally.set(key, row)
}

for (const seed of seeds) {
  const w = buildScaleWorld(FULL_WORLD.filter((l) => ids.includes(l.id)), seed)
  const history: Snapshot[] = []
  const snapshot = (state: SeasonState): Snapshot => {
    const out: Snapshot = new Map()
    for (const c of state.season.competitions) if (pyramidOf(c) === 'br') for (const id of c.teamIds) out.set(id, c.id)
    return out
  }
  const tier = (id: string | undefined) => (id ? Number(id.split('-')[1]) : 0)
  simulateLeagueYears(
    { year: 2026, seed: `years-${seed}`, teams: w.teams, players: w.players, academy: w.academy, competitions: w.competitions, focus: 'br' },
    years,
    {
      before: (s, pyramid) => {
        if (pyramid === 'br' && history.length === 0) history.push(snapshot(s))
      },
      after: (s, pyramid) => {
        if (pyramid === 'br') history.push(snapshot(s))
      },
    },
  )
  // history[k] é a divisão de cada clube na temporada k (0 = a inicial); history[k + 1] é a seguinte.
  for (let k = 0; k + 1 < history.length; k++) {
    const now = history[k] as Snapshot
    const next = history[k + 1] as Snapshot
    const after = history[k + 2]
    for (const [team, league] of next) {
      const from = now.get(team)
      if (tier(from) <= tier(league)) continue
      // subiu de `from` para `league` ao fim da temporada k
      const key = `${from} -> ${league}`
      bump(key, 'promoted')
      if (after && tier(after.get(team)) > tier(league)) bump(key, 'fellNext')
      if (after && tier(after.get(team)) < tier(league)) bump(key, 'promotedAgain')
    }
  }
}

console.log(`Quem sobe: ${seeds.length} sementes, ${years} temporadas (a última não conta: não há temporada seguinte)`)
for (const [key, r] of [...tally].sort()) {
  console.log(`${key}: subiram ${r.promoted}, caíram na temporada seguinte ${r.fellNext} (${((100 * r.fellNext) / r.promoted).toFixed(0)}%), subiram de novo ${r.promotedAgain}`)
}
