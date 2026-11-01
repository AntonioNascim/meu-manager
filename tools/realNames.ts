/** Varredura de nomes suspeitos do pacote real (node tools/run.mjs realNames [arquivo] [--baixa]). Mostra tudo que `nameScan.ts` acha. */
import { readFileSync } from 'node:fs'
import { entriesFromPackage, scanNames } from './realdata/nameScan'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--')) ?? 'data/pacote-real.json'
const pkg = JSON.parse(readFileSync(file, 'utf8'))
const findings = scanNames(entriesFromPackage(pkg))
const bySev = { alta: 0, media: 0, baixa: 0 }
const byCode = new Map<string, number>()
for (const f of findings) {
  bySev[f.severity]++
  byCode.set(`${f.severity}/${f.code}`, (byCode.get(`${f.severity}/${f.code}`) ?? 0) + 1)
}
console.log(`${file}: ${findings.length} achados`, bySev)
console.log([...byCode].sort().map(([k, n]) => `  ${k}: ${n}`).join('\n'))
for (const f of findings) {
  if (f.severity === 'baixa' && !args.includes('--baixa')) continue
  console.log(`[${f.severity}/${f.code}] ${f.kind} ${f.id} (${f.club}) ${f.field}: "${f.value}" — ${f.why}`)
}
