/**
 * O que a tela de novo jogo mostra de um mundo: países, as divisões de cada um e os clubes de cada divisão. Mundo sem ligas
 * explícitas (o fictício de sempre) é um país só, o Brasil, com as séries pelo `tier`.
 */
import type { World } from '../data/generateWorld'
import type { Nationality, Team } from '../engine/types'

export interface DivisionChoice {
  id: string
  name: string
  tier: number
  teams: Team[]
}

export interface CountryChoice {
  country: Nationality
  divisions: DivisionChoice[]
}

const SERIES = ['Série A', 'Série B', 'Série C']

export function worldChoices(world: Pick<World, 'teams' | 'competitions'>): CountryChoice[] {
  if (!world.competitions) {
    const tiers = [...new Set(world.teams.map((t) => t.tier))].sort((a, b) => a - b)
    return [{ country: 'Brazil', divisions: tiers.map((tier) => ({ id: `serie-${tier}`, name: SERIES[tier - 1] ?? `Série ${tier}`, tier, teams: world.teams.filter((t) => t.tier === tier) })) }]
  }
  const out: CountryChoice[] = []
  for (const c of world.competitions) {
    const country = c.country ?? 'Brazil'
    let entry = out.find((e) => e.country === country)
    if (!entry) out.push((entry = { country, divisions: [] }))
    entry.divisions.push({ id: c.id, name: c.name, tier: c.tier, teams: [...c.teams] })
  }
  for (const e of out) e.divisions.sort((a, b) => a.tier - b.tier)
  return out
}
