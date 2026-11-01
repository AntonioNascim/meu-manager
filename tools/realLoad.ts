/** Mede o custo de carregar o pacote real: ler o JSON, montar o mundo e criar o jogo (node tools/run.mjs realLoad). */
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { loadWorld } from '../src/data/package/defaultPackage'
import { parsePackage } from '../src/data/package/validate'
import type { DataPackage } from '../src/data/package/types'
import { createGame } from '../src/store/game'

const t = (label: string, t0: number) => console.log(`${label}: ${(performance.now() - t0).toFixed(0)} ms`)
const text = readFileSync('data/pacote-real.json', 'utf8')
console.log(`tamanho: ${(text.length / 1e6).toFixed(2)} MB, gzip ${(gzipSync(text).length / 1e6).toFixed(2)} MB`)
let t0 = performance.now()
const raw = JSON.parse(text) as DataPackage
t('JSON.parse', t0)
t0 = performance.now()
const parsed = parsePackage(text)
t('parsePackage (valida)', t0)
console.log('erros:', parsed.report.errors.length, 'avisos:', parsed.report.warnings.length)
t0 = performance.now()
const world = loadWorld(5, raw)
t('loadWorld', t0)
console.log('clubes', world.teams.length, 'jogadores', world.players.length)
t0 = performance.now()
const game = createGame(5, world.teams[0]!.id, { world, dataPackage: raw, dataPackageId: 'mundo-real' })
t('createGame', t0)
console.log('partidas', game.season.matches.length)
