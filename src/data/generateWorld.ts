import { createRng } from '../engine/rng'
import type { Player, Team } from '../engine/types'
import { createGenerationContext, generateTeam } from './generateTeam'
import { TEAM_DEFINITIONS } from './teamDefinitions'

export interface WorldOptions {
  /** Mesma semente = exatamente o mesmo mundo. */
  seed: number | string
  startYear?: number
}

export interface World {
  seed: number | string
  startYear: number
  /** Séries A e B, na ordem das definições (Série A primeiro). */
  teams: Team[]
  players: Player[]
}

export const DEFAULT_START_YEAR = 2026

export function generateWorld(options: WorldOptions): World {
  const startYear = options.startYear ?? DEFAULT_START_YEAR
  const rng = createRng(options.seed)
  const ctx = createGenerationContext(startYear)

  // Posição de cada time na sua série por reputação (empate: ordem das definições).
  const rankOf = new Map<string, number>()
  for (const tier of [1, 2] as const) {
    TEAM_DEFINITIONS.filter((d) => d.tier === tier)
      .map((def, index) => ({ def, index }))
      .sort((a, b) => b.def.reputation - a.def.reputation || a.index - b.index)
      .forEach(({ def }, i) => rankOf.set(def.abbreviation, i + 1))
  }

  const teams: Team[] = []
  const players: Player[] = []
  for (const def of TEAM_DEFINITIONS) {
    const generated = generateTeam(rng.fork(def.abbreviation), ctx, def, rankOf.get(def.abbreviation) ?? 20)
    teams.push(generated.team)
    players.push(...generated.players)
  }

  return { seed: options.seed, startYear, teams, players }
}
