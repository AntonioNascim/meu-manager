/**
 * Visualizações recentes da página do jogador na Wikipedia (API de pageviews da Wikimedia, de uso livre): medem quem está em alta agora,
 * ao contrário do número de páginas do Wikidata, que mede a carreira. Soma os últimos 3 meses fechados, só de usuários (sem robôs).
 */
import type { Fetcher } from './http'

interface PageviewsResponse {
  items?: { views: number }[]
}

/** Jogadores com menos páginas no Wikidata que isto não entram (a fama deles já é baixa e a consulta seria desperdiçada). */
export const MIN_FAME_FOR_VIEWS = 5

const pad = (n: number): string => String(n).padStart(2, '0')

/** Os 3 últimos meses fechados antes de `today`, no formato da API (`AAAAMM0100` a `AAAAMMDD00`). */
export function viewsWindow(today: Date): { start: string; end: string } {
  const endMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)) // último dia do mês anterior
  const startMonth = new Date(Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - 2, 1))
  return { start: `${startMonth.getUTCFullYear()}${pad(startMonth.getUTCMonth() + 1)}0100`, end: `${endMonth.getUTCFullYear()}${pad(endMonth.getUTCMonth() + 1)}${pad(endMonth.getUTCDate())}00` }
}

/** Visualizações dos últimos 3 meses de cada artigo (título canónico da Wikipedia em inglês, depois dos redirecionamentos). */
export async function fetchViews(fetcher: Fetcher, articles: ReadonlyMap<string, string>, today: Date, log?: (message: string) => void): Promise<Map<string, number>> {
  const { start, end } = viewsWindow(today)
  const views = new Map<string, number>()
  let done = 0
  for (const [key, title] of articles) {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${start}/${end}`
    try {
      const response = await fetcher.getJson<PageviewsResponse>(url)
      views.set(key, (response.items ?? []).reduce((sum, item) => sum + item.views, 0))
    } catch (error) {
      // 404 = nenhuma visualização no período (artigo novo ou sem acesso registrado).
      if (String(error).includes('HTTP 404')) views.set(key, 0)
      else throw error
    }
    if (++done % 500 === 0) log?.(`  ${done}/${articles.size} páginas com visualizações`)
  }
  return views
}
