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
  lines.push('', `Total: ${sheets.reduce((n, s) => n + s.stats.clubs, 0)} clubes e ${sheets.reduce((n, s) => n + s.stats.players, 0)} jogadores.`, '')

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
