/**
 * Mostra o que o filtro novo de patrocinadores e a conferência de nomes (assemble.ts) mudariam nas planilhas atuais, sem gravar nada:
 * remonta as ligas a partir do cache (a rede só para os rótulos em várias línguas) e compara com os CSV de jogadores do projeto.
 * Uso: node tools/run.mjs auditReviewImpact [--original dados-reais/planilhas] [--relatorio dados-reais/revisao-ia-relatorio]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { assembleLeague, newAssembleState } from './realdata/assemble'
import { Fetcher } from './realdata/http'
import { REAL_LEAGUES } from './realdata/leagues'
import { readSheet } from './realdata/corrections'
import { collectLeague } from './realdata/pipeline'

const args = process.argv.slice(2)
const opt = (n: string, d: string): string => (args.includes(`--${n}`) ? (args[args.indexOf(`--${n}`) + 1] ?? d) : d)
const ORIG = opt('original', 'dados-reais/planilhas')
const OUT = opt('relatorio', 'dados-reais/revisao-ia-relatorio')
mkdirSync(OUT, { recursive: true })
const fetcher = new Fetcher({ userAgent: 'MeuManagerDados/1.0 (auditoria das planilhas; projeto pessoal, sem e-mail) node', cacheDir: join(ORIG, '.cache'), refresh: false, pauseMs: 300, log: console.log })
const today = new Date('2026-10-20T12:00:00')
const state = newAssembleState()
const lines: string[] = ['# Efeito do filtro novo e da conferência de nomes (simulação, nada foi gravado)', '']
const dropped: string[] = []
const renamed: string[] = []
const wrong: string[] = []
const added: string[] = []
for (const league of REAL_LEAGUES) {
  if (!existsSync(join(ORIG, `${league.id}-jogadores.csv`))) continue
  const collected = await collectLeague(league, { fetcher, today, log: () => undefined })
  const sheets = assembleLeague(collected.input, state)
  const oldRows = new Map(readSheet(readFileSync(join(ORIG, `${league.id}-jogadores.csv`), 'utf8')).rows.concat(existsSync(join(ORIG, `${league.id}-base.csv`)) ? readSheet(readFileSync(join(ORIG, `${league.id}-base.csv`), 'utf8')).rows : []).map((r) => [r.id as string, r]))
  const newRows = new Map(readSheet(sheets.playersCsv).rows.concat(readSheet(sheets.academyCsv).rows).map((r) => [r.id as string, r]))
  for (const issue of sheets.issues) {
    if (issue.kind === 'player-not-person' && issue.id && oldRows.has(issue.id)) dropped.push(`${league.id} · ${issue.club} · ${issue.player} (${issue.id}) — estava como jogador`)
    if (issue.kind === 'player-name-suspect') renamed.push(`${league.id} · ${issue.club} · ${oldRows.get(issue.id ?? '')?.name ?? '?'} → ${issue.player} (${issue.id})`)
    if (issue.kind === 'player-wrong-item') wrong.push(`${league.id} · ${issue.club} · ${issue.player} (${issue.id})`)
  }
  for (const [id, r] of newRows) if (!oldRows.has(id) && !(r.generated === 'sim')) added.push(`${league.id} · ${r.clubName} · ${r.name} (${id})`)
  console.log(`${league.id}: ok`)
}
const section = (title: string, list: string[]): void => void lines.push(`## ${title}: ${list.length}`, '', ...list.map((l) => `- ${l}`), '')
section('Passariam a ser descartados (item sem dados de pessoa, antes mantidos)', dropped)
section('Nome trocado pelo da Wikipedia (rótulo vandalizado ou sem relação)', renamed)
section('Ficam, mas sem o id/fama do item errado (página de homônimos com nacionalidade na tabela)', wrong)
section('Ids novos que não existiam (por mudança de id ao ignorar item errado)', added)
writeFileSync(join(OUT, '5-efeito-da-correcao.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
