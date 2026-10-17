/**
 * Forma de uma copa: as fases em ordem (grupos ou fase de liga, se houver, e depois o mata-mata) e como cada fase de
 * mata-mata reparte os clubes (confrontos e folgas). Funções puras, usadas pelo motor e pela validação do pacote.
 */
import type { CupSpec } from '../types'

export interface StageDescriptor {
  kind: 'groups' | 'league' | 'knockout'
  name: string
  /** Jogo único ou ida e volta (no mata-mata); grupos usam `groups.legs`. */
  legs: 1 | 2
}

/** As fases da copa na ordem em que são jogadas. O índice delas é o usado em `CupEntrant.stage`, `CupPrize.perStage` e `MatchCupInfo.stage`. */
export function stageList(spec: CupSpec): StageDescriptor[] {
  const out: StageDescriptor[] = []
  if (spec.format === 'groups-knockout' && spec.groups) out.push({ kind: 'groups', name: spec.groups.name, legs: spec.groups.legs })
  if (spec.format === 'league-knockout' && spec.leaguePhase) out.push({ kind: 'league', name: spec.leaguePhase.name, legs: 1 })
  for (const s of spec.stages) out.push({ kind: 'knockout', name: s.name, legs: s.legs })
  return out
}

export const isPowerOfTwo = (n: number): boolean => n > 0 && (n & (n - 1)) === 0
export const floorPowerOfTwo = (n: number): number => 2 ** Math.floor(Math.log2(Math.max(1, n)))

export interface KnockoutShape {
  /** Confrontos da fase. */
  ties: number
  /** Clubes que folgam (passam direto para a fase seguinte). */
  byes: number
  /** Clubes que seguem para a fase seguinte (vencedores dos confrontos mais os que folgaram). */
  advancing: number
}

/**
 * Como uma fase de mata-mata reparte `n` clubes: potência de dois, todos jogam; senão, os melhores cabeças de chave folgam e os
 * outros jogam até sobrar uma potência de dois para a fase seguinte.
 */
export function knockoutShape(n: number): KnockoutShape {
  if (n < 2) return { ties: 0, byes: n, advancing: n }
  if (isPowerOfTwo(n)) return { ties: n / 2, byes: 0, advancing: n / 2 }
  const p = floorPowerOfTwo(n)
  return { ties: n - p, byes: 2 * p - n, advancing: p }
}

/**
 * Confere se o número de clubes que entra em cada fase leva a uma final de dois clubes. `entering[i]` = clubes que entram na fase
 * `i` da lista (além dos que vêm da fase anterior); `fromPhase` = quantos saem da fase de grupos ou de liga para o mata-mata
 * (`direct` e `playoff` na fase de liga). Devolve a lista de clubes por fase de mata-mata ou o motivo do erro.
 */
export function checkBracket(spec: CupSpec, entering: readonly number[], phaseOut?: { first: number; later?: number }): { ok: true; sizes: number[] } | { ok: false; reason: string } {
  const stages = stageList(spec)
  const sizes: number[] = []
  let carried = 0
  const firstKnockout = stages.findIndex((s) => s.kind === 'knockout')
  if (firstKnockout < 0) return { ok: false, reason: 'sem fases de mata-mata' }
  for (let i = firstKnockout; i < stages.length; i++) {
    let n: number
    if (i === firstKnockout) n = (phaseOut ? phaseOut.first : 0) + (entering[i] ?? 0)
    else n = carried + (entering[i] ?? 0) + (i === firstKnockout + 1 ? (phaseOut?.later ?? 0) : 0)
    sizes.push(n)
    if (n < 2) return { ok: false, reason: `a fase "${stages[i]?.name}" tem menos de 2 clubes` }
    carried = knockoutShape(n).advancing
  }
  if (carried !== 1) return { ok: false, reason: 'a última fase não termina com um campeão (a final precisa ter 2 clubes)' }
  return { ok: true, sizes }
}
