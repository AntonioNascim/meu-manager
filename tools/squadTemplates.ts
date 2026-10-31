/**
 * Elencos reais por clube: cria, em `dados-reais/planilhas/elencos-reais/`, uma planilha-modelo para cada clube que ainda tem jogadores
 * gerados (com os reais que o script já achou e uma linha em branco, com a posição que falta, para cada gerado) e confere as que já
 * foram preenchidas. Nunca sobrescreve um arquivo que já existe. Quem aplica as planilhas é o passo final (`dados:finalizar`, `dados:planilhas`
 * e `dados:aplicar`), em toda rodada.
 *
 * Uso: node tools/run.mjs squadTemplates [--saida dados-reais/planilhas] [--liga cl-1,us-1]
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readSheet } from './realdata/corrections'
import { SQUAD_DIR, readSquadSheet, squadFileName, squadFiles, squadTemplate, writeSquadTemplate } from './realdata/clubSquads'
import { REAL_LEAGUES } from './realdata/leagues'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const out = opt('saida', 'dados-reais/planilhas')
const wanted = opt('liga', '').split(',').map((s) => s.trim()).filter(Boolean)

let created = 0
let kept = 0
for (const league of REAL_LEAGUES.filter((l) => wanted.length === 0 || wanted.includes(l.id))) {
  const clubsFile = join(out, `${league.id}-clubes.csv`)
  const playersFile = join(out, `${league.id}-jogadores.csv`)
  if (!existsSync(clubsFile) || !existsSync(playersFile)) continue
  const clubs = readSheet(readFileSync(clubsFile, 'utf8'))
  const players = readSheet(readFileSync(playersFile, 'utf8'))
  for (const club of clubs.rows) {
    const generated = players.rows.some((p) => p.club === club.id && /^(sim|s|1|true)$/i.test(p.generated ?? ''))
    if (!generated) continue
    const made = writeSquadTemplate(out, league.id, club.name ?? '', squadTemplate(players.rows, club.id ?? ''))
    if (made.created) (created++, console.log(`criado   ${SQUAD_DIR}/${squadFileName(league.id, club.name ?? '')}`))
    else (kept++, console.log(`já existe ${SQUAD_DIR}/${squadFileName(league.id, club.name ?? '')} (não mexi)`))
  }
}
console.log(`\n${created} modelos criados, ${kept} já existiam.`)

const files = squadFiles(out)
if (files.length > 0) console.log('\nConferência das planilhas preenchidas:')
for (const file of files) {
  const read = readSquadSheet(readFileSync(join(out, SQUAD_DIR, file), 'utf8'))
  if ('header' in read) console.log(`  ${file}: ERRO faltam as colunas jogador e posicao (cabeçalho: ${read.header})`)
  else {
    console.log(`  ${file}: ${read.players.length} jogadores prontos, ${read.open} vagas em branco, ${read.problems.length} linhas com problema`)
    for (const p of read.problems) console.log(`      linha ${p.line}: ${p.reason}`)
  }
}
console.log('\nPara aplicar: npm run dados:finalizar')
