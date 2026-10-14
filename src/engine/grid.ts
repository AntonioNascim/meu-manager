/**
 * Posicionamento livre: o campo é uma grade de pontos por linha (goleiro, defesa, volância, meio, meia ofensiva,
 * ataque) e por faixa (esquerda, centro-esquerda, centro, centro-direita, direita), sempre do ponto de vista do
 * time (esquerda = o lado esquerdo de quem ataca para a frente). O papel de cada jogador (posição e setor) vem
 * do ponto que ele ocupa; as formações prontas são só atalhos que já põem o time nos pontos certos.
 */
import type { Formation, FormationSlot, GridPoint, Position, Sector, Tactic } from './types'

export type { GridPoint }

export const GRID_ROWS = ['GK', 'DEF', 'DM', 'MID', 'AM', 'ATT'] as const
export type GridRow = (typeof GRID_ROWS)[number]
/** Faixas: 0 esquerda, 1 centro-esquerda, 2 centro, 3 centro-direita, 4 direita. */
export const GRID_LANES = 5

export const GK_POINT: GridPoint = { row: 0, lane: 2 }
export const ROW_COUNT = GRID_ROWS.length

export const gridKey = (p: GridPoint): string => `${p.row}.${p.lane}`

export function isGridPoint(p: GridPoint): boolean {
  if (!Number.isInteger(p.row) || !Number.isInteger(p.lane)) return false
  if (p.row < 0 || p.row >= ROW_COUNT || p.lane < 0 || p.lane >= GRID_LANES) return false
  // O goleiro só tem o ponto do centro.
  return p.row !== 0 || p.lane === GK_POINT.lane
}

/** Todos os pontos da grade (o do goleiro e 5 faixas em cada uma das outras 5 linhas). */
export function allGridPoints(): GridPoint[] {
  const points: GridPoint[] = [GK_POINT]
  for (let row = 1; row < ROW_COUNT; row++) for (let lane = 0; lane < GRID_LANES; lane++) points.push({ row, lane })
  return points
}

/**
 * Papel de quem ocupa o ponto: posição e setor. Lateral na defesa; ala na linha da volância (setor do meio); ponta
 * aberto no meio, na meia ofensiva e no ataque (no ataque, o setor é de ataque).
 */
export function slotAt(p: GridPoint): FormationSlot {
  const wide = p.lane === 0 ? 'left' : p.lane === GRID_LANES - 1 ? 'right' : null
  const side = (left: Position, right: Position): Position => (wide === 'left' ? left : right)
  switch (GRID_ROWS[p.row]) {
    case 'GK':
      return { position: 'GK', sector: 'defense' }
    case 'DEF':
      return { position: wide ? side('LB', 'RB') : 'CB', sector: 'defense' }
    case 'DM':
      return { position: wide ? side('LB', 'RB') : 'DM', sector: 'midfield' }
    case 'MID':
      return { position: wide ? side('LW', 'RW') : 'CM', sector: 'midfield' }
    case 'AM':
      return { position: wide ? side('LW', 'RW') : 'AM', sector: 'midfield' }
    default:
      return { position: wide ? side('LW', 'RW') : 'ST', sector: 'attack' }
  }
}

/** Mensagem do problema da grade (`null` se está válida): 11 pontos da grade, sem repetir, um só no gol. */
export function gridProblem(grid: readonly GridPoint[], partial = false): string | null {
  if (partial ? grid.length < 1 || grid.length > 11 : grid.length !== 11) return 'A grade precisa de 11 jogadores'
  if (!grid.every(isGridPoint)) return 'Ponto fora da grade'
  if (new Set(grid.map(gridKey)).size !== grid.length) return 'Dois jogadores no mesmo ponto'
  // Time reduzido (expulsão ou lesão sem troca): o gol pode ficar vazio.
  if (grid.filter((p) => p.row === 0).length !== 1 && !(partial && grid.every((p) => p.row !== 0))) return 'É preciso exatamente um goleiro'
  return null
}

/** Mesmos pontos, em qualquer ordem. */
export function sameGridSet(a: readonly GridPoint[], b: readonly GridPoint[]): boolean {
  if (a.length !== b.length) return false
  const keys = new Set(a.map(gridKey))
  return b.every((p) => keys.has(gridKey(p)))
}

/** Nome do esquema pelos setores (defesa-meio-ataque), ex.: "3-5-2". O goleiro não conta. */
export function shapeOf(grid: readonly GridPoint[]): string {
  const count = (s: Sector) => grid.filter((p) => p.row > 0 && slotAt(p).sector === s).length
  return `${count('defense')}-${count('midfield')}-${count('attack')}`
}

/** Atalho: monta a grade de uma lista de pontos escritos como [linha, faixa]. */
export const points = (...list: [number, number][]): GridPoint[] => list.map(([row, lane]) => ({ row, lane }))

/** Rótulo da formação de uma tática sem grade livre; a grade livre é identificada pelo `id` 'custom'. */
export const CUSTOM_FORMATION_ID = 'custom'

/** Grade com o papel de cada vaga: o que o motor e as telas usam no lugar do nome da formação. */
export function formationFromGrid(grid: readonly GridPoint[], id: string = CUSTOM_FORMATION_ID, partial = false): Formation {
  const problem = gridProblem(grid, partial)
  if (problem) throw new Error(problem)
  return { id, slots: grid.map(slotAt), grid: grid.map((p) => ({ ...p })) }
}

/** Posição de cada vaga de uma tática (a grade guardada ou, sem ela, a da formação pronta). */
export type TacticShape = Pick<Tactic, 'formationId'> & { grid?: GridPoint[] | undefined }
