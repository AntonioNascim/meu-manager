/**
 * Estado interno de uma partida em andamento. Só existe durante a simulação:
 * é criado do zero a cada partida e nunca altera os jogadores/times recebidos.
 */
import { MATCH } from '../config'
import { getFormation } from '../formations'
import { positionFit } from '../overall'
import type { Rng } from '../rng'
import type {
  AttributeName,
  Formation,
  MatchEvent,
  Mentality,
  Player,
  PlayStyle,
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
  /** Público presente. Sem ele, é estimado pela torcida e capacidade do estádio do mandante. */
  attendance?: number
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
  /** Multiplicador por jogar fora da posição principal (1 = posição natural). */
  fitFactor: number
  /** Multiplicador do lado (fator casa para o mandante, 1 para o visitante). */
  sideFactor: number
  /** Moral × forma × "dia" (consistência), sorteado quando o jogador entra em campo. */
  dayFactor: number
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
  style: PlayStyle
  /** Mentalidade escolhida na tática. */
  baseMentality: Mentality
  /** Níveis de mentalidade a menos por ser bem mais fraco que o rival (IA). */
  underdogShift: number
  /** Mentalidade em vigor no momento (a escolhida − recuo de azarão + ajuste conforme o placar). */
  mentality: number
  /** Multiplicador de atributos deste lado (fator casa). */
  sideFactor: number
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

export function createPitchPlayer(
  player: Player,
  slot: Position,
  sector: Sector,
  minuteOn: number,
  sideFactor = 1,
  dayFactor = 1,
): PitchPlayer {
  return {
    player,
    slot,
    sector,
    fitness: player.condition.fitness,
    fitFactor: 1 - (1 - positionFit(player, slot)) * MATCH.improvisationWeight,
    sideFactor,
    dayFactor,
    minuteOn,
    minuteOff: null,
    yellowCards: 0,
    sentOff: false,
    injuryDays: 0,
    tally: emptyTally(),
  }
}

/** Ocupação do estádio (0 a 1): pelo público informado ou estimada pela torcida. */
export function crowdFill(team: Team, attendance?: number): number {
  const capacity = Math.max(1, team.stadium.capacity)
  const expected = attendance ?? team.fanBase * MATCH.home.fanTurnout
  return Math.min(1, Math.max(attendance === undefined ? MATCH.home.minFill : 0, expected / capacity))
}

/**
 * Multiplicador de atributos do mandante: vantagem fixa + parte proporcional à ocupação do estádio
 * (percentual, não público absoluto). `level` é a força média dos titulares do mandante: elenco mais
 * fraco recebe percentual maior, para a vantagem em pontos de atributo ser a mesma em qualquer série.
 */
export function homeFactor(team: Team, attendance?: number, level: number = MATCH.home.referenceLevel): number {
  const advantage = MATCH.home.base + MATCH.home.crowd * crowdFill(team, attendance)
  return 1 + (advantage * MATCH.home.referenceLevel) / Math.max(1, level)
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Efeito da moral (0–100) nos atributos. */
export function moraleFactor(morale: number): number {
  const { neutral, effect } = MATCH.modifiers.morale
  return 1 + (effect * (morale - neutral)) / 30
}

/** Efeito da forma (média das últimas notas; 0 = ainda não jogou) nos atributos. */
export function formFactor(form: number): number {
  if (form <= 0) return 1
  const { neutral, perPoint, maxEffect } = MATCH.modifiers.form
  return 1 + clamp((form - neutral) * perPoint, -maxEffect, maxEffect)
}

/**
 * Rendimento do jogador nesta partida: moral × forma × "dia" sorteado.
 * Quanto menor a consistência, mais o dia varia (para cima ou para baixo).
 */
export function dayFactorFor(rng: Rng, player: Player): number {
  const sd = MATCH.modifiers.consistency.maxSd * (1 - player.hidden.consistency / 100)
  const day = 1 + clamp(rng.normal(0, sd), -3 * sd, 3 * sd)
  return moraleFactor(player.condition.morale) * formFactor(player.condition.form) * day
}

export function buildSide(input: MatchSideInput, sideFactor: number, rng: Rng): SideState {
  const { team } = input
  const byId = new Map(input.players.map((p) => [p.id, p]))
  const formation = getFormation(team.tactic.formationId)
  const xi = team.tactic.startingXI.map((id) => byId.get(id))
  if (xi.length !== formation.slots.length || xi.some((p) => !p)) {
    throw new Error(`Escalação inválida para ${team.name}`)
  }
  const players = formation.slots.map((slot, i) =>
    createPitchPlayer(xi[i] as Player, slot.position, slot.sector, 0, sideFactor, dayFactorFor(rng, xi[i] as Player)),
  )
  const bench = team.tactic.bench
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined && !team.tactic.startingXI.includes(p.id))

  return {
    team,
    formation,
    style: team.tactic.style,
    baseMentality: team.tactic.mentality,
    underdogShift: 0,
    mentality: team.tactic.mentality,
    sideFactor,
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

const PHYSICAL: ReadonlySet<AttributeName> = new Set(['pace', 'stamina', 'strength'])

/** Quanto a condição física reduz o atributo (1 com condição 100). */
export function fitnessFactor(name: AttributeName, fitness: number): number {
  const floor = PHYSICAL.has(name) ? MATCH.fatigue.physicalFloor : MATCH.fatigue.otherFloor
  return floor + (1 - floor) * (Math.max(0, Math.min(100, fitness)) / 100)
}

/**
 * Atributo efetivo usado nos duelos: valor bruto × posição improvisada × fator casa
 * × moral/forma/consistência × condição física.
 */
export function attr(p: PitchPlayer, name: AttributeName): number {
  return p.player.attributes[name] * p.fitFactor * p.sideFactor * p.dayFactor * fitnessFactor(name, p.fitness)
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
