/** Relatório do que ficou faltando ou duvidoso, lista de revisão (CSV) e créditos das fontes. */
import { toCsv } from '../../src/data/package/edit/csv'
import type { Issue, IssueKind, LeagueSheets } from './assemble'

export interface RunInfo {
  /** Data da execução, `AAAA-MM-DD`. */
  date: string
  /** Páginas da Wikipedia usadas (título e endereço), para os créditos. */
  articles: { title: string; url: string }[]
  /** Temporada achada para cada liga (e se foi a anterior). */
  seasons: { league: string; title: string; previous: boolean }[]
  /** Uso da Wikipedia no idioma do país, por liga. */
  local: { league: string; clubs: number; added: number; enriched: number }[]
  /** Validação do rascunho do pacote (ligas, clubes e jogadores juntos). */
  validation?: { errors: number; warnings: number; byCode: Record<string, number>; rejected: number }
  network: number
  cached: number
}

const KIND_TEXT: Record<IssueKind, string> = {
  'club-count': 'Número de clubes diferente do número real da liga',
  'club-missing-season': 'Temporada da liga não encontrada',
  'squad-missing': 'Clube sem elenco na Wikipedia',
  'squad-small': 'Elenco pequeno demais (menos de 18)',
  'player-to-academy': 'Jovem que passou para a base (elenco com mais de 30)',
  'player-freed': 'Jogador que ficou livre no mercado (elenco com mais de 30)',
  'player-generated': 'Jogador gerado para completar o elenco (trocar por um real)',
  'squad-generated': 'Clube com elenco completado por jogadores gerados',
  'squad-large': 'Elenco grande demais (mais de 30)',
  'club-no-colors': 'Cores ausentes ou incompletas',
  'club-no-stadium': 'Clube sem estádio',
  'club-no-capacity': 'Estádio sem capacidade',
  'club-bad-capacity': 'Capacidade fora do que o jogo aceita',
  'club-no-city': 'Clube sem cidade',
  'player-no-birthdate': 'Data de nascimento estimada pela média de idade do elenco (sem data em nenhuma fonte)',
  'player-birth-imprecise': 'Data de nascimento estimada pelo ano (a fonte só tem o ano)',
  'player-position': 'Posição incerta (escolhida a mais provável)',
  'player-nationality': 'Nacionalidade incerta',
  'player-no-wikidata': 'Jogador sem artigo na Wikipedia (só nome, país e setor)',
  'player-duplicate': 'Jogador em dois elencos (mantido o primeiro)',
}

const ORDER = Object.keys(KIND_TEXT) as IssueKind[]

export function reviewCsv(issues: readonly Issue[]): string {
  const rows = [...issues]
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.league.localeCompare(b.league) || (a.club ?? '').localeCompare(b.club ?? '') || (a.player ?? '').localeCompare(b.player ?? ''))
    .map((i) => [i.league, i.club, i.player, i.id, KIND_TEXT[i.kind], i.detail])
  return toCsv(['liga', 'clube', 'jogador', 'id', 'tipo', 'detalhe'], rows)
}

const PREVIEW = 20

export function buildReport(sheets: readonly LeagueSheets[], run: RunInfo): string {
  const lines: string[] = []
  const all = sheets.flatMap((s) => s.issues)
  lines.push('# Planilha inicial dos elencos reais — relatório', '')
  lines.push(`Gerado em ${run.date}. Consultas à rede: ${run.network}; respostas reaproveitadas do cache: ${run.cached}.`, '')
  lines.push('Fontes: clubes e jogadores do **Wikidata** (domínio público); lista dos clubes da temporada e elencos atuais da **Wikipedia** (CC BY-SA 4.0; créditos em `creditos.txt`). Atributos em branco: o jogo gera.', '')
  lines.push('A **reputação** dos clubes é provisória: ordem da fama do clube (número de páginas do Wikidata) sobre a escada de reputação da liga no mundo fictício. Revise antes de usar.', '')

  lines.push('## Resumo por liga', '', '| Liga | Clubes | Número real | Jogadores | Menor elenco | Maior elenco | Datas estimadas | Posições a revisar | Wikipedia local (clubes / jogadores acrescentados) | Avisos |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const s of sheets) {
    const season = run.seasons.find((x) => x.league === s.leagueId)
    const local = run.local.find((x) => x.league === s.leagueId)
    const note = season ? (season.previous ? ` (temporada anterior: ${season.title})` : '') : ''
    lines.push(`| ${s.leagueId}${note} | ${s.stats.clubs} | ${s.stats.expected} | ${s.stats.players} | ${s.stats.smallest} | ${s.stats.largest} | ${s.stats.estimated} | ${s.stats.reviewPositions} | ${local ? `${local.clubs} / ${local.added}` : '—'} | ${s.issues.length} |`)
  }
  const sum = (pick: (s: LeagueSheets) => number): number => sheets.reduce((n, s) => n + pick(s), 0)
  lines.push('', `Total: ${sum((s) => s.stats.clubs)} clubes e ${sum((s) => s.stats.players)} jogadores no elenco principal ou livres, mais ${sum((s) => s.stats.toAcademy)} na base.`, '')

  lines.push('## Ajustes automáticos para o pacote passar na validação', '', '| Liga | Para a base | Livres no mercado | Gerados | Posições distribuídas | Posições a revisar (com artigo) | Clubes com cores do uniforme | Tarefas manuais |', '|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const s of sheets) lines.push(`| ${s.leagueId} | ${s.stats.toAcademy} | ${s.stats.freed} | ${s.stats.generated} | ${s.stats.distributed} | ${s.stats.reviewPositions} | ${s.stats.colorsFromKit} | ${taskRows(s.issues).length} |`)
  lines.push(`| **total** | ${sum((s) => s.stats.toAcademy)} | ${sum((s) => s.stats.freed)} | ${sum((s) => s.stats.generated)} | ${sum((s) => s.stats.distributed)} | ${sum((s) => s.stats.reviewPositions)} | ${sum((s) => s.stats.colorsFromKit)} | ${sum((s) => taskRows(s.issues).length)} |`, '')
  lines.push('Elencos com mais de 30: os jovens de 15 a 19 anos passam para a base (até 15 por clube, os menos conhecidos primeiro); se ainda passar de 30, os menos conhecidos (sem artigo na Wikipedia) ficam livres no mercado. Elencos com menos de 18 são completados com jogadores gerados (coluna `generated`). Posições genéricas da fonte são distribuídas pela necessidade de um time real (goleiros, laterais dos dois lados, zagueiros, volantes, meias, pontas e atacantes); só os jogadores com artigo na Wikipedia ficam marcados para revisão.', '')

  if (run.validation) {
    const v = run.validation
    lines.push('## Validação do rascunho do pacote (`pacote-real.json`)', '', `${v.errors} erros e ${v.warnings} avisos na mesma validação da importação do jogo; ${v.rejected} linhas das planilhas recusadas pelo leitor de CSV.`, '')
    for (const [code, n] of Object.entries(v.byCode).sort((a, b) => b[1] - a[1])) lines.push(`- ${code}: ${n}`)
    lines.push('')
  }

  lines.push('## O que ficou faltando ou duvidoso', '', 'A lista completa, uma linha por caso, está em `revisao.csv`.', '')
  for (const kind of ORDER) {
    const list = all.filter((i) => i.kind === kind)
    if (list.length === 0) continue
    lines.push(`### ${KIND_TEXT[kind]} (${list.length})`, '')
    for (const i of list.slice(0, PREVIEW)) lines.push(`- ${i.league}${i.club ? ` · ${i.club}` : ''}${i.player ? ` · ${i.player}` : ''}: ${i.detail}`)
    if (list.length > PREVIEW) lines.push(`- … e mais ${list.length - PREVIEW} em \`revisao.csv\``)
    lines.push('')
  }
  if (all.length === 0) lines.push('Nada a revisar.', '')

  lines.push('## Como importar no editor', '', '1. Menu › Editor › abra o mundo ampliado (21 ligas) ou um pacote seu.', '2. Aba *Planilhas* › importe primeiro `<liga>-clubes.csv` e depois `<liga>-jogadores.csv` da mesma liga (ligue "Remover o que não está na planilha" para trocar os clubes e jogadores fictícios).', '3. A aba *Problemas* mostra o que ainda falta (data de nascimento em branco, elenco fora de 18 a 30, goleiro).', '')
  return lines.join('\n')
}

export function buildCredits(run: RunInfo): string {
  const lines = [
    'Créditos dos dados',
    '',
    'Estas planilhas foram montadas pelo script tools/buildRealSheets.ts a partir de:',
    '',
    '- Wikidata (https://www.wikidata.org), dados em domínio público (CC0).',
    '- Wikipedia em inglês (https://en.wikipedia.org), texto sob a licença Creative Commons Atribuição-CompartilhaIgual 4.0 (CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/). Dos artigos foram lidos apenas os nomes das tabelas de elenco e das listas de clubes da temporada; o histórico de autores de cada artigo está na própria Wikipedia.',
    '',
    'Este material é independente e não tem ligação com clubes, jogadores, ligas ou federações. Escudos, fotos e logotipos não foram baixados.',
    '',
    `Dados coletados em ${run.date}. Artigos da Wikipedia consultados (${run.articles.length}):`,
    '',
    ...run.articles.map((a) => `- ${a.title} — ${a.url}`),
  ]
  return `${lines.join('\n')}\n`
}

/** Tipos de aviso que viram tarefa manual, com o campo e onde procurar. */
const TASK_KINDS: Partial<Record<IssueKind, { type: string; where: string }>> = {
  'club-no-colors': { type: 'Clube', where: 'Quadro do clube na Wikipedia, site oficial do clube (cores do uniforme)' },
  'club-no-stadium': { type: 'Clube', where: 'Wikipedia do clube (estádio)' },
  'club-no-city': { type: 'Clube', where: 'Wikipedia do clube (cidade)' },
  'club-no-capacity': { type: 'Clube', where: 'Wikipedia do estádio (capacidade)' },
  'club-bad-capacity': { type: 'Clube', where: 'Wikipedia do estádio (capacidade entre 500 e 300.000)' },
  'squad-generated': { type: 'Elenco', where: 'Wikipedia do clube, site oficial (elenco atual); ver revisao.csv para os jogadores gerados' },
  'squad-missing': { type: 'Elenco', where: 'Wikipedia do clube, site oficial (elenco atual)' },
  'player-position': { type: 'Jogador conhecido', where: 'Wikipedia do jogador, site do clube (posição exata)' },
}

/** Quantos jogadores de posição incerta entram na lista de tarefas de cada clube: os mais conhecidos (mais páginas no Wikidata). */
export const POSITION_TASKS_PER_CLUB = 8

export function taskRows(issues: readonly Issue[]): (string | undefined)[][] {
  const famous = new Set<Issue>()
  const byClub = new Map<string, Issue[]>()
  for (const i of issues) if (i.kind === 'player-position') (byClub.get(i.club ?? '') ?? byClub.set(i.club ?? '', []).get(i.club ?? '') ?? []).push(i)
  for (const list of byClub.values()) for (const i of [...list].sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0) || (a.player ?? '').localeCompare(b.player ?? '')).slice(0, POSITION_TASKS_PER_CLUB)) famous.add(i)
  return issues
    .filter((i) => TASK_KINDS[i.kind] && (i.kind !== 'player-position' || famous.has(i)) && !(i.kind === 'squad-missing' && issues.some((x) => x.kind === 'squad-generated' && x.id === i.id)))
    .sort((a, b) => (TASK_KINDS[a.kind]?.type ?? '').localeCompare(TASK_KINDS[b.kind]?.type ?? '') || (a.club ?? '').localeCompare(b.club ?? '') || (a.player ?? '').localeCompare(b.player ?? ''))
    .map((i) => [TASK_KINDS[i.kind]?.type, i.club, i.player, i.id, i.field ?? '', i.detail, i.current, '', TASK_KINDS[i.kind]?.where, ''])
}

/** Planilha de tarefas manuais de uma liga (para dividir entre sócios): o que não deu para resolver sozinho. */
export function tasksCsv(issues: readonly Issue[]): string {
  return toCsv(['tipo', 'clube', 'jogador', 'id', 'campo', 'situacao', 'valor_provisorio', 'valor_correto', 'onde_procurar', 'feito'], taskRows(issues))
}
