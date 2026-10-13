/**
 * Posição de cada vaga da formação no campo desenhado (percentuais; ataque para cima, goleiro embaixo).
 * Vem só das posições das vagas, então qualquer formação nova funciona sem tabela própria.
 */
import { getFormation } from '../engine/formations'
import { GK_POINT, allGridPoints } from '../engine/grid'
import type { FormationSlot, GridPoint, Position } from '../engine/types'

export interface PitchPoint {
  x: number
  y: number
}

type Row = 'gk' | 'def' | 'att' | 'm0' | 'm1' | 'm2'

const MID_ROWS: Row[] = ['m0', 'm1', 'm2']
/** Lado em que o jogador joga: esquerda, centro ou direita (esquerda do campo = esquerda da tela). */
const LATERAL: Partial<Record<Position, number>> = { LB: 0, LW: 0, RB: 2, RW: 2 }

function rowOf(slot: FormationSlot, hasAttackingMid: boolean): Row {
  if (slot.position === 'GK') return 'gk'
  if (slot.sector === 'defense') return 'def'
  if (slot.sector === 'attack') return 'att'
  if (slot.position === 'DM') return 'm0'
  if (slot.position === 'AM') return 'm2'
  // Pontas no meio-campo ficam na linha do meia atacante quando há um; alas e meias, na linha do meio.
  if ((slot.position === 'RW' || slot.position === 'LW') && hasAttackingMid) return 'm2'
  return 'm1'
}

export function pitchLayout(formationId: string): PitchPoint[] {
  const { slots } = getFormation(formationId)
  const hasAttackingMid = slots.some((s) => s.position === 'AM')
  const rows = slots.map((s) => rowOf(s, hasAttackingMid))
  const midRows = MID_ROWS.filter((r) => rows.includes(r))
  const yOf: Record<Row, number> = { gk: 91, def: 74, att: 15, m0: 0, m1: 0, m2: 0 }
  // As linhas do meio se espalham entre o fundo e a frente do meio-campo.
  const top = 56
  const bottom = 34
  midRows.forEach((r, i) => {
    yOf[r] = midRows.length === 1 ? 45 : top - ((top - bottom) * i) / (midRows.length - 1)
  })

  const points: PitchPoint[] = slots.map(() => ({ x: 50, y: 0 }))
  for (const row of new Set(rows)) {
    const members = slots
      .map((s, index) => ({ s, index }))
      .filter(({ index }) => rows[index] === row)
      .sort((a, b) => (LATERAL[a.s.position] ?? 1) - (LATERAL[b.s.position] ?? 1) || a.index - b.index)
    members.forEach(({ index }, i) => {
      points[index] = { x: Math.round(((i + 1) / (members.length + 1)) * 100), y: yOf[row] }
    })
  }
  return points
}

/** Posição (percentual) de cada faixa e de cada linha da grade no campo desenhado (ataque para cima, goleiro embaixo). */
export const LANE_X = [14, 32, 50, 68, 86] as const
export const ROW_Y = [91, 75, 59, 46, 33, 16] as const

export const gridCoords = (p: GridPoint): PitchPoint => ({ x: LANE_X[p.lane] as number, y: ROW_Y[p.row] as number })

/** Ponto da grade mais perto de uma posição (percentual) do campo; `w` e `h` são o tamanho do campo, para medir a distância em pixels. */
export function nearestGridPoint(x: number, y: number, w = 3, h = 5.1): GridPoint {
  let best: GridPoint = GK_POINT
  let bestDistance = Infinity
  for (const p of allGridPoints()) {
    const c = gridCoords(p)
    const d = Math.hypot(((c.x - x) / 100) * w, ((c.y - y) / 100) * h)
    if (d < bestDistance) {
      bestDistance = d
      best = p
    }
  }
  return best
}
