/** Coleta de uma liga: clubes da temporada (Wikipedia), detalhes dos clubes e dos jogadores (Wikidata) e elencos atuais (Wikipedia). */
import type { ClubSource, Issue, LeagueInput, SquadSource } from './assemble'
import type { Fetcher } from './http'
import { seasonTitleCandidates } from './leagues'
import type { RealLeague } from './leagues'
import { articleUrl, fetchPages } from './wikipedia'
import { fetchClubs, fetchFootballClubs, fetchPlayers } from './wikidata'
import { parseSeasonLinks, parseSquad } from './wikitext'

export interface CollectOptions {
  fetcher: Fetcher
  today: Date
  /** Limita os clubes de cada liga (para testar o script sem baixar tudo). */
  maxClubs?: number
  log: (message: string) => void
}

export interface Collected {
  input: LeagueInput
  /** Artigos da Wikipedia lidos (créditos). */
  articles: { title: string; url: string }[]
  season?: { title: string; previous: boolean }
}

interface FoundClub {
  qid: string
  display?: string
  title?: string
}

/** Clubes da temporada atual: o primeiro artigo candidato que existe e traz clubes suficientes. */
async function findSeasonClubs(league: RealLeague, options: CollectOptions, notes: Issue[]): Promise<{ clubs: FoundClub[]; season?: { title: string; previous: boolean }; pageTitle?: string }> {
  let best: { clubs: FoundClub[]; season: { title: string; previous: boolean }; pageTitle: string } | undefined
  for (const candidate of seasonTitleCandidates(league, options.today)) {
    const page = (await fetchPages(options.fetcher, [candidate.title], { content: true })).get(candidate.title)
    if (!page || page.missing || !page.wikitext) continue
    const links = parseSeasonLinks(page.wikitext)
    if (links.length === 0) continue
    const resolved = await fetchPages(options.fetcher, links.map((l) => l.title), { content: false })
    const byQid = new Map<string, FoundClub>()
    for (const link of links) {
      const r = resolved.get(link.title)
      if (r?.qid && !byQid.has(r.qid)) byQid.set(r.qid, { qid: r.qid, display: link.display, title: r.title })
    }
    const isClub = await fetchFootballClubs(options.fetcher, [...byQid.keys()])
    const clubs = [...byQid.values()].filter((c) => isClub.has(c.qid))
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
  const addArticle = (title: string): void => void (articles.some((a) => a.title === title) || articles.push({ title, url: articleUrl(title) }))

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

  const infos = await fetchClubs(fetcher, found.map((c) => c.qid), league.languages)
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

  const playerTitles = [...new Set([...squads.values()].flatMap((s) => s.entries.flatMap((e) => (e.title ? [e.title] : []))))]
  log(`${league.id}: ${playerTitles.length} jogadores com artigo; buscando os dados no Wikidata`)
  const resolved = await fetchPages(fetcher, playerTitles, { content: false })
  const articleToQid = new Map<string, string>()
  for (const [title, page] of resolved) if (page.qid) articleToQid.set(title, page.qid)
  const players = await fetchPlayers(fetcher, [...new Set(articleToQid.values())], league.languages)

  return { input: { league, clubs, squads, players, articleToQid, notes }, articles, ...(season ? { season } : {}) }
}
