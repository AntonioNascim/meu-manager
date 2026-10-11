import { BENCH_SIZE } from './config'
import { getFormation } from './formations'
import { overallAt, playerOverall } from './overall'
import type { Formation, Mentality, Player, PlayerId, PlayStyle, Tactic } from './types'

export function isAvailable(player: Player): boolean {
  return player.condition.injuryDaysLeft === 0 && player.condition.suspensionGames === 0
}

/**
 * Escolhe os 11 titulares para a formação: atribui primeiro os melhores pares
 * (jogador, vaga) pela força efetiva, então a ordem das vagas não importa e
 * quem joga na posição natural tem preferência sobre improvisados.
 * Devolve os ids na ordem das vagas.
 */
export function pickStartingXI(players: readonly Player[], formation: Formation): PlayerId[] {
  const available = players.filter(isAvailable)
  const pool = available.length >= formation.slots.length ? available : players
  if (pool.length < formation.slots.length) throw new Error('pickStartingXI: jogadores insuficientes')

  const pairs: { player: Player; slot: number; score: number }[] = []
  pool.forEach((player) => {
    formation.slots.forEach((slot, index) => {
      pairs.push({ player, slot: index, score: overallAt(player, slot.position) })
    })
  })
  pairs.sort((a, b) => b.score - a.score) // ordenação estável: empates mantêm a ordem do elenco

  const bySlot: (Player | undefined)[] = formation.slots.map(() => undefined)
  const used = new Set<Player>()
  for (const pair of pairs) {
    if (bySlot[pair.slot] || used.has(pair.player)) continue
    bySlot[pair.slot] = pair.player
    used.add(pair.player)
  }
  return bySlot.map((p) => (p as Player).id)
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
    p.attributes.determination + p.attributes.decisions + p.hidden.professionalism * 0.5 + (p.age >= 27 ? 3 : 0)

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
