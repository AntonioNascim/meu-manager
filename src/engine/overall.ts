import { POSITION_FIT } from './config'
import { ATTRIBUTE_NAMES } from './types'
import type { AttributeName, Attributes, Player, Position } from './types'

export type PositionWeights = Partial<Record<AttributeName, number>>

/** Peso de cada atributo na força geral de cada posição. */
export const POSITION_WEIGHTS: Record<Position, PositionWeights> = {
  GK: { reflexes: 5, positioning: 4, rushingOut: 3, decisions: 1.5, passing: 0.5, strength: 0.5 },
  RB: {
    pace: 3, stamina: 3, tackling: 3, positioning: 2.5, crossing: 2.5,
    passing: 1.5, dribbling: 1.5, decisions: 1, strength: 1,
  },
  LB: {
    pace: 3, stamina: 3, tackling: 3, positioning: 2.5, crossing: 2.5,
    passing: 1.5, dribbling: 1.5, decisions: 1, strength: 1,
  },
  CB: {
    tackling: 4, heading: 4, positioning: 4, strength: 3, decisions: 2,
    pace: 1.5, passing: 1, determination: 1,
  },
  DM: {
    tackling: 4, positioning: 3.5, stamina: 3, passing: 2.5, strength: 2,
    decisions: 2, vision: 1.5, ballControl: 1,
  },
  CM: {
    passing: 4, vision: 3, ballControl: 3, stamina: 2.5, decisions: 2.5,
    positioning: 2, tackling: 2, dribbling: 1,
  },
  AM: {
    vision: 4, passing: 3.5, ballControl: 3.5, dribbling: 3, finishing: 2.5,
    decisions: 2.5, pace: 1,
  },
  RW: {
    pace: 4, dribbling: 4, crossing: 3.5, ballControl: 2.5, finishing: 2,
    passing: 1.5, stamina: 1.5, vision: 1,
  },
  LW: {
    pace: 4, dribbling: 4, crossing: 3.5, ballControl: 2.5, finishing: 2,
    passing: 1.5, stamina: 1.5, vision: 1,
  },
  ST: {
    finishing: 5, pace: 3, heading: 3, dribbling: 2.5, strength: 2.5,
    ballControl: 2.5, positioning: 2.5, decisions: 1.5, determination: 1,
  },
}

/** Pesos de cada posição já em lista (na ordem de ATTRIBUTE_NAMES) e com o total somado, para não refazer a conta a cada jogador. */
const WEIGHT_TABLE = Object.fromEntries(
  (Object.keys(POSITION_WEIGHTS) as Position[]).map((position) => {
    const weights = POSITION_WEIGHTS[position]
    const entries = ATTRIBUTE_NAMES.flatMap((name) => (weights[name] ? [[name, weights[name]] as const] : []))
    return [position, { entries, total: entries.reduce((sum, [, w]) => sum + w, 0) }]
  }),
) as Record<Position, { entries: (readonly [AttributeName, number])[]; total: number }>

/** Média ponderada dos atributos para a posição (escala 1 a 100; devolve decimal, arredondar só para exibir). */
export function overallForPosition(attributes: Attributes, position: Position): number {
  const { entries, total } = WEIGHT_TABLE[position]
  let sum = 0
  for (const [name, w] of entries) sum += w * attributes[name]
  return sum / total
}

/** Multiplicador por jogar fora da posição principal. */
export function positionFit(player: Pick<Player, 'position' | 'secondaryPositions'>, position: Position): number {
  if (player.position === position) return 1
  if (player.secondaryPositions.includes(position)) return POSITION_FIT.secondary
  if (player.position === 'GK' || position === 'GK') return POSITION_FIT.goalkeeperMismatch
  return POSITION_FIT.outOfPosition
}

/** Força geral na posição principal. */
export function playerOverall(player: Player): number {
  return overallForPosition(player.attributes, player.position)
}

/** Força efetiva ao jogar em `position` (com penalidade se for improvisado). */
export function overallAt(player: Player, position: Position): number {
  return overallForPosition(player.attributes, position) * positionFit(player, position)
}
