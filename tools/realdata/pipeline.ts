/** Coleta de uma liga: clubes da temporada (Wikipedia), detalhes dos clubes e dos jogadores (Wikidata) e elencos atuais (Wikipedia em inglês e no idioma do país). */
import type { ClubSource, Issue, LeagueInput, SquadSource } from './assemble'
import { articleKey } from './assemble'
import type { Fetcher } from './http'
import { seasonTitleCandidates } from './leagues'
import type { RealLeague } from './leagues'
import { parseSquadHtml } from './localSquad'
import type { LocalEntry } from './localSquad'
import { mergeSquads } from './merge'
import { articleUrl, fetchPages, fetchSquadHtml } from './wikipedia'
import { fetchClubs, fetchFootballClubs, fetchPlayers } from './wikidata'
import { parseSeasonLinkGroups, parseSquad } from './wikitext'
import type { WikiLink } from './wikitext'

export interface CollectOptions {
  fetcher: Fetcher
  today: Date
  /** Limita os clubes de cada liga (para testar o script sem baixar tudo). */
  maxClubs?: number
  /** Não consulta a Wikipedia local (só a em inglês). */
  noLocal?: boolean
  log: (message: string) => void
}

export interface Collected {
  input: LeagueInput
  /** Artigos da Wikipedia lidos (créditos). */
  articles: { title: string; url: string }[]
  season?: { title: string; previous: boolean }
  /** Quantos clubes tiveram o elenco completado ou enriquecido pela Wikipedia local. */
  local: { clubs: number; added: number; enriched: number }
}

interface FoundClub {
  qid: string
  display?: string
  title?: string
}

/** Links da página da temporada → clubes de futebol (item do Wikidata), na ordem em que aparecem. */
async function clubsOfLinks(links: readonly WikiLink[], fetcher: Fetcher): Promise<FoundClub[]> {
  const resolved = await fetchPages(fetcher, links.map((l) => l.title), { content: false })
  const byQid = new Map<string, FoundClub>()
  for (const link of links) {
    const r = resolved.get(link.title)
    if (r?.qid && !byQid.has(r.qid)) byQid.set(r.qid, { qid: r.qid, display: link.display, title: r.title })
  }
  const isClub = await fetchFootballClubs(fetcher, [...byQid.keys()])
  return [...byQid.values()].filter((c) => isClub.has(c.qid))
}

/** Clubes da temporada atual: o primeiro artigo candidato que existe e traz clubes suficientes. */
async function findSeasonClubs(league: RealLeague, options: CollectOptions, notes: Issue[]): Promise<{ clubs: FoundClub[]; season?: { title: string; previous: boolean }; pageTitle?: string }> {
  let best: { clubs: FoundClub[]; season: { title: string; previous: boolean }; pageTitle: string } | undefined
  for (const candidate of seasonTitleCandidates(league, options.today)) {
    const page = (await fetchPages(options.fetcher, [candidate.title], { content: true })).get(candidate.title)
    if (!page || page.missing || !page.wikitext) continue
    const groups = parseSeasonLinkGroups(page.wikitext)
    if (groups.primary.length + groups.secondary.length === 0) continue
    // A tabela de estádios e cidades basta; as outras seções (que trazem também os rebaixados do ano anterior) só completam até o número da liga.
    let clubs = await clubsOfLinks(groups.primary, options.fetcher)
    if (clubs.length < league.expected && groups.secondary.length > 0) {
      const extra = (await clubsOfLinks(groups.secondary, options.fetcher)).filter((c) => !clubs.some((x) => x.qid === c.qid))
      clubs = [...clubs, ...extra.slice(0, league.expected - clubs.length)]
    }
    options.log(`  ${candidate.title}: ${clubs.length} clubes`)
    if (!best || clubs.length > best.clubs.length) best = { clubs, season: { title: page.title, previous: candidate.previous }, pageTitle: page.title }
    // A temporada atual com pelo menos metade dos clubes basta; senão tenta a anterior e fica a melhor.
    if (clubs.length >= league.expected * 0.5 && !candidate.previous) break
  }
  if (!best) {
    notes.push({ league: league.id, kind: 'club-missing-season', detail: `nenhum artigo de temporada encontrado (${seasonTitleCandidates(league, options.today).map((c) => c.title).join('; ')})` })
    return { clubs: [] }
  }
  return best
}

export async function collectLeague(league: RealLeague, options: CollectOptions): Promise<Collected> {
  const { fetcher, log } = options
  const notes: Issue[] = []
  const articles: { title: string; url: string }[] = []
  const addArticle = (title: string, lang = 'en'): void => {
    const label = lang === 'en' ? title : `${lang}: ${title}`
    if (!articles.some((a) => a.title === label)) articles.push({ title: label, url: articleUrl(title, lang) })
  }

  log(`${league.id}: procurando os clubes`)
  let found: FoundClub[]
  let season: Collected['season']
  if (league.fixedClubs) found = league.fixedClubs.map((qid) => ({ qid }))
  else {
    const result = await findSeasonClubs(league, options, notes)
    found = result.clubs
    season = result.season
    if (result.pageTitle) addArticle(result.pageTitle)
  }
  if (options.maxClubs !== undefined) found = found.slice(0, options.maxClubs)

  const lang = options.noLocal ? undefined : league.wikiLang
  const infos = await fetchClubs(fetcher, found.map((c) => c.qid), league.languages, lang)
  const clubs: ClubSource[] = []
  for (const club of found) {
    const info = infos.get(club.qid)
    if (!info) continue
    const articleTitle = club.title ?? info.enTitle
    clubs.push({ info, ...(club.display ? { displayName: club.display } : {}), ...(articleTitle ? { articleTitle } : {}) })
  }

  log(`${league.id}: ${clubs.length} clubes; lendo os elencos`)
  const squads = new Map<string, SquadSource>()
  const titles = clubs.flatMap((c) => (c.articleTitle ? [c.articleTitle] : []))
  const pages = await fetchPages(fetcher, titles, { content: true })
  for (const club of clubs) {
    const page = club.articleTitle ? pages.get(club.articleTitle) : undefined
    if (!page?.wikitext) continue
    const squad = parseSquad(page.wikitext)
    if (squad.entries.length > 0) {
      squads.set(club.info.qid, { entries: squad.entries, ...(squad.section ? { section: squad.section } : {}) })
      addArticle(page.title)
    }
  }

  // Wikipedia no idioma do país: completa elencos que faltam e traz a posição exata e o país de cada jogador.
  const local = { clubs: 0, added: 0, enriched: 0 }
  if (lang) {
    log(`${league.id}: lendo os elencos na Wikipedia em ${lang}`)
    for (const club of clubs) {
      if (!club.info.localTitle) continue
      const html = await fetchSquadHtml(fetcher, lang, club.info.localTitle)
      if (!html) continue
      const entries: LocalEntry[] = parseSquadHtml(html.html, lang)
      if (entries.length === 0) continue
      const merged = mergeSquads(squads.get(club.info.qid)?.entries ?? [], entries, lang)
      if (merged.added === 0 && merged.enriched === 0) continue
      squads.set(club.info.qid, { entries: merged.entries, section: squads.get(club.info.qid)?.section ?? html.section })
      local.clubs++
      local.added += merged.added
      local.enriched += merged.enriched
      addArticle(html.title, lang)
    }
    log(`  ${local.clubs} clubes com dados da Wikipedia em ${lang}: ${local.added} jogadores acrescentados, ${local.enriched} enriquecidos`)
  }

  const entries = [...squads.values()].flatMap((s) => s.entries)
  const englishTitles = [...new Set(entries.filter((e) => e.title && !e.lang).map((e) => e.title as string))]
  log(`${league.id}: ${englishTitles.length} jogadores com artigo; buscando os dados no Wikidata`)
  const articleToQid = new Map<string, string>()
  for (const [title, page] of await fetchPages(fetcher, englishTitles, { content: false })) if (page.qid) articleToQid.set(title, page.qid)
  if (lang) {
    const localTitles = [...new Set(entries.filter((e) => e.title && e.lang === lang).map((e) => e.title as string))]
    for (const [title, page] of await fetchPages(fetcher, localTitles, { content: false, lang })) if (page.qid) articleToQid.set(articleKey({ title, lang }), page.qid)
  }
  const players = await fetchPlayers(fetcher, [...new Set(articleToQid.values())], league.languages)

  return { input: { league, clubs, squads, players, articleToQid, notes, today: options.today }, articles, local, ...(season ? { season } : {}) }
}
