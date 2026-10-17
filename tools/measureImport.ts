/**
 * Mede neste computador o caminho de importar um pacote e começar um jogo (o mesmo da tela ?diagnostico=1).
 * Uso: node tools/run.mjs measureImport [arquivo.json]   (padrão: dados-reais/mundo-ficticio-15-ligas.json)
 */
import { readFileSync } from 'node:fs'
import { formatImportReport, measureImport } from '../src/diagnostics/measure'

const file = process.argv[3] ?? 'dados-reais/mundo-ficticio-15-ligas.json'
const t = performance.now()
const text = readFileSync(file, 'utf8')
const readMs = performance.now() - t
console.log(formatImportReport(await measureImport(text, { label: file, readMs, saveStore: null })))
