import { Fetcher } from './realdata/http'
import { fetchSquadHtml } from './realdata/wikipedia'
const [lang = 'es', title = 'Club Atlético Peñarol'] = process.argv.slice(2)
const fetcher = new Fetcher({ userAgent: 'MeuManagerDados/1.0 (depuracao)', cacheDir: 'dados-reais/planilhas/.cache', refresh: false, pauseMs: 1500 })
const page = await fetchSquadHtml(fetcher, lang, title)
console.log([...(page?.html ?? '').matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => `h${m[1]}:${m[2]!.replace(/<[^>]+>/g, '')}@${m.index}`).join(' | '))
console.log('tables', (page?.html.match(/<table/g) ?? []).length, 'len', page?.html.length)
