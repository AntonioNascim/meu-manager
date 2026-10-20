/**
 * Confere as planilhas geradas por `buildRealSheets` com o mesmo leitor de CSV do editor (`parseClubsCsv` e `parsePlayersCsv`):
 * mostra, por liga, quantas linhas entram e quais erros o editor mostraria (o esperado são só datas de nascimento em branco).
 * Uso: node tools/run.mjs checkRealSheets [--saida dados-reais/planilhas]
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseClubsCsv, parsePlayersCsv } from '../src/data/package/edit/csv'
import type { DataPackage, PackageClub } from '../src/data/package/types'
import { REAL_LEAGUES } from './realdata/leagues'

const args = process.argv.slice(2)
const out = args.includes('--saida') ? (args[args.indexOf('--saida') + 1] ?? 'dados-reais/planilhas') : 'dados-reais/planilhas'

const skeleton = { leagues: REAL_LEAGUES.map((l) => ({ id: l.id })), clubs: [], players: [] } as unknown as DataPackage
const clubs: PackageClub[] = []
const abbreviations = new Set<string>()
let failed = false

for (const league of REAL_LEAGUES) {
  const file = join(out, `${league.id}-clubes.csv`)
  if (!existsSync(file)) continue
  const parsed = parseClubsCsv(readFileSync(file, 'utf8'), skeleton)
  for (const { value } of parsed.rows) {
    if (abbreviations.has(value.abbreviation)) console.log(`${league.id}: sigla repetida ${value.abbreviation}`), (failed = true)
    abbreviations.add(value.abbreviation)
    clubs.push(value)
  }
  if (parsed.issues.length > 0) failed = true
  console.log(`${league.id} clubes: ${parsed.rows.length}/${parsed.total} linhas ok${parsed.issues.length > 0 ? `; problemas: ${parsed.issues.slice(0, 5).map((i) => `${i.line}:${i.column}:${i.code}`).join(' ')}` : ''}`)
}

const withClubs = { ...skeleton, clubs } as unknown as DataPackage
const ids = new Set<string>()
for (const league of REAL_LEAGUES) {
  const file = join(out, `${league.id}-jogadores.csv`)
  if (!existsSync(file)) continue
  const parsed = parsePlayersCsv(readFileSync(file, 'utf8'), withClubs)
  const byCode = new Map<string, number>()
  for (const issue of parsed.issues) byCode.set(`${issue.column ?? ''}:${issue.code}`, (byCode.get(`${issue.column ?? ''}:${issue.code}`) ?? 0) + 1)
  for (const { value } of parsed.rows) {
    if (value.id && ids.has(value.id)) console.log(`${league.id}: id repetido ${value.id}`), (failed = true)
    if (value.id) ids.add(value.id)
  }
  const unexpected = [...byCode].filter(([key]) => key !== 'birthDate:missing-field')
  if (unexpected.length > 0) failed = true
  console.log(`${league.id} jogadores: ${parsed.rows.length}/${parsed.total} linhas ok; sem nascimento: ${byCode.get('birthDate:missing-field') ?? 0}${unexpected.length > 0 ? `; INESPERADO: ${unexpected.map(([k, n]) => `${k} x${n}`).join(' ')}` : ''}`)
}
console.log(failed ? '\nHá problemas além de datas de nascimento em branco.' : '\nTudo certo: só faltam datas de nascimento (esperado).')
process.exitCode = failed ? 1 : 0
