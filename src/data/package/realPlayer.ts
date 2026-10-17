import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from '../../engine/config'
import { salaryForOverall, scaledSalary } from '../../engine/market/value'
import { overallForPosition } from '../../engine/overall'
import { createRng } from '../../engine/rng'
import { ageOn, contractEndOn } from '../../engine/season/dates'
import type { Foot, LeagueEconomy, Nationality, Player, PlayerId, Position, TeamId } from '../../engine/types'
import { generateAttributes, hiddenAttribute, pickFoot, pickSecondaryPositions, qualityFloorFor, softCap } from '../generatePlayer'
import { starChance, teamLevelFor } from '../generateTeam'
import { GENERATION } from '../generationConfig'
import type { PackagePlayer } from './types'

/** Parte dos jogadores de um elenco que faz papel de titular (14 de 24 no molde do mundo fictício, ~54% com a profundidade). */
const STARTER_SHARE = 0.54

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Nível de um clube (ajuste fixo por clube, em torno do nível que a reputação e a divisão dão). */
export function clubLevel(club: { id: string; reputation: number }, tier: 1 | 2 | 3, economy?: LeagueEconomy): number {
  return teamLevelFor({ tier, reputation: club.reputation, ...(economy ? { economy } : {}) }) + createRng(`club-level:${club.id}`).normal(0, GENERATION.teamLevelSd)
}

export interface RealPlayerContext {
  /** Ano da temporada inicial (os contratos são contados a partir dele). */
  startYear: number
  /** Divisão do clube na pirâmide (1 a 3 nesta fase). */
  tier: 1 | 2 | 3
  /** Economia da liga do clube (padrão: a do Brasil). */
  economy?: LeagueEconomy
  /** `null` = jogador livre: usa o nível de um clube médio da divisão. */
  club: { id: string; reputation: number } | null
}

/**
 * Jogador do pacote como o jogo usa. O que o pacote não traz é gerado de forma **estável**: o sorteio vem só da
 * identidade do jogador (nome, nascimento, nacionalidade e posição), então o mesmo jogador tem sempre os mesmos
 * atributos, na mesma ordem de sorteios haja o que houver no pacote. O nível vem da reputação do clube e da divisão
 * (as mesmas faixas do mundo fictício), e a idade, da data de nascimento.
 */
export function generateRealPlayer(spec: PackagePlayer, id: PlayerId, teamId: TeamId | null, ctx: RealPlayerContext): Player {
  const rng = createRng(`player:${spec.name}|${spec.birthDate}|${spec.nationality}|${spec.position}`)
  const age = ageOn(spec.birthDate, `${ctx.startYear}-01-01`)
  const reputation = ctx.club?.reputation ?? 8
  const level = ctx.club ? clubLevel(ctx.club, ctx.tier, ctx.economy) : teamLevelFor({ tier: ctx.tier, reputation, ...(ctx.economy ? { economy: ctx.economy } : {}) })

  // Sorteios sempre na mesma ordem: um campo dado pelo pacote só substitui o valor, nunca desloca os outros.
  const drawnFoot: Foot = pickFoot(rng, spec.position)
  const drawnSecondary: Position[] = pickSecondaryPositions(rng, spec.position)
  const starter = rng.next() < STARTER_SHARE
  let quality = level + rng.normal(0, GENERATION.talentSd) - (starter ? 0 : GENERATION.backupPenalty)
  const star = rng.chance(starChance({ tier: ctx.tier, reputation }))
  const starBonus = rng.float(GENERATION.star.bonusMin, GENERATION.star.bonusMax)
  if (starter && star) quality += starBonus
  const drawnAttributes = generateAttributes(rng, spec.position, quality, age, qualityFloorFor(ctx.tier))
  const g = GENERATION.growth
  const growth = Math.max(0, g.untilAge - age) * rng.float(g.perYearMin, g.perYearMax) + rng.float(0, g.randomMax)
  const hidden = {
    consistency: hiddenAttribute(rng, GENERATION.hidden.consistency),
    injuryProneness: hiddenAttribute(rng, GENERATION.hidden.injuryProneness),
    professionalism: hiddenAttribute(rng, GENERATION.hidden.professionalism),
  }
  const contractYears = rng.weighted([0, 1, 2, 3, 4], (y) => [3, 4, 4, 3, 2][y] ?? 1)
  const clauseMonths = rng.int(24, 48)

  const attributes = spec.attributes ?? drawnAttributes
  const overall = overallForPosition(attributes, spec.position)
  const potential = spec.potential ?? clamp(Math.round(Math.max(overall, softCap(overall + growth))), Math.round(overall), ATTRIBUTE_MAX)
  const salary = scaledSalary(salaryForOverall(overall), { tier: ctx.tier, ...(ctx.economy ? { economy: ctx.economy } : {}) })

  const player: Player = {
    id,
    name: spec.name,
    birthDate: spec.birthDate,
    age,
    nationality: spec.nationality as Nationality,
    foot: spec.foot ?? drawnFoot,
    position: spec.position,
    secondaryPositions: spec.secondaryPositions ?? drawnSecondary,
    attributes,
    hidden: {
      potential: clamp(potential, ATTRIBUTE_MIN, ATTRIBUTE_MAX),
      consistency: spec.hidden?.consistency ?? hidden.consistency,
      injuryProneness: spec.hidden?.injuryProneness ?? hidden.injuryProneness,
      professionalism: spec.hidden?.professionalism ?? hidden.professionalism,
    },
    condition: { fitness: 100, morale: 70, form: 0, recentRatings: [], injuryDaysLeft: 0, yellowCards: 0, redCards: 0, suspensionGames: 0 },
    contract: spec.contract ?? { salary, endDate: contractEndOn(ctx.startYear + contractYears), releaseClause: Math.round((salary * clauseMonths) / 1000) * 1000 },
    teamId,
    seasonStats: { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, ratingSum: 0, ratedGames: 0, homeGoals: 0, awayGoals: 0, passAssists: 0, crossAssists: 0 },
  }
  if (spec.nickname) player.nickname = spec.nickname
  return player
}
