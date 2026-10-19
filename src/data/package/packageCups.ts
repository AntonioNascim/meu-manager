/**
 * As copas de um pacote: as que ele define e, para cada país com liga que não definiu nenhuma copa dele, as copas padrão do país
 * (`countryCups.ts`) que cabem nas ligas dele. Um pacote com `cups: []` (lista vazia) não quer copas, nem as padrão.
 */
import type { CupSpec, Nationality, Region } from '../../engine/types'
import { countryRegion, countryRevenue, defaultContinentalCups } from './continentalCups'
import type { ContinentalLeague } from './continentalCups'
import { normalizeCup } from './cups'
import { defaultCupsFor } from './countryCups'
import type { PackageCup } from './types'
import { validateCups } from './validateCups'

interface PackageLike {
  cups?: PackageCup[]
  leagues: { id: string; country: string; level: number; teams?: number; region?: Region; economy?: { revenue: number } }[]
}

/** As copas padrão cabem nas ligas do país (vagas existentes, chaveamento que fecha)? */
function fits(cups: PackageCup[], pkg: PackageLike, countries: Iterable<string>): boolean {
  let errors = 0
  validateCups(JSON.parse(JSON.stringify(cups)) as unknown, {
    leagues: pkg.leagues.map((l) => ({ id: l.id, country: l.country, ...(l.teams !== undefined ? { teams: l.teams } : {}) })),
    countries: new Set(countries),
    error: () => {
      errors++
    },
    warn: () => undefined,
  })
  return errors === 0
}

/**
 * As copas padrão para um mundo que já existe (um save de antes das copas): pelas competições dele, cada país com liga recebe as
 * copas padrão que cabem. Os ids das ligas são os das competições.
 */
export function defaultCupSpecsForCompetitions(competitions: readonly { id: string; tier: number; pyramid?: string; country?: string; region?: Region; economy?: { revenue: number }; teamIds: readonly string[] }[]): CupSpec[] {
  const leagues = competitions.map((c) => ({ id: c.id, country: c.country ?? 'Brazil', level: c.tier, teams: c.teamIds.length, ...(c.region ? { region: c.region } : {}), ...(c.economy ? { economy: c.economy } : {}) }))
  return cupsForPackage({ leagues }).cups.map((c) => normalizeCup(c))
}

/** A copa nacional do país (a primeira, que não é supercopa): o campeão dela ganha vaga continental. */
const nationalCupOf = (cups: readonly PackageCup[], country: string): { nationalCup?: string } => {
  const cup = cups.find((c) => c.country === country && (c.kind ?? 'cup') === 'cup')
  return cup ? { nationalCup: cup.id } : {}
}

export function cupsForPackage(pkg: PackageLike): { cups: PackageCup[]; skipped: string[] } {
  if (pkg.cups !== undefined && pkg.cups.length === 0) return { cups: [], skipped: [] }
  const own = pkg.cups ?? []
  const cups = [...own]
  const skipped: string[] = []
  for (const country of [...new Set(pkg.leagues.map((l) => l.country))]) {
    if (own.some((c) => c.country === country)) continue
    const defaults = defaultCupsFor(country as Nationality, pkg.leagues.filter((l) => l.country === country))
    if (defaults.length === 0) continue
    // Cada copa é conferida junto com as outras do país (a supercopa cita a copa).
    if (fits(defaults, pkg, [country])) cups.push(...defaults)
    else skipped.push(country)
  }
  // Copas continentais: uma região sem copa continental no pacote ganha as padrão, se tem países suficientes e as vagas cabem.
  const members: ContinentalLeague[] = pkg.leagues
    .filter((l) => l.level === 1)
    .flatMap((l) => {
      const region = countryRegion(l.country, l.region)
      return region ? [{ id: l.id, country: l.country as Nationality, region, teams: l.teams ?? 0, revenue: countryRevenue(l.country, l.economy?.revenue), ...nationalCupOf(cups, l.country) }] : []
    })
  for (const region of ['SA', 'EU'] as const) {
    if (own.some((c) => c.country === undefined && c.region === region)) continue
    if (members.filter((m) => m.region === region).length < 5) continue
    const defaults = defaultContinentalCups(region, members)
    if (defaults && fits([...cups, ...defaults], pkg, new Set(pkg.leagues.map((l) => l.country)))) cups.push(...defaults)
    else skipped.push(region)
  }
  return { cups, skipped }
}
