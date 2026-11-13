/**
 * Números de camisa. Cada técnico pode escolher o de cada jogador do clube (`SeasonState.shirts`); quem não tem escolha recebe o número da posição,
 * do melhor ao pior. Puro: o campo, o cartão do jogador e o servidor usam as mesmas contas.
 */
import type { Player, PlayerId, Position, TeamId } from './types'
import { playerOverall } from './overall'
import type { SeasonState } from './season'

export const SHIRT_MIN = 1
export const SHIRT_MAX = 99

/** Números preferidos de cada posição (o primeiro livre vale). */
export const POSITION_NUMBERS: Record<Position, number[]> = {
  GK: [1, 12, 25],
  RB: [2, 22, 26],
  CB: [3, 4, 13, 14],
  LB: [6, 16, 27],
  DM: [5, 15, 23],
  CM: [8, 18, 20, 21],
  AM: [10, 17, 24],
  RW: [7, 19, 28],
  LW: [11, 17, 29],
  ST: [9, 19, 30],
}

/** O primeiro número livre da posição (depois, de 31 em diante). */
export function freeNumber(position: Position, used: ReadonlySet<number>): number {
  return [...POSITION_NUMBERS[position], ...Array.from({ length: 70 }, (_, i) => 31 + i)].find((n) => !used.has(n)) ?? 99
}

export const isShirtNumber = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= SHIRT_MIN && n <= SHIRT_MAX

/** Número de cada jogador do elenco: as escolhas válidas (sem repetir) valem e o resto sai pela posição, do melhor ao pior. */
export function squadShirts(squad: readonly Player[], chosen: Readonly<Record<PlayerId, number>> = {}): Map<PlayerId, number> {
  const out = new Map<PlayerId, number>()
  const used = new Set<number>()
  for (const p of squad) {
    const n = chosen[p.id]
    if (isShirtNumber(n) && !used.has(n)) {
      out.set(p.id, n)
      used.add(n)
    }
  }
  for (const p of [...squad].sort((a, b) => playerOverall(b) - playerOverall(a) || (a.id < b.id ? -1 : 1))) {
    if (out.has(p.id)) continue
    const n = freeNumber(p.position, used)
    out.set(p.id, n)
    used.add(n)
  }
  return out
}

export type ShirtError = 'not-found' | 'invalid'

/** Troca o número de um jogador do clube; se outro já o usa, os dois trocam. */
export function setShirt(world: SeasonState, teamId: TeamId, playerId: PlayerId, number: number): { ok: true; world: SeasonState } | { ok: false; error: ShirtError } {
  if (!isShirtNumber(number)) return { ok: false, error: 'invalid' }
  const squad = world.players.filter((p) => p.teamId === teamId)
  if (!squad.some((p) => p.id === playerId)) return { ok: false, error: 'not-found' }
  const chosen = world.shirts?.[teamId] ?? {}
  const now = squadShirts(squad, chosen)
  const mine = now.get(playerId) as number
  const other = [...now.entries()].find(([id, n]) => n === number && id !== playerId)?.[0]
  const next: Record<PlayerId, number> = { ...Object.fromEntries(now), [playerId]: number }
  if (other) next[other] = mine
  // Só guarda quem o técnico mexeu: o resto continua sendo o da posição.
  const keep: Record<PlayerId, number> = {}
  for (const id of new Set([...Object.keys(chosen), playerId, ...(other ? [other] : [])])) if (squad.some((p) => p.id === id)) keep[id] = next[id] as number
  return { ok: true, world: { ...world, shirts: { ...(world.shirts ?? {}), [teamId]: keep } } }
}
