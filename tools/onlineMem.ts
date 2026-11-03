/**
 * Fase 6, B1: o mundo real inteiro cabe no limite de memória de um Durable Object (128 MB)? Joga uma temporada com o mundo todo em memória
 * (como a liga online faria sem blocos) e imprime o heap vivo e o pico. Rode com um teto de heap para ver onde quebra:
 *   node --expose-gc --max-old-space-size=96 tools/run.mjs onlineMem
 * (o teto do V8 vale só para o heap de JavaScript; o limite de 128 MB do Cloudflare conta também o código e o resto do isolate).
 */
import { readFileSync } from 'node:fs'
import { loadWorld } from '../src/data/package/defaultPackage'
import type { DataPackage } from '../src/data/package/types'
import { simulateMatch } from '../src/engine/match'
import { userMatchInput } from '../src/engine/season/advance'
import { advanceGame, createGame, finishPendingMatch } from '../src/store/game'

const mb = (x: number) => Math.round(x / 1048576)
const gc = () => (globalThis as { gc?: () => void }).gc?.()
const raw = JSON.parse(readFileSync('data/pacote-real.json', 'utf8')) as DataPackage
const world = loadWorld(5, raw)
const top = [...world.teams].sort((a, b) => b.reputation - a.reputation)[0]!
let game = createGame(5, top.id, { world, dataPackage: raw, dataPackageId: 'mundo-real' })
gc()
console.log(`depois de criar: heap vivo ${mb(process.memoryUsage().heapUsed)} MB`)
let peak = 0
let advances = 0
let worst = 0
let stale = 0
let lastSig = ''
const t0 = performance.now()
for (let i = 0; i < 400; i++) {
    const t = performance.now()
  game = advanceGame(game)
  if (game.pendingUserMatch) game = finishPendingMatch(game, simulateMatch(userMatchInput(game.season, game.pendingUserMatch, game.userTeamId)))
  worst = Math.max(worst, performance.now() - t)
  peak = Math.max(peak, process.memoryUsage().heapUsed)
  const sig = game.season.season.currentDate + game.season.matches.filter((m) => m.status === 'finished').length
  stale = sig === lastSig ? stale + 1 : 0
  lastSig = sig
  if (game.dismissal || stale >= 5) { console.log('parou em', game.season.season.currentDate, 'demissão:', !!game.dismissal); break }
  advances++
}
const total = (performance.now() - t0) / 1000
gc()
console.log(`${advances} avanços em ${total.toFixed(1)} s (pior ${Math.round(worst)} ms) · pico do heap ${mb(peak)} MB · heap vivo no fim ${mb(process.memoryUsage().heapUsed)} MB · jogos ${game.season.matches.filter((m) => m.status === 'finished').length}/${game.season.matches.length}`)
