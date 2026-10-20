// Depuração: lista os links da página da temporada de uma liga que NÃO viraram clube (para achar clube que falta).
import { Fetcher } from './realdata/http'
import { REAL_LEAGUES, seasonTitleCandidates } from './realdata/leagues'
import { fetchPages } from './realdata/wikipedia'
import { fetchFootballClubs } from './realdata/wikidata'
import { parseSeasonLinks, sectionsOf } from './realdata/wikitext'

const id = process.argv[2] ?? 'ar-1'
const league = REAL_LEAGUES.find((l) => l.id === id)!
const fetcher = new Fetcher({ userAgent: 'MeuManagerDados/1.0 (depuracao)', cacheDir: 'dados-reais/planilhas/.cache', refresh: false, pauseMs: 1500 })
const cand = seasonTitleCandidates(league, new Date())[0]!
const page = (await fetchPages(fetcher, [cand.title], { content: true })).get(cand.title)!
console.log(cand.title, 'seções:', sectionsOf(page.wikitext ?? '').map((s) => s.title).join(' | '))
const links = parseSeasonLinks(page.wikitext ?? '')
const res = await fetchPages(fetcher, links.map((l) => l.title), { content: false })
const clubs = await fetchFootballClubs(fetcher, [...res.values()].flatMap((r) => (r.qid ? [r.qid] : [])))
for (const l of links) {
  const r = res.get(l.title)
  const ok = r?.qid && clubs.has(r.qid)
  if (!ok) console.log('REJEITADO', l.title, '|', l.display, '|', r?.qid ?? 'sem item', r?.missing ? 'página ausente' : '')
}
console.log('aceitos', links.filter((l) => { const r = res.get(l.title); return r?.qid && clubs.has(r.qid) }).map((l) => l.display).join(', '))
