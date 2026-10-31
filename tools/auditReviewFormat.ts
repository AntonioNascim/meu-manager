/**
 * Auditoria de um pacote de planilhas revisadas por outra pessoa/IA (itens 1 e 2): confere o formato de todos os arquivos contra as
 * planilhas originais do projeto, resume o que mudaria e sorteia linhas com o link da Wikipedia para conferência à mão. Não grava nada
 * nas planilhas do projeto; o relatório vai para `--relatorio` (padrão `dados-reais/revisao-ia-relatorio/`).
 *
 * Uso: node tools/run.mjs auditReviewFormat --revisao "<pasta planilhas extraída>" [--original dados-reais/planilhas] [--semente 7]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv } from '../src/data/package/edit/csv'
import { Fetcher } from './realdata/http'
import { interpretTask, parsePosition, readSheet } from './realdata/corrections'
import { REAL_LEAGUES } from './realdata/leagues'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const REV = opt('revisao', '')
const ORIG = opt('original', 'dados-reais/planilhas')
const OUT = opt('relatorio', 'dados-reais/revisao-ia-relatorio')
const SEED = Number(opt('semente', '7'))
if (!REV || !existsSync(REV)) (console.error('Informe --revisao com a pasta planilhas do pacote.'), process.exit(1))
mkdirSync(OUT, { recursive: true })

const out: string[] = []
const say = (line = ''): void => void out.push(line)
const problems: string[] = []
const problem = (line: string): void => void problems.push(line)

const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
const DONE = /^(sim|s|x|ok|feito|true|verdadeiro|1|v|yes|y|✓|✔|✅)$/i

interface Row { file: string; line: number; cells: Record<string, string> }
function load(path: string): { header: string[]; rows: Row[]; delimiter: string; bom: boolean; badQuote: boolean; raw: string } {
  const raw = readFileSync(path, 'utf8')
  const parsed = parseCsv(raw)
  const header = (parsed.rows[0] ?? []).map((h) => h.trim())
  const rows = parsed.rows.slice(1).map((cells, i) => ({ file: path, line: parsed.lines[i + 1] as number, cells: Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? '').trim()])) }))
  return { header, rows, delimiter: parsed.delimiter, bom: raw.charCodeAt(0) === 0xfeff, badQuote: parsed.badQuote, raw }
}

// ---------------------------------------------------------------------------------------------------------------------
// 1) Formato
say('# Auditoria do pacote de planilhas revisadas')
say('')
say(`Pacote: \`${REV}\` · originais: \`${ORIG}\` · semente do sorteio: ${SEED}`)
say('')
say('## 1. Formato dos arquivos')
say('')

const FIXED = ['tipo', 'clube', 'jogador', 'id', 'campo', 'situacao', 'valor_provisorio', 'onde_procurar']
const taskFiles = readdirSync(join(REV, 'tarefas')).filter((f) => f.endsWith('-tarefas.csv') && f !== 'TODAS-AS-TAREFAS.csv').sort()
const origTaskFiles = readdirSync(join(ORIG, 'tarefas')).filter((f) => f.endsWith('-tarefas.csv')).sort()
if (taskFiles.join() !== origTaskFiles.join()) problem(`lista de arquivos de tarefas diferente: revisão=${taskFiles.length}, original=${origTaskFiles.length}; só na revisão: ${taskFiles.filter((f) => !origTaskFiles.includes(f)).join(', ') || '-'}; só no original: ${origTaskFiles.filter((f) => !taskFiles.includes(f)).join(', ') || '-'}`)

// Todos os ids das planilhas do projeto.
const known = new Map<string, { kind: 'club' | 'player'; name: string; club: string; league: string }>()
for (const league of REAL_LEAGUES) {
  const clubs = join(ORIG, `${league.id}-clubes.csv`)
  if (!existsSync(clubs)) continue
  for (const r of readSheet(readFileSync(clubs, 'utf8')).rows) known.set(r.id as string, { kind: 'club', name: r.name as string, club: r.name as string, league: league.id })
  for (const suffix of ['jogadores', 'base']) {
    const f = join(ORIG, `${league.id}-${suffix}.csv`)
    if (existsSync(f)) for (const r of readSheet(readFileSync(f, 'utf8')).rows) known.set(r.id as string, { kind: 'player', name: r.name as string, club: r.clubName as string, league: league.id })
  }
}

let totalRows = 0
let changedCells = 0
let fixedColumnChanges = 0
const reviewed: (Row & { orig: Row; league: string })[] = []
const perFile: string[][] = []
for (const f of taskFiles) {
  const rev = load(join(REV, 'tarefas', f))
  const org = existsSync(join(ORIG, 'tarefas', f)) ? load(join(ORIG, 'tarefas', f)) : undefined
  const flags: string[] = []
  if (!rev.bom) flags.push('sem BOM')
  if (rev.delimiter !== ';') flags.push(`separador "${rev.delimiter}"`)
  if (rev.badQuote) flags.push('aspas desbalanceadas')
  if (!org) { problem(`${f}: não existe nos originais`); continue }
  if (rev.header.join('|') !== org.header.join('|')) flags.push(`cabeçalho diferente (${rev.header.join('|')})`)
  if (rev.rows.length !== org.rows.length) flags.push(`${rev.rows.length} linhas (original ${org.rows.length})`)
  const seen = new Set<string>()
  let dup = 0
  let unknownId = 0
  rev.rows.forEach((r, i) => {
    const o = org.rows[i]
    if (!o) return
    totalRows++
    for (const c of FIXED) if (r.cells[c] !== o.cells[c]) (fixedColumnChanges++, problem(`${f} linha ${r.line}: coluna ${c} foi alterada ("${o.cells[c]}" → "${r.cells[c]}")`))
    if ((r.cells.valor_correto ?? '') !== (o.cells.valor_correto ?? '')) changedCells++
    if ((r.cells.feito ?? '') !== (o.cells.feito ?? '')) changedCells++
    const key = `${r.cells.id}|${r.cells.campo}`
    if (seen.has(key)) dup++
    seen.add(key)
    if (!known.has(r.cells.id ?? '')) unknownId++
    reviewed.push({ ...r, orig: o, league: f.replace('-tarefas.csv', '') })
  })
  if (dup) flags.push(`${dup} (id, campo) repetidos`)
  if (unknownId) flags.push(`${unknownId} ids que não existem nas planilhas`)
  perFile.push([f, String(rev.rows.length), rev.delimiter, rev.bom ? 'sim' : 'não', flags.join('; ') || 'ok'])
}
say('| arquivo | linhas | separador | BOM | observações |')
say('|---|---:|:-:|:-:|---|')
for (const r of perFile) say(`| ${r.join(' | ')} |`)
say('')
say(`- Linhas de tarefas conferidas contra o original: **${totalRows}**. Células de \`valor_correto\`/\`feito\` que mudaram: **${changedCells}**.`)
say(`- Alterações em colunas que deveriam ficar intactas (tipo, clube, jogador, id, campo, situação, valor_provisório, onde_procurar): **${fixedColumnChanges}**.`)

// TODAS-AS-TAREFAS
{
  const all = load(join(REV, 'tarefas', 'TODAS-AS-TAREFAS.csv'))
  const mine = new Map(reviewed.map((r) => [`${r.cells.id}|${r.cells.campo}`, r]))
  let diffs = 0
  let missing = 0
  for (const r of all.rows) {
    const m = mine.get(`${r.cells.id}|${r.cells.campo}`)
    if (!m) { missing++; continue }
    if ((m.cells.valor_correto ?? '') !== (r.cells.valor_correto ?? '') || (m.cells.feito ?? '') !== (r.cells.feito ?? '')) diffs++
  }
  say(`- \`TODAS-AS-TAREFAS.csv\`: ${all.rows.length} linhas (individuais: ${reviewed.length}); ${diffs} diferem dos arquivos por liga; ${missing} sem correspondente. (O \`dados:aplicar\` lê só os arquivos por liga; TODAS fica de fora da pasta para não contar em dobro.)`)
  if (diffs) problem(`TODAS-AS-TAREFAS.csv difere de ${diffs} linhas dos arquivos por liga`)
}

// Conferência (força)
const forceRows: Row[] = []
{
  const rev = load(join(REV, 'conferencia', 'top-300-jogadores.csv'))
  const org = load(join(ORIG, 'conferencia', 'top-300-jogadores.csv'))
  const flags: string[] = []
  if (rev.delimiter !== ';') flags.push(`separador "${rev.delimiter}"`)
  if (rev.header.join('|') !== org.header.join('|')) flags.push('cabeçalho diferente')
  if (rev.rows.length !== org.rows.length) flags.push(`${rev.rows.length} linhas (original ${org.rows.length})`)
  let fixed = 0
  rev.rows.forEach((r, i) => {
    const o = org.rows[i]
    if (!o) return
    for (const c of Object.keys(o.cells).filter((k) => k !== 'valor_correto' && k !== 'feito')) if (r.cells[c] !== o.cells[c]) (fixed++, problem(`top-300 linha ${r.line}: coluna ${c} alterada ("${o.cells[c]}" → "${r.cells[c]}")`))
    if ((r.cells.valor_correto ?? '') !== '' || DONE.test(r.cells.feito ?? '')) forceRows.push(r)
  })
  say(`- \`conferencia/top-300-jogadores.csv\`: ${rev.rows.length} linhas, separador \`${rev.delimiter}\`, ${flags.join('; ') || 'cabeçalho e ids iguais ao original'}; colunas fixas alteradas: ${fixed}; linhas preenchidas: **${forceRows.length}**.`)
}

// Pendências restantes
{
  const p = load(join(REV, 'PENDENCIAS-RESTANTES.csv'))
  const open = reviewed.filter((r) => !DONE.test(r.cells.feito ?? '')).length
  say(`- \`PENDENCIAS-RESTANTES.csv\`: ${p.rows.length} linhas; tarefas por liga sem \`feito\`: ${open}; conferência de força sem \`feito\`: ${load(join(REV, 'conferencia', 'top-300-jogadores.csv')).rows.filter((r) => !DONE.test(r.cells.feito ?? '')).length}.`)
}

// Planilhas de clubes/jogadores/base idênticas?
{
  let same = 0
  const diff: string[] = []
  for (const f of readdirSync(REV).filter((x) => /-(clubes|jogadores|base)\.csv$/.test(x))) {
    if (readFileSync(join(REV, f), 'utf8') === readFileSync(join(ORIG, f), 'utf8')) same++
    else diff.push(f)
  }
  say(`- Planilhas de clubes, jogadores e base: ${same} idênticas às do projeto${diff.length ? `; **diferentes: ${diff.join(', ')}**` : ' (nenhuma diferença)'}.`)
  if (diff.length) problem(`planilhas diferentes das originais: ${diff.join(', ')}`)
}

// Elencos
{
  const dir = join(REV, 'elencos-reais')
  const files = readdirSync(dir).filter((f) => f.endsWith('.csv')).sort()
  say(`- \`elencos-reais/\`: ${files.length} arquivos; formato esperado \`jogador;posicao;nascimento;pais;pe;apelido;forca;tirar\`.`)
  for (const f of files) {
    const s = load(join(dir, f))
    const ok = s.header.join(';') === 'jogador;posicao;nascimento;pais;pe;apelido;forca;tirar' && s.delimiter === ';'
    const bad = s.rows.filter((r) => (r.cells.posicao ?? '') !== '' && !(r.cells.posicao ?? '').split(/[|,/;+\s]+/).filter(Boolean).every((t) => parsePosition(t)))
    if (!ok || bad.length) problem(`elencos-reais/${f}: ${!ok ? 'cabeçalho ou separador fora do padrão; ' : ''}${bad.length ? `${bad.length} posições inválidas` : ''}`)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Resultado do dados:aplicar --simular (lido do arquivo gravado pelo comando)
const simFile = opt('simulacao', '')
if (simFile && existsSync(simFile)) {
  const text = readFileSync(simFile, 'utf8')
  const ok = (text.match(/ OK /g) ?? []).length
  const err = (text.match(/ ERRO /g) ?? []).length
  const warn = (text.match(/ AVISO /g) ?? []).length
  const summary = /Resumo:.*$/m.exec(text)?.[0] ?? ''
  say('')
  say('## 2. `dados:aplicar --simular`')
  say('')
  say(`- Linhas **OK: ${ok}** · **ERRO: ${err}** · avisos: ${warn}`)
  say(`- ${summary}`)
}

// ---------------------------------------------------------------------------------------------------------------------
// 3) O que mudaria
say('')
say('## 3. O que mudaria')
say('')

const done = reviewed.filter((r) => DONE.test(r.cells.feito ?? ''))
const campoOf = (r: Row): string => norm(r.cells.campo ?? '')
const byCampo = new Map<string, number>()
for (const r of done) byCampo.set(campoOf(r), (byCampo.get(campoOf(r)) ?? 0) + 1)

interface Change { row: Row; campo: string; before: string; after: string; changed: boolean; note?: string }
const changes: Change[] = []
const redFlags: string[] = []
for (const r of done) {
  const campo = campoOf(r)
  const result = campo === 'elenco' ? undefined : interpretTask(r.cells.campo ?? '', r.cells.valor_correto ?? '')
  if (campo === 'elenco') { changes.push({ row: r, campo, before: '', after: '(elenco feito à mão)', changed: true }); continue }
  if (!result?.ok) continue
  const after = result.entries.map((e) => e.value).join(' ')
  let before = r.cells.valor_provisorio ?? ''
  if (campo === 'posicao') before = parsePosition(before) ?? before
  const changed = campo === 'posicao' ? result.entries[0]?.value !== before || result.entries.length > 1 : norm(before) !== norm(after)
  changes.push({ row: r, campo, before, after, changed })
  if (campo === 'posicao') {
    const p = result.entries[0]?.value ?? ''
    if (before && ((before === 'GK') !== (p === 'GK'))) redFlags.push(`${r.cells.clube} · ${r.cells.jogador}: ${before} → ${after} (goleiro ↔ jogador de linha) [${r.cells.id}]`)
  }
  if (campo === 'capacidade' && result.entries[0]) {
    const n = Number(result.entries[0].value)
    const was = Number(before.replace(/\D/g, ''))
    // Valor provisório abaixo de 500 é lixo do Wikidata (ex.: "20"), não uma capacidade; trocar por um estádio de verdade não é alerta.
    if (was >= 500 && (n / was > 2 || n / was < 0.5)) redFlags.push(`${r.cells.clube}: capacidade ${was} → ${n} (mais que o dobro/metade) [${r.cells.id}]`)
    if (n < 3000 || n > 100000) redFlags.push(`${r.cells.clube}: capacidade ${n} fora do comum (confira) [${r.cells.id}]`)
  }
  if ((campo === 'cor 1' || campo === 'cor 2') && result.entries[0]) {
    const mine = result.entries[0].value
    const otherCampo = campo === 'cor 1' ? 'cor 2' : 'cor 1'
    const other = done.find((d) => d.cells.id === r.cells.id && campoOf(d) === otherCampo)
    if (other && interpretTask(other.cells.campo ?? '', other.cells.valor_correto ?? '') && mine === (interpretTask(other.cells.campo ?? '', other.cells.valor_correto ?? '') as { entries: { value: string }[] }).entries[0]?.value) redFlags.push(`${r.cells.clube}: as duas cores ficaram iguais (${mine}) [${r.cells.id}]`)
  }
}
const count = (campo: string, onlyChanged = false): number => changes.filter((c) => c.campo === campo && (!onlyChanged || c.changed)).length
say('| tipo | linhas feitas | mudam o valor atual | confirmam o valor atual |')
say('|---|---:|---:|---:|')
for (const [label, key] of [['Posição', 'posicao'], ['Cor 1', 'cor 1'], ['Cor 2', 'cor 2'], ['Cores (par)', 'cores'], ['Capacidade', 'capacidade'], ['Cidade', 'cidade'], ['Estádio', 'estadio'], ['Elenco (à mão)', 'elenco']] as const) {
  const n = count(key)
  if (n) say(`| ${label} | ${n} | ${count(key, true)} | ${n - count(key, true)} |`)
}
const other = [...byCampo].filter(([k]) => !['posicao', 'cor 1', 'cor 2', 'cores', 'capacidade', 'cidade', 'estadio', 'elenco'].includes(k))
for (const [k, n] of other) say(`| ${k} | ${n} | ? | ? |`)

// posição: tipos de mudança
const posChanges = changes.filter((c) => c.campo === 'posicao')
const sector = (p: string): string => (p === 'GK' ? 'goleiro' : ['CB', 'RB', 'LB'].includes(p) ? 'defesa' : ['DM', 'CM', 'AM'].includes(p) ? 'meio' : ['RW', 'LW', 'ST'].includes(p) ? 'ataque' : '?')
const withSecondary = posChanges.filter((c) => c.after.includes(' ')).length
const sectorChanged = posChanges.filter((c) => c.changed && sector(c.before) !== sector(c.after.split(' ')[0] ?? ''))
say('')
say(`- Posições: ${posChanges.length} feitas; a principal muda em **${posChanges.filter((c) => c.before !== c.after.split(' ')[0]).length}**; **${withSecondary}** trazem posição secundária; **${sectorChanged.length}** mudam de setor (defesa/meio/ataque).`)
const transitions = new Map<string, number>()
for (const c of posChanges) if (c.before !== c.after.split(' ')[0]) transitions.set(`${c.before}→${c.after.split(' ')[0]}`, (transitions.get(`${c.before}→${c.after.split(' ')[0]}`) ?? 0) + 1)
say(`- Trocas mais comuns da posição principal: ${[...transitions].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} (${n})`).join(', ')}.`)

// força
{
  const deltas: { row: Row; before: number; after: number }[] = []
  for (const r of forceRows) {
    if (!DONE.test(r.cells.feito ?? '')) continue
    const before = Number(r.cells.valor_provisorio)
    const after = Number((r.cells.valor_correto ?? '').replace(',', '.'))
    if (Number.isFinite(before) && Number.isFinite(after)) deltas.push({ row: r, before, after })
  }
  const abs = deltas.map((d) => Math.abs(d.after - d.before))
  const mean = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
  say(`- Força: **${deltas.length}** ajustes (de ${load(join(REV, 'conferencia', 'top-300-jogadores.csv')).rows.length} jogadores do top 300); variação média ${mean(deltas.map((d) => d.after - d.before)).toFixed(2)}, média do valor absoluto ${mean(abs).toFixed(2)}, maior ${Math.max(0, ...abs)}; para cima: ${deltas.filter((d) => d.after > d.before).length}, para baixo: ${deltas.filter((d) => d.after < d.before).length}, sem mudança: ${deltas.filter((d) => d.after === d.before).length}.`)
  const big = deltas.filter((d) => Math.abs(d.after - d.before) >= 5)
  if (big.length) say(`- Ajustes de força de 5 pontos ou mais: ${big.map((d) => `${d.row.cells.jogador} ${d.before}→${d.after}`).join('; ')}.`)
  if (deltas.length > 5 && new Set(deltas.map((d) => d.after - d.before)).size === 1) redFlags.push(`Os ${deltas.length} ajustes de força têm exatamente a mesma variação (${(deltas[0] as { after: number; before: number }).after - (deltas[0] as { after: number; before: number }).before}): parece ajuste mecânico de distribuição, não conferência jogador a jogador`)
  for (const d of deltas) changes.push({ row: d.row, campo: 'forca', before: String(d.before), after: String(d.after), changed: d.before !== d.after })
}

say('')
say('### Sinais de alerta automáticos')
say('')
if (redFlags.length === 0) say('Nenhum (goleiro ↔ linha, capacidade fora do comum, cores repetidas).')
else for (const f of redFlags) say(`- ${f}`)

// ---------------------------------------------------------------------------------------------------------------------
// 4) Amostras com link
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(SEED)
function sample<T>(list: readonly T[], n: number): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
  }
  return copy.slice(0, n)
}
const posSample = sample(changes.filter((c) => c.campo === 'posicao'), 30)
const otherSample = sample(changes.filter((c) => !['posicao', 'elenco'].includes(c.campo)), 30)

const fetcher = new Fetcher({ userAgent: 'MeuManagerDados/1.0 (auditoria das planilhas revisadas; projeto pessoal, sem e-mail) node', cacheDir: join(OUT, '.cache'), refresh: false, pauseMs: 400 })
const qids = [...new Set([...posSample, ...otherSample].map((c) => (c.row.cells.id ?? '').replace(/^wd-/, '')).filter((q) => /^Q\d+$/.test(q)))]
const wiki = new Map<string, { en?: string; pt?: string; es?: string; any?: string }>()
for (let i = 0; i < qids.length; i += 40) {
  const batch = qids.slice(i, i + 40)
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=sitelinks&format=json`
  const res = await fetcher.getJson<{ entities: Record<string, { sitelinks?: Record<string, { title: string }> }> }>(url)
  for (const q of batch) {
    const s = res.entities[q]?.sitelinks ?? {}
    const link = (site: string, lang: string): string | undefined => (s[site] ? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(s[site].title.replace(/ /g, '_'))}` : undefined)
    const en = link('enwiki', 'en')
    const pt = link('ptwiki', 'pt')
    const es = link('eswiki', 'es')
    const anyKey = Object.keys(s).find((k) => /wiki$/.test(k) && !['commonswiki', 'specieswiki', 'metawiki', 'wikidatawiki'].includes(k))
    wiki.set(q, { ...(en ? { en } : {}), ...(pt ? { pt } : {}), ...(es ? { es } : {}), ...(anyKey && s[anyKey] ? { any: `https://${anyKey.replace(/wiki$/, '').replace(/_/g, '-')}.wikipedia.org/wiki/${encodeURIComponent(s[anyKey].title.replace(/ /g, '_'))}` } : {}) })
  }
}
const linkOf = (id: string): string => {
  const q = id.replace(/^wd-/, '')
  const w = wiki.get(q)
  const wp = w?.en ?? w?.pt ?? w?.es ?? w?.any
  return `${wp ? `[Wikipedia](${wp})` : 'sem artigo'} · [Wikidata](https://www.wikidata.org/wiki/${q})`
}
const cell = (t: string): string => t.replace(/\|/g, '/').replace(/\n/g, ' ')

say('')
say(`## 4. Amostra aleatória de 30 posições (semente ${SEED}; sorteio uniforme entre as ${posChanges.length} feitas)`)
say('')
say('| # | clube | jogador | antes | depois | muda? | links |')
say('|--:|---|---|:-:|:-:|:-:|---|')
posSample.forEach((c, i) => say(`| ${i + 1} | ${cell(c.row.cells.clube ?? '')} | ${cell(c.row.cells.jogador ?? '')} | ${c.before} | ${c.after} | ${c.changed ? '**sim**' : 'não'} | ${linkOf(c.row.cells.id ?? '')} |`))
say('')
say(`## 5. Amostra aleatória de 30 de outros tipos (cores, capacidade, cidade, estádio, força; ${changes.filter((c) => !['posicao', 'elenco'].includes(c.campo)).length} possíveis)`)
say('')
say('| # | tipo | clube / jogador | antes | depois | muda? | links |')
say('|--:|---|---|:-:|:-:|:-:|---|')
otherSample.forEach((c, i) => say(`| ${i + 1} | ${c.campo} | ${cell([c.row.cells.clube, c.row.cells.jogador].filter(Boolean).join(' · '))} | ${cell(c.before) || '—'} | ${cell(c.after)} | ${c.changed ? '**sim**' : 'não'} | ${linkOf(c.row.cells.id ?? '')} |`))

// ---------------------------------------------------------------------------------------------------------------------
say('')
say('## Problemas de formato encontrados')
say('')
if (problems.length === 0) say('Nenhum.')
else for (const p of problems.slice(0, 80)) say(`- ${p}`)
if (problems.length > 80) say(`- … e mais ${problems.length - 80}`)

writeFileSync(join(OUT, '1-formato-e-mudancas.md'), `${out.join('\n')}\n`)
console.log(out.join('\n'))
