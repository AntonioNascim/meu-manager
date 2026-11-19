/**
 * Posicionamento livre: cada titular pode ficar em qualquer ponto do campo (`Tactic.spots`, em percentual, só para a tela), e o motor
 * continua lendo um dos 26 pontos da grade (`Tactic.grid`): o ponto livre mais perto de cada jogador, sem repetir. Como o motor só vê a
 * grade, o papel de cada um (`slotAt`) e todas as contas, calibradas, ficam como sempre.
 * Funções puras.
 */
import { GK_POINT, allGridPoints, gridKey, gridSpot, slotAt } from './grid'
import type { PitchSpot } from './grid'
import { formationOf } from './formations'
import { positionFit } from './overall'
import type { GridPoint, Player, Position, Tactic } from './types'

export type { PitchSpot }

/** Tamanho (relativo) do campo desenhado: a largura vale 3 e a altura 5,1, como na tela, para medir distâncias sem achatar o campo. */
const FIELD_W = 3
const FIELD_H = 5.1

/** Dois jogadores a menos que isto de distância (nessas unidades) trocam de lugar quando um é solto sobre o outro. */
export const SWAP_RADIUS = 0.32

/** Limites onde um jogador de linha pode ser solto (o gol é só do goleiro). */
export const SPOT_LIMITS = { xMin: 5, xMax: 95, yMin: 5, yMax: 84 } as const

export const spotDistance = (a: PitchSpot, b: PitchSpot): number => Math.hypot(((a.x - b.x) / 100) * FIELD_W, ((a.y - b.y) / 100) * FIELD_H)

/** Põe o ponto dentro do campo (jogador de linha). */
export function clampSpot(s: PitchSpot): PitchSpot {
  const x = Number.isFinite(s.x) ? s.x : 50
  const y = Number.isFinite(s.y) ? s.y : 50
  return { x: Math.round(Math.min(SPOT_LIMITS.xMax, Math.max(SPOT_LIMITS.xMin, x)) * 10) / 10, y: Math.round(Math.min(SPOT_LIMITS.yMax, Math.max(SPOT_LIMITS.yMin, y)) * 10) / 10 }
}

/** Índice do goleiro na escalação: quem está no ponto do gol. */
export function keeperIndexOf(grid: readonly GridPoint[]): number {
  return grid.findIndex((p) => gridKey(p) === gridKey(GK_POINT))
}

/**
 * Da posição livre de cada titular ao ponto da grade que o motor lê: o goleiro fica no gol; cada um dos outros recebe o ponto livre
 * mais perto dele (os mais próximos de um ponto escolhem primeiro) e ninguém repete ponto. Um ajuste final troca pares enquanto isso
 * diminui a distância total. Sempre o mesmo resultado para as mesmas posições.
 */
export function assignGrid(spots: readonly PitchSpot[], keeper: number): GridPoint[] {
  const out: GridPoint[] = new Array(spots.length)
  if (keeper >= 0) out[keeper] = { ...GK_POINT }
  const free = allGridPoints().filter((p) => gridKey(p) !== gridKey(GK_POINT))
  const players = spots.map((_, i) => i).filter((i) => i !== keeper)
  const pairs: { i: number; p: number; d: number }[] = []
  for (const i of players) free.forEach((p, k) => pairs.push({ i, p: k, d: spotDistance(spots[i] as PitchSpot, gridSpot(p)) }))
  pairs.sort((a, b) => a.d - b.d || a.i - b.i || a.p - b.p)
  const pointOf = new Map<number, number>()
  const used = new Set<number>()
  for (const { i, p } of pairs) {
    if (pointOf.has(i) || used.has(p)) continue
    pointOf.set(i, p)
    used.add(p)
  }
  const cost = (i: number, p: number) => spotDistance(spots[i] as PitchSpot, gridSpot(free[p] as GridPoint))
  for (let pass = 0; pass < 20; pass++) {
    let improved = false
    for (let a = 0; a < players.length; a++) {
      for (let b = a + 1; b < players.length; b++) {
        const ia = players[a] as number
        const ib = players[b] as number
        const pa = pointOf.get(ia) as number
        const pb = pointOf.get(ib) as number
        if (cost(ia, pb) + cost(ib, pa) < cost(ia, pa) + cost(ib, pb) - 1e-9) {
          pointOf.set(ia, pb)
          pointOf.set(ib, pa)
          improved = true
        }
      }
    }
    if (!improved) break
  }
  for (const i of players) out[i] = { ...(free[pointOf.get(i) as number] as GridPoint) }
  return out
}

/** Confere os pontos livres vindos de fora (online, preferências): 11 pares x, y em percentual dentro do campo, sem campos a mais. */
export function parseSpots(v: unknown): PitchSpot[] | undefined {
  if (!Array.isArray(v) || v.length !== 11) return undefined
  const out: PitchSpot[] = []
  for (const s of v) {
    if (typeof s !== 'object' || s === null || Array.isArray(s)) return undefined
    const o = s as Record<string, unknown>
    if (Object.keys(o).length !== 2 || typeof o.x !== 'number' || typeof o.y !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.y) || o.x < 0 || o.x > 100 || o.y < 0 || o.y > 100) return undefined
    out.push({ x: o.x, y: o.y })
  }
  return out
}

/** Os pontos livres da tática, se ela os tem e batem com a grade que o motor lê; senão `undefined` (vale o centro de cada ponto da grade). */
export function freeSpotsOf(tactic: Pick<Tactic, 'formationId' | 'startingXI'> & { grid?: GridPoint[] | undefined; spots?: PitchSpot[] | undefined }): PitchSpot[] | undefined {
  const spots = tactic.spots
  if (!spots || spots.length !== tactic.startingXI.length) return undefined
  const grid = formationOf(tactic).grid
  if (grid.length !== spots.length) return undefined
  const again = assignGrid(spots, keeperIndexOf(grid))
  return again.every((p, i) => gridKey(p) === gridKey(grid[i] as GridPoint)) ? spots : undefined
}

/** Onde desenhar cada titular: o ponto livre, ou o centro do ponto da grade quando não há. */
export function spotsOf(tactic: Pick<Tactic, 'formationId' | 'startingXI'> & { grid?: GridPoint[] | undefined; spots?: PitchSpot[] | undefined }): PitchSpot[] {
  return freeSpotsOf(tactic)?.map((s) => ({ ...s })) ?? formationOf(tactic).grid.map((p) => gridSpot(p))
}

/** Os pontos livres só valem guardados se algum difere do centro do ponto da grade (senão a tática é a de sempre). */
export function compactSpots(spots: readonly PitchSpot[], grid: readonly GridPoint[]): PitchSpot[] | undefined {
  const same = spots.every((s, i) => {
    const c = gridSpot(grid[i] as GridPoint)
    return Math.abs(s.x - c.x) < 0.05 && Math.abs(s.y - c.y) < 0.05
  })
  return same ? undefined : spots.map((s) => ({ x: s.x, y: s.y }))
}

export interface RoleRead {
  /** Papel que o motor entendeu para quem está nesse ponto. */
  role: Position
  /** Multiplicador de força nesse papel (1 = sem penalidade). */
  fit: number
  /** Penalidade em percentual inteiro (0 = nenhuma). */
  penalty: number
  /** O papel é a posição principal (`natural`), uma secundária (`secondary`) ou improvisado (`out`). */
  kind: 'natural' | 'secondary' | 'out'
  /** Os pontos livres caíram num ponto da grade diferente do mais perto (a zona estava cheia). */
  moved: boolean
}

/** O que o motor entendeu para o jogador no ponto da grade: o papel e a penalidade por jogar fora da posição. */
export function readRole(player: Pick<Player, 'position' | 'secondaryPositions'>, point: GridPoint): Omit<RoleRead, 'moved'> {
  const role = slotAt(point).position
  const fit = positionFit(player, role)
  return { role, fit, penalty: Math.round((1 - fit) * 100), kind: player.position === role ? 'natural' : player.secondaryPositions.includes(role) ? 'secondary' : 'out' }
}

/** Para cada titular, o papel entendido; `moved` quando o ponto da grade não é o mais perto da posição livre (zona cheia). */
export function readRoles(tactic: Pick<Tactic, 'formationId' | 'startingXI'> & { grid?: GridPoint[] | undefined; spots?: PitchSpot[] | undefined }, players: ReadonlyMap<string, Player>): (RoleRead | undefined)[] {
  const grid = formationOf(tactic).grid
  const spots = spotsOf(tactic)
  const all = allGridPoints()
  return tactic.startingXI.map((id, i) => {
    const player = players.get(id)
    const point = grid[i]
    if (!player || !point) return undefined
    const read = readRole(player, point)
    const spot = spots[i] as PitchSpot
    let nearest = point
    let best = Infinity
    for (const p of all) {
      if (gridKey(p) === gridKey(GK_POINT) && gridKey(point) !== gridKey(GK_POINT)) continue
      const d = spotDistance(spot, gridSpot(p))
      if (d < best - 1e-9) {
        best = d
        nearest = p
      }
    }
    return { ...read, moved: gridKey(nearest) !== gridKey(point) }
  })
}
