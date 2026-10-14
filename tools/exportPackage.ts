/**
 * Exporta o mundo fictício padrão como arquivo de pacote de dados (para testar a importação).
 * Uso: node tools/run.mjs exportPackage [--seed 7] [--out dados-reais/mundo-ficticio-exemplo.json]
 * A pasta dados-reais/ está no .gitignore: nada disso entra no repositório nem no site.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { defaultPackage, loadWorld } from '../src/data/package/defaultPackage'
import { parsePackage } from '../src/data/package/validate'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const seed = Number(opt('seed', '7'))
const out = opt('out', 'dados-reais/mundo-ficticio-exemplo.json')

const pkg = { ...defaultPackage(seed), name: `Mundo fictício de exemplo (semente ${seed})`, credits: 'Pacote de exemplo gerado pelo próprio jogo: nomes inventados, sem dados reais.' }
const text = JSON.stringify(pkg)
const parsed = parsePackage(text)
if (!parsed.pkg || parsed.report.errors.length > 0) {
  console.error('O pacote exportado não passou na validação:', JSON.stringify(parsed.report.errors.slice(0, 5)))
  process.exit(1)
}
const a = JSON.stringify(loadWorld(seed))
const b = JSON.stringify(loadWorld(seed, parsed.pkg))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, text)
console.log(`${out}: ${(text.length / 1024 / 1024).toFixed(2)} MB, ${pkg.clubs.length} clubes, ${pkg.players.length} jogadores, ${pkg.academy?.length ?? 0} na base`)
console.log(`validação: ${parsed.report.errors.length} erros, ${parsed.report.warnings.length} avisos; ida e volta idêntica ao mundo gerado: ${a === b}`)
