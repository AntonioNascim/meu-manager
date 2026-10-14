import { formationFromGrid, points, sameGridSet } from './grid'
import type { Formation, GridPoint, Tactic } from './types'

/** Vagas na ordem: goleiro, defesa (da direita para a esquerda), depois meio e ataque. */
export const FORMATIONS: Record<string, Formation> = {
  '4-4-2': {
    id: '4-4-2',
    grid: points(...([[0,2],[1,4],[1,3],[1,1],[1,0],[3,4],[3,3],[3,1],[3,0],[5,3],[5,1]] as [number, number][])),
    slots: [
      { position: 'GK', sector: 'defense' },
      { position: 'RB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'LB', sector: 'defense' },
      { position: 'RW', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'LW', sector: 'midfield' },
      { position: 'ST', sector: 'attack' },
      { position: 'ST', sector: 'attack' },
    ],
  },
  '4-3-3': {
    id: '4-3-3',
    grid: points(...([[0,2],[1,4],[1,3],[1,1],[1,0],[2,2],[3,3],[3,1],[5,4],[5,2],[5,0]] as [number, number][])),
    slots: [
      { position: 'GK', sector: 'defense' },
      { position: 'RB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'LB', sector: 'defense' },
      { position: 'DM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'RW', sector: 'attack' },
      { position: 'ST', sector: 'attack' },
      { position: 'LW', sector: 'attack' },
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    grid: points(...([[0,2],[1,4],[1,3],[1,1],[1,0],[2,3],[2,1],[4,4],[4,2],[4,0],[5,2]] as [number, number][])),
    slots: [
      { position: 'GK', sector: 'defense' },
      { position: 'RB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'LB', sector: 'defense' },
      { position: 'DM', sector: 'midfield' },
      { position: 'DM', sector: 'midfield' },
      { position: 'RW', sector: 'midfield' },
      { position: 'AM', sector: 'midfield' },
      { position: 'LW', sector: 'midfield' },
      { position: 'ST', sector: 'attack' },
    ],
  },
  '4-3-1-2': {
    id: '4-3-1-2',
    grid: points(...([[0,2],[1,4],[1,3],[1,1],[1,0],[2,2],[3,3],[3,1],[4,2],[5,3],[5,1]] as [number, number][])),
    slots: [
      { position: 'GK', sector: 'defense' },
      { position: 'RB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'LB', sector: 'defense' },
      { position: 'DM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'AM', sector: 'midfield' },
      { position: 'ST', sector: 'attack' },
      { position: 'ST', sector: 'attack' },
    ],
  },
  '4-1-4-1': {
    id: '4-1-4-1',
    grid: points(...([[0,2],[1,4],[1,3],[1,1],[1,0],[2,2],[3,4],[3,3],[3,1],[3,0],[5,2]] as [number, number][])),
    slots: [
      { position: 'GK', sector: 'defense' },
      { position: 'RB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'LB', sector: 'defense' },
      { position: 'DM', sector: 'midfield' },
      { position: 'RW', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'LW', sector: 'midfield' },
      { position: 'ST', sector: 'attack' },
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    grid: points(...([[0,2],[1,3],[1,2],[1,1],[2,4],[2,2],[3,2],[4,2],[2,0],[5,3],[5,1]] as [number, number][])),
    slots: [
      { position: 'GK', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'RB', sector: 'midfield' },
      { position: 'DM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'AM', sector: 'midfield' },
      { position: 'LB', sector: 'midfield' },
      { position: 'ST', sector: 'attack' },
      { position: 'ST', sector: 'attack' },
    ],
  },
}

export const FORMATION_IDS = Object.keys(FORMATIONS)
export const DEFAULT_FORMATION_ID = '4-4-2'

export function getFormation(id: string): Formation {
  const formation = FORMATIONS[id]
  if (!formation) throw new Error(`Formação desconhecida: ${id}`)
  return formation
}

/** Grade (um ponto por vaga) de uma formação pronta. */
export const readyGrid = (id: string): GridPoint[] => getFormation(id).grid.map((p) => ({ ...p }))

/**
 * Vagas de uma tática: a grade guardada (posicionamento livre) ou, sem ela, a da formação pronta. Se a grade guardada
 * é a de uma formação pronta (mesmos pontos), devolve a própria formação pronta (mesma ordem de vagas).
 */
export function formationOf(tactic: Pick<Tactic, 'formationId'> & { grid?: GridPoint[] | undefined }): Formation {
  const { grid, formationId } = tactic
  const ready = FORMATIONS[formationId]
  if (!grid) return getFormation(formationId)
  // Time reduzido na partida ao vivo (menos de 11 em campo): só a grade dos que restam.
  if (grid.length < 11) return formationFromGrid(grid, 'custom', true)
  if (ready && sameGridSet(ready.grid, grid)) return ready.grid.every((p, i) => p.row === grid[i]?.row && p.lane === grid[i]?.lane) ? ready : formationFromGrid(grid, formationId)
  return formationFromGrid(grid, ready ? 'custom' : formationId)
}

/** Rótulo de uma grade: a formação pronta com os mesmos pontos ou "custom". */
export function labelOfGrid(grid: readonly GridPoint[]): string {
  return FORMATION_IDS.find((id) => sameGridSet(getFormation(id).grid, grid)) ?? 'custom'
}
