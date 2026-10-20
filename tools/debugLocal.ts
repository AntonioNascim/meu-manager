// Depuração: lê o elenco de um clube na Wikipedia local. Uso: node tools/run.mjs debugLocal es "Club Atlético Peñarol"
import { Fetcher } from './realdata/http'
import { parseSquadHtml } from './realdata/localSquad'
import { fetchSquadHtml } from './realdata/wikipedia'

const [lang = 'es', title = 'Club Atlético Peñarol'] = process.argv.slice(2)
const fetcher = new Fetcher({ userAgent: 'MeuManagerDados/1.0 (depuracao)', cacheDir: 'dados-reais/planilhas/.cache', refresh: false, pauseMs: 1500 })
const page = await fetchSquadHtml(fetcher, lang, title)
if (!page) {
  console.log('sem seção de elenco')
} else {
  const entries = parseSquadHtml(page.html, lang)
  console.log(page.title, '|', page.section, '|', entries.length, 'jogadores')
  for (const e of entries.slice(0, 40)) console.log(JSON.stringify(e))
}
