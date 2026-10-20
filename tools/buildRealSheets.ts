/**
 * Fase 5A: monta as planilhas iniciais dos elencos reais (clubes e jogadores, uma dupla de CSV por liga) no formato que o editor importa.
 * Fontes: Wikidata (dados em domínio público) e Wikipedia (lista de clubes da temporada e elencos atuais, com créditos).
 *
 * Uso: node tools/run.mjs buildRealSheets [--liga br-1,en-1] [--saida dados-reais/planilhas] [--atualizar]
 *        [--contato "email ou site"] [--max-clubes N] [--pausa 1500] [--data 2026-10-20] [--sem-local]
 *
 * - Sem `--liga`, faz as 21 ligas do mundo ampliado. Os atributos ficam em branco: o jogo gera.
 * - As respostas da rede ficam em `<saida>/.cache`; rodar de novo reaproveita o que já foi baixado (continua de onde parou).
 *   Para atualizar os elencos depois de uma janela de transferências, rode com `--atualizar` (baixa tudo de novo).
 * - `dados-reais/` está no .gitignore: nada disso entra no repositório.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assembleLeague, newAssembleState } from './realdata/assemble'
import type { LeagueSheets } from './realdata/assemble'
import { Fetcher } from './realdata/http'
import { REAL_LEAGUES } from './realdata/leagues'
import { collectLeague } from './realdata/pipeline'
import { buildRealPackage, leagueDefinitions } from './realdata/packageOut'
import { buildCredits, buildReport, reviewCsv, tasksCsv } from './realdata/report'
import type { RunInfo } from './realdata/report'

const args = process.argv.slice(2)
const has = (name: string): boolean => args.includes(`--${name}`)
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}

const out = opt('saida', 'dados-reais/planilhas')
const contact = opt('contato', process.env.MEUMANAGER_CONTATO ?? '')
const wanted = opt('liga', '').split(',').map((s) => s.trim()).filter(Boolean)
const today = has('data') ? new Date(`${opt('data', '')}T12:00:00`) : new Date()
const maxClubs = args.includes('--max-clubes') ? Number(opt('max-clubes', '0')) : undefined

const unknown = wanted.filter((id) => !REAL_LEAGUES.some((l) => l.id === id))
if (unknown.length > 0) {
  console.error(`Liga desconhecida: ${unknown.join(', ')}. Ligas: ${REAL_LEAGUES.map((l) => l.id).join(' ')}`)
  process.exit(1)
}
if (contact === '') console.warn('Aviso: sem --contato (ou a variável MEUMANAGER_CONTATO). A Wikimedia pede um e-mail ou site de contato no User-Agent; informe o seu.')

mkdirSync(out, { recursive: true })
const log = (message: string): void => console.log(message)
const fetcher = new Fetcher({
  userAgent: `MeuManagerDados/1.0 (script de planilhas do jogo Meu Manager; ${contact || 'sem contato informado'}) node`,
  cacheDir: join(out, '.cache'),
  refresh: has('atualizar'),
  pauseMs: Number(opt('pausa', '1500')),
  log,
})

const leagues = REAL_LEAGUES.filter((l) => wanted.length === 0 || wanted.includes(l.id))
const run: RunInfo = { date: today.toISOString().slice(0, 10), articles: [], seasons: [], local: [], network: 0, cached: 0 }
const state = newAssembleState()
const sheets: LeagueSheets[] = []

for (const league of leagues) {
  try {
    const collected = await collectLeague(league, { fetcher, today, ...(maxClubs !== undefined ? { maxClubs } : {}), noLocal: has('sem-local'), log })
    for (const article of collected.articles) if (!run.articles.some((a) => a.title === article.title)) run.articles.push(article)
    run.local.push({ league: league.id, ...collected.local })
    if (collected.season) run.seasons.push({ league: league.id, ...collected.season })
    const result = assembleLeague(collected.input, state)
    sheets.push(result)
    writeFileSync(join(out, `${league.id}-clubes.csv`), result.clubsCsv)
    writeFileSync(join(out, `${league.id}-jogadores.csv`), result.playersCsv)
    writeFileSync(join(out, `${league.id}-base.csv`), result.academyCsv)
    mkdirSync(join(out, 'tarefas'), { recursive: true })
    writeFileSync(join(out, 'tarefas', `${league.id}-tarefas.csv`), tasksCsv(result.issues))
    log(`${league.id}: ${result.stats.clubs}/${result.stats.expected} clubes, ${result.stats.players} jogadores, ${result.issues.length} avisos`)
  } catch (error) {
    console.error(`${league.id}: falhou (${error instanceof Error ? error.message : String(error)}). Rode de novo: o que já foi baixado fica no cache.`)
    process.exitCode = 1
  }
}

run.network = fetcher.stats.network
run.cached = fetcher.stats.cached
// Ligas com o número real de clubes e o rascunho do pacote inteiro (validado como o jogo valida na importação).
writeFileSync(join(out, 'ligas-reais.json'), JSON.stringify(leagueDefinitions(sheets), null, 2))
const credits = buildCredits(run)
const built = buildRealPackage(sheets, credits.trim(), today.getFullYear())
run.validation = { errors: built.errors, warnings: built.warnings, byCode: built.byCode, rejected: built.rejected }
writeFileSync(join(out, 'pacote-real.json'), JSON.stringify(built.pkg))
writeFileSync(join(out, 'relatorio.md'), buildReport(sheets, run))
writeFileSync(join(out, 'revisao.csv'), reviewCsv(sheets.flatMap((s) => s.issues)))
writeFileSync(join(out, 'creditos.txt'), credits)
log(`\nPronto. Planilhas, relatorio.md, revisao.csv e creditos.txt em ${out}`)
