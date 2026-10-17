/**
 * Gera o pacote de exemplo com as 15 ligas (282 clubes) para testar a importação no celular.
 * Uso: node tools/run.mjs exportScalePackage [--seed 7] [--out dados-reais/mundo-ficticio-15-ligas.json]
 * A pasta dados-reais/ está no .gitignore: nada disso entra no repositório nem no site.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadWorld } from '../src/data/package/defaultPackage'
import { parsePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { createGame } from '../src/store/game'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const seed = Number(opt('seed', '7'))
const out = opt('out', 'dados-reais/mundo-ficticio-15-ligas.json')

const text = JSON.stringify(buildScalePackage(seed))
const t0 = performance.now()
const parsed = parsePackage(text)
const parseMs = performance.now() - t0
if (!parsed.pkg || parsed.report.errors.length > 0) {
  console.error('O pacote não passou na validação:', JSON.stringify(parsed.report.errors.slice(0, 8)))
  process.exit(1)
}
const t1 = performance.now()
const world = loadWorld(seed, parsed.pkg)
const worldMs = performance.now() - t1
const t2 = performance.now()
const game = createGame(seed, world.teams[0]!.id, { world, dataPackage: parsed.pkg })
const gameMs = performance.now() - t2
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, text)
console.log(`${out}: ${(text.length / 1024 / 1024).toFixed(2)} MB, ${parsed.pkg.clubs.length} clubes, ${parsed.pkg.players.length} jogadores, ${parsed.pkg.leagues.length} ligas, ${parsed.pkg.countries.length} países`)
console.log(`validar ${parseMs.toFixed(0)} ms | montar o mundo ${worldMs.toFixed(0)} ms | criar o jogo ${gameMs.toFixed(0)} ms (${game.season.matches.length} partidas, foco ${game.season.focus})`)
