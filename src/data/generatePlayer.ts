import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from '../engine/config'
import { salaryForOverall } from '../engine/market/value'
import { overallForPosition, POSITION_WEIGHTS } from '../engine/overall'
import type { Rng } from '../engine/rng'
import { ATTRIBUTE_NAMES } from '../engine/types'
import type {
  AttributeName,
  Attributes,
  Foot,
  Nationality,
  Player,
  PlayerId,
  Position,
  TeamId,
} from '../engine/types'
import {
  BRAZILIAN_FIRST_NAMES,
  BRAZILIAN_SECOND_NAMES,
  BRAZILIAN_SURNAMES,
  NAME_SUFFIXES,
  NICKNAMES,
  SPANISH_FIRST_NAMES,
  SPANISH_SURNAMES,
} from './names'
import { GENERATION } from './generationConfig'

/** Chance de o jogador ser estrangeiro (sul-americano). */
const FOREIGN_CHANCE = 0.06
const NICKNAME_CHANCE = 0.22
const SECOND_NAME_CHANCE = 0.3
const SUFFIX_CHANCE = 0.08

const FOREIGN_NATIONALITIES: readonly { nationality: Nationality; weight: number }[] = [
  { nationality: 'Argentina', weight: 5 },
  { nationality: 'Uruguay', weight: 4 },
  { nationality: 'Paraguay', weight: 3 },
  { nationality: 'Chile', weight: 2 },
  { nationality: 'Colombia', weight: 3 },
  { nationality: 'Peru', weight: 1 },
  { nationality: 'Ecuador', weight: 1 },
]

/** Posições em que o jogador pode ser improvisado com menos prejuízo. */
const NEIGHBOR_POSITIONS: Record<Position, readonly Position[]> = {
  GK: [],
  RB: ['CB', 'RW', 'DM'],
  LB: ['CB', 'LW', 'DM'],
  CB: ['DM', 'RB', 'LB'],
  DM: ['CM', 'CB'],
  CM: ['DM', 'AM'],
  AM: ['CM', 'ST', 'RW', 'LW'],
  RW: ['LW', 'AM', 'ST'],
  LW: ['RW', 'AM', 'ST'],
  ST: ['AM', 'RW', 'LW'],
}

export interface GenerationContext {
  startYear: number
  usedNames: Set<string>
  nextPlayerNumber: number
}

export function createGenerationContext(startYear: number): GenerationContext {
  return { startYear, usedNames: new Set(), nextPlayerNumber: 1 }
}

export interface PlayerSpec {
  position: Position
  /** Nível-base do jogador (força geral esperada, 1 a 100, antes de idade e ruído). */
  quality: number
  age: number
  /** `null` = jogador livre no mercado. */
  teamId: TeamId | null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Idade com mistura realista: poucos muito jovens/velhos, maioria entre 21 e 30. */
export function pickAge(rng: Rng): number {
  const band = rng.weighted(
    [
      { min: 17, max: 20, weight: 17 },
      { min: 21, max: 25, weight: 30 },
      { min: 26, max: 30, weight: 30 },
      { min: 31, max: 34, weight: 18 },
      { min: 35, max: 38, weight: 5 },
    ],
    (b) => b.weight,
  )
  return rng.int(band.min, band.max)
}

function pickNationality(rng: Rng): Nationality {
  if (!rng.chance(FOREIGN_CHANCE)) return 'Brazil'
  return rng.weighted(FOREIGN_NATIONALITIES, (n) => n.weight).nationality
}

function pickFoot(rng: Rng, position: Position): Foot {
  const roll = rng.next()
  if (position === 'LB' || position === 'LW') return roll < 0.78 ? 'left' : roll < 0.9 ? 'right' : 'both'
  if (position === 'RB' || position === 'RW') return roll < 0.78 ? 'right' : roll < 0.9 ? 'left' : 'both'
  return roll < 0.68 ? 'right' : roll < 0.92 ? 'left' : 'both'
}

function drawName(rng: Rng, nationality: Nationality): string {
  if (nationality !== 'Brazil') {
    return `${rng.pick(SPANISH_FIRST_NAMES)} ${rng.pick(SPANISH_SURNAMES)}`
  }
  let first: string = rng.pick(BRAZILIAN_FIRST_NAMES)
  if (rng.chance(SECOND_NAME_CHANCE)) {
    const second = rng.pick(BRAZILIAN_SECOND_NAMES)
    if (second !== first) first = `${first} ${second}`
  }
  let surname: string = rng.pick(BRAZILIAN_SURNAMES)
  if (rng.chance(SUFFIX_CHANCE)) surname = `${surname} ${rng.pick(NAME_SUFFIXES)}`
  return `${first} ${surname}`
}

function pickUniqueName(rng: Rng, ctx: GenerationContext, nationality: Nationality): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const name = drawName(rng, nationality)
    if (!ctx.usedNames.has(name)) {
      ctx.usedNames.add(name)
      return name
    }
  }
  // Banco de nomes esgotado para esta combinação: desambigua com um número no fim.
  let n = 2
  const base = drawName(rng, nationality)
  while (ctx.usedNames.has(`${base} ${n}`)) n++
  const name = `${base} ${n}`
  ctx.usedNames.add(name)
  return name
}

function pickSecondaryPositions(rng: Rng, position: Position): Position[] {
  const neighbors = NEIGHBOR_POSITIONS[position]
  if (neighbors.length === 0) return []
  const roll = rng.next()
  const count = roll < 0.3 ? 0 : roll < 0.85 ? 1 : 2
  return rng.shuffle(neighbors).slice(0, count)
}

const offsetCache = new Map<Position, Record<AttributeName, number>>()

/**
 * Quanto cada atributo fica acima/abaixo do nível do jogador, conforme a importância
 * dele na posição (mesmos pesos da força geral). Centralizado para que a força geral
 * resultante fique em torno do nível-base: atributos-chave sobem, os irrelevantes caem.
 */
function attributeOffsets(position: Position): Record<AttributeName, number> {
  const cached = offsetCache.get(position)
  if (cached) return cached

  const weights = POSITION_WEIGHTS[position]
  const maxWeight = Math.max(...Object.values(weights))
  const raw = {} as Record<AttributeName, number>
  let weightedSum = 0
  let weightTotal = 0
  for (const name of ATTRIBUTE_NAMES) {
    const w = weights[name]
    const importance = w ? 0.45 + (0.75 * w) / maxWeight : 0.4
    const { above, below } = GENERATION.emphasis
    raw[name] = importance >= 1 ? (importance - 1) * above : (importance - 1) * below
    if (w) {
      weightedSum += w * raw[name]
      weightTotal += w
    }
  }
  const center = weightedSum / weightTotal
  const offsets = {} as Record<AttributeName, number>
  for (const name of ATTRIBUTE_NAMES) offsets[name] = raw[name] - center
  offsetCache.set(position, offsets)
  return offsets
}

/** Comprime valores muito altos, para que atributos acima de 90 sejam raros. */
function softCap(value: number): number {
  const { softCap: cap, softCapFactor } = GENERATION
  return value > cap ? cap + (value - cap) * softCapFactor : value
}

function generateAttributes(rng: Rng, position: Position, quality: number, age: number): Attributes {
  const a = GENERATION.age
  // Jovens ainda não se desenvolveram; veteranos perdem físico mas ganham leitura de jogo.
  const base = Math.max(
    GENERATION.qualityFloor,
    quality - Math.max(0, a.fullGrowthAge - age) * a.youthPenaltyPerYear,
  )
  const physicalDecline = Math.max(0, age - a.declineStartAge) * a.physicalDeclinePerYear
  const mentalGain = clamp((age - a.mentalGainStartAge) * a.mentalGainPerYear, 0, a.mentalGainMax)
  const offsets = attributeOffsets(position)

  const attributes = {} as Attributes
  for (const name of ATTRIBUTE_NAMES) {
    if ((name === 'reflexes' || name === 'rushingOut') && position !== 'GK') {
      const [low, high] = GENERATION.outfieldGoalkeeperRange
      attributes[name] = rng.int(low, high)
      continue
    }
    let value = base + offsets[name] + rng.normal(0, GENERATION.attributeNoiseSd)
    if (name === 'pace' || name === 'stamina') value -= physicalDecline
    if (name === 'strength') value -= physicalDecline * a.strengthDeclineShare
    if (name === 'vision' || name === 'positioning' || name === 'decisions' || name === 'determination') {
      value += mentalGain
    }
    attributes[name] = clamp(Math.round(softCap(value)), ATTRIBUTE_MIN, ATTRIBUTE_MAX)
  }
  return attributes
}

function hiddenAttribute(rng: Rng, dist: { mean: number; sd: number }): number {
  return clamp(Math.round(rng.normal(dist.mean, dist.sd)), ATTRIBUTE_MIN, ATTRIBUTE_MAX)
}

export function generatePlayer(rng: Rng, ctx: GenerationContext, spec: PlayerSpec): Player {
  const id: PlayerId = `player-${ctx.nextPlayerNumber++}`
  const nationality = pickNationality(rng)
  const name = pickUniqueName(rng, ctx, nationality)
  // Apelidos são em português: só jogadores brasileiros têm.
  const nickname = nationality === 'Brazil' && rng.chance(NICKNAME_CHANCE) ? rng.pick(NICKNAMES) : undefined

  const attributes = generateAttributes(rng, spec.position, spec.quality, spec.age)
  const overall = overallForPosition(attributes, spec.position)

  // Jovens têm margem para crescer; quem já passou dos 28 está no teto.
  const g = GENERATION.growth
  const growth = Math.max(0, g.untilAge - spec.age) * rng.float(g.perYearMin, g.perYearMax) + rng.float(0, g.randomMax)
  const potential = clamp(Math.round(Math.max(overall, softCap(overall + growth))), Math.round(overall), ATTRIBUTE_MAX)

  const salary = salaryForOverall(overall)
  const contractYears = rng.weighted([0, 1, 2, 3, 4], (y) => [3, 4, 4, 3, 2][y] ?? 1)

  const player: Player = {
    id,
    name,
    age: spec.age,
    nationality,
    foot: pickFoot(rng, spec.position),
    position: spec.position,
    secondaryPositions: pickSecondaryPositions(rng, spec.position),
    attributes,
    hidden: {
      potential,
      consistency: hiddenAttribute(rng, GENERATION.hidden.consistency),
      injuryProneness: hiddenAttribute(rng, GENERATION.hidden.injuryProneness),
      professionalism: hiddenAttribute(rng, GENERATION.hidden.professionalism),
    },
    condition: {
      fitness: 100,
      morale: 70,
      form: 0,
      recentRatings: [],
      injuryDaysLeft: 0,
      yellowCards: 0,
      redCards: 0,
      suspensionGames: 0,
    },
    contract: {
      salary,
      endDate: `${ctx.startYear + contractYears}-12-31`,
      releaseClause: Math.round((salary * rng.int(24, 48)) / 1000) * 1000,
    },
    teamId: spec.teamId,
    seasonStats: { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, ratingSum: 0, ratedGames: 0 },
  }
  if (nickname) player.nickname = nickname
  return player
}
