import { ACADEMY, OFFSEASON } from '../engine/config'
import { contractEndOn } from '../engine/season/dates'
import type { YouthFactory } from '../engine/offseason'
import { playerOverall } from '../engine/overall'
import { createGenerationContext, generatePlayer } from './generatePlayer'
import { GENERATION } from './generationConfig'
import { teamLevelFor, withLeagueSalary } from './generateTeam'

/**
 * Jovens novos: para a base (15 a 19 anos, `request.academy`) ou, na reposição de posições descobertas, direto
 * no elenco profissional (16 a 19 anos). A qualidade fica perto do nível do time (reservas), com uma pequena
 * chance de promessa bem acima disso. Como a geração desconta a idade dos atributos, quem chega aos 15 anos
 * chega fraco e com muito potencial para crescer. O motor chama isto sem conhecer a geração.
 */
export const createYouth: YouthFactory = (request, rng, taken) => {
  const Y = OFFSEASON.youth
  const ctx = createGenerationContext(request.year)
  ctx.usedNames = new Set(taken)
  const club = { tier: request.tier as 1 | 2 | 3, ...(request.economy ? { economy: request.economy } : {}) }
  const level = teamLevelFor({ ...club, reputation: request.reputation })
  const wonderkidChance = (request.academy ? ACADEMY.wonderkidChance : Y.wonderkidChance) * (Y.wonderkidTierScale[request.tier] ?? 1)
  return request.positions.map((position, i) => {
    let quality = level - (Y.qualityBelowTeam[request.tier] ?? 7) + (request.academy ? (ACADEMY.qualityOffset[request.tier] ?? 0) : 0) + rng.normal(0, GENERATION.talentSd)
    const wonderkid = rng.chance(wonderkidChance)
    if (wonderkid) quality = rng.normal(Y.wonderkidQuality, Y.wonderkidQualitySd)
    else if (rng.chance(request.academy ? ACADEMY.prospectChance : Y.prospectChance)) quality += rng.float(Y.prospectBonus[0], Y.prospectBonus[1])
    const age = request.ages?.[i] ?? rng.int(Y.ageRange[0], Y.ageRange[1])
    const generated = generatePlayer(rng, ctx, { position, quality, age, teamId: request.teamId, tier: request.tier })
    const player = withLeagueSalary(request.academy && !wonderkid ? { ...generated, hidden: { ...generated.hidden, potential: Math.max(Math.round(playerOverall(generated)), generated.hidden.potential + (ACADEMY.potentialOffset[request.tier] ?? 0)) } } : generated, club)
    const salary = player.contract.salary
    return { ...player, contract: { ...player.contract, endDate: contractEndOn(request.year + rng.int(2, 4)), releaseClause: Math.round((salary * rng.int(24, 48)) / 1000) * 1000 } }
  })
}
