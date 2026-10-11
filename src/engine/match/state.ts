/**
 * Estado interno de uma partida em andamento. Só existe durante a simulação:
 * é criado do zero a cada partida e nunca altera os jogadores/times recebidos.
 */
import { MATCH } from '../config'
import { getFormation } from '../formations'
import type { Rng } from '../rng'
import type {
  AttributeName,
  Formation,
  MatchEvent,
  Player,
  Position,
  Sector,
  Team,
} from '../types'

export interface MatchSideInput {
  team: Team
  /** Elenco do time (precisa conter os titulares e reservas da tática). */
  players: readonly Player[]
}

export interface MatchInput {
  home: MatchSideInput
  away: MatchSideInput
  /** Semente da partida: mesma semente = mesmo resultado. */
  seed: number
}

/** Contagem de ações de um jogador na partida (base da nota). */
export interface PlayerTally {
  goals: number
  assists: number
  shots: number
  shotsOnTarget: number
  keyPasses: number
  dribblesWon: number
  dribblesLost: number
  tacklesWon: number
  headersWon: number
  fouls: number
  foulsWon: number
  saves: number
  goalsConceded: number
  ownGoals: number
  penaltiesMissed: number
}

export interface PitchPlayer {
  player: Player
  /** Posição em que está jogando (vaga da formação). */
  slot: Position
  sector: Sector
  fitness: number
  minuteOn: number
  /** Minuto em que saiu (substituição, expulsão, lesão); `null` = em campo. */
  minuteOff: number | null
  yellowCards: number
  sentOff: boolean
  injuryDays: number
  tally: PlayerTally
}

export interface TeamTally {
  possession: number
  shots: number
  shotsOnTarget: number
  corners: number
  fouls: number
  yellowCards: number
  redCards: number
  xg: number
}

export interface SideState {
  team: Team
  formation: Formation
  /** Todos que entraram em campo (titulares e quem entrou depois). */
  players: PitchPlayer[]
  /** Reservas ainda disponíveis. */
  bench: Player[]
  subsLeft: number
  goals: number
  tally: TeamTally
}

export interface MatchContext {
  rng: Rng
  /** Gerador separado para os textos: mudar a narração não muda resultados. */
  textRng: Rng
  home: SideState
  away: SideState
  minute: number
  events: MatchEvent[]
}

export const emptyTally = (): PlayerTally => ({
  goals: 0,
  assists: 0,
  shots: 0,
  shotsOnTarget: 0,
  keyPasses: 0,
  dribblesWon: 0,
  dribblesLost: 0,
  tacklesWon: 0,
  headersWon: 0,
  fouls: 0,
  foulsWon: 0,
  saves: 0,
  goalsConceded: 0,
  ownGoals: 0,
  penaltiesMissed: 0,
})

export function createPitchPlayer(player: Player, slot: Position, sector: Sector, minuteOn: number): PitchPlayer {
  return {
    player,
    slot,
    sector,
    fitness: player.condition.fitness,
    minuteOn,
    minuteOff: null,
    yellowCards: 0,
    sentOff: false,
    injuryDays: 0,
    tally: emptyTally(),
  }
}

export function buildSide(input: MatchSideInput): SideState {
  const { team } = input
  const byId = new Map(input.players.map((p) => [p.id, p]))
  const formation = getFormation(team.tactic.formationId)
  const xi = team.tactic.startingXI.map((id) => byId.get(id))
  if (xi.length !== formation.slots.length || xi.some((p) => !p)) {
    throw new Error(`Escalação inválida para ${team.name}`)
  }
  const players = formation.slots.map((slot, i) =>
    createPitchPlayer(xi[i] as Player, slot.position, slot.sector, 0),
  )
  const bench = team.tactic.bench
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined && !team.tactic.startingXI.includes(p.id))

  return {
    team,
    formation,
    players,
    bench,
    subsLeft: Math.min(MATCH.maxSubs, bench.length),
    goals: 0,
    tally: { possession: 0, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, xg: 0 },
  }
}

export const isOnPitch = (p: PitchPlayer) => p.minuteOff === null

export function activePlayers(side: SideState): PitchPlayer[] {
  return side.players.filter(isOnPitch)
}

/** Quem está no gol: o da vaga de goleiro ou, sem ele, o de melhores reflexos em campo. */
export function goalkeeperOf(side: SideState): PitchPlayer | undefined {
  const active = activePlayers(side)
  return (
    active.find((p) => p.slot === 'GK') ??
    [...active].sort((a, b) => b.player.attributes.reflexes - a.player.attributes.reflexes)[0]
  )
}

/** Atributo usado nos duelos (Parte A: valor bruto; modificadores entram depois). */
export function attr(p: PitchPlayer, name: AttributeName): number {
  return p.player.attributes[name]
}

/** Sorteia um jogador em campo pelo peso da posição; ignora o goleiro e quem estiver em `exclude`. */
export function pickByPosition(
  rng: Rng,
  side: SideState,
  weights: Partial<Record<Position, number>>,
  fallback = 0,
  exclude?: PitchPlayer,
): PitchPlayer | undefined {
  const candidates = activePlayers(side).filter((p) => p !== exclude && p.slot !== 'GK')
  if (candidates.length === 0) return undefined
  return rng.weighted(candidates, (p) => weights[p.slot] ?? fallback)
}

export const displayName = (p: PitchPlayer | Player) => {
  const player = 'player' in p ? p.player : p
  return player.nickname ?? player.name
}
