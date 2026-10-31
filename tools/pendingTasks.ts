/**
 * Resumo do que ainda falta preencher à mão nas planilhas de tarefas (`tarefas/*-tarefas.csv`) e no `conferencia/top-300-jogadores.csv`.
 * Gera `PENDENCIAS.md` (tabela por arquivo, arquivos completos, divisão entre três pessoas) e `tarefas/TODAS-AS-TAREFAS.csv` (todas as
 * tarefas pendentes juntas, por importância). Desconta o que já foi resolvido: linha marcada como feita (na própria planilha ou nas
 * preenchidas em `tarefas-feitas/`) e tarefa coberta por uma correção de `correcoes.json` (o que o `dados:aplicar` guardou).
 * Rodando de novo, mostra só o que ainda falta.
 *
 * Uso: node tools/run.mjs pendingTasks [--saida dados-reais/planilhas] [--pessoas 3]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { toCsv } from '../src/data/package/edit/csv'
import { CHECK_DIR } from './realdata/finalize'
import { DONE_DIR, isTaskDone, loadCorrections, readSheet, readTaskSheet } from './realdata/corrections'
import type { TaskRow } from './realdata/corrections'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const out = resolve(opt('saida', 'dados-reais/planilhas'))
const people = Math.max(1, Number(opt('pessoas', '3')) || 3)
const TASKS_DIR = 'tarefas'
const COMBINED = 'TODAS-AS-TAREFAS.csv'

const strip = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (text: string): string => strip(text).trim().toLowerCase().replace(/\s+/g, ' ')

/** Tipo da tarefa, como aparece no resumo. */
const KINDS = ['estádio', 'capacidade', 'cores', 'cidade', 'posição', 'elenco gerado', 'força'] as const
type Kind = (typeof KINDS)[number]
function kindOf(campo: string): Kind {
  switch (norm(campo)) {
    case 'estadio': return 'estádio'
    case 'capacidade': return 'capacidade'
    case 'cores': case 'cor 1': case 'cor 2': return 'cores'
    case 'cidade': return 'cidade'
    case 'forca': return 'força'
    case 'elenco': return 'elenco gerado'
    default: return 'posição'
  }
}

interface Pending {
  file: string
  league: string
  /** Posição na ordem de importância dentro do arquivo (top 300 pelo ranking). */
  row: TaskRow
  raw: Record<string, string>
  kind: Kind
}
interface FileReport {
  file: string
  path: string
  league: string
  total: number
  pending: Pending[]
}

const corrections = loadCorrections(out)

// Tarefas marcadas como feitas nas planilhas preenchidas (`tarefas-feitas/`): contam como resolvidas (inclui as de elenco, que não viram correção).
const doneKeys = new Set<string>()
const doneDir = join(out, DONE_DIR)
if (existsSync(doneDir)) {
  for (const f of readdirSync(doneDir).filter((n) => n.toLowerCase().endsWith('.csv'))) {
    for (const r of readTaskSheet(readFileSync(join(doneDir, f), 'utf8')).rows) if (r.feito) doneKeys.add(`${r.id}|${norm(r.campo)}`)
  }
}

/** Lê uma planilha de tarefas e separa as linhas que ainda faltam. */
function readFile(path: string, league: (raw: Record<string, string>) => string): FileReport {
  const text = readFileSync(path, 'utf8')
  const { rows } = readTaskSheet(text)
  const raws = readSheet(text).rows
  const pending: Pending[] = []
  rows.forEach((row, i) => {
    const resolved = row.feito || isTaskDone(corrections, row.id, row.campo) || doneKeys.has(`${row.id}|${norm(row.campo)}`)
    if (resolved) return
    const raw = raws[i] as Record<string, string>
    pending.push({ file: path, league: league(raw), row, raw, kind: kindOf(row.campo) })
  })
  return { file: path.split(/[\\/]/).pop() as string, path, league: '', total: rows.length, pending }
}

const reports: FileReport[] = []
const tasksFolder = join(out, TASKS_DIR)
if (existsSync(tasksFolder)) {
  for (const f of readdirSync(tasksFolder).filter((n) => /-tarefas\.csv$/i.test(n) && n !== COMBINED).sort()) {
    const league = f.replace(/-tarefas\.csv$/i, '')
    const r = readFile(join(tasksFolder, f), () => league)
    reports.push({ ...r, league })
  }
}
const topPath = join(out, CHECK_DIR, 'top-300-jogadores.csv')
const top = existsSync(topPath) ? readFile(topPath, (raw) => raw.liga ?? '') : undefined
if (top) {
  top.league = 'top-300'
  top.pending.sort((a, b) => Number(a.raw.ranking) - Number(b.raw.ranking))
}

// Força de cada liga (média da força dos clubes), para dizer quais são as mais fortes.
const strength = new Map<string, number[]>()
const clubsPath = join(out, CHECK_DIR, 'forca-dos-clubes.csv')
if (existsSync(clubsPath)) for (const r of readSheet(readFileSync(clubsPath, 'utf8')).rows) (strength.get(r.liga as string) ?? strength.set(r.liga as string, []).get(r.liga as string) ?? []).push(Number(r.forca_14_melhores))
const leagueStrength = (league: string): number => {
  const v = strength.get(league) ?? []
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0
}
reports.sort((a, b) => leagueStrength(b.league) - leagueStrength(a.league) || a.league.localeCompare(b.league))

// Dentro de uma liga: elenco, depois dados do clube, depois posição dos jogadores.
const KIND_RANK: Record<Kind, number> = { 'elenco gerado': 0, estádio: 1, capacidade: 2, cores: 3, cidade: 4, posição: 5, força: 6 }
for (const r of reports) r.pending.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])

const ordered: FileReport[] = top ? [top, ...reports] : reports
const withTasks = ordered.filter((r) => r.pending.length > 0)
const complete = ordered.filter((r) => r.pending.length === 0)

// ---------------------------------------------------------------------------------------------------------------------
// Divisão entre as pessoas: arquivos inteiros, do maior para o menor, sempre para quem tem menos.
const groups = Array.from({ length: people }, () => ({ files: [] as FileReport[], count: 0 }))
for (const r of [...withTasks].sort((a, b) => b.pending.length - a.pending.length)) {
  const g = groups.reduce((lo, cur) => (cur.count < lo.count ? cur : lo))
  g.files.push(r)
  g.count += r.pending.length
}
for (const g of groups) g.files.sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b))

// ---------------------------------------------------------------------------------------------------------------------
// Planilha única
const header = ['ordem', 'liga', 'arquivo', 'tipo', 'clube', 'jogador', 'id', 'campo', 'situacao', 'valor_provisorio', 'valor_correto', 'onde_procurar', 'feito']
let order = 0
const combined = withTasks.flatMap((r) =>
  r.pending.map((p) => [++order, p.league === 'top-300' ? p.raw.liga : p.league, r.file, p.raw.tipo, p.raw.clube, p.raw.jogador, p.row.id, p.row.campo, p.raw.situacao, p.raw.valor_provisorio, '', p.raw.onde_procurar, ''] as (string | number | undefined)[]),
)
writeFileSync(join(tasksFolder, COMBINED), toCsv(header, combined))

// ---------------------------------------------------------------------------------------------------------------------
// PENDENCIAS.md
const countOf = (r: FileReport): string =>
  KINDS.map((k) => ({ k, n: r.pending.filter((p) => p.kind === k).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.k}: ${x.n}`)
    .join(', ')
const totalPending = withTasks.reduce((s, r) => s + r.pending.length, 0)
const totalAll = ordered.reduce((s, r) => s + r.total, 0)
const byKind = KINDS.map((k) => ({ k, n: withTasks.reduce((s, r) => s + r.pending.filter((p) => p.kind === k).length, 0) })).filter((x) => x.n > 0)

const md: string[] = []
md.push('# Pendências das planilhas reais', '')
md.push(`Gerado por \`npm run dados:pendencias\` em ${new Date().toISOString().slice(0, 10)}. Já descontado o que foi marcado como feito e o que as correções do \`dados:aplicar\` (\`correcoes.json\`, ${corrections.length} guardadas) resolveram. Rode de novo depois de cada \`dados:aplicar\` para ver só o que falta.`, '')
md.push(`**Faltam ${totalPending} de ${totalAll} tarefas** em ${withTasks.length} arquivos (${complete.length} já completos).`, '')
if (byKind.length > 0) md.push(`Por tipo: ${byKind.map((x) => `${x.k} ${x.n}`).join(' · ')}`, '')

md.push('## 1. Arquivos com tarefas pendentes', '')
md.push('Em ordem de importância: primeiro o top 300, depois as ligas mais fortes.', '')
md.push('| # | Arquivo | Caminho completo | Faltam | Tipos |', '| --- | --- | --- | ---: | --- |')
withTasks.forEach((r, i) => md.push(`| ${i + 1} | ${r.file} | \`${r.path}\` | ${r.pending.length} | ${countOf(r)} |`))
if (withTasks.length === 0) md.push('| | nenhum | | 0 | |')
md.push('')

md.push('## 2. Arquivos já completos (não precisa abrir)', '')
if (complete.length === 0) md.push('Nenhum ainda.')
else for (const r of complete) md.push(`- ${r.file} — \`${r.path}\``)
md.push('')

md.push(`## 3. Sugestão de divisão entre ${people} pessoas`, '')
md.push('Arquivos inteiros, com quantidades parecidas.', '')
groups.forEach((g, i) => {
  md.push(`### Pessoa ${i + 1} — ${g.count} tarefas`, '')
  if (g.files.length === 0) md.push('Nada.')
  for (const r of g.files) md.push(`- ${r.file} — ${r.pending.length} (${countOf(r)})`)
  md.push('')
})

md.push('## 4. Arquivo único', '')
md.push(`\`${join(tasksFolder, COMBINED)}\` — todas as ${totalPending} tarefas pendentes, com a coluna \`liga\`, ordenadas por importância (top 300, depois as ligas mais fortes). Preencha \`valor_correto\` e \`feito\`, salve como CSV em \`${doneDir}\` e rode \`npm run dados:aplicar\`.`, '')
writeFileSync(join(out, 'PENDENCIAS.md'), md.join('\n'))

console.log(md.join('\n'))
console.log(`Gravei ${join(out, 'PENDENCIAS.md')} e ${join(tasksFolder, COMBINED)}.`)
