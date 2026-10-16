/** Gols do motor completo e do simplificado, mundo a mundo e série a série (diagnóstico da calibragem). */
import { generateWorld } from '../src/data/generateWorld'
import { collectSamples, summarizeSamples } from './quickMeasure'

const seeds = (process.argv[2] ?? '1,2,3,31,32,33').split(',').map(Number)
for (const seed of seeds) {
  const samples = collectSamples([generateWorld({ seed })], 1800, 'quick-worlds')
  const row = [1, 2, 3].map((tier) => {
    const part = samples.filter((s) => s.home.tier === tier)
    const a = summarizeSamples(part, 'full')
    const b = summarizeSamples(part, 'quick')
    return `S${tier} ${a.goals.toFixed(2)}/${b.goals.toFixed(2)} m${a.homeWin.toFixed(2)}/${b.homeWin.toFixed(2)} e${a.draw.toFixed(2)}/${b.draw.toFixed(2)}`
  })
  console.log(`mundo ${seed}: ${row.join('   ')}`)
}
