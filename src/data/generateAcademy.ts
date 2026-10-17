import { ACADEMY } from '../engine/config'
import { CORE_COUNTS } from '../engine/offseason/squad'
import { createRng } from '../engine/rng'
import { contractEndOn } from '../engine/season/dates'
import type { Player, Position, Team } from '../engine/types'
import { createYouth } from './generateYouth'

const POSITION_BAG: Position[] = (Object.keys(CORE_COUNTS) as Position[]).flatMap((p) => Array<Position>(CORE_COUNTS[p]).fill(p))

export interface AcademyOptions {
  teams: readonly Team[]
  /** Mesma semente = mesma base. */
  seed: number | string
  /** Ano da temporada em andamento. */
  year: number
  /** Número do primeiro `player-N` livre. */
  firstNumber: number
  /** Nomes que já existem no mundo (a base não repete). */
  takenNames: Iterable<string>
}

/**
 * A base inicial de cada clube (mundo novo ou save antigo): de 7 a 12 jovens de 15 a 19 anos, mais
 * quanto maior a reputação, com a qualidade que a geração de jovens dá para a divisão e a reputação do clube.
 */
export function createAcademy(options: AcademyOptions): Player[] {
  const rng = createRng(`${options.seed}:academy:${options.year}`)
  const taken = new Set(options.takenNames)
  const { min, max } = ACADEMY.initialSize
  const out: Player[] = []
  let number = options.firstNumber
  for (const team of options.teams) {
    const size = Math.max(min, Math.min(max, Math.round(min + ((team.reputation - 1) / 19) * (max - min)) + rng.int(-1, 1)))
    const positions = Array.from({ length: size }, () => rng.pick(POSITION_BAG))
    const ages = positions.map(() => rng.int(ACADEMY.minAge, ACADEMY.graduationAge - 1))
    const made = createYouth({ teamId: team.id, tier: team.tier, reputation: team.reputation, ...(team.economy ? { economy: team.economy } : {}), ...(team.country ? { country: team.country } : {}), positions, ages, academy: true, year: options.year }, rng, taken)
    for (const p of made) {
      taken.add(p.name)
      out.push({ ...p, id: `player-${number++}`, teamId: team.id, contract: { salary: 0, endDate: contractEndOn(options.year), releaseClause: 0 } })
    }
  }
  return out
}
