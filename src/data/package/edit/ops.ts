/**
 * Operações de edição do pacote de dados: funções puras que recebem o pacote e devolvem um novo (o que não muda é
 * compartilhado). Mantêm o pacote coerente onde dá (acesso e rebaixamento ligados, clube novo já com elenco); o que o
 * editor não consegue consertar sozinho a validação aponta.
 */
import { BRAZILIAN_FIRST_NAMES, BRAZILIAN_SURNAMES, SPANISH_FIRST_NAMES, SPANISH_SURNAMES } from '../../names'
import { createRng } from '../../../engine/rng'
import type { Nationality } from '../../../engine/types'
import { DEFAULT_START_YEAR } from '../../generateWorld'
import { PACKAGE_FORMAT, PACKAGE_VERSION } from '../types'
import type { DataPackage, PackageClub, PackageCountry, PackageLeague, PackagePlayer } from '../types'
import { SQUAD_TEMPLATE } from './suggest'

export type EntityKind = 'countries' | 'leagues' | 'clubs' | 'players' | 'academy' | 'cups'
const KINDS: readonly string[] = ['countries', 'leagues', 'clubs', 'players', 'academy', 'cups']

/** Onde um problema está: `clubs[3].name` → `{ kind: 'clubs', index: 3, field: 'name' }`. */
export interface IssueLocation {
  kind: EntityKind
  index: number
  field?: string
}

export function locateIssue(path: string): IssueLocation | null {
  const m = /^(\w+)\[(\d+)\](?:\.(.+))?$/.exec(path)
  if (!m || !KINDS.includes(m[1] as string)) return null
  return { kind: m[1] as EntityKind, index: Number(m[2]), ...(m[3] ? { field: m[3] } : {}) }
}

export const replaceAt = <T>(list: readonly T[], index: number, next: T): T[] => list.map((item, i) => (i === index ? next : item))
export const removeAt = <T>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index)

/** Próximo id livre com o prefixo (`club-ed-1`, `club-ed-2`...). */
export function freeId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  let n = 1
  while (used.has(`${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}

// ---------------------------------------------------------------------------------------------------------------------
// Pacote

/** Pacote novo e vazio: um país sem ligas (o editor começa por criar a liga e os clubes). */
export const emptyPackage = (name = 'Meu pacote'): DataPackage => ({ format: PACKAGE_FORMAT, version: PACKAGE_VERSION, name, startYear: DEFAULT_START_YEAR, countries: [], leagues: [], clubs: [], players: [] })

/** Garante as listas que o editor usa (arquivo aberto com campos faltando). */
export function normalizeForEditing(raw: Partial<DataPackage>): DataPackage {
  return { ...raw, format: PACKAGE_FORMAT, version: raw.version ?? PACKAGE_VERSION, name: raw.name ?? 'Pacote sem nome', countries: raw.countries ?? [], leagues: raw.leagues ?? [], clubs: raw.clubs ?? [], players: raw.players ?? [] }
}

// ---------------------------------------------------------------------------------------------------------------------
// Países e ligas

export function addCountry(pkg: DataPackage, country: PackageCountry): DataPackage {
  if (pkg.countries.some((c) => c.id === country.id)) return pkg
  return { ...pkg, countries: [...pkg.countries, country] }
}

/** Só remove o país se nenhuma liga o usa. */
export function removeCountry(pkg: DataPackage, id: string): DataPackage {
  if (pkg.leagues.some((l) => l.country === id)) return pkg
  return { ...pkg, countries: pkg.countries.filter((c) => c.id !== id) }
}

export const leaguesOfCountry = (pkg: DataPackage, country: string): PackageLeague[] => pkg.leagues.filter((l) => l.country === country).sort((a, b) => a.level - b.level)

/** Nova divisão no fim da pirâmide do país (nível seguinte), com acesso e rebaixamento ligados à de cima. */
export function addLeague(pkg: DataPackage, country: string, name = 'Nova liga'): DataPackage {
  const above = leaguesOfCountry(pkg, country).pop()
  const level = (above?.level ?? 0) + 1
  const link = above ? Math.min(2, Math.floor((above.teams ?? 4) / 4)) : 0
  const league: PackageLeague = { id: freeId(`${country.toLowerCase().replace(/[^a-z]/g, '').slice(0, 3) || 'lg'}-${level}-ed`, pkg.leagues.map((l) => l.id)), name, country, level, teams: 0, promotion: link, relegation: 0 }
  return { ...pkg, leagues: [...pkg.leagues.map((l) => (above && l.id === above.id ? { ...l, relegation: link } : l)), league] }
}

/** Só remove a liga se nenhum clube está nela; a pirâmide é refeita em sequência (1, 2, 3) e a última deixa de rebaixar. */
export function removeLeague(pkg: DataPackage, id: string): DataPackage {
  const league = pkg.leagues.find((l) => l.id === id)
  if (!league || pkg.clubs.some((c) => c.league === id)) return pkg
  const rest = pkg.leagues.filter((l) => l.id !== id)
  const sorted = leaguesOfCountry({ ...pkg, leagues: rest }, league.country)
  const relevel = new Map(sorted.map((l, i) => [l.id, i + 1]))
  return {
    ...pkg,
    leagues: rest.map((l) => {
      const level = relevel.get(l.id)
      if (level === undefined) return l
      const last = level === sorted.length
      return { ...l, level, ...(level === 1 ? { promotion: 0 } : {}), ...(last ? { relegation: 0 } : {}) }
    }),
  }
}

/** Acesso e rebaixamento andam juntos: quem cai de uma divisão é quem sobe para a de baixo. */
export function setLinkedMovement(pkg: DataPackage, leagueId: string, field: 'promotion' | 'relegation', value: number): DataPackage {
  const league = pkg.leagues.find((l) => l.id === leagueId)
  if (!league) return pkg
  const sorted = leaguesOfCountry(pkg, league.country)
  const i = sorted.findIndex((l) => l.id === leagueId)
  const neighbour = field === 'promotion' ? sorted[i - 1] : sorted[i + 1]
  const other = field === 'promotion' ? ('relegation' as const) : ('promotion' as const)
  return { ...pkg, leagues: pkg.leagues.map((l) => (l.id === leagueId ? { ...l, [field]: value } : neighbour && l.id === neighbour.id ? { ...l, [other]: value } : l)) }
}

export const clubsOfLeague = (pkg: DataPackage, leagueId: string): PackageClub[] => pkg.clubs.filter((c) => c.league === leagueId)

/** Põe `teams` de cada liga igual ao número de clubes que estão nela. */
export function syncTeamCounts(pkg: DataPackage): DataPackage {
  const counts = new Map<string, number>()
  for (const c of pkg.clubs) counts.set(c.league, (counts.get(c.league) ?? 0) + 1)
  return { ...pkg, leagues: pkg.leagues.map((l) => ((counts.get(l.id) ?? 0) === l.teams ? l : { ...l, teams: counts.get(l.id) ?? 0 })) }
}

// ---------------------------------------------------------------------------------------------------------------------
// Clubes

const PALETTE = ['#c8102e', '#111111', '#f2f2f2', '#0b3d91', '#1b7f3b', '#f2b705', '#6a1b9a', '#ee7203', '#00a3c4', '#7a1f1f']
const SPANISH_SPEAKING: readonly string[] = ['Argentina', 'Uruguay', 'Paraguay', 'Chile', 'Colombia', 'Peru', 'Ecuador', 'Spain', 'Mexico', 'Bolivia', 'Venezuela']

/** Sigla de 3 letras livre a partir do nome. */
export function freeAbbreviation(name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const letters = name.toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '')
  for (const candidate of [letters.slice(0, 3), letters.slice(0, 2) + letters.slice(-1), letters[0] + letters.slice(-2)]) if (/^[A-Z]{3}$/.test(candidate) && !used.has(candidate)) return candidate
  for (let n = 0; n < 17576; n++) {
    const candidate = String.fromCharCode(65 + (n % 26), 65 + (Math.floor(n / 26) % 26), 65 + Math.floor(n / 676))
    if (!used.has(candidate)) return candidate
  }
  return 'XXX'
}

/** Jogador novo e plausível (nome sorteado do banco de nomes, posição dada, idade de 17 a 35 anos). */
export function makePlayer(pkg: DataPackage, rng: ReturnType<typeof createRng>, position: PackagePlayer['position'], nationality: Nationality, club: string | null, id: string): PackagePlayer {
  const spanish = SPANISH_SPEAKING.includes(nationality)
  const firsts = spanish ? SPANISH_FIRST_NAMES : BRAZILIAN_FIRST_NAMES
  const lasts = spanish ? SPANISH_SURNAMES : BRAZILIAN_SURNAMES
  const year = (pkg.startYear ?? DEFAULT_START_YEAR) - rng.int(17, 35)
  const month = String(rng.int(1, 12)).padStart(2, '0')
  const day = String(rng.int(1, 28)).padStart(2, '0')
  return { id, name: `${rng.pick(firsts)} ${rng.pick(lasts)}`, birthDate: `${year}-${month}-${day}`, nationality, position, club }
}

/** Elenco inicial de 24 jogadores para um clube novo (ids `player-ed-N`). */
export function newSquad(pkg: DataPackage, clubId: string, nationality: Nationality): PackagePlayer[] {
  const rng = createRng(`editor-squad:${clubId}:${pkg.players.length}`)
  const taken = new Set([...pkg.players, ...(pkg.academy ?? [])].flatMap((p) => (p.id ? [p.id] : [])))
  return SQUAD_TEMPLATE.map((position) => {
    const id = freeId('player-ed', taken)
    taken.add(id)
    return makePlayer(pkg, rng, position, nationality, clubId, id)
  })
}

/** Clube novo no fim da liga, com o elenco já montado; `teams` da liga acompanha. */
export function addClub(pkg: DataPackage, leagueId: string): DataPackage {
  const league = pkg.leagues.find((l) => l.id === leagueId)
  if (!league) return pkg
  const id = freeId('club-ed', pkg.clubs.map((c) => c.id))
  const rng = createRng(`editor-club:${id}`)
  const name = `Novo Clube ${pkg.clubs.length + 1}`
  const club: PackageClub = {
    id,
    name,
    abbreviation: freeAbbreviation('Novo', pkg.clubs.map((c) => c.abbreviation)),
    colors: [rng.pick(PALETTE), '#f2f2f2'],
    city: 'Cidade',
    state: '',
    stadium: { name: 'Estádio Municipal', capacity: 20_000 },
    reputation: 8,
    league: leagueId,
  }
  const next = { ...pkg, clubs: [...pkg.clubs, club] }
  return syncTeamCounts({ ...next, players: [...pkg.players, ...newSquad(next, id, league.country as Nationality)] })
}

/** Remove o clube: os jogadores dele viram livres; a base dele sai; `teams` da liga acompanha. */
export function removeClub(pkg: DataPackage, clubId: string): DataPackage {
  const next: DataPackage = {
    ...pkg,
    clubs: pkg.clubs.filter((c) => c.id !== clubId),
    players: pkg.players.map((p) => (p.club === clubId ? { ...p, club: null } : p)),
    ...(pkg.academy ? { academy: pkg.academy.filter((p) => p.club !== clubId) } : {}),
  }
  return syncTeamCounts(next)
}

/** Passa o clube para outra liga (`teams` das duas acompanha). */
export function moveClubToLeague(pkg: DataPackage, clubId: string, leagueId: string): DataPackage {
  return syncTeamCounts({ ...pkg, clubs: pkg.clubs.map((c) => (c.id === clubId ? { ...c, league: leagueId } : c)) })
}

// ---------------------------------------------------------------------------------------------------------------------
// Jogadores

export type PlayerList = 'players' | 'academy'

export const playersOf = (pkg: DataPackage, list: PlayerList): PackagePlayer[] => (list === 'players' ? pkg.players : (pkg.academy ?? []))
export const withPlayers = (pkg: DataPackage, list: PlayerList, players: PackagePlayer[]): DataPackage => (list === 'players' ? { ...pkg, players } : { ...pkg, academy: players })

/** Jogador novo, no clube dado (ou livre), com a nacionalidade do país da liga do clube. */
export function addPlayer(pkg: DataPackage, list: PlayerList, clubId: string | null, position: PackagePlayer['position'] = 'CM'): DataPackage {
  const club = pkg.clubs.find((c) => c.id === clubId)
  const country = (pkg.leagues.find((l) => l.id === club?.league)?.country ?? 'Brazil') as Nationality
  const taken = [...pkg.players, ...(pkg.academy ?? [])].flatMap((p) => (p.id ? [p.id] : []))
  const id = freeId('player-ed', taken)
  const rng = createRng(`editor-player:${id}`)
  const made = makePlayer(pkg, rng, position, country, clubId, id)
  const player = list === 'academy' ? { ...made, birthDate: `${(pkg.startYear ?? DEFAULT_START_YEAR) - rng.int(15, 19)}-06-15` } : made
  return withPlayers(pkg, list, [...playersOf(pkg, list), player])
}

export function removePlayer(pkg: DataPackage, list: PlayerList, index: number): DataPackage {
  return withPlayers(pkg, list, removeAt(playersOf(pkg, list), index))
}

/** Passa o jogador para outro clube (ou para os livres, com `null`). O contrato do pacote, se existe, é mantido. */
export function transferPlayer(pkg: DataPackage, list: PlayerList, index: number, clubId: string | null): DataPackage {
  const players = playersOf(pkg, list)
  const player = players[index]
  if (!player) return pkg
  return withPlayers(pkg, list, replaceAt(players, index, { ...player, club: clubId }))
}

/** Tira do objeto os campos vazios (campo opcional apagado volta a ser gerado pelo jogo). */
export function compactPlayer(player: PackagePlayer): PackagePlayer {
  const out = { ...player } as Record<string, unknown>
  for (const key of Object.keys(out)) if (out[key] === undefined || out[key] === '') delete out[key]
  return out as unknown as PackagePlayer
}

/** Dá um id a quem não tem (a planilha liga a linha ao jogador pelo id). Devolve o mesmo pacote se todos já têm. */
export function ensurePlayerIds(pkg: DataPackage): DataPackage {
  if ([...pkg.players, ...(pkg.academy ?? [])].every((p) => p.id)) return pkg
  const taken = new Set([...pkg.players, ...(pkg.academy ?? [])].flatMap((p) => (p.id ? [p.id] : [])))
  const give = (list: PackagePlayer[]) =>
    list.map((p) => {
      if (p.id) return p
      const id = freeId('player-ed', taken)
      taken.add(id)
      return { ...p, id }
    })
  return { ...pkg, players: give(pkg.players), ...(pkg.academy ? { academy: give(pkg.academy) } : {}) }
}

/** Quantos jogadores cada clube tem (sem varrer a lista a cada linha). */
export function squadCounts(pkg: DataPackage): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of pkg.players) if (p.club) counts.set(p.club, (counts.get(p.club) ?? 0) + 1)
  return counts
}
