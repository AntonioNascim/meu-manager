// Depuração: mostra, para uma liga, os links da página da temporada por grupo e quais viraram clube. Uso: node tools/run.mjs debugSeason ar-1
import { Fetcher } from './realdata/http'
import { REAL_LEAGUES, seasonTitleCandidates } from './realdata/leagues'
import { fetchFootballClubs } from './realdata/wikidata'
import { fetchPages } from './realdata/wikipedia'
import { parseSeasonLinkGroups, sectionsOf } from './realdata/wikitext'

const id = process.argv[2] ?? 'ar-1'
const league = REAL_LEAGUES.find((l) => l.id === id)!
const fetcher = new Fetcher({ userAgent: 'MeuManagerDados/1.0 (depuracao)', cacheDir: 'dados-reais/planilhas/.cache', refresh: false, pauseMs: 1500 })
const cand = seasonTitleCandidates(league, new Date())[0]!
const page = (await fetchPages(fetcher, [cand.title], { content: true })).get(cand.title)!
console.log(cand.title, 'seções:', sectionsOf(page.wikitext ?? '').slice(0, 14).map((s) => s.title).join(' | '))
const groups = parseSeasonLinkGroups(page.wikitext ?? '')
for (const [name, links] of Object.entries(groups)) {
  const res = await fetchPages(fetcher, links.map((l) => l.title), { content: false })
  const clubs = await fetchFootballClubs(fetcher, [...res.values()].flatMap((r) => (r.qid ? [r.qid] : [])))
  const ok = links.filter((l) => { const r = res.get(l.title); return r?.qid && clubs.has(r.qid) })
  console.log(`\n[${name}] ${links.length} links, ${ok.length} clubes: ${ok.map((l) => l.display).join(', ')}`)
  const maybe = links.filter((l) => !ok.includes(l) && /club|fc|c\.a\.|atl|sport|deport|union|unión|juniors|ac\b|esporte|clube/i.test(l.title))
  console.log('  rejeitados com cara de clube:', maybe.map((l) => `${l.title} (${res.get(l.title)?.qid ?? 'sem item'})`).join(' | '))
}
