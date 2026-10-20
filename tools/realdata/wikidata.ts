/** Consultas ao Wikidata (SPARQL, dados em domínio público): detalhes dos clubes e dos jogadores. As linhas cruas viram dados tipados em funções puras. */
import type { Fetcher } from './http'

const ENDPOINT = 'https://query.wikidata.org/sparql'

export type Row = Record<string, string>

export interface ClubInfo {
  qid: string
  name: string
  /** Siglas de 3 letras que o Wikidata guarda como nome curto. */
  shortNames: string[]
  venue?: string
  capacity?: number
  city?: string
  /** Cores oficiais (`#rrggbb`), na ordem em que o Wikidata devolveu. */
  colors: string[]
  /** Número de páginas do item em outras línguas: mede o quanto o clube é conhecido (base da reputação provisória). */
  sitelinks: number
  /** Título do artigo na Wikipedia em inglês. */
  enTitle?: string
  /** Título do artigo na Wikipedia do idioma do país (espanhol, português...), quando a liga usa uma. */
  localTitle?: string
}

export interface PlayerInfo {
  qid: string
  name?: string
  /** Data completa `AAAA-MM-DD`, só quando o Wikidata tem dia, mês e ano. */
  birthDate?: string
  /** Ano de nascimento quando a data é imprecisa. */
  birthYear?: number
  nationalities: string[]
  positions: string[]
  foot?: 'right' | 'left' | 'both'
  nickname?: string
  /** Número de páginas do item em outras línguas: mede o quanto o jogador é conhecido. */
  sitelinks?: number
}

export const qidOf = (uri: string): string => uri.slice(uri.lastIndexOf('/') + 1)

export async function sparql(fetcher: Fetcher, query: string): Promise<Row[]> {
  const response = await fetcher.postJson<{ results: { bindings: Record<string, { value: string }>[] } }>(ENDPOINT, { query, format: 'json' })
  return response.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])))
}

const values = (qids: readonly string[]): string => qids.map((q) => `wd:${q}`).join(' ')

/** `languages`: ordem de preferência dos nomes (Brasil: `pt,en`; demais países: `en,pt`). */
export function clubsQuery(qids: readonly string[], languages: string, wikiLang?: string): string {
  return `SELECT ?c ?name ?short ?sl ?venueName ?cap ?capWhen ?capRank ?hqName ?vlocName ?hex ?enTitle ?localTitle WHERE {
  VALUES ?c { ${values(qids)} }
  ?c wikibase:sitelinks ?sl .
  OPTIONAL { ?c wdt:P1813 ?short . FILTER(STRLEN(?short) = 3) }
  OPTIONAL {
    ?c p:P115 ?vs . ?vs ps:P115 ?venue . FILTER NOT EXISTS { ?vs pq:P582 ?vend }
    OPTIONAL { ?venue p:P1083 ?cs . ?cs ps:P1083 ?cap ; wikibase:rank ?capRank . OPTIONAL { ?cs pq:P585 ?capWhen } }
    OPTIONAL { ?venue wdt:P131 ?vloc }
  }
  OPTIONAL { ?c wdt:P159 ?hq }
  OPTIONAL { { ?c wdt:P6364 ?col } UNION { ?c wdt:P462 ?col } ?col wdt:P465 ?hex }
  OPTIONAL { ?art schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle }
  ${wikiLang ? `OPTIONAL { ?lart schema:about ?c ; schema:isPartOf <https://${wikiLang}.wikipedia.org/> ; schema:name ?localTitle }` : ""}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${languages}". ?c rdfs:label ?name. ?venue rdfs:label ?venueName. ?hq rdfs:label ?hqName. ?vloc rdfs:label ?vlocName }
}`
}

/** Quais dos itens são clubes de futebol (classe "clube de futebol" ou subclasse), para separar clubes de cidades, estádios e pessoas. */
export function clubFilterQuery(qids: readonly string[]): string {
  return `SELECT ?c WHERE { VALUES ?c { ${values(qids)} } ?c wdt:P31/wdt:P279* ?kind . VALUES ?kind { wd:Q476028 wd:Q847017 wd:Q12973014 } . FILTER NOT EXISTS { ?c wdt:P576 ?dissolved } }`
}

export function playersQuery(qids: readonly string[], languages: string): string {
  return `SELECT ?p ?name ?sl ?birth ?prec ?natn ?posn ?footn ?nick WHERE {
  VALUES ?p { ${values(qids)} }
  OPTIONAL { ?p wikibase:sitelinks ?sl }
  OPTIONAL { ?p p:P569/psv:P569 [ wikibase:timeValue ?birth ; wikibase:timePrecision ?prec ] }
  OPTIONAL { ?p wdt:P27 ?nat . ?nat rdfs:label ?natn . FILTER(LANG(?natn) = "en") }
  OPTIONAL { ?p wdt:P413 ?pos . ?pos rdfs:label ?posn . FILTER(LANG(?posn) = "en") }
  OPTIONAL { ?p wdt:P8006 ?foot . ?foot rdfs:label ?footn . FILTER(LANG(?footn) = "en") }
  OPTIONAL { ?p wdt:P1449 ?nick . FILTER(LANG(?nick) IN ("pt", "en", "es")) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${languages}". ?p rdfs:label ?name }
}`
}

const push = <T>(list: T[], value: T | undefined): void => {
  if (value !== undefined && !list.includes(value)) list.push(value)
}

/** Capacidade atual: a mais recente com data; sem datas, a de rank preferido; senão a menor (os estádios costumam diminuir com a reforma). */
function currentCapacity(rows: readonly Row[]): number | undefined {
  const caps = rows.filter((r) => r.cap !== undefined && Number.isFinite(Number(r.cap)))
  if (caps.length === 0) return undefined
  const dated = caps.filter((r) => r.capWhen).sort((a, b) => (b.capWhen as string).localeCompare(a.capWhen as string))
  if (dated[0]) return Math.round(Number(dated[0].cap))
  const preferred = caps.filter((r) => r.capRank?.endsWith('PreferredRank'))
  if (preferred[0]) return Math.round(Number(preferred[0].cap))
  return Math.round(Math.min(...caps.map((r) => Number(r.cap))))
}

export function aggregateClubRows(rows: readonly Row[]): Map<string, ClubInfo> {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const qid = qidOf(row.c as string)
    ;(groups.get(qid) ?? groups.set(qid, []).get(qid) ?? []).push(row)
  }
  const clubs = new Map<string, ClubInfo>()
  for (const [qid, group] of groups) {
    const first = group[0] as Row
    const club: ClubInfo = { qid, name: first.name ?? qid, shortNames: [], colors: [], sitelinks: Number(first.sl ?? 0) }
    const venues = new Map<string, Row[]>()
    for (const row of group) {
      push(club.shortNames, row.short)
      push(club.colors, row.hex ? `#${row.hex.replace('#', '').toLowerCase()}` : undefined)
      if (row.venueName) (venues.get(row.venueName) ?? venues.set(row.venueName, []).get(row.venueName) ?? []).push(row)
      if (!club.city) club.city = row.hqName ?? undefined
      if (!club.enTitle && row.enTitle) club.enTitle = row.enTitle
      if (!club.localTitle && row.localTitle) club.localTitle = row.localTitle
    }
    // Vários estádios atuais: fica o de maior capacidade (o principal).
    let best: { name: string; capacity?: number; rows: Row[] } | undefined
    for (const [name, venueRows] of venues) {
      const capacity = currentCapacity(venueRows)
      if (!best || (capacity ?? 0) > (best.capacity ?? 0)) best = { name, ...(capacity !== undefined ? { capacity } : {}), rows: venueRows }
    }
    if (best) {
      club.venue = best.name
      if (best.capacity !== undefined) club.capacity = best.capacity
      if (!club.city) club.city = best.rows.find((r) => r.vlocName)?.vlocName
    }
    clubs.set(qid, club)
  }
  return clubs
}

function parseFoot(text: string | undefined): PlayerInfo['foot'] {
  if (!text) return undefined
  const t = text.toLowerCase()
  if (/both|ambi/.test(t)) return 'both'
  if (/left/.test(t)) return 'left'
  if (/right/.test(t)) return 'right'
  return undefined
}

export function aggregatePlayerRows(rows: readonly Row[]): Map<string, PlayerInfo> {
  const players = new Map<string, PlayerInfo>()
  for (const row of rows) {
    const qid = qidOf(row.p as string)
    let player = players.get(qid)
    if (!player) players.set(qid, (player = { qid, nationalities: [], positions: [] }))
    if (row.name && !/^Q\d+$/.test(row.name)) player.name = row.name
    if (row.sl && player.sitelinks === undefined) player.sitelinks = Number(row.sl)
    if (row.birth && !player.birthDate) {
      const match = /^(-?\d{4,})-(\d{2})-(\d{2})T/.exec(row.birth)
      if (match) {
        if (row.prec === '11') player.birthDate = `${match[1]}-${match[2]}-${match[3]}`
        else player.birthYear = Number(match[1])
      }
    }
    push(player.nationalities, row.natn)
    push(player.positions, row.posn)
    player.foot ??= parseFoot(row.footn)
    if (row.nick && !player.nickname) player.nickname = row.nick
  }
  return players
}

const chunks = <T>(list: readonly T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))

export async function fetchFootballClubs(fetcher: Fetcher, qids: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (const batch of chunks(qids, 100)) for (const row of await sparql(fetcher, clubFilterQuery(batch))) found.add(qidOf(row.c as string))
  return found
}

export async function fetchClubs(fetcher: Fetcher, qids: readonly string[], languages: string, wikiLang?: string): Promise<Map<string, ClubInfo>> {
  const clubs = new Map<string, ClubInfo>()
  for (const batch of chunks(qids, 25)) for (const [qid, club] of aggregateClubRows(await sparql(fetcher, clubsQuery(batch, languages, wikiLang)))) clubs.set(qid, club)
  return clubs
}

export async function fetchPlayers(fetcher: Fetcher, qids: readonly string[], languages: string): Promise<Map<string, PlayerInfo>> {
  const players = new Map<string, PlayerInfo>()
  for (const batch of chunks(qids, 60)) for (const [qid, player] of aggregatePlayerRows(await sparql(fetcher, playersQuery(batch, languages)))) players.set(qid, player)
  return players
}
