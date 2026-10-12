import { OFFSEASON } from '../engine/config'
import type { YouthFactory } from '../engine/offseason'
import { createGenerationContext, generatePlayer } from './generatePlayer'
import { GENERATION } from './generationConfig'
import { teamLevelFor } from './generateTeam'

/**
 * Jovens que sobem da base na virada de temporada: 16 a 19 anos, qualidade perto do nível do time
 * (reservas), com uma pequena chance de promessa bem acima disso. O motor chama isto sem conhecer a geração.
 */
export const createYouth: YouthFactory = (request, rng, taken) => {
  const Y = OFFSEASON.youth
  const ctx = createGenerationContext(request.year)
  ctx.usedNames = new Set(taken)
  const level = teamLevelFor({ tier: request.tier as 1 | 2, reputation: request.reputation })
  return request.positions.map((position) => {
    let quality = level - (Y.qualityBelowTeam[request.tier] ?? 7) + rng.normal(0, GENERATION.talentSd)
    const wonderkid = rng.chance(Y.wonderkidChance)
    if (wonderkid) quality = rng.normal(Y.wonderkidQuality, Y.wonderkidQualitySd)
    else if (rng.chance(Y.prospectChance)) quality += rng.float(Y.prospectBonus[0], Y.prospectBonus[1])
    const player = generatePlayer(rng, ctx, { position, quality, age: rng.int(Y.ageRange[0], Y.ageRange[1]), teamId: request.teamId })
    const salary = player.contract.salary
    return { ...player, contract: { ...player.contract, endDate: `${request.year + rng.int(2, 4)}-12-31`, releaseClause: Math.round((salary * rng.int(24, 48)) / 1000) * 1000 } }
  })
}
