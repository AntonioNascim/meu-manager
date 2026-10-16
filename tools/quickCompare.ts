/**
 * Compara a partida simplificada com o motor completo nas mesmas duplas de times (npm run analyze:quick).
 *   npm run analyze:quick                  compara com os coeficientes atuais (QUICK em config.ts)
 *   npm run analyze:quick -- --fit         também imprime os coeficientes de gols ajustados ao motor completo
 * Opções: --worlds N (padrão 4), --matches N por mundo (padrão 1500), --seed N.
 */
import { generateWorld } from '../src/data/generateWorld'
import { QUICK } from '../src/engine/config'
import { collectSamples, fitGoals, summarizeSamples } from './quickMeasure'

const args = process.argv.slice(2)
const num = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : fallback
}
const worldsN = num('worlds', 4)
const perWorld = num('matches', 1500)
const seed = num('seed', 1)

const t0 = performance.now()
const worlds = Array.from({ length: worldsN }, (_, i) => generateWorld({ seed: seed + i * 3 }))
const samples = collectSamples(worlds, perWorld, 'quick-compare')
console.log(`${samples.length} duplas jogadas pelos dois motores em ${((performance.now() - t0) / 1000).toFixed(1)} s`)

if (args.includes('--fit')) {
  console.log('\nCoeficientes de gols ajustados ao motor completo:')
  console.log(JSON.stringify(fitGoals(samples, QUICK.reference)))
}

const full = summarizeSamples(samples, 'full')
const quick = summarizeSamples(samples, 'quick')
const fmt = (v: number | number[]) => (Array.isArray(v) ? v.map((x) => x.toFixed(3)).join('  ') : v.toFixed(3))
console.log('\n' + 'métrica'.padEnd(22) + 'completo'.padEnd(34) + 'simplificado')
for (const key of Object.keys(full) as (keyof typeof full)[]) {
  console.log(String(key).padEnd(22) + fmt(full[key]).padEnd(34) + fmt(quick[key]))
}

if (args.includes('--tiers')) {
  for (const tier of [1, 2, 3]) {
    const part = samples.filter((s) => s.home.tier === tier)
    const a = summarizeSamples(part, 'full')
    const b = summarizeSamples(part, 'quick')
    console.log(`\nSérie ${tier} (${part.length} partidas)`)
    for (const key of ['goals', 'homeWin', 'draw', 'awayWin', 'strongerWin', 'strongerPoints', 'strongerGoalDiff', 'gapShare'] as const) {
      console.log(String(key).padEnd(22) + fmt(a[key]).padEnd(34) + fmt(b[key]))
    }
  }
}
