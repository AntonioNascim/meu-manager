/**
 * As copas de um pacote: as que ele define e, para cada país com liga que não definiu nenhuma copa dele, as copas padrão do país
 * (`countryCups.ts`) que cabem nas ligas dele. Um pacote com `cups: []` (lista vazia) não quer copas, nem as padrão.
 */
import type { CupSpec, Nationality } from '../../engine/types'
import { normalizeCup } from './cups'
import { defaultCupsFor } from './countryCups'
import type { PackageCup } from './types'
import { validateCups } from './validateCups'

interface PackageLike {
  cups?: PackageCup[]
  leagues: { id: string; country: string; level: number; teams?: number }[]
}

/** As copas padrão cabem nas ligas do país (vagas existentes, chaveamento que fecha)? */
function fits(cups: PackageCup[], pkg: PackageLike, country: string): boolean {
  let errors = 0
  validateCups(JSON.parse(JSON.stringify(cups)) as unknown, {
    leagues: pkg.leagues.map((l) => ({ id: l.id, country: l.country, ...(l.teams !== undefined ? { teams: l.teams } : {}) })),
    countries: new Set([country]),
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
export function defaultCupSpecsForCompetitions(competitions: readonly { id: string; tier: number; pyramid?: string; country?: string; teamIds: readonly string[] }[]): CupSpec[] {
  const leagues = competitions.map((c) => ({ id: c.id, country: c.country ?? 'Brazil', level: c.tier, teams: c.teamIds.length }))
  return cupsForPackage({ leagues }).cups.map((c) => normalizeCup(c))
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
    if (fits(defaults, pkg, country)) cups.push(...defaults)
    else skipped.push(country)
  }
  return { cups, skipped }
}
