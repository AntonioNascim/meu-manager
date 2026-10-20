/** Consultas à API da Wikipedia (em inglês): texto wiki dos artigos e o item do Wikidata ligado a cada um. */
import type { Fetcher } from './http'

import { pickSquadSection } from './localSquad'
const apiOf = (lang: string): string => `https://${lang}.wikipedia.org/w/api.php`

export interface WikiPage {
  /** Título pedido. */
  requested: string
  /** Título final (depois de normalizar e seguir redirecionamentos). */
  title: string
  missing: boolean
  /** Item do Wikidata (`Q123`). */
  qid?: string
  wikitext?: string
}

interface QueryResponse {
  query?: {
    normalized?: { from: string; to: string }[]
    redirects?: { from: string; to: string }[]
    pages?: {
      title: string
      missing?: boolean
      invalid?: boolean
      pageprops?: { wikibase_item?: string }
      revisions?: { slots?: { main?: { content?: string } } }[]
    }[]
  }
}

/** Endereço do artigo (para os créditos). */
export const articleUrl = (title: string, lang = 'en'): string => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`

/**
 * Busca vários artigos de uma vez. Com `content`, devolve o texto wiki (lotes menores, porque cada artigo é grande); sem ele, só o item
 * do Wikidata de cada título.
 */
export async function fetchPages(fetcher: Fetcher, titles: readonly string[], options: { content: boolean; lang?: string }): Promise<Map<string, WikiPage>> {
  const result = new Map<string, WikiPage>()
  const unique = [...new Set(titles)]
  const batchSize = options.content ? 8 : 50
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize)
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      maxlag: '5',
      prop: options.content ? 'pageprops|revisions' : 'pageprops',
      ppprop: 'wikibase_item',
      titles: batch.join('|'),
      ...(options.content ? { rvprop: 'content', rvslots: 'main' } : {}),
    })
    const response = await fetcher.getJson<QueryResponse>(`${apiOf(options.lang ?? 'en')}?${params.toString()}`)
    const query = response.query ?? {}
    const follow = new Map<string, string>()
    for (const n of query.normalized ?? []) follow.set(n.from, n.to)
    const redirect = new Map((query.redirects ?? []).map((r) => [r.from, r.to]))
    const byTitle = new Map((query.pages ?? []).map((p) => [p.title, p]))
    for (const requested of batch) {
      let title = follow.get(requested) ?? requested
      for (let hop = 0; hop < 3 && redirect.has(title); hop++) title = redirect.get(title) as string
      const page = byTitle.get(title)
      const wikitext = page?.revisions?.[0]?.slots?.main?.content
      const found: WikiPage = { requested, title, missing: !page || page.missing === true || page.invalid === true }
      if (page?.pageprops?.wikibase_item) found.qid = page.pageprops.wikibase_item
      if (wikitext !== undefined) found.wikitext = wikitext
      result.set(requested, found)
    }
  }
  return result
}

/** HTML da seção de elenco do artigo de um clube na Wikipedia de uma língua (duas consultas pequenas: as seções e a escolhida). */
export async function fetchSquadHtml(fetcher: Fetcher, lang: string, title: string): Promise<{ title: string; html: string; section: string } | undefined> {
  const base = `format=json&formatversion=2&redirects=1&maxlag=5&page=${encodeURIComponent(title)}`
  const sections = await fetcher.getJson<{ parse?: { title: string; sections: { index: string; line: string }[] } }>(`${apiOf(lang)}?action=parse&prop=sections&${base}`)
  if (!sections.parse) return undefined
  const picked = pickSquadSection(sections.parse.sections)
  if (!picked) return undefined
  const text = await fetcher.getJson<{ parse?: { text: string } }>(`${apiOf(lang)}?action=parse&prop=text&section=${picked.index}&${base}`)
  return text.parse ? { title: sections.parse.title, html: text.parse.text, section: picked.line } : undefined
}
