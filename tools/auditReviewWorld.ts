/**
 * Auditoria dos elencos reais e das ligações de identidade (itens 3 e 4 do pedido de conferência do pacote revisado).
 *
 *   --modo elencos     cada jogador dos 11 elencos revisados é procurado na Wikipedia e no Wikidata e confrontado com o clube.
 *   --modo identidade  procura no mundo todo jogadores cujo item do Wikidata não é uma pessoa, cujo nome vem de um rótulo estranho
 *                      (vandalismo do Wikidata no dia da coleta) ou cujo nome não combina com o que a Wikipedia mostra.
 *
 * Lê as respostas já guardadas em `dados-reais/planilhas/.cache` (sem rede) e usa a rede só para as consultas novas, guardadas em
 * `--relatorio/.cache`. Não altera as planilhas.
 *
 * Uso: node tools/run.mjs auditReviewWorld --modo elencos|identidade --revisao "<pasta planilhas extraída>" [--data 2026-10-20]
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Collected } from './realdata/pipeline'
import { collectLeague } from './realdata/pipeline'
import { Fetcher } from './realdata/http'
import { REAL_LEAGUES } from './realdata/leagues'
import { readSheet } from './realdata/corrections'
import { readSquadSheet, slug } from './realdata/clubSquads'
import { sparql } from './realdata/wikidata'
import { fetchPages } from './realdata/wikipedia'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const MODE = opt('modo', 'elencos')
const REV = opt('revisao', '')
const ORIG = opt('original', 'dados-reais/planilhas')
const OUT = opt('relatorio', 'dados-reais/revisao-ia-relatorio')
const TODAY = new Date(`${opt('data', '2026-10-20')}T12:00:00`)
mkdirSync(OUT, { recursive: true })

const UA = 'MeuManagerDados/1.0 (auditoria das planilhas revisadas; projeto pessoal, sem e-mail) node'
let misses = 0
// Cache do projeto só para leitura: se faltar uma resposta, não vai à rede (conta como falta).
const offline = new Fetcher({
  userAgent: UA,
  cacheDir: join(ORIG, '.cache'),
  refresh: false,
  pauseMs: 0,
  retryBaseMs: 1,
  fetchImpl: (async () => {
    misses++
    return new Response('{}', { status: 599 })
  }) as typeof fetch,
})
const net = new Fetcher({ userAgent: UA, cacheDir: join(OUT, '.cache'), refresh: false, pauseMs: 350, log: (m) => console.log(m) })

const strip = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (t: string): string => strip(t).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = (t: string): string[] => norm(t).split(' ').filter((w) => w.length >= 2)
const shareToken = (a: string, b: string): boolean => {
  const tb = new Set(tokens(b))
  return tokens(a).some((w) => tb.has(w))
}

async function collectAll(ids: readonly string[]): Promise<Map<string, Collected>> {
  const result = new Map<string, Collected>()
  for (const league of REAL_LEAGUES.filter((l) => ids.length === 0 || ids.includes(l.id))) {
    try {
      result.set(league.id, await collectLeague(league, { fetcher: offline, today: TODAY, log: () => undefined }))
    } catch (error) {
      console.error(`${league.id}: falha lendo o cache (${String(error).slice(0, 160)})`)
    }
  }
  return result
}

const out: string[] = []
const say = (line = ''): void => void out.push(line)
const cell = (t: string | number | undefined): string => String(t ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')
const wd = (qid: string): string => `[${qid}](https://www.wikidata.org/wiki/${qid})`

const API = 'https://www.wikidata.org/w/api.php'
type Claim = { mainsnak?: { datavalue?: { value?: { id?: string } } }; qualifiers?: Record<string, unknown[]> }
interface Entity {
  id: string
  labels?: Record<string, { value: string }>
  descriptions?: Record<string, { value: string }>
  sitelinks?: Record<string, { title: string }>
  claims?: Record<string, Claim[]>
}
async function entities(ids: readonly string[], props: string, languages = 'en|pt|es'): Promise<Map<string, Entity>> {
  const map = new Map<string, Entity>()
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40)
    const res = await net.getJson<{ entities?: Record<string, Entity> }>(`${API}?action=wbgetentities&ids=${batch.join('|')}&props=${props}&languages=${languages}&format=json`)
    for (const [k, v] of Object.entries(res.entities ?? {})) map.set(k, v)
  }
  return map
}
const claimIds = (e: Entity | undefined, prop: string): string[] => (e?.claims?.[prop] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter((x): x is string => !!x)

// ---------------------------------------------------------------------------------------------------------------------
if (MODE === 'elencos') {
  if (!REV) (console.error('Informe --revisao.'), process.exit(1))
  const dir = join(REV, 'elencos-reais')
  const files = readdirSync(dir).filter((f) => f.endsWith('.csv')).sort()
  const leagueIds = [...new Set(files.map((f) => f.split('-').slice(0, 2).join('-')))]
  console.log(`Lendo o cache das ligas ${leagueIds.join(', ')}…`)
  const collected = await collectAll(leagueIds)
  console.log(`Respostas que faltaram no cache: ${misses}`)

  say('# 3. Conferência automática dos 11 elencos reais')
  say('')
  say('Fontes consultadas por jogador: (a) tabela de elenco do artigo do clube na Wikipedia (inglês e idioma local, lida no dia da coleta, 20/10/2026); (b) busca no Wikidata pelo nome, conferindo se é pessoa, se tem a ocupação de futebolista e se o item liga o jogador ao clube (propriedade "membro do time", atual = sem data de fim); (c) busca de texto na Wikipedia (inglês e idioma local) pelo nome com o clube; (d) o nome citado no texto do artigo do clube.')
  say('')
  say('Legenda: ✅ confirmado (tabela da Wikipedia do clube, ou futebolista no Wikidata ligado ao clube sem data de fim) · 🟡 parcial (existe como futebolista/citado, mas sem ligação atual com o clube) · ❌ não encontrado em nenhuma fonte.')
  say('')
  const summary: string[][] = []
  const detail: string[] = []
  for (const file of files) {
    const leagueId = file.split('-').slice(0, 2).join('-')
    const clubSlug = file.replace(`${leagueId}-`, '').replace(/\.csv$/, '')
    const league = REAL_LEAGUES.find((l) => l.id === leagueId)
    const clubsRows = readSheet(readFileSync(join(ORIG, `${leagueId}-clubes.csv`), 'utf8')).rows
    const club = clubsRows.find((c) => slug(c.name ?? '') === clubSlug)
    if (!club || !league) { detail.push(`## ${file}\n\nclube não encontrado nas planilhas\n`); continue }
    const clubQid = (club.id ?? '').replace(/^wd-/, '')
    const lang = league.wikiLang
    const players = readSheet(readFileSync(join(ORIG, `${leagueId}-jogadores.csv`), 'utf8')).rows.filter((p) => p.club === club.id)
    const squadSheet = readSquadSheet(readFileSync(join(dir, file), 'utf8'))
    if ('header' in squadSheet) { detail.push(`## ${file}\n\ncabeçalho inválido\n`); continue }
    const input = collected.get(leagueId)?.input
    const entries = input?.squads.get(clubQid)?.entries ?? []
    const info = input?.clubs.find((c) => c.info.qid === clubQid)
    // Texto do artigo do clube (cache), para ver se o nome é citado.
    let articleText = ''
    if (info?.articleTitle) {
      const page = (await fetchPages(net, [info.articleTitle], { content: true })).get(info.articleTitle)
      articleText = norm(page?.wikitext ?? '')
    }
    const localInfo = info?.info.localTitle
    if (lang && localInfo) {
      const page = (await fetchPages(net, [localInfo], { content: true, lang })).get(localInfo)
      articleText += ` ${norm(page?.wikitext ?? '')}`
    }

    const wanted = squadSheet.players.filter((p) => !p.remove)
    const removed = squadSheet.players.filter((p) => p.remove)
    interface Result { name: string; position: string; origin: string; onTable: boolean; verdict: '✅' | '🟡' | '❌'; why: string[]; link: string }
    const results: Result[] = []
    for (const p of wanted) {
      const key = norm(p.name)
      const existing = players.find((x) => norm(x.name ?? '') === key || norm(x.nickname ?? '') === key)
      const origin = existing ? ((existing.generated ?? '') === 'sim' ? 'gerado pelo script' : 'da Wikipedia (script)') : 'incluído na revisão'
      const onTable = entries.some((e) => norm(e.display) === key || (e.title && norm(e.title) === key) || (shareToken(e.display, p.name) && tokens(p.name).length > 1 && tokens(p.name).every((w) => tokens(e.display).includes(w))))
      const why: string[] = []
      let linkTxt = ''
      let verdict: Result['verdict'] = '❌'
      if (onTable) { verdict = '✅'; why.push('está na tabela de elenco da Wikipedia do clube') }
      // Wikidata
      const wanted2 = p.name
      const search = await net.getJson<{ search?: { id: string; label?: string; description?: string }[] }>(`${API}?action=wbsearchentities&search=${encodeURIComponent(wanted2)}&language=en&uselang=en&type=item&limit=6&format=json`)
      const cand = (search.search ?? []).map((s) => s.id)
      const ents = await entities(cand, 'labels|descriptions|claims|sitelinks')
      let best: { id: string; score: number; text: string; wiki?: string } | undefined
      for (const id of cand) {
        const e = ents.get(id)
        if (!e) continue
        const labels = Object.values(e.labels ?? {}).map((l) => l.value)
        const nameMatch = labels.some((l) => norm(l) === key) || (labels.some((l) => tokens(l).length > 0 && tokens(p.name).every((w) => tokens(l).includes(w))))
        if (!nameMatch) continue
        const human = claimIds(e, 'P31').includes('Q5')
        const footballer = claimIds(e, 'P106').includes('Q937857')
        const teams = (e.claims?.P54 ?? []).filter((c) => c.mainsnak?.datavalue?.value?.id === clubQid)
        const current = teams.some((c) => !c.qualifiers?.P582)
        const score = (human ? 1 : 0) + (footballer ? 2 : 0) + (teams.length ? 2 : 0) + (current ? 4 : 0)
        const text = `${human ? 'pessoa' : 'não é pessoa'}, ${footballer ? 'futebolista' : 'sem ocupação de futebolista'}, ${teams.length ? (current ? 'membro atual do clube' : 'já passou pelo clube') : 'sem ligação com o clube'}`
        const s = e.sitelinks ?? {}
        const sl = s.enwiki ?? s[`${lang}wiki`] ?? s.eswiki ?? s.ptwiki
        const wiki = sl ? `https://${s.enwiki ? 'en' : lang && s[`${lang}wiki`] ? lang : s.eswiki ? 'es' : 'pt'}.wikipedia.org/wiki/${encodeURIComponent(sl.title.replace(/ /g, '_'))}` : undefined
        if (!best || score > best.score) best = { id, score, text, ...(wiki ? { wiki } : {}) }
      }
      if (best) {
        why.push(`Wikidata ${best.id}: ${best.text}`)
        linkTxt = `${best.wiki ? `[Wikipedia](${best.wiki}) · ` : ''}${wd(best.id)}`
        if (best.score >= 7) verdict = '✅'
        else if (best.score >= 3 && verdict !== '✅') verdict = '🟡'
        else if (best.score >= 1 && verdict === '❌') verdict = '🟡'
      } else why.push('nenhum item do Wikidata com esse nome')
      // Texto no artigo do clube
      const surname = tokens(p.name).slice(-1)[0] ?? ''
      const inArticle = articleText.includes(key) || (surname.length >= 4 && tokens(p.name).length > 1 && articleText.includes(` ${surname} `) && tokens(p.name).slice(0, 1).every((w) => articleText.includes(w)))
      if (inArticle) { why.push('nome citado no artigo do clube'); if (verdict === '❌') verdict = '🟡' }
      // Busca de texto na Wikipedia
      for (const wl of [...new Set(['en', lang].filter(Boolean))] as string[]) {
        const q = `"${p.name}" ${club.name ?? ''}`
        const r = await net.getJson<{ query?: { search?: { title: string; snippet: string }[]; searchinfo?: { totalhits?: number } } }>(`https://${wl}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&format=json`)
        const hit = (r.query?.search ?? []).find((s) => shareToken(s.title, p.name) && tokens(p.name).filter((w) => norm(s.title).includes(w)).length >= Math.min(2, tokens(p.name).length))
        if (hit) { why.push(`busca ${wl}.wikipedia: "${hit.title}"`); if (verdict === '❌') verdict = '🟡'; if (!linkTxt) linkTxt = `[${wl}.wikipedia](https://${wl}.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))})` }
      }
      if (!why.some((w) => !w.startsWith('nenhum'))) why.push('não achado em nenhuma fonte')
      results.push({ name: p.name, position: p.position, origin, onTable, verdict, why, link: linkTxt })
    }
    const count = (v: string): number => results.filter((r) => r.verdict === v).length
    summary.push([file, club.name ?? '', String(wanted.length), String(count('✅')), String(count('🟡')), String(count('❌')), String(removed.length), String(results.filter((r) => r.origin === 'incluído na revisão').length)])
    detail.push(`## ${club.name} (${file})`)
    detail.push('')
    detail.push(`Elenco do arquivo: ${wanted.length} jogadores${removed.length ? ` · para tirar (\`tirar=sim\`): ${removed.map((r) => r.name).join(', ')}` : ''} · tabela da Wikipedia lida: ${entries.length} linhas · ${count('✅')} ✅ / ${count('🟡')} 🟡 / ${count('❌')} ❌`)
    detail.push('')
    detail.push('| jogador | pos. | origem | veredito | o que achei | links |')
    detail.push('|---|:-:|---|:-:|---|---|')
    for (const r of results.sort((a, b) => '❌🟡✅'.indexOf(a.verdict) - '❌🟡✅'.indexOf(b.verdict))) detail.push(`| ${cell(r.name)} | ${r.position} | ${r.origin} | ${r.verdict} | ${cell(r.why.join('; '))} | ${r.link} |`)
    detail.push('')
    const missingFromFile = players.filter((x) => (x.generated ?? '') !== 'sim' && !wanted.some((p) => norm(p.name) === norm(x.name ?? '') || norm(p.name) === norm(x.nickname ?? '')))
    if (missingFromFile.length) detail.push(`Jogadores reais que estavam na planilha do projeto e **não aparecem** no arquivo revisado: ${missingFromFile.map((m) => m.name).join(', ')}\n`)
    for (const r of removed) {
      const e = players.find((x) => norm(x.name ?? '') === norm(r.name))
      detail.push(`- \`tirar=sim\`: **${r.name}** ${e ? `(id \`${e.id}\`, ${(e.generated ?? '') === 'sim' ? 'gerado' : 'da Wikipedia'})` : '(não está nas planilhas do projeto)'}`)
    }
    detail.push('')
    console.log(`${file}: ${count('✅')} ✅ ${count('🟡')} 🟡 ${count('❌')} ❌`)
  }
  say('| arquivo | clube | jogadores | ✅ | 🟡 | ❌ | tirar | incluídos pela revisão |')
  say('|---|---|--:|--:|--:|--:|--:|--:|')
  for (const s of summary) say(`| ${s.join(' | ')} |`)
  say('')
  out.push(...detail)
  writeFileSync(join(OUT, '3-elencos.md'), `${out.join('\n')}\n`)
}

// ---------------------------------------------------------------------------------------------------------------------
if (MODE === 'identidade') {
  console.log('Lendo o cache de todas as ligas…')
  const collected = await collectAll([])
  console.log(`Ligas lidas: ${collected.size}; respostas que faltaram no cache: ${misses}`)

  interface Item { league: string; club: string; qid: string; id: string; display: string; title: string | undefined; label: string | undefined; sitelinks: number; birth: string | undefined; hasPerson: boolean; nat: string[] }
  const items: Item[] = []
  for (const [leagueId, c] of collected) {
    for (const club of c.input.clubs) {
      for (const e of c.input.squads.get(club.info.qid)?.entries ?? []) {
        const key = e.title ? (e.lang && e.lang !== 'en' ? `${e.lang}:${e.title}` : e.title) : undefined
        const qid = key ? c.input.articleToQid.get(key) : undefined
        if (!qid) continue
        const p = c.input.players.get(qid)
        items.push({ league: leagueId, club: club.displayName ?? club.info.name, qid, id: `wd-${qid}`, display: e.display, title: e.title, label: p?.name, sitelinks: p?.sitelinks ?? 0, birth: p?.birthDate ?? (p?.birthYear ? String(p.birthYear) : undefined), hasPerson: !!(p && (p.birthDate || p.birthYear !== undefined || p.nationalities.length || p.positions.length || p.foot)), nat: p?.nationalities ?? [] })
      }
    }
  }
  const uniq = new Map<string, Item>()
  for (const i of items) if (!uniq.has(i.qid)) uniq.set(i.qid, i)
  const list = [...uniq.values()]
  console.log(`${items.length} linhas de elenco com artigo, ${list.length} itens do Wikidata distintos`)

  say('# 4. Ligações de identidade e patrocinadores — varredura do mundo inteiro')
  say('')
  say(`Base: ${collected.size} ligas, ${items.length} linhas de elenco com artigo na Wikipedia, ${list.length} itens distintos do Wikidata (coleta de 20/10/2026, lida do cache).`)
  say('')

  // A) Item que não é pessoa / não é futebolista (consulta SPARQL em lotes)
  const kinds = new Map<string, { kinds: Set<string>; human: boolean; foot: boolean }>()
  const ids = list.map((i) => i.qid)
  for (let i = 0; i < ids.length; i += 120) {
    const batch = ids.slice(i, i + 120)
    const q = `SELECT ?p ?kind ?foot WHERE { VALUES ?p { ${batch.map((x) => `wd:${x}`).join(' ')} } OPTIONAL { ?p wdt:P31 ?k . ?k rdfs:label ?kind . FILTER(LANG(?kind) = "en") } OPTIONAL { ?p wdt:P106 wd:Q937857 . BIND("yes" AS ?foot) } }`
    const rows = await sparql(net, q)
    for (const r of rows) {
      const id = (r.p as string).slice((r.p as string).lastIndexOf('/') + 1)
      const k = kinds.get(id) ?? { kinds: new Set<string>(), human: false, foot: false }
      if (r.kind) { k.kinds.add(r.kind); if (r.kind === 'human') k.human = true }
      if (r.foot) k.foot = true
      kinds.set(id, k)
    }
    if ((i / 120) % 10 === 0) console.log(`  SPARQL ${Math.min(i + 120, ids.length)}/${ids.length}`)
  }
  const notHuman = list.filter((i) => !(kinds.get(i.qid)?.human))
  const humanNotFoot = list.filter((i) => kinds.get(i.qid)?.human && !kinds.get(i.qid)?.foot)

  say(`## A. Itens que **não são pessoas** (sem "instância de: ser humano" no Wikidata): ${notHuman.length}`)
  say('')
  say('Estes são o tipo do Claus-7, OneFit e Training Deportes (patrocinadores listados como jogadores). **Todos os que estão aqui entraram como jogadores nas planilhas se o filtro antigo não os pegou.**')
  say('')
  say('| liga | clube | nome na tabela | item | é um(a) | páginas | dados de pessoa | filtro antigo pegaria? |')
  say('|---|---|---|---|---|--:|:-:|:-:|')
  const NOT_PERSON_SITELINKS = 12
  for (const i of notHuman.sort((a, b) => b.sitelinks - a.sitelinks)) {
    const k = [...(kinds.get(i.qid)?.kinds ?? [])].join(', ') || '(sem "instância de")'
    say(`| ${i.league} | ${cell(i.club)} | ${cell(i.display)} | ${wd(i.qid)} | ${cell(k)} | ${i.sitelinks} | ${i.hasPerson ? 'sim' : 'não'} | ${!i.hasPerson && i.sitelinks >= NOT_PERSON_SITELINKS ? 'sim' : 'não'} |`)
  }
  say('')
  say(`Itens que são pessoas mas sem a ocupação "futebolista" no Wikidata: ${humanNotFoot.length} (normal em jogadores pouco documentados; listados só os de nome estranho abaixo).`)
  say('')

  // B) Rótulo do Wikidata mudou desde a coleta?
  const live = await entities(ids, 'labels', 'en|pt|es|fr|de|it|nl')
  const diverge: { i: Item; liveLabel: string }[] = []
  for (const i of list) {
    const labels = Object.values(live.get(i.qid)?.labels ?? {}).map((l) => l.value)
    if (!i.label || labels.length === 0) continue
    if (!labels.some((l) => norm(l) === norm(i.label as string))) diverge.push({ i, liveLabel: labels[0] as string })
  }
  say(`## B. Nome do jogador diferente do rótulo atual do Wikidata: ${diverge.length}`)
  say('')
  say('O nome nas planilhas veio do rótulo do item no dia da coleta. Se hoje o rótulo é outro, o de então pode ter sido vandalizado (ou corrigido depois). Casos assim são o do "Federico Messiano" (rótulo vandalizado em 15/10/2026 e desfeito em 20/10/2026; coleta em 20/10).')
  say('')
  say('| liga | clube | na tabela da Wikipedia | rótulo que entrou na planilha | rótulo hoje | item | páginas |')
  say('|---|---|---|---|---|---|--:|')
  for (const d of diverge.sort((a, b) => b.i.sitelinks - a.i.sitelinks)) say(`| ${d.i.league} | ${cell(d.i.club)} | ${cell(d.i.display)} | **${cell(d.i.label)}** | ${cell(d.liveLabel)} | ${wd(d.i.qid)} | ${d.i.sitelinks} |`)
  say('')

  // C) Nome sem nenhuma palavra em comum com o que a Wikipedia mostra
  const mismatch = list.filter((i) => i.label && !shareToken(i.label, i.display) && !(i.title && shareToken(i.label, i.title)))
  say(`## C. Rótulo sem nenhuma palavra em comum com o nome da tabela nem com o título do artigo: ${mismatch.length}`)
  say('')
  say('| liga | clube | tabela | título do artigo | rótulo | item | páginas | rótulo hoje | também em B |')
  say('|---|---|---|---|---|---|--:|---|:-:|')
  for (const i of mismatch.sort((a, b) => b.sitelinks - a.sitelinks)) {
    const liveLabel = Object.values(live.get(i.qid)?.labels ?? {})[0]?.value ?? ''
    say(`| ${i.league} | ${cell(i.club)} | ${cell(i.display)} | ${cell(i.title)} | **${cell(i.label)}** | ${wd(i.qid)} | ${i.sitelinks} | ${cell(liveLabel)} | ${diverge.some((d) => d.i.qid === i.qid) ? 'sim' : 'não'} |`)
  }
  say('')

  // D) Histórico de edição dos suspeitos (B e C): quem mudou o rótulo e quando
  const suspects = [...new Set([...diverge.map((d) => d.i.qid), ...mismatch.map((m) => m.qid)])].slice(0, 60)
  say(`## D. Histórico recente dos itens suspeitos (B e C): edições de rótulo (até 60 itens)`)
  say('')
  say('| item | nome na planilha | edições de rótulo recentes (usuário · data · resumo) |')
  say('|---|---|---|')
  for (const q of suspects) {
    const res = await net.getJson<{ query?: { pages?: Record<string, { revisions?: { user: string; timestamp: string; comment: string; temp?: string }[] }> } }>(`${API}?action=query&prop=revisions&titles=${q}&rvlimit=25&rvprop=user|timestamp|comment&format=json`)
    const revs = Object.values(res.query?.pages ?? {})[0]?.revisions ?? []
    const label = revs.filter((r) => /wbsetlabel|undo|undid|revert/i.test(r.comment)).slice(0, 4)
    const it = uniq.get(q)
    say(`| ${wd(q)} | ${cell(it?.label)} | ${label.length ? cell(label.map((r) => `${r.temp !== undefined ? '(anônimo) ' : ''}${r.user.slice(0, 18)} · ${r.timestamp.slice(0, 10)} · ${r.comment.replace(/\/\*|\*\//g, '').slice(0, 70)}`).join(' ‖ ')) : '—'} |`)
  }
  say('')

  // E) Duplicatas de identidade
  const byDisplay = new Map<string, Item[]>()
  for (const i of items) (byDisplay.get(`${i.club}|${norm(i.display)}`) ?? byDisplay.set(`${i.club}|${norm(i.display)}`, []).get(`${i.club}|${norm(i.display)}`) ?? []).push(i)
  const sameQidTwoClubs = new Map<string, Set<string>>()
  for (const i of items) (sameQidTwoClubs.get(i.qid) ?? sameQidTwoClubs.set(i.qid, new Set()).get(i.qid) ?? new Set()).add(i.club)
  const twoClubs = [...sameQidTwoClubs].filter(([, s]) => s.size > 1)
  say(`## E. Mesmo item do Wikidata em mais de um clube (emprestados ou ligação errada): ${twoClubs.length}`)
  say('')
  for (const [q, s] of twoClubs.slice(0, 60)) say(`- ${wd(q)} ${cell(uniq.get(q)?.label)}: ${[...s].join(' · ')}`)
  say('')
  const dupNames = new Map<string, Item[]>()
  for (const i of list) (dupNames.get(norm(i.label ?? i.display)) ?? dupNames.set(norm(i.label ?? i.display), []).get(norm(i.label ?? i.display)) ?? []).push(i)
  const homonyms = [...dupNames].filter(([, v]) => v.length > 1 && v.every((x) => x.birth && x.birth === v[0]?.birth))
  say(`Itens diferentes com o mesmo nome **e a mesma data de nascimento** (possível duplicata): ${homonyms.length}`)
  for (const [n, v] of homonyms.slice(0, 30)) say(`- ${n}: ${v.map((x) => `${wd(x.qid)} (${x.club})`).join(', ')}`)
  say('')

  // F) Fama muito alta em quem não parece conhecido
  const rankedCsv = readSheet(readFileSync(join(ORIG, 'conferencia', 'top-300-jogadores.csv'), 'utf8'))
  const top = rankedCsv.rows
  say(`## F. Fama alta e sinais fracos (top 300 de força do projeto: ${top.length} jogadores)`)
  say('')
  say('Verificações cruzadas por jogador do top 300: (1) o item é pessoa e futebolista; (2) o nome da planilha tem palavra em comum com o da tabela; (3) a razão entre as visualizações recentes e as páginas do Wikidata (fama) — craque de verdade tem muitas visualizações; (4) a coluna de fama é maior que a esperada para o clube.')
  say('')
  say('| posição no ranking | jogador | clube | força | fama (páginas) | visualizações 3m | pessoa? | futebolista? | alerta |')
  say('|--:|---|---|--:|--:|--:|:-:|:-:|---|')
  let flagged = 0
  const viewsList = top.map((t) => Number(t.visualizacoes_3_meses ?? 0)).filter((n) => n > 0).sort((a, b) => a - b)
  const p10 = viewsList[Math.floor(viewsList.length * 0.1)] ?? 0
  for (const t of top) {
    const q = (t.id ?? '').replace(/^wd-/, '')
    const k = kinds.get(q)
    const it = uniq.get(q)
    const alerts: string[] = []
    if (k && !k.human) alerts.push('não é pessoa')
    if (k && k.human && !k.foot) alerts.push('sem ocupação de futebolista')
    if (it && it.label && mismatch.some((m) => m.qid === q)) alerts.push('nome sem relação com a Wikipedia')
    if (it && diverge.some((d) => d.i.qid === q)) alerts.push('rótulo mudou desde a coleta')
    const v = Number(t.visualizacoes_3_meses ?? 0)
    if (v > 0 && v <= p10 && Number(t.fama ?? 0) >= 15) alerts.push(`poucas visualizações (${v}) para ${t.fama} páginas`)
    if (v === 0 && Number(t.fama ?? 0) >= 10) alerts.push('sem visualizações registradas')
    if (alerts.length) {
      flagged++
      say(`| ${t.ranking} | ${cell(t.jogador)} | ${cell(t.clube)} | ${t.valor_provisorio} | ${t.fama} | ${v} | ${k ? (k.human ? 'sim' : 'não') : '?'} | ${k ? (k.foot ? 'sim' : 'não') : '?'} | ${cell(alerts.join('; '))} |`)
    }
  }
  if (flagged === 0) say('| — | nenhum alerta no top 300 | | | | | | | |')
  say('')
  say(`(limite de "poucas visualizações": ${p10} em 3 meses, o 10º percentil do top 300.)`)

  // G) Casos já citados
  say('')
  say('## G. Casos citados no pedido')
  say('')
  for (const needle of ['Messiano', 'Foden', 'Claus-7', 'OneFit', 'Training Deportes']) {
    const found = items.filter((i) => norm(i.label ?? '').includes(norm(needle)) || norm(i.display).includes(norm(needle)))
    for (const f of found) say(`- **${needle}** → ${wd(f.qid)} · tabela: "${f.display}" · rótulo na coleta: "${f.label}" · clube: ${f.club} (${f.league}) · páginas: ${f.sitelinks} · dados de pessoa: ${f.hasPerson ? 'sim' : 'não'} · é pessoa no Wikidata: ${kinds.get(f.qid)?.human ? 'sim' : 'não'}`)
  }
  writeFileSync(join(OUT, '4-identidade.md'), `${out.join('\n')}\n`)
  writeFileSync(join(OUT, '4-identidade.json'), JSON.stringify({ notHuman: notHuman.map((i) => i.qid), diverge: diverge.map((d) => ({ qid: d.i.qid, label: d.i.label, live: d.liveLabel })), mismatch: mismatch.map((m) => m.qid) }, null, 1))
}
console.log(`\nRelatório em ${OUT}`)
