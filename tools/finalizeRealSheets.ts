/**
 * Fase 5C: reaplica as correções guardadas, gera os atributos pela fama e remonta o rascunho do pacote e as planilhas de conferência,
 * tudo a partir dos arquivos de `dados-reais/planilhas/` (sem rede). Roda sozinho no fim do `dados:planilhas` e do `dados:aplicar`.
 *
 * Uso: node tools/run.mjs finalizeRealSheets [--saida dados-reais/planilhas] [--jogadores 20] [--clubes 10]
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHECK_DIR, distributionMarkdown, finalizeOutput, summaryText } from './realdata/finalize'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const out = opt('saida', 'dados-reais/planilhas')
const result = finalizeOutput(out, console.log)
writeFileSync(join(out, CHECK_DIR, 'distribuicao.md'), distributionMarkdown(result))
console.log(summaryText(result, Number(opt('jogadores', '20')), Number(opt('clubes', '10'))))
console.log(`\nPlanilhas de conferência em ${join(out, CHECK_DIR)} (top-300-jogadores.csv, forca-dos-clubes.csv, distribuicao.md)`)
