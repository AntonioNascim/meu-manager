/**
 * Tamanho e tempo do save no mundo grande (Fase 2, B4): joga a temporada pelo mesmo caminho do jogo e, depois de cada
 * avanço, grava o jogo em partes comprimidas num IndexedDB de mentira (fake-indexeddb), como o salvamento automático.
 *
 * Uso: node tools/run.mjs saveWorld [--world full|brazil] [--seed 7]
 * Os tempos de IndexedDB são os do fake-indexeddb (em memória, mais rápido que o disco de um celular); o resto (dividir,
 * serializar, comprimir) é o mesmo código. Para o tempo num aparelho de verdade, use a tela ?diagnostico=1.
 */
import 'fake-indexeddb/auto'
import { measureWorld } from '../src/diagnostics/measure'
import type { WorldChoice } from '../src/diagnostics/measure'

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const world = flag('world', 'full') as WorldChoice
const m = await measureWorld({ world, seed: Number(flag('seed', '7')), readMemory: () => null })
const s = m.save
console.log(`Mundo ${world}: ${m.clubs} clubes, ${m.players} jogadores, ${m.matches} partidas, ${m.advances} avancos (${m.finished ? 'temporada inteira' : 'parcial'})`)
console.log(`JSON do save no fim: ${m.saveJsonKb} KB`)
if (s) {
  console.log(`Gravado (comprimido): inicio ${s.startKb} KB, fim ${s.endKb} KB, ${s.parts} pedacos`)
  console.log(`Salvar a cada avanco: primeiro ${s.firstMs.toFixed(0)} ms, mediana ${s.medianMs.toFixed(0)} ms, p95 ${s.p95Ms.toFixed(0)} ms, pior ${s.worstMs.toFixed(0)} ms`)
  console.log(`Por save (mediana): ${s.writtenPartsMedian} de ${s.parts} pedacos, ${s.writtenKbMedian} KB; preparar ${s.planMs.toFixed(0)} ms, comprimir ${s.packMs.toFixed(0)} ms, escrever ${s.writeMs.toFixed(0)} ms`)
}
