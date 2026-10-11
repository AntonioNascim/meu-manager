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
  /** Nível-base do jogador (escala dos atributos, antes de idade e ruído). */
  quality: number
  age: number
  teamId: TeamId
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

/** Importância de cada atributo para a posição, vinda dos mesmos pesos da força geral. */
function emphasis(position: Position, name: AttributeName): number {
  const weights = POSITION_WEIGHTS[position]
  const maxWeight = Math.max(...Object.values(weights))
  const w = weights[name]
  return w ? 0.45 + (0.75 * w) / maxWeight : 0.4
}

function generateAttributes(rng: Rng, position: Position, quality: number, age: number): Attributes {
  // Jovens ainda não se desenvolveram; veteranos perdem físico mas ganham leitura de jogo.
  const base = quality - Math.max(0, 22 - age) * 0.6
  const physicalDecline = Math.max(0, age - 30) * 0.45
  const mentalGain = clamp((age - 26) * 0.25, 0, 1.5)

  const attributes = {} as Attributes
  for (const name of ATTRIBUTE_NAMES) {
    if ((name === 'reflexes' || name === 'rushingOut') && position !== 'GK') {
      attributes[name] = rng.int(1, 3)
      continue
    }
    let value = base * emphasis(position, name) + rng.normal(0, 1.2)
    if (name === 'pace' || name === 'stamina') value -= physicalDecline
    if (name === 'strength') value -= physicalDecline * 0.4
    if (name === 'vision' || name === 'positioning' || name === 'decisions' || name === 'determination') {
      value += mentalGain
    }
    attributes[name] = clamp(Math.round(value), 1, 20)
  }
  return attributes
}

/** Salário mensal em R$: cresce exponencialmente com a força geral. */
export function salaryForOverall(overall: number): number {
  const raw = 8000 * Math.pow(1.33, overall - 5)
  return Math.max(5000, Math.round(raw / 500) * 500)
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
  const growth = Math.max(0, 26 - spec.age) * rng.float(0.2, 0.7) + rng.float(0, 0.8)
  const potential = clamp(Math.round(overall + growth), Math.round(overall), 20)

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
      consistency: clamp(Math.round(rng.normal(12, 3)), 1, 20),
      injuryProneness: clamp(Math.round(rng.normal(10, 4)), 1, 20),
      professionalism: clamp(Math.round(rng.normal(12, 3.5)), 1, 20),
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
    seasonStats: { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 },
  }
  if (nickname) player.nickname = nickname
  return player
}
