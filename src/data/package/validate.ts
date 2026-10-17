import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from '../../engine/config'
import { ATTRIBUTE_NAMES, NATIONALITIES, POSITIONS } from '../../engine/types'
import type { Attributes } from '../../engine/types'
import { SQUAD_MAX, SQUAD_MIN } from '../../engine/types/team'
import { COUNTRY_DEFAULTS } from './leagueDefaults'
import { PACKAGE_FORMAT, PACKAGE_VERSION, TIEBREAKERS } from './types'
import type { DataPackage, PackageIssue, PackageIssueCode, PackageReport } from './types'

/** O que o jogo aceita: países com 1 a 3 divisões, de 4 a 40 times (número par) cada. */
export const SUPPORTED = { maxDivisions: 3, minTeams: 4, maxTeams: 40 } as const

const MAX_ISSUES = 60
const FOOTS = ['right', 'left', 'both'] as const

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

class Collector {
  errors: PackageIssue[] = []
  warnings: PackageIssue[] = []
  more = 0
  error(code: PackageIssueCode, path: string, detail?: string | number, expected?: string | number) {
    if (this.errors.length >= MAX_ISSUES) {
      this.more++
      return
    }
    this.errors.push({ code, path, ...(detail !== undefined ? { detail } : {}), ...(expected !== undefined ? { expected } : {}) })
  }
  warn(code: PackageIssueCode, path: string, detail?: string | number) {
    this.warnings.push({ code, path, ...(detail !== undefined ? { detail } : {}) })
  }
}

/** Confere um campo de texto obrigatório e devolve o valor (ou `undefined`, já registrando o problema). */
function text(c: Collector, o: Obj, key: string, path: string): string | undefined {
  const v = o[key]
  if (v === undefined || v === null || v === '') {
    c.error('missing-field', `${path}.${key}`, key)
    return undefined
  }
  if (typeof v !== 'string') {
    c.error('wrong-type', `${path}.${key}`, key)
    return undefined
  }
  return v
}

function int(c: Collector, o: Obj, key: string, path: string, min: number, max: number): number | undefined {
  const v = o[key]
  if (v === undefined || v === null) {
    c.error('missing-field', `${path}.${key}`, key)
    return undefined
  }
  if (!isInt(v)) {
    c.error('wrong-type', `${path}.${key}`, key)
    return undefined
  }
  if (v < min || v > max) {
    c.error('out-of-range', `${path}.${key}`, v, `${min}–${max}`)
    return undefined
  }
  return v
}

const validDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)

function checkAttributes(c: Collector, a: unknown, path: string): void {
  if (!isObj(a)) return c.error('wrong-type', path, 'attributes')
  for (const name of ATTRIBUTE_NAMES) {
    const v = (a as Partial<Attributes>)[name]
    if (v === undefined) c.error('missing-field', `${path}.${name}`, name)
    else if (!isInt(v)) c.error('wrong-type', `${path}.${name}`, name)
    else if (v < ATTRIBUTE_MIN || v > ATTRIBUTE_MAX) c.error('out-of-range', `${path}.${name}`, v, `${ATTRIBUTE_MIN}–${ATTRIBUTE_MAX}`)
  }
}

function checkPlayer(c: Collector, p: unknown, path: string, clubIds: Set<string>, ids: Set<string>, allowClubless: boolean): string | null | undefined {
  if (!isObj(p)) {
    c.error('wrong-type', path, 'player')
    return undefined
  }
  text(c, p, 'name', path)
  const birth = text(c, p, 'birthDate', path)
  if (birth !== undefined && !validDate(birth)) c.error('bad-date', `${path}.birthDate`, birth)
  const nationality = text(c, p, 'nationality', path)
  if (nationality !== undefined && !(NATIONALITIES as readonly string[]).includes(nationality)) c.error('unknown-value', `${path}.nationality`, nationality)
  const position = text(c, p, 'position', path)
  if (position !== undefined && !(POSITIONS as readonly string[]).includes(position)) c.error('unknown-value', `${path}.position`, position)
  if (p.secondaryPositions !== undefined) {
    if (!Array.isArray(p.secondaryPositions)) c.error('wrong-type', `${path}.secondaryPositions`, 'secondaryPositions')
    else
      p.secondaryPositions.forEach((s, i) => {
        if (!(POSITIONS as readonly unknown[]).includes(s)) c.error('unknown-value', `${path}.secondaryPositions[${i}]`, String(s))
      })
  }
  if (p.foot !== undefined && !(FOOTS as readonly unknown[]).includes(p.foot)) c.error('unknown-value', `${path}.foot`, String(p.foot))
  if (p.id !== undefined) {
    if (typeof p.id !== 'string' || p.id === '') c.error('wrong-type', `${path}.id`, 'id')
    else if (ids.has(p.id)) c.error('duplicate-id', `${path}.id`, p.id)
    else ids.add(p.id)
  }
  if (p.attributes !== undefined) checkAttributes(c, p.attributes, `${path}.attributes`)
  if (p.potential !== undefined && (!isInt(p.potential) || p.potential < ATTRIBUTE_MIN || p.potential > ATTRIBUTE_MAX)) c.error('out-of-range', `${path}.potential`, String(p.potential), `${ATTRIBUTE_MIN}–${ATTRIBUTE_MAX}`)
  const club = p.club
  if (club === undefined || club === null) {
    if (!allowClubless) c.error('missing-field', `${path}.club`, 'club')
    return null
  }
  if (typeof club !== 'string') {
    c.error('wrong-type', `${path}.club`, 'club')
    return undefined
  }
  if (!clubIds.has(club)) c.error('unknown-reference', `${path}.club`, club)
  return club
}

/**
 * Valida o conteúdo de um pacote. Os erros impedem o uso; os avisos só informam. Nesta fase o jogo aceita um país com
 * duas divisões de 20 times: pacote com mais ligas recebe `unsupported-leagues`.
 */
export function validatePackage(input: unknown): { pkg?: DataPackage; report: PackageReport } {
  const c = new Collector()
  const done = (): { pkg?: DataPackage; report: PackageReport & { more: number } } => ({ report: { errors: c.errors, warnings: c.warnings, more: c.more } })
  if (!isObj(input)) {
    c.error('not-object', '$')
    return done()
  }
  if (input.format !== PACKAGE_FORMAT) {
    c.error('wrong-format', 'format', String(input.format ?? ''))
    return done()
  }
  if (!isInt(input.version) || input.version < 1) {
    c.error('missing-field', 'version', 'version')
    return done()
  }
  if (input.version > PACKAGE_VERSION) {
    c.error('newer-version', 'version', input.version, PACKAGE_VERSION)
    return done()
  }
  text(c, input, 'name', '$')
  if (input.startYear !== undefined && (!isInt(input.startYear) || input.startYear < 1900 || input.startYear > 2200)) c.error('out-of-range', 'startYear', String(input.startYear), '1900–2200')
  for (const key of ['countries', 'leagues', 'clubs', 'players'] as const) {
    if (input[key] === undefined) c.error('missing-field', key, key)
    else if (!Array.isArray(input[key])) c.error('wrong-type', key, key)
  }
  if (c.errors.length > 0) return done()

  // Países
  const countryIds = new Set<string>()
  ;(input.countries as unknown[]).forEach((country, i) => {
    const path = `countries[${i}]`
    if (!isObj(country)) return c.error('wrong-type', path, 'country')
    const id = text(c, country, 'id', path)
    text(c, country, 'name', path)
    if (id !== undefined && !(NATIONALITIES as readonly string[]).includes(id)) c.error('unknown-value', `${path}.id`, id)
    if (id === undefined) return
    if (countryIds.has(id)) c.error('duplicate-id', `${path}.id`, id)
    countryIds.add(id)
  })

  // Ligas
  const leagueIds = new Set<string>()
  const leagues: { id: string; country?: string; level?: number; teams?: number; promotion?: number; relegation?: number; path: string }[] = []
  ;(input.leagues as unknown[]).forEach((league, i) => {
    const path = `leagues[${i}]`
    if (!isObj(league)) return c.error('wrong-type', path, 'league')
    const id = text(c, league, 'id', path)
    text(c, league, 'name', path)
    const country = text(c, league, 'country', path)
    if (country !== undefined && !countryIds.has(country)) c.error('unknown-reference', `${path}.country`, country)
    const level = int(c, league, 'level', path, 1, 10)
    const teams = int(c, league, 'teams', path, SUPPORTED.minTeams, SUPPORTED.maxTeams)
    if (teams !== undefined && teams % 2 !== 0) c.error('league-size-unsupported', `${path}.teams`, teams, 'número par')
    const promotion = int(c, league, 'promotion', path, 0, 10)
    const relegation = int(c, league, 'relegation', path, 0, 10)
    if (league.tiebreakers !== undefined) {
      const list = league.tiebreakers
      if (!Array.isArray(list) || list.some((t) => !(TIEBREAKERS as readonly unknown[]).includes(t))) c.error('unknown-value', `${path}.tiebreakers`, 'tiebreakers')
      else if (list.join() !== TIEBREAKERS.join()) c.warn('tiebreakers-unsupported', `${path}.tiebreakers`)
    }
    if (league.economy !== undefined) {
      const e = league.economy
      if (!isObj(e)) c.error('wrong-type', `${path}.economy`, 'economy')
      else {
        if (typeof e.revenue !== 'number' || !(e.revenue >= 0.05 && e.revenue <= 20)) c.error('out-of-range', `${path}.economy.revenue`, String(e.revenue), '0,05–20')
        if (typeof e.level !== 'number' || !(e.level >= -15 && e.level <= 15)) c.error('out-of-range', `${path}.economy.level`, String(e.level), '-15–15')
      }
    }
    if (country !== undefined && league.economy === undefined && !(country in COUNTRY_DEFAULTS)) c.warn('league-defaults-missing', `${path}.economy`, country)
    if (league.rounds !== undefined && league.rounds !== 1 && league.rounds !== 2) c.error('unknown-value', `${path}.rounds`, String(league.rounds))
    if (league.region !== undefined && !['BR', 'SA', 'EU'].includes(league.region as string)) c.error('unknown-value', `${path}.region`, String(league.region))
    if (league.foreignLimit !== undefined) {
      const f = league.foreignLimit
      if (!isObj(f)) c.error('wrong-type', `${path}.foreignLimit`, 'foreignLimit')
      else {
        if (f.squad !== undefined && (!isInt(f.squad) || f.squad < 0 || f.squad > SQUAD_MAX)) c.error('out-of-range', `${path}.foreignLimit.squad`, String(f.squad), `0–${SQUAD_MAX}`)
        if (f.lineup !== undefined && (!isInt(f.lineup) || f.lineup < 0 || f.lineup > 11)) c.error('out-of-range', `${path}.foreignLimit.lineup`, String(f.lineup), '0–11')
      }
    }
    if (id === undefined) return
    if (leagueIds.has(id)) c.error('duplicate-id', `${path}.id`, id)
    leagueIds.add(id)
    leagues.push({ id, ...(country !== undefined ? { country } : {}), ...(level !== undefined ? { level } : {}), ...(teams !== undefined ? { teams } : {}), ...(promotion !== undefined ? { promotion } : {}), ...(relegation !== undefined ? { relegation } : {}), path })
  })

  // Clubes
  const clubIds = new Set<string>()
  const abbreviations = new Set<string>()
  const clubLeague = new Map<string, string>()
  ;(input.clubs as unknown[]).forEach((club, i) => {
    const path = `clubs[${i}]`
    if (!isObj(club)) return c.error('wrong-type', path, 'club')
    const id = text(c, club, 'id', path)
    text(c, club, 'name', path)
    const abbreviation = text(c, club, 'abbreviation', path)
    if (abbreviation !== undefined) {
      if (!/^[A-Z]{3}$/.test(abbreviation)) c.error('out-of-range', `${path}.abbreviation`, abbreviation, '3 letras maiúsculas')
      else if (abbreviations.has(abbreviation)) c.error('duplicate-id', `${path}.abbreviation`, abbreviation)
      abbreviations.add(abbreviation)
    }
    text(c, club, 'city', path)
    if (club.state !== undefined && typeof club.state !== 'string') c.error('wrong-type', `${path}.state`, 'state')
    if (!Array.isArray(club.colors) || club.colors.length !== 2) c.error(club.colors === undefined ? 'missing-field' : 'wrong-type', `${path}.colors`, 'colors')
    else club.colors.forEach((color, k) => !(typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) && c.error('bad-color', `${path}.colors[${k}]`, String(color)))
    if (!isObj(club.stadium)) c.error(club.stadium === undefined ? 'missing-field' : 'wrong-type', `${path}.stadium`, 'stadium')
    else {
      text(c, club.stadium, 'name', `${path}.stadium`)
      int(c, club.stadium, 'capacity', `${path}.stadium`, 500, 300_000)
    }
    int(c, club, 'reputation', path, 1, 20)
    const league = text(c, club, 'league', path)
    if (league !== undefined && !leagueIds.has(league)) c.error('unknown-reference', `${path}.league`, league)
    if (id === undefined) return
    if (clubIds.has(id)) c.error('duplicate-id', `${path}.id`, id)
    clubIds.add(id)
    if (league !== undefined) clubLeague.set(id, league)
  })

  // Jogadores
  const playerIds = new Set<string>()
  const squads = new Map<string, { path: string; total: number; goalkeepers: number }>()
  const clubPath = new Map<string, string>()
  ;(input.clubs as unknown[]).forEach((club, i) => isObj(club) && typeof club.id === 'string' && clubPath.set(club.id, `clubs[${i}]`))
  ;(input.players as unknown[]).forEach((player, i) => {
    const club = checkPlayer(c, player, `players[${i}]`, clubIds, playerIds, true)
    if (typeof club !== 'string') return
    const entry = squads.get(club) ?? { path: clubPath.get(club) ?? club, total: 0, goalkeepers: 0 }
    entry.total++
    if (isObj(player) && player.position === 'GK') entry.goalkeepers++
    squads.set(club, entry)
  })
  if (input.academy !== undefined) {
    if (!Array.isArray(input.academy)) c.error('wrong-type', 'academy', 'academy')
    else input.academy.forEach((player, i) => checkPlayer(c, player, `academy[${i}]`, clubIds, playerIds, false))
  }

  for (const id of clubIds) {
    const squad = squads.get(id)
    const path = clubPath.get(id) ?? id
    if (!squad) c.error('club-without-players', path, id)
    else if (squad.total < SQUAD_MIN || squad.total > SQUAD_MAX) c.error('club-squad-size', path, squad.total, `${SQUAD_MIN}–${SQUAD_MAX}`)
    else if (squad.goalkeepers === 0) c.error('club-no-goalkeeper', path, id)
  }

  // Número de times de cada liga: o declarado contra os clubes que a escolheram
  const counts = new Map<string, number>()
  for (const league of clubLeague.values()) counts.set(league, (counts.get(league) ?? 0) + 1)
  for (const league of leagues) {
    const found = counts.get(league.id) ?? 0
    if (league.teams !== undefined && found !== league.teams) c.error('league-team-count', `${league.path}.teams`, found, league.teams)
  }

  // Pirâmides: cada país tem de 1 a 3 divisões em sequência (1, 2, 3), e quem cai de uma divisão é quem sobe para a de baixo.
  const byCountry = new Map<string, typeof leagues>()
  for (const league of leagues) if (league.country !== undefined) byCountry.set(league.country, [...(byCountry.get(league.country) ?? []), league])
  for (const [country, divisions] of byCountry) {
    const sorted = [...divisions].sort((x, y) => (x.level ?? 0) - (y.level ?? 0))
    if (sorted.length > SUPPORTED.maxDivisions || sorted.some((d, i) => d.level !== i + 1)) {
      c.error('unsupported-leagues', sorted[0]?.path ?? 'leagues', sorted.length, country)
      continue
    }
    sorted.forEach((league, i) => {
      const below = sorted[i + 1]
      const above = sorted[i - 1]
      if (league.promotion !== undefined && league.promotion !== (above ? (above.relegation ?? league.promotion) : 0)) c.error('league-promotion', `${league.path}.promotion`, league.promotion, above ? (above.relegation ?? 0) : 0)
      if (league.relegation !== undefined && league.relegation !== (below ? (below.promotion ?? league.relegation) : 0)) c.error('league-promotion', `${league.path}.relegation`, league.relegation, below ? (below.promotion ?? 0) : 0)
      if (league.teams !== undefined && league.promotion !== undefined && league.relegation !== undefined && league.promotion + league.relegation > league.teams / 2) c.error('league-promotion', `${league.path}.promotion`, league.promotion + league.relegation, `até ${league.teams / 2}`)
    })
  }

  if (c.errors.length > 0) return done()
  return { pkg: input as unknown as DataPackage, report: { errors: [], warnings: c.warnings } }
}

/** Lê o texto de um arquivo de pacote (JSON) e valida. */
export function parsePackage(textContent: string): { pkg?: DataPackage; report: PackageReport } {
  let data: unknown
  try {
    data = JSON.parse(textContent)
  } catch {
    return { report: { errors: [{ code: 'not-json', path: '$' }], warnings: [] } }
  }
  return validatePackage(data)
}
