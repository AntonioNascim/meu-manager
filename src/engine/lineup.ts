import { ATTRIBUTE_MAX, BENCH_SIZE } from './config'
import { getFormation } from './formations'
import { overallAt, playerOverall } from './overall'
import type { Formation, Mentality, Player, PlayerId, PlayStyle, Tactic } from './types'

export function isAvailable(player: Player): boolean {
  return player.condition.injuryDaysLeft === 0 && player.condition.suspensionGames === 0
}

export interface LineupEvaluation {
  formationId: string
  /** Ids dos titulares na ordem das vagas da formação. */
  startingXI: PlayerId[]
  /**
   * Soma dos 11 valores de encaixe (jogador, vaga). O valor é a força efetiva ao quadrado
   * (já com penalidade de posição), então perder um craque custa mais que perder um reserva.
   */
  score: number
}

const EPSILON = 1e-9

/** Valor de encaixe de um jogador numa posição: convexo, para priorizar os melhores jogadores. */
function fitValue(player: Player, position: Player['position']): number {
  const strength = overallAt(player, position)
  return (strength * strength) / ATTRIBUTE_MAX
}

/**
 * Melhor escalação para a formação: começa atribuindo os melhores pares (jogador, vaga)
 * e depois melhora por trocas e substituições até a soma da força efetiva não subir mais.
 * Assim os melhores jogadores jogam, na posição natural ou em uma secundária que encaixe.
 */
export function evaluateFormation(players: readonly Player[], formation: Formation): LineupEvaluation {
  const available = players.filter(isAvailable)
  const pool = available.length >= formation.slots.length ? available : [...players]
  const slotCount = formation.slots.length
  if (pool.length < slotCount) throw new Error('evaluateFormation: jogadores insuficientes')

  // matriz de encaixe: score[jogador][vaga]
  const score = pool.map((player) => formation.slots.map((slot) => fitValue(player, slot.position)))

  // 1) atribuição gulosa pelos melhores pares (ordenação estável: empates seguem a ordem do elenco)
  const pairs: { p: number; s: number; value: number }[] = []
  pool.forEach((_, p) => {
    for (let s = 0; s < slotCount; s++) pairs.push({ p, s, value: score[p]?.[s] ?? 0 })
  })
  pairs.sort((a, b) => b.value - a.value)
  const slotPlayer: number[] = Array(slotCount).fill(-1)
  const used = new Set<number>()
  for (const pair of pairs) {
    if ((slotPlayer[pair.s] ?? -1) >= 0 || used.has(pair.p)) continue
    slotPlayer[pair.s] = pair.p
    used.add(pair.p)
  }

  const at = (p: number, s: number) => score[p]?.[s] ?? 0

  // 2) melhoria local: trocar duas vagas entre titulares ou substituir um titular por um reserva
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < slotCount; i++) {
      for (let j = i + 1; j < slotCount; j++) {
        const pi = slotPlayer[i] as number
        const pj = slotPlayer[j] as number
        if (at(pj, i) + at(pi, j) > at(pi, i) + at(pj, j) + EPSILON) {
          slotPlayer[i] = pj
          slotPlayer[j] = pi
          improved = true
        }
      }
    }
    for (let s = 0; s < slotCount; s++) {
      const current = slotPlayer[s] as number
      for (let c = 0; c < pool.length; c++) {
        if (used.has(c)) continue
        if (at(c, s) > at(current, s) + EPSILON) {
          used.delete(current)
          used.add(c)
          slotPlayer[s] = c
          improved = true
          break
        }
      }
    }
  }

  const startingXI = slotPlayer.map((p) => (pool[p] as Player).id)
  const total = slotPlayer.reduce((sum, p, s) => sum + at(p, s), 0)
  return { formationId: formation.id, startingXI, score: total }
}

/** Formações ordenadas da que melhor encaixa o elenco para a que pior encaixa. */
export function rankFormations(players: readonly Player[], formations: readonly Formation[]): LineupEvaluation[] {
  return formations.map((f) => evaluateFormation(players, f)).sort((a, b) => b.score - a.score)
}

/** Escolhe os 11 titulares para a formação (ids na ordem das vagas). */
export function pickStartingXI(players: readonly Player[], formation: Formation): PlayerId[] {
  return evaluateFormation(players, formation).startingXI
}

/** Banco: um goleiro reserva e os melhores jogadores restantes. */
export function pickBench(players: readonly Player[], startingXI: readonly PlayerId[], size = BENCH_SIZE): PlayerId[] {
  const rest = players.filter((p) => isAvailable(p) && !startingXI.includes(p.id))
  const byStrength = [...rest].sort((a, b) => playerOverall(b) - playerOverall(a))
  const keeper = byStrength.find((p) => p.position === 'GK')
  const bench = keeper ? [keeper] : []
  for (const p of byStrength) {
    if (bench.length >= size) break
    if (!bench.includes(p)) bench.push(p)
  }
  return bench.map((p) => p.id)
}

function topBy(players: readonly Player[], score: (p: Player) => number, count: number): PlayerId[] {
  return [...players]
    .sort((a, b) => score(b) - score(a))
    .slice(0, count)
    .map((p) => p.id)
}

/** Tática completa com escalação automática (usada pela IA e como sugestão ao jogador). */
export function buildTactic(
  players: readonly Player[],
  options: { formationId: string; style: PlayStyle; mentality: Mentality },
): Tactic {
  const formation = getFormation(options.formationId)
  const startingXI = pickStartingXI(players, formation)
  const xi = startingXI.map((id) => players.find((p) => p.id === id) as Player)
  const outfield = xi.filter((p) => p.position !== 'GK')

  const leadership = (p: Player) =>
    p.attributes.determination + p.attributes.decisions + p.hidden.professionalism * 0.5 + (p.age >= 27 ? 15 : 0)

  return {
    formationId: options.formationId,
    style: options.style,
    mentality: options.mentality,
    startingXI,
    bench: pickBench(players, startingXI),
    captainId: topBy(xi, leadership, 1)[0] as PlayerId,
    penaltyTakerIds: topBy(outfield, (p) => p.attributes.finishing + p.attributes.decisions + p.attributes.determination, 3),
    freeKickTakerIds: topBy(outfield, (p) => p.attributes.passing + p.attributes.crossing + p.attributes.finishing, 2),
  }
}
