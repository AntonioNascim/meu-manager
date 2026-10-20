/**
 * Ajustes automáticos de um elenco para o pacote passar na validação: distribuir as posições genéricas conforme a necessidade de um time
 * real, mandar o excesso de jogadores para a base ou para o mercado e completar elencos curtos com jogadores gerados. Funções puras.
 */
import type { Foot, Position } from '../../src/engine/types'
import type { Coarse } from './positions'

/** Elenco de referência de 25 jogadores: o que um time real precisa em cada posição. */
export const TARGET: Record<Position, number> = { GK: 3, RB: 2, LB: 2, CB: 4, DM: 2, CM: 3, AM: 2, RW: 2, LW: 2, ST: 3 }
const ORDER = Object.keys(TARGET) as Position[]

const SECTOR_OF: Record<Position, Coarse> = { GK: 'GK', RB: 'DF', LB: 'DF', CB: 'DF', DM: 'MF', CM: 'MF', AM: 'MF', RW: 'FW', LW: 'FW', ST: 'FW' }
const SECTORS: Record<Coarse, Position[]> = { GK: ['GK'], DF: ['RB', 'LB', 'CB'], MF: ['DM', 'CM', 'AM'], FW: ['ST', 'RW', 'LW'] }

export interface PlanPlayer {
  /** Posição que a leitura das fontes escolheu. */
  position: Position
  /** `true` quando a fonte só dizia o setor (defensor, meio-campista, atacante): a posição pode mudar. */
  generic: boolean
  foot?: Foot
}

/** Posições entre as quais um jogador genérico pode ser distribuído: laterais só entre laterais, pontas entre pontas, o resto no setor. */
function candidates(position: Position): Position[] {
  if (position === 'RB' || position === 'LB') return ['RB', 'LB']
  if (position === 'RW' || position === 'LW') return ['RW', 'LW']
  return SECTORS[SECTOR_OF[position]]
}

/**
 * Distribui as posições dos jogadores genéricos pelo que o elenco ainda precisa (`TARGET` menos quem já tem posição certa), na ordem da
 * tabela do clube. O pé decide o lado: canhoto vai para a esquerda, destro para a direita, quando as duas precisam.
 */
export function distributePositions(players: readonly PlanPlayer[]): Position[] {
  const count: Record<Position, number> = { GK: 0, RB: 0, LB: 0, CB: 0, DM: 0, CM: 0, AM: 0, RW: 0, LW: 0, ST: 0 }
  for (const p of players) if (!p.generic) count[p.position]++
  return players.map((p) => {
    if (!p.generic || p.position === 'GK') return p.position
    let best: Position = p.position
    let bestScore = -Infinity
    for (const c of candidates(p.position)) {
      const side = c === 'LB' || c === 'LW' ? (p.foot === 'left' ? 0.6 : p.foot === 'right' ? -0.6 : 0) : c === 'RB' || c === 'RW' ? (p.foot === 'right' ? 0.6 : p.foot === 'left' ? -0.6 : 0) : 0
      const score = TARGET[c] - count[c] + side - ORDER.indexOf(c) * 0.001
      if (score > bestScore) (best = c), (bestScore = score)
    }
    count[best]++
    return best
  })
}

/** Posições que faltam para completar um elenco de `size` jogadores, partindo das que já existem (primeiro o que o time mais precisa; sempre 2 goleiros). */
export function missingPositions(have: readonly Position[], size: number): Position[] {
  const count: Record<Position, number> = { GK: 0, RB: 0, LB: 0, CB: 0, DM: 0, CM: 0, AM: 0, RW: 0, LW: 0, ST: 0 }
  for (const p of have) count[p]++
  const out: Position[] = []
  let total = have.length
  while (total < size) {
    if (count.GK < 2) {
      out.push('GK')
      count.GK++
      total++
      continue
    }
    let best: Position = 'CM'
    let bestNeed = -Infinity
    for (const c of ORDER) {
      const need = (c === 'GK' ? Math.min(TARGET.GK, 2) : TARGET[c]) - count[c]
      if (need > bestNeed) (best = c), (bestNeed = need)
    }
    out.push(best)
    count[best]++
    total++
  }
  return out
}

export interface TrimPlayer {
  position: Position
  /** Idade em anos na data de referência. */
  age: number
  /** Tem artigo na Wikipedia (mais conhecido). */
  known: boolean
}

export interface TrimResult {
  /** Posições (índices) que ficam no elenco principal. */
  keep: number[]
  /** Índices que vão para a base. */
  academy: number[]
  /** Índices que ficam livres no mercado. */
  free: number[]
}

export const SQUAD_MAX = 30
export const ACADEMY_MAX = 15
export const ACADEMY_AGE = { min: 15, max: 19 }

/**
 * Tira o excesso de um elenco com mais de 30. Primeiro os jovens de 15 a 19 anos vão para a base (até 15 por clube, os menos
 * conhecidos e os últimos da tabela primeiro); se ainda passar de 30, os menos conhecidos ficam livres (sem deixar o clube com menos de
 * 2 goleiros). `order` é a ordem da tabela do clube: quem vem antes é mais do time principal.
 */
export function trimSquad(players: readonly TrimPlayer[], academyAlready = 0): TrimResult {
  const result: TrimResult = { keep: [], academy: [], free: [] }
  const alive = new Set(players.map((_, i) => i))
  let excess = players.length - SQUAD_MAX
  // Menos conhecidos primeiro; entre iguais, o que vem mais tarde na tabela.
  const byProminence = [...alive].sort((a, b) => Number(players[a]!.known) - Number(players[b]!.known) || b - a)
  if (excess > 0) {
    let room = ACADEMY_MAX - academyAlready
    for (const i of byProminence) {
      if (excess <= 0 || room <= 0) break
      const p = players[i] as TrimPlayer
      if (p.age < ACADEMY_AGE.min || p.age > ACADEMY_AGE.max || (p.position === "GK" && goalkeepers(players, alive) <= 2)) continue
      alive.delete(i)
      result.academy.push(i)
      excess--
      room--
    }
  }
  if (excess > 0) {
    for (const i of byProminence) {
      if (excess <= 0) break
      if (!alive.has(i)) continue
      const p = players[i] as TrimPlayer
      if (p.position === 'GK' && goalkeepers(players, alive) <= 2) continue
      alive.delete(i)
      result.free.push(i)
      excess--
    }
  }
  result.keep = [...alive].sort((a, b) => a - b)
  return result
}

function goalkeepers(players: readonly TrimPlayer[], alive: ReadonlySet<number>): number {
  let n = 0
  for (const i of alive) if (players[i]?.position === 'GK') n++
  return n
}
