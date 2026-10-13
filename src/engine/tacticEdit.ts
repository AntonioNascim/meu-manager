/**
 * Edição da tática pelo jogador: trocar jogadores de lugar, mudar de formação e escolher capitão e
 * cobradores. Funções puras: devolvem uma tática nova e nunca deixam a escalação inválida
 * (11 titulares únicos, banco sem repetidos, funções só para titulares).
 */
import { formationOf, getFormation, labelOfGrid } from './formations'
import { GK_POINT, gridKey, gridProblem } from './grid'
import { BENCH_SIZE } from './config'
import { evaluateFormation } from './lineup'
import { overallAt, playerOverall } from './overall'
import type { GridPoint, Player, PlayerId, SavedLineup, Tactic } from './types'

export type SetPieceKind = 'penalty' | 'free-kick'

export const MAX_TAKERS: Record<SetPieceKind, number> = { penalty: 3, 'free-kick': 2 }

type Location = { zone: 'xi'; index: number } | { zone: 'bench'; index: number } | { zone: 'out' }

export function locate(tactic: Tactic, id: PlayerId): Location {
  const xi = tactic.startingXI.indexOf(id)
  if (xi >= 0) return { zone: 'xi', index: xi }
  const bench = tactic.bench.indexOf(id)
  return bench >= 0 ? { zone: 'bench', index: bench } : { zone: 'out' }
}

/**
 * Troca dois jogadores de lugar (titular, banco ou fora do banco).
 * Quem sai de uma vaga de titular passa o capitão e as cobranças para quem entra no lugar dele.
 */
export function swapPlayers(tactic: Tactic, a: PlayerId, b: PlayerId): Tactic {
  if (a === b) return tactic
  const la = locate(tactic, a)
  const lb = locate(tactic, b)
  const xi = [...tactic.startingXI]
  const bench = [...tactic.bench]
  const put = (loc: Location, id: PlayerId) => {
    if (loc.zone === 'xi') xi[loc.index] = id
    else if (loc.zone === 'bench') bench[loc.index] = id
  }
  put(la, b)
  put(lb, a)

  // Papéis: quem deixou o time titular passa a função para quem ocupou a vaga.
  const heir = new Map<PlayerId, PlayerId>()
  if (la.zone === 'xi' && lb.zone !== 'xi') heir.set(a, b)
  if (lb.zone === 'xi' && la.zone !== 'xi') heir.set(b, a)
  const inherit = (id: PlayerId) => heir.get(id) ?? id
  return {
    ...tactic,
    startingXI: xi,
    bench,
    captainId: inherit(tactic.captainId),
    penaltyTakerIds: tactic.penaltyTakerIds.map(inherit),
    freeKickTakerIds: tactic.freeKickTakerIds.map(inherit),
  }
}

/**
 * Muda a formação mantendo os mesmos 11 jogadores: cada um vai para a vaga que melhor encaixa.
 * O banco, o capitão e os cobradores continuam como estavam.
 */
export function changeFormation(tactic: Tactic, squad: readonly Player[], formationId: string): Tactic {
  const formation = getFormation(formationId)
  if (formationOf(tactic) === formation) return tactic
  const players = tactic.startingXI.map((id) => squad.find((p) => p.id === id)).filter((p): p is Player => p !== undefined)
  if (players.length !== formation.slots.length) throw new Error('Escalação inválida')
  // Todos os 11 entram, mesmo lesionados (o jogador decide); o encaixe só escolhe as vagas.
  const available = players.map((p) => ({ ...p, condition: { ...p.condition, injuryDaysLeft: 0, suspensionGames: 0 } }))
  const { startingXI } = evaluateFormation(available, formation)
  return { ...tactic, formationId, grid: formation.grid.map((p) => ({ ...p })), startingXI }
}

/**
 * Posicionamento livre: leva o titular para um ponto da grade. Se o ponto está ocupado os dois trocam de lugar; o
 * goleiro nunca deixa o gol sem ser trocado por outro. A formação vira a pronta de mesmos pontos ou "custom".
 */
export function movePlayerTo(tactic: Tactic, id: PlayerId, target: GridPoint): Tactic {
  const i = tactic.startingXI.indexOf(id)
  if (i < 0) throw new Error('Só os titulares podem ser posicionados')
  const grid = formationOf(tactic).grid.map((p) => ({ ...p }))
  const j = grid.findIndex((p) => gridKey(p) === gridKey(target))
  if (j === i) return tactic
  if (j >= 0) {
    const a = grid[i] as GridPoint
    grid[i] = grid[j] as GridPoint
    grid[j] = a
  } else {
    if (gridKey(grid[i] as GridPoint) === gridKey(GK_POINT)) throw new Error('O gol não pode ficar sem goleiro')
    grid[i] = { row: target.row, lane: target.lane }
  }
  const problem = gridProblem(grid)
  if (problem) throw new Error(problem)
  return { ...tactic, formationId: labelOfGrid(grid), grid }
}

/** Define o capitão (precisa ser titular). */
export function setCaptain(tactic: Tactic, id: PlayerId): Tactic {
  if (!tactic.startingXI.includes(id)) throw new Error('O capitão precisa ser titular')
  return { ...tactic, captainId: id }
}

/** Define o cobrador na posição `rank` (0 = primeiro) da lista de pênaltis ou de faltas. */
export function setTaker(tactic: Tactic, kind: SetPieceKind, rank: number, id: PlayerId): Tactic {
  if (!tactic.startingXI.includes(id)) throw new Error('O cobrador precisa ser titular')
  if (rank < 0 || rank >= MAX_TAKERS[kind]) throw new Error('Posição de cobrador inválida')
  const key = kind === 'penalty' ? 'penaltyTakerIds' : 'freeKickTakerIds'
  const list = [...tactic[key]]
  // Sem repetir: o jogador sai de onde estava na lista.
  const previous = list.indexOf(id)
  const displaced = list[rank]
  list[rank] = id
  if (previous >= 0 && previous !== rank) {
    if (displaced !== undefined) list[previous] = displaced
    else list.splice(previous, 1)
  }
  return { ...tactic, [key]: list.filter((x, i) => x !== undefined && list.indexOf(x) === i) }
}

/**
 * Carrega uma escalação guardada na tática atual: formação, estilo e titulares vêm do que foi guardado
 * (mentalidade, banco, capitão e cobradores são mantidos quando ainda servem). Quem saiu do elenco desde
 * então é trocado pelo melhor jogador que sobrou para a vaga. Lesionados e suspensos continuam como foram
 * guardados: o jogador vê e decide.
 */
export function applySavedLineup(tactic: Tactic, squad: readonly Player[], saved: SavedLineup): Tactic {
  const formation = formationOf(saved)
  if (saved.startingXI.length !== formation.slots.length) throw new Error('Escalação guardada inválida')
  const byId = new Map(squad.map((p) => [p.id, p]))
  const taken = new Set(saved.startingXI.filter((id) => byId.has(id)))
  const startingXI = saved.startingXI.map((id, i) => {
    if (byId.has(id)) return id
    const position = formation.slots[i]?.position as Player['position']
    const best = squad.filter((p) => !taken.has(p.id)).sort((a, b) => overallAt(b, position) - overallAt(a, position))[0]
    if (!best) throw new Error('Elenco pequeno demais para esta escalação')
    taken.add(best.id)
    return best.id
  })
  const inXI = new Set(startingXI)
  const bench = tactic.bench.filter((id) => byId.has(id) && !inXI.has(id))
  const filler = squad.filter((p) => !inXI.has(p.id) && !bench.includes(p.id)).sort((a, b) => playerOverall(b) - playerOverall(a))
  for (const p of filler) if (bench.length < Math.max(tactic.bench.length, BENCH_SIZE)) bench.push(p.id)
  const captainId = inXI.has(tactic.captainId) ? tactic.captainId : ((startingXI.find((id) => byId.get(id)?.position !== 'GK') ?? startingXI[0]) as PlayerId)
  const keepTakers = (ids: PlayerId[]) => (ids.filter((id) => inXI.has(id)).length > 0 ? ids.filter((id) => inXI.has(id)) : [captainId])
  return {
    ...tactic,
    formationId: formation.id,
    grid: formation.grid.map((p) => ({ ...p })),
    style: saved.style,
    startingXI,
    bench,
    captainId,
    penaltyTakerIds: keepTakers(tactic.penaltyTakerIds),
    freeKickTakerIds: keepTakers(tactic.freeKickTakerIds),
  }
}
