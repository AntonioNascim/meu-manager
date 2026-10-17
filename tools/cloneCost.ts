/**
 * Quanto custa copiar o jogo para o Web Worker e de volta (o preço de tirar o cálculo pesado da tela).
 * Uso: node tools/run.mjs cloneCost
 */
import { buildScaleGame, FULL_WORLD, BRAZIL_ONLY } from '../src/diagnostics/scaleWorld'
import { createGame } from '../src/store/game'
import { runHeavyOp } from '../src/store/heavyOps'

for (const [name, game] of [['mundo padrão (60 clubes)', createGame(7, 'team-imp')], ['Brasil A+B+C (60)', buildScaleGame(BRAZIL_ONLY, 7).game], ['15 ligas (282 clubes)', buildScaleGame(FULL_WORLD, 7, { focus: true }).game]] as const) {
  const t = performance.now()
  const copy = structuredClone(game)
  const cloneMs = performance.now() - t
  const t2 = performance.now()
  const next = runHeavyOp('advance', copy)
  const advanceMs = performance.now() - t2
  const t3 = performance.now()
  structuredClone(next)
  const backMs = performance.now() - t3
  console.log(`${name}: copiar ida ${cloneMs.toFixed(0)} ms, calcular o primeiro avanço ${advanceMs.toFixed(0)} ms, copiar volta ${backMs.toFixed(0)} ms`)
}
