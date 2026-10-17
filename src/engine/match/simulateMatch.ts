/**
 * Motor de partida: ~96 momentos de posse, cada um decidido por duelos entre jogadores.
 * Etapas de um momento (pode terminar em qualquer uma):
 *   1. disputa do meio-campo (quem fica com a bola)
 *   2. progressão: condutor × marcador (drible, passe em profundidade ou cruzamento)
 *   3. criação da chance (tipo de finalização define o xG base)
 *   4. finalização × goleiro
 * Em paralelo: faltas, cartões, pênaltis, escanteios e lesões.
 */
import { MATCH } from '../config'
import { knockoutLeader, runShootout } from './knockout'
import type { KnockoutRules, ShootoutSide } from './knockout'
import { isForeign } from '../foreign'
import type { PlayType, ShotType } from '../config'
import { overallAt, playerOverall } from '../overall'
import { createRng } from '../rng'
import { getFormation, labelOfGrid } from '../formations'
import { GK_POINT, allGridPoints, formationFromGrid, gridKey, gridProblem, slotAt } from '../grid'
import { READY_CAPS, gapsOf, profileOf } from './formationProfile'
import { evaluateFormation } from '../lineup'
import type { GridPoint, MatchEvent, Mentality, MatchResult, Player, PlayerMatchResult, PlayStyle, Position, TeamMatchStats } from '../types'
import { duelChance } from './duel'
import * as text from './narration'
import { playerRating } from './ratings'
import {
  activePlayers,
  attr,
  buildSide,
  createPitchPlayer,
  dayFactorFor,
  displayName,
  goalkeeperOf,
  homeFactor,
  pickByPosition,
} from './state'
import type { MatchContext, MatchInput, PitchPlayer, PlayTrace, SideState } from './state'

const MATCH_MINUTES = 90
const EXTRA_END = 120

/** Força geral média dos titulares (referência do fator casa). */
function startersLevel({ team, players }: MatchInput['home']): number {
  const byId = new Map(players.map((p) => [p.id, p]))
  const xi = team.tactic.startingXI.flatMap((id) => {
    const p = byId.get(id)
    return p ? [playerOverall(p)] : []
  })
  return xi.length ? mean(xi) : MATCH.home.referenceLevel
}

/** Simula a partida inteira de uma vez. */
export function simulateMatch(input: MatchInput): MatchResult {
  const match = startMatch(input)
  match.playUntil(EXTRA_END)
  return match.result()
}

export type MatchSide = 'home' | 'away'

export interface SideSnapshot {
  teamId: string
  formationId: string
  style: PlayStyle
  /** Mentalidade escolhida (a do técnico, sem os ajustes automáticos da IA). */
  mentality: Mentality
  /** Mentalidade em uso agora: a da IA muda pelo placar e pelo tamanho do rival (no time do jogador é a mesma). */
  activeMentality: Mentality
  goals: number
  /** Quem está em campo agora, com a vaga e a condição. */
  onPitch: { playerId: string; slot: Position; fitness: number; yellowCards: number; point?: GridPoint }[]
  /** Ponto da grade de cada vaga da formação (a formação pronta ou a montada pelo técnico). */
  grid: GridPoint[]
  /** Reservas que ainda podem entrar. */
  bench: string[]
  subsLeft: number
  /** Paradas para substituir que ainda restam (o intervalo não conta). */
  stopsLeft: number
}

export interface MatchSnapshot {
  /** Último minuto simulado (0 antes do apito inicial, 90 no fim; até 120 se houve prorrogação). */
  minute: number
  finished: boolean
  homeGoals: number
  awayGoals: number
  events: MatchEvent[]
  /** Rastro dos momentos de posse, na ordem (só leitura: serve para desenhar o campo). */
  trace: PlayTrace[]
  /** A partida foi para a prorrogação (mata-mata empatado nos 90 minutos). */
  extraTime?: boolean
  /** Depois do apito final de uma disputa de pênaltis: o placar dela e as cobranças. */
  penalties?: { home: number; away: number }
  shootout?: MatchResult['shootout']
  /** Jogador do seu time machucado esperando a escolha de quem entra (o jogo está parado). */
  injuryPending?: { side: MatchSide; playerId: string }
  homeStats: TeamMatchStats
  awayStats: TeamMatchStats
  home: SideSnapshot
  away: SideSnapshot
}

/**
 * Partida em andamento: avança aos poucos (`playUntil`), deixa o técnico mexer no time entre os
 * lances (tática, formação, substituições) e termina com o mesmo resultado que `simulateMatch`
 * daria se ninguém mexesse. Os lances sorteados dependem só da seed e das decisões tomadas, nunca
 * de quando a interface pede cada passo.
 */
export interface LiveMatch {
  readonly minute: number
  readonly finished: boolean
  /** Simula os lances até o minuto indicado (inclusive). */
  playUntil(minute: number): void
  snapshot(): MatchSnapshot
  setStyle(side: MatchSide, style: PlayStyle): void
  setMentality(side: MatchSide, mentality: Mentality): void
  /** Muda a formação mantendo os mesmos jogadores em campo (só com 11 em campo). */
  setFormation(side: MatchSide, formationId: string): void
  /** Leva um jogador em campo a um ponto da grade (ponto ocupado = os dois trocam de lugar). Vale também com menos de 11 (o lugar de quem saiu fica vazio; sem goleiro, qualquer um pode ir ao gol). */
  setPosition(side: MatchSide, playerId: string, target: GridPoint): void
  /** Troca um jogador em campo por um reserva (limite de substituições e banco respeitados). */
  substitute(side: MatchSide, outgoingId: string, incomingId: string): void
  /** Reorganiza sozinho o time com menos de 11 (cobre as linhas e faixas que ficaram vazias), como a IA faz. */
  reorganize(side: MatchSide): void
  /** Resolve a lesão que parou o jogo: com `incomingId` o reserva entra na vaga; sem ele o time segue com um a menos. */
  resolveInjury(side: MatchSide, incomingId?: string): void
  /** Resultado completo (só depois do apito final). */
  result(): MatchResult
}

/** Refaz as vagas da formação com os pontos de quem está em campo e atualiza o papel de cada um. */
function applyPoints(side: SideState, active: PitchPlayer[]): void {
  const grid = active.map((p) => p.point as GridPoint)
  const formation = formationFromGrid(grid, grid.length === 11 ? labelOfGrid(grid) : 'custom', true)
  for (const [i, p] of active.entries()) {
    const slot = formation.slots[i] as (typeof formation.slots)[number]
    p.slot = slot.position
    p.sector = slot.sector
    p.fitFactor = createPitchPlayer(p.player, slot.position, slot.sector, 0).fitFactor
  }
  side.formation = formation
}

const gapCost = (grid: GridPoint[]): number => {
  const g = gapsOf(formationFromGrid(grid, 'custom', true))
  return MATCH.grid.defenseGap * g.defense + MATCH.grid.midfieldGap * g.midfield + MATCH.grid.flankGap * g.flank.reduce((sum, v) => sum + v, 0)
}

/**
 * IA com um jogador a menos: cobre a linha ou a faixa que ficou sem gente, movendo quem perde menos jogando ali, até
 * não haver ganho. Só mexe em quem não é o goleiro e nunca num time do jogador.
 */
export function reorganizeShortHanded(side: SideState): void {
  const active = activePlayers(side)
  if (active.length >= 11 || active.length < 2) return
  const free = (): GridPoint[] => allGridPoints().filter((p) => p.row > 0 && !active.some((q) => q.point && gridKey(q.point) === gridKey(p)))
  for (let step = 0; step < 6; step++) {
    const now = gapCost(active.map((p) => p.point as GridPoint))
    if (now <= 0) return
    let best: { p: PitchPlayer; to: GridPoint; cost: number; loss: number } | null = null
    for (const p of active) {
      if (p.slot === 'GK' || !p.point) continue
      const current = overallAt(p.player, p.slot)
      const from = p.point
      for (const to of free()) {
        const loss = Math.max(0, current - overallAt(p.player, slotAt(to).position))
        if (loss > 4) continue
        const cost = gapCost(active.map((q) => (q === p ? to : (q.point as GridPoint))))
        if (cost >= now - 1e-9) continue
        if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && loss < best.loss)) best = { p, to, cost, loss }
      }
      p.point = from
    }
    if (!best) return
    best.p.point = best.to
    applyPoints(side, active)
  }
}

/**
 * Com menos de 11 em campo (expulsão ou lesão sem troca) o lugar de quem saiu fica vazio e o time paga o custo dos
 * buracos desde o primeiro lance, mexa o técnico ou não. A IA do motor reorganiza o time; o do jogador só muda quando
 * ele arrasta os jogadores.
 */
function syncShortHanded(side: SideState, forced = false): void {
  const active = activePlayers(side)
  if (!forced && active.length === side.formation.grid.length) return
  if (active.length > 11 || active.some((p) => !p.point)) return
  if (active.length !== side.formation.grid.length) applyPoints(side, active)
  if (forced || !side.userControlled) reorganizeShortHanded(side)
}

const minuteOfMoment = (i: number) =>
  i < MATCH.moments ? Math.min(MATCH_MINUTES, 1 + Math.floor((i * MATCH_MINUTES) / MATCH.moments)) : Math.min(EXTRA_END, MATCH_MINUTES + 1 + Math.floor(((i - MATCH.moments) * (EXTRA_END - MATCH_MINUTES)) / MATCH.extraMoments))

export function startMatch(input: MatchInput): LiveMatch {
  const rng = createRng(input.seed)
  const ctx: MatchContext = {
    rng,
    textRng: rng.fork('narration'),
    home: buildSide(input.home, input.neutral ? 1 : homeFactor(input.home.team, input.attendance, startersLevel(input.home)), rng, input.userControlled?.home),
    away: buildSide(input.away, 1, rng, input.userControlled?.away),
    minute: 0,
    events: [],
    trace: [],
  }
  if (input.holdInjurySubs) {
    if (input.userControlled?.home) ctx.home.holdInjury = true
    if (input.userControlled?.away) ctx.away.holdInjury = true
  }
  for (const [side, ids] of [[ctx.home, input.startedOff?.home], [ctx.away, input.startedOff?.away]] as const) {
    for (const p of side.players) if (ids?.includes(p.player.id)) p.minuteOff = 0
  }
  applyUnderdogPosture(ctx.home, ctx.away)
  applyUnderdogPosture(ctx.away, ctx.home)
  let moment = 0
  // Mata-mata: ao fim dos 90 minutos, se o confronto está empatado, a partida continua por mais 30 (prorrogação).
  let totalMoments = MATCH.moments
  let finalResult: MatchResult | undefined
  let settled = !input.knockout?.extraTime
  const settle = () => {
    if (settled || moment < MATCH.moments) return
    settled = true
    if (knockoutLeader(input.knockout as KnockoutRules, ctx.home.goals, ctx.away.goals) === null) {
      totalMoments = MATCH.moments + MATCH.extraMoments
      ctx.extra = true
    }
  }
  const sideOf = (side: MatchSide) => (side === 'home' ? ctx.home : ctx.away)

  const stepMoment = () => {
    ctx.minute = minuteOfMoment(moment)
    checkInjury(ctx)
    syncShortHanded(ctx.home)
    syncShortHanded(ctx.away)
    updateGameState(ctx)
    applyFatigue(ctx.home)
    applyFatigue(ctx.away)
    substituteTired(ctx, ctx.home)
    substituteTired(ctx, ctx.away)
    const homeHasBall = rng.chance(homePossessionChance(ctx.home, ctx.away))
    const [attacking, defending] = homeHasBall ? [ctx.home, ctx.away] : [ctx.away, ctx.home]
    playMoment(ctx, attacking, defending)
    moment++
  }

  const snapshotSide = (side: SideState): SideSnapshot => ({
    teamId: side.team.id,
    formationId: side.formation.id,
    style: side.style,
    mentality: side.baseMentality,
    activeMentality: side.mentality as Mentality,
    goals: side.goals,
    onPitch: activePlayers(side).map((p) => ({ playerId: p.player.id, slot: p.slot, fitness: Math.round(p.fitness), yellowCards: p.yellowCards, ...(p.point ? { point: p.point } : {}) })),
    grid: side.formation.grid,
    bench: side.bench.map((p) => p.id),
    subsLeft: side.subsLeft,
    stopsLeft: MATCH.maxSubStops - side.subStops.length,
  })

  return {
    get minute() {
      return moment === 0 ? 0 : minuteOfMoment(moment - 1)
    },
    get finished() {
      settle()
      return moment >= totalMoments
    },
    playUntil(minute) {
      for (;;) {
        settle()
        if (moment >= totalMoments || minuteOfMoment(moment) > minute || ctx.pendingInjury) break
        stepMoment()
      }
    },
    snapshot() {
      settle()
      const decided = moment >= totalMoments && input.knockout ? (finalResult ??= buildResult(ctx, input.knockout)) : undefined
      const total = ctx.home.tally.possession + ctx.away.tally.possession
      const homeShare = total === 0 ? 50 : Math.round((100 * ctx.home.tally.possession) / total)
      return {
        minute: this.minute,
        finished: this.finished,
        homeGoals: ctx.home.goals,
        awayGoals: ctx.away.goals,
        ...(ctx.extra ? { extraTime: true } : {}),
        ...(decided?.penalties ? { penalties: decided.penalties } : {}),
        ...(decided?.shootout ? { shootout: decided.shootout } : {}),
        events: [...ctx.events],
        trace: [...ctx.trace],
        ...(ctx.pendingInjury ? { injuryPending: ctx.pendingInjury } : {}),
        homeStats: teamStats(ctx.home, homeShare),
        awayStats: teamStats(ctx.away, 100 - homeShare),
        home: snapshotSide(ctx.home),
        away: snapshotSide(ctx.away),
      }
    },
    setStyle(side, style) {
      sideOf(side).style = style
    },
    setMentality(side, mentality) {
      sideOf(side).baseMentality = mentality
    },
    setFormation(side, formationId) {
      const s = sideOf(side)
      const formation = getFormation(formationId)
      const active = activePlayers(s)
      if (active.length !== formation.slots.length) throw new Error('A formação só muda com 11 jogadores em campo')
      // Cada jogador vai para a vaga que melhor encaixa (lesionados também: já estão em campo).
      const fresh = active.map((p) => ({ ...p.player, condition: { ...p.player.condition, injuryDaysLeft: 0, suspensionGames: 0 } }))
      const slotOrder = evaluateFormation(fresh, formation).startingXI
      slotOrder.forEach((id, i) => {
        const pitchPlayer = active.find((p) => p.player.id === id) as PitchPlayer
        const slot = formation.slots[i] as (typeof formation.slots)[number]
        pitchPlayer.slot = slot.position
        pitchPlayer.sector = slot.sector
        pitchPlayer.point = formation.grid[i]
        pitchPlayer.fitFactor = createPitchPlayer(pitchPlayer.player, slot.position, slot.sector, 0).fitFactor
      })
      s.formation = formation
    },
    setPosition(side, playerId, target) {
      const s = sideOf(side)
      const active = activePlayers(s)
      const mover = active.find((p) => p.player.id === playerId)
      if (!mover) throw new Error('O jogador não está em campo')
      const from = mover.point as GridPoint
      const other = active.find((p) => p.point && gridKey(p.point) === gridKey(target))
      if (other === mover) return
      if (other) {
        other.point = { ...from }
      } else if (gridKey(from) === gridKey(GK_POINT)) {
        // (com o gol já vazio ninguém está nele: este ramo só vale para o goleiro em campo)
        throw new Error('O gol não pode ficar sem goleiro')
      }
      mover.point = { row: target.row, lane: target.lane }
      const grid = active.map((p) => p.point as GridPoint)
      const problem = gridProblem(grid, true)
      if (problem) {
        mover.point = from
        if (other) other.point = { ...target }
        throw new Error(problem)
      }
      applyPoints(s, active)
    },
    substitute(side, outgoingId, incomingId) {
      const s = sideOf(side)
      const outgoing = activePlayers(s).find((p) => p.player.id === outgoingId)
      const incoming = s.bench.find((p) => p.id === incomingId)
      if (!outgoing) throw new Error('O jogador não está em campo')
      if (!incoming) throw new Error('O reserva não está no banco')
      if (s.subsLeft <= 0) throw new Error('Sem substituições disponíveis')
      if (!canSubstituteAt(s, ctx.minute)) throw new Error('Sem paradas disponíveis: no máximo 3 paradas além do intervalo')
      assertForeignOk(s, outgoing.player, incoming)
      substitute(ctx, s, outgoing, incoming)
    },
    reorganize(side) {
      const s = sideOf(side)
      syncShortHanded(s, true)
    },
    resolveInjury(side, incomingId) {
      const pending = ctx.pendingInjury
      if (!pending || pending.side !== side) throw new Error('Não há lesão à espera de troca')
      const s = sideOf(side)
      if (incomingId !== undefined) {
        const injured = s.players.find((p) => p.player.id === pending.playerId)
        const incoming = s.bench.find((p) => p.id === incomingId)
        if (!injured) throw new Error('O jogador não está mais em campo')
        if (!incoming) throw new Error('O reserva não está no banco')
        assertForeignOk(s, injured.player, incoming)
        substitute(ctx, s, injured, incoming)
      }
      ctx.pendingInjury = undefined
    },
    result() {
      settle()
      if (moment < totalMoments) throw new Error('A partida ainda não terminou')
      // A disputa de pênaltis sorteia uma vez só: pedir o resultado de novo devolve o mesmo.
      return (finalResult ??= buildResult(ctx, input.knockout))
    },
  }
}

// ---------------------------------------------------------------------------
// 1. Disputa do meio-campo
// ---------------------------------------------------------------------------

function midfielders(side: SideState): PitchPlayer[] {
  const active = activePlayers(side)
  const mids = active.filter((p) => p.sector === 'midfield')
  return mids.length > 0 ? mids : active.filter((p) => p.slot !== 'GK')
}

const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length)

const sectorCount = (side: SideState, sector: PitchPlayer['sector']) =>
  activePlayers(side).filter((p) => p.sector === sector && p.slot !== 'GK').length

/** Bônus da formação no meio-campo: cada meio-campista acima/abaixo da referência vale pontos. */
function midfieldNumbers(side: SideState): number {
  const f = MATCH.formation
  const profile = profileOf(side.formation)
  const control = f.perMidfielder * (sectorCount(side, 'midfield') - f.referenceMidfielders) + profile.control - MATCH.grid.midfieldGap * gapsOf(side.formation).midfield
  return profile.custom ? Math.min(control, READY_CAPS.control) : control
}

/**
 * Qualidade do meio: média do núcleo (os melhores do setor). Quem passa do núcleo entra
 * pelo bônus de números, então um meio-campista a mais nunca piora o meio.
 */
function sectorQuality(players: PitchPlayer[], value: (p: PitchPlayer) => number): number {
  // Só os melhores do núcleo, em ordem decrescente (evita ordenar a lista inteira a cada momento).
  const core = MATCH.formation.midfieldCore
  const best: number[] = []
  for (const p of players) {
    const v = value(p)
    if (best.length === core && v <= (best[core - 1] as number)) continue
    let i = best.length === core ? core - 1 : best.length
    while (i > 0 && (best[i - 1] as number) < v) {
      best[i] = best[i - 1] as number
      i--
    }
    best[i] = v
  }
  return mean(best)
}

/** Capacidade de ficar com a bola: passe, visão, controle, posicionamento (+ estilo e formação). */
function controlScore(side: SideState): number {
  const base = sectorQuality(
    midfielders(side),
    (p) => (attr(p, 'passing') + attr(p, 'vision') + attr(p, 'ballControl') + attr(p, 'positioning')) / 4,
  )
  const style =
    side.style === 'possession' ? MATCH.tactics.possession.control
    : side.style === 'counter-attack' ? MATCH.tactics.counter.control
    : 0
  return base + style + midfieldNumbers(side) + MATCH.tactics.mentality.control * side.mentality
}

/** Capacidade de tomar a bola: desarme, posicionamento, resistência (+ pressão alta e formação). */
function pressScore(side: SideState): number {
  const base = sectorQuality(
    midfielders(side),
    (p) => (attr(p, 'tackling') + attr(p, 'positioning') + attr(p, 'stamina')) / 3,
  )
  const style = side.style === 'high-press' ? MATCH.tactics.highPress.press : 0
  return base + style + midfieldNumbers(side)
}

/**
 * Deslocamento tático na progressão do ataque: defesa com mais gente fecha espaços,
 * ataque com mais gente abre; mentalidade ofensiva de quem defende deixa espaço;
 * transição de contra-ataque pega a defesa desarrumada.
 */
function progressionOffset(att: SideState, def: SideState, transition: boolean, carrier?: PitchPlayer): number {
  const f = MATCH.formation
  return (
    -f.perDefender * (sectorCount(def, 'defense') - f.referenceDefenders) +
    f.perAttacker * (sectorCount(att, 'attack') - f.referenceAttackers) +
    profileOf(att.formation).attack +
    attackExcess(att) +
    gridGap(def, carrier) +
    MATCH.tactics.mentality.openness * def.mentality +
    (transition ? MATCH.tactics.counter.transitionProgression : 0)
  )
}

/** Quanto o ganho de progressão de uma grade livre passa do teto das formações prontas (negativo: é descontado; 0 nas prontas). */
function attackExcess(att: SideState): number {
  const f = MATCH.formation
  const profile = profileOf(att.formation)
  if (!profile.custom) return 0
  const bonus = f.perAttacker * (sectorCount(att, 'attack') - f.referenceAttackers) + profile.attack
  return -Math.max(0, bonus - READY_CAPS.attack)
}

/**
 * Custo dos buracos do posicionamento livre de quem defende: linha de defesa curta e, na faixa por onde o rival
 * conduz a bola, pouca gente cobrindo (a faixa espelhada e as vizinhas). Formações prontas não têm buracos.
 */
function gridGap(def: SideState, carrier?: PitchPlayer): number {
  const gaps = gapsOf(def.formation)
  const lane = carrier?.point?.lane
  return MATCH.grid.defenseGap * gaps.defense + (lane === undefined ? 0 : MATCH.grid.flankGap * (gaps.flank[lane] ?? 0))
}

/** Chance de virar cara a cara: posse tem menos; pressão alta do rival e contra-ataque dão mais. */
function oneOnOneOffset(att: SideState, def: SideState, transition: boolean): number {
  return (
    (att.style === 'possession' ? MATCH.tactics.possession.oneOnOne : 0) +
    (def.style === 'high-press' ? MATCH.tactics.highPress.spaceBehind : 0) +
    (transition ? MATCH.tactics.counter.transitionOneOnOne : 0)
  )
}

/** Reta final: quem vence recua para segurar o resultado e quem perde vai para o tudo ou nada. */
function updateGameState(ctx: MatchContext): void {
  const { fromMinute, shift } = MATCH.tactics.gameState
  for (const [side, other] of [
    [ctx.home, ctx.away],
    [ctx.away, ctx.home],
  ] as const) {
    if (side.userControlled) {
      side.mentality = side.baseMentality
      continue
    }
    const diff = side.goals - other.goals
    const adjust = ctx.minute < fromMinute || diff === 0 ? 0 : diff > 0 ? -shift : shift
    side.mentality = Math.max(-2, Math.min(2, side.baseMentality - side.underdogShift + adjust))
  }
}

/** Força média dos titulares como o técnico vê (posição e fator casa; sem o "dia" de cada um). */
function lineupStrength(side: SideState): number {
  return mean(activePlayers(side).map((p) => overallAt(p.player, p.slot) * p.sideFactor))
}

/** IA: quantos níveis de mentalidade um time recua por ser bem mais fraco que o rival. */
export function underdogShiftFor(side: SideState, opponent: SideState): number {
  const { gap, maxShift } = MATCH.tactics.underdog
  const deficit = lineupStrength(opponent) - lineupStrength(side)
  return Math.max(0, Math.min(maxShift, Math.floor(deficit / gap)))
}

function applyUnderdogPosture(side: SideState, opponent: SideState): void {
  if (side.userControlled) return
  side.underdogShift = underdogShiftFor(side, opponent)
}

/** Quem joga no contra-ataque (e, em menor grau, na pressão alta), ao recuperar a bola, pode sair em transição rápida. */
function maybeCounter(ctx: MatchContext, recovering: SideState, opponent: SideState, transition: boolean): void {
  if (transition) return
  const chance =
    recovering.style === 'counter-attack' ? MATCH.tactics.counter.transitionChance
    : recovering.style === 'high-press' ? MATCH.tactics.highPress.transitionChance
    : 0
  if (chance > 0 && ctx.rng.chance(chance)) playMoment(ctx, recovering, opponent, true)
}

// ---------------------------------------------------------------------------
// Condição física e substituições por cansaço
// ---------------------------------------------------------------------------

function applyFatigue(side: SideState): void {
  const f = MATCH.fatigue
  const tactical = f.style[side.style] * (1 + f.perMentality * side.mentality)
  for (const p of activePlayers(side)) {
    const staminaFactor = 1.5 - p.player.attributes.stamina / 100
    // Goleiro corre bem menos.
    const role = p.slot === 'GK' ? 0.3 : 1
    p.fitness = Math.max(0, p.fitness - f.perMoment * staminaFactor * tactical * role)
  }
}

function substituteTired(ctx: MatchContext, side: SideState): void {
  if (side.userControlled) return
  const f = MATCH.fatigue
  if (ctx.minute < f.subFromMinute || side.subsLeft <= 0 || side.bench.length === 0) return
  if (ctx.minute < f.keepOneSubUntil && side.subsLeft <= 1) return
  if (!canSubstituteAt(side, ctx.minute)) return
  const tired = activePlayers(side)
    .filter((p) => p.slot !== 'GK' && p.fitness < f.subBelowFitness)
    .sort((a, b) => a.fitness - b.fitness)[0]
  if (!tired) return
  const replacement = bestReplacement(side, tired)
  if (replacement && replacement.position !== 'GK') substitute(ctx, side, tired, replacement)
}

export function homePossessionChance(home: SideState, away: SideState): number {
  const homeKeeps = duelChance(controlScore(home), pressScore(away))
  const awayKeeps = duelChance(controlScore(away), pressScore(home))
  return 0.5 + (homeKeeps - awayKeeps) / 2
}

// ---------------------------------------------------------------------------
// 2. Progressão
// ---------------------------------------------------------------------------

/** Anota no rastro do momento em andamento (só leitura; não mexe em nada do jogo). */
function mark(ctx: MatchContext, patch: Partial<PlayTrace>): void {
  if (ctx.current) Object.assign(ctx.current, patch)
}

function playMoment(ctx: MatchContext, att: SideState, def: SideState, transition = false): void {
  const { rng } = ctx
  ctx.current = { minute: ctx.minute, side: att === ctx.home ? 'home' : 'away', transition, play: 'held' }
  ctx.trace.push(ctx.current)
  // Transição de contra-ataque é um lance rápido: não conta como momento de posse.
  if (!transition) att.tally.possession++

  const attackRate = Math.min(0.95, MATCH.attackRate * (1 + MATCH.tactics.mentality.attackRate * att.mentality))
  if (!transition && !rng.chance(attackRate)) {
    if (rng.chance(MATCH.foul.midfield)) {
      const fouler = pickByPosition(rng, def, {}, 1)
      const victim = pickByPosition(rng, att, {}, 1)
      if (fouler && victim) commitFoul(ctx, def, att, fouler, victim, false)
    }
    return
  }

  const carrier = pickByPosition(rng, att, MATCH.carrierWeight)
  if (!carrier) return
  mark(ctx, { carrierId: carrier.player.id })
  const typeWeights = MATCH.playTypeWeight[carrier.slot]
  const styleWeights: Partial<Record<PlayType, number>> = att.style === 'possession' ? MATCH.tactics.possession.playType : {}
  // Em transição não há tempo para chutar de longe ou cruzar: é passe em profundidade ou drible.
  const types = (Object.keys(typeWeights) as PlayType[]).filter((t) => !transition || t === 'through' || t === 'dribble')
  const type = rng.weighted(types, (t) => typeWeights[t] * (styleWeights[t] ?? 1))

  mark(ctx, { play: type === 'longShot' ? 'long-shot' : type })
  if (type === 'longShot') {
    shoot(ctx, att, def, carrier, 'longShot')
    return
  }

  const marker = pickByPosition(rng, def, MATCH.markerWeight[carrier.slot], MATCH.markerFallbackWeight)
  if (marker) mark(ctx, { markerId: marker.player.id })
  if (!marker) {
    shoot(ctx, att, def, carrier, 'oneOnOne')
    return
  }

  if (type === 'dribble') dribble(ctx, att, def, carrier, marker, transition)
  else if (type === 'through') throughBall(ctx, att, def, carrier, transition)
  else cross(ctx, att, def, carrier, marker, transition)
}

const isAttacker = (p: PitchPlayer) => p.sector === 'attack' || p.slot === 'AM' || p.slot === 'ST'

function dribble(
  ctx: MatchContext,
  att: SideState,
  def: SideState,
  carrier: PitchPlayer,
  marker: PitchPlayer,
  transition: boolean,
): void {
  const { rng } = ctx
  const attack = (2 * attr(carrier, 'dribbling') + attr(carrier, 'pace') + attr(carrier, 'ballControl')) / 4
  const defense = (2 * attr(marker, 'tackling') + attr(marker, 'pace') + attr(marker, 'positioning')) / 4
  const offset = MATCH.offset.dribble + progressionOffset(att, def, transition, carrier)

  if (rng.chance(duelChance(attack, defense, offset))) {
    carrier.tally.dribblesWon++
    mark(ctx, { outcome: 'won' })
    if (rng.chance(MATCH.foul.onBeaten)) {
      mark(ctx, { outcome: 'foul' })
      commitFoul(ctx, def, att, marker, carrier, isAttacker(carrier))
      return
    }
    const mix = isAttacker(carrier) ? MATCH.shotAfterDribble.attacker : MATCH.shotAfterDribble.other
    // Cara a cara fica mais ou menos provável conforme a tática (mesmo deslocamento do passe em profundidade).
    const oneOnOneWeight = mix.oneOnOne * Math.exp(oneOnOneOffset(att, def, transition))
    const shotType = rng.weighted(Object.keys(mix) as (keyof typeof mix)[], (t) =>
      t === 'oneOnOne' ? oneOnOneWeight : mix[t],
    )
    shoot(ctx, att, def, carrier, shotType)
    return
  }

  carrier.tally.dribblesLost++
  mark(ctx, { outcome: 'lost' })
  if (rng.chance(MATCH.foul.onFailedDribble)) {
    mark(ctx, { outcome: 'foul' })
    commitFoul(ctx, def, att, marker, carrier, isAttacker(carrier))
    return
  }
  marker.tally.tacklesWon++
  maybeCounter(ctx, def, att, transition)
}

function throughBall(ctx: MatchContext, att: SideState, def: SideState, passer: PitchPlayer, transition: boolean): void {
  const { rng } = ctx
  const receiver = pickByPosition(rng, att, MATCH.throughReceiverWeight, 0, passer)
  if (!receiver) {
    shoot(ctx, att, def, passer, 'longShot')
    return
  }
  mark(ctx, { receiverId: receiver.player.id })
  const defenders = activePlayers(def).filter((p) => p.sector === 'defense' && p.slot !== 'GK')
  const line = defenders.length > 0 ? defenders : activePlayers(def)
  const lineReading = mean(line.map((p) => attr(p, 'positioning')))
  const attack = (attr(passer, 'passing') + attr(passer, 'vision')) / 2

  // Pressão alta do rival deixa espaço nas costas também para o passe.
  const spaceBehind = def.style === 'high-press' ? MATCH.tactics.highPress.spaceBehind / 2 : 0
  const offset = MATCH.offset.through + progressionOffset(att, def, transition, passer) + spaceBehind
  if (!rng.chance(duelChance(attack, lineReading, offset))) {
    // Passe interceptado pela defesa.
    const interceptor = rng.pick(line)
    interceptor.tally.tacklesWon++
    mark(ctx, { outcome: 'intercepted', markerId: interceptor.player.id })
    maybeCounter(ctx, def, att, transition)
    return
  }

  passer.tally.keyPasses++
  mark(ctx, { outcome: 'won' })
  const runner = (attr(receiver, 'pace') + attr(receiver, 'decisions')) / 2
  const cover = mean(line.map((p) => (attr(p, 'pace') + attr(p, 'positioning')) / 2))
  const oneOnOne = rng.chance(duelChance(runner, cover, MATCH.offset.oneOnOne + oneOnOneOffset(att, def, transition)))
  shoot(ctx, att, def, receiver, oneOnOne ? 'oneOnOne' : 'inBox', passer)
}

function cross(
  ctx: MatchContext,
  att: SideState,
  def: SideState,
  crosser: PitchPlayer,
  marker: PitchPlayer,
  transition: boolean,
): void {
  const { rng } = ctx
  const offset = MATCH.offset.cross + progressionOffset(att, def, transition, crosser)
  if (!rng.chance(duelChance(attr(crosser, 'crossing'), attr(marker, 'positioning'), offset))) {
    // Cruzamento travado.
    marker.tally.tacklesWon++
    mark(ctx, { outcome: 'lost' })
    if (rng.chance(MATCH.corner.afterLostCross)) corner(ctx, att, def)
    else maybeCounter(ctx, def, att, transition)
    return
  }
  aerialDuel(ctx, att, def, crosser, MATCH.offset.header)
}

const aerialScore = (p: PitchPlayer) => (3 * attr(p, 'heading') + attr(p, 'strength') + attr(p, 'positioning')) / 5

/** Bola alçada na área: cabeceio do atacante × cabeceio do zagueiro. */
function aerialDuel(ctx: MatchContext, att: SideState, def: SideState, crosser: PitchPlayer, offset: number): void {
  const { rng } = ctx
  const target = pickByPosition(rng, att, MATCH.crossReceiverWeight, 0, crosser)
  const defender = pickByPosition(rng, def, MATCH.aerialDefenderWeight, MATCH.markerFallbackWeight)
  if (!target || !defender) return
  mark(ctx, { receiverId: target.player.id })

  if (rng.chance(duelChance(aerialScore(target), aerialScore(defender), offset))) {
    target.tally.headersWon++
    mark(ctx, { outcome: 'won' })
    shoot(ctx, att, def, target, 'header', crosser)
    return
  }
  defender.tally.headersWon++
  mark(ctx, { outcome: 'lost', markerId: defender.player.id })
  if (rng.chance(MATCH.ownGoalOnLostHeader)) {
    ownGoal(ctx, att, def, defender)
    return
  }
  if (rng.chance(MATCH.corner.afterLostHeader)) corner(ctx, att, def)
}

function corner(ctx: MatchContext, att: SideState, def: SideState): void {
  att.tally.corners++
  const taker = setPieceTaker(att, att.team.tactic.freeKickTakerIds, 'crossing')
  addEvent(ctx, att, 'corner', taker, text.cornerText(att.team.name))
  if (taker) aerialDuel(ctx, att, def, taker, MATCH.offset.cornerHeader)
}

/** Primeiro cobrador da lista que está em campo; senão, o melhor no atributo. */
function setPieceTaker(side: SideState, ids: readonly string[], fallbackAttr: 'crossing' | 'finishing'): PitchPlayer | undefined {
  const active = activePlayers(side).filter((p) => p.slot !== 'GK')
  for (const id of ids) {
    const found = active.find((p) => p.player.id === id)
    if (found) return found
  }
  return [...active].sort((a, b) => attr(b, fallbackAttr) - attr(a, fallbackAttr))[0]
}

// ---------------------------------------------------------------------------
// 3 e 4. Criação da chance e finalização × goleiro
// ---------------------------------------------------------------------------

function shoot(
  ctx: MatchContext,
  att: SideState,
  def: SideState,
  shooter: PitchPlayer,
  type: ShotType,
  assister?: PitchPlayer,
): void {
  const { rng } = ctx
  const shot: NonNullable<PlayTrace['shot']> = { shooterId: shooter.player.id, type, result: 'off-target', ...(assister ? { assisterId: assister.player.id } : {}) }
  mark(ctx, { shot })
  const base = MATCH.xg[type]
  const block = MATCH.blockChance[type]
  att.tally.shots++
  att.tally.xg += base
  shooter.tally.shots++

  if (rng.chance(block)) {
    shot.result = 'blocked'
    if (rng.chance(MATCH.corner.afterBlock)) corner(ctx, att, def)
    return
  }

  const keeper = goalkeeperOf(def)
  if (keeper) shot.keeperId = keeper.player.id
  const skill =
    type === 'header'
      ? 0.8 * attr(shooter, 'heading') + 0.2 * attr(shooter, 'strength')
      : 0.8 * attr(shooter, 'finishing') + 0.2 * attr(shooter, 'decisions')
  const keeping = !keeper
    ? 0
    : type === 'oneOnOne'
      ? 0.4 * attr(keeper, 'reflexes') + 0.4 * attr(keeper, 'rushingOut') + 0.2 * attr(keeper, 'positioning')
      : 0.6 * attr(keeper, 'reflexes') + 0.4 * attr(keeper, 'positioning')
  // O xG base já desconta bloqueios; aqui é a chance de gol quando a bola chega ao goleiro.
  const goalChance = Math.min(MATCH.maxGoalChance, (base / (1 - block)) * Math.exp(MATCH.shotK * (skill - keeping)))

  if (rng.chance(goalChance)) {
    shot.result = 'goal'
    att.tally.shotsOnTarget++
    shooter.tally.shotsOnTarget++
    scoreGoal(ctx, att, def, shooter, type, assister)
    return
  }

  const onTarget = rng.chance(MATCH.onTargetIfMissed[type])
  if (onTarget) {
    shot.result = 'saved'
    att.tally.shotsOnTarget++
    shooter.tally.shotsOnTarget++
    if (keeper) keeper.tally.saves++
  }
  if (type === 'penalty') {
    shooter.tally.penaltiesMissed++
    addEvent(ctx, att, 'missed-penalty', shooter, text.missedPenaltyText(ctx.textRng, displayName(shooter), onTarget))
    return
  }
  if (onTarget && rng.chance(MATCH.corner.afterSave)) corner(ctx, att, def)
}

function scoreGoal(
  ctx: MatchContext,
  att: SideState,
  def: SideState,
  scorer: PitchPlayer,
  type: ShotType,
  assister?: PitchPlayer,
): void {
  att.goals++
  scorer.tally.goals++
  if (assister) assister.tally.assists++
  for (const p of activePlayers(def)) p.tally.goalsConceded++
  addEvent(
    ctx,
    att,
    'goal',
    scorer,
    text.goalText(ctx.textRng, att.team.name, displayName(scorer), type, assister && displayName(assister)),
    assister,
  )
  const goal = ctx.events[ctx.events.length - 1]
  if (assister && goal) goal.assistKind = type === 'header' ? 'cross' : 'pass'
}

/** Gol contra: conta para o time que atacava; o evento aponta o defensor. */
function ownGoal(ctx: MatchContext, att: SideState, def: SideState, defender: PitchPlayer): void {
  att.goals++
  defender.tally.ownGoals++
  for (const p of activePlayers(def)) p.tally.goalsConceded++
  addEvent(ctx, att, 'own-goal', defender, text.ownGoalText(displayName(defender), att.team.name))
}

// ---------------------------------------------------------------------------
// Eventos paralelos: faltas, cartões, pênaltis, lesões, substituições
// ---------------------------------------------------------------------------

function commitFoul(
  ctx: MatchContext,
  foulingSide: SideState,
  fouledSide: SideState,
  fouler: PitchPlayer,
  victim: PitchPlayer,
  dangerous: boolean,
): void {
  const { rng } = ctx
  foulingSide.tally.fouls++
  fouler.tally.fouls++
  victim.tally.foulsWon++
  addEvent(ctx, foulingSide, 'foul', fouler, text.foulText(displayName(fouler)))

  if (rng.chance(MATCH.card.straightRedPerFoul)) {
    sendOff(ctx, foulingSide, fouler, text.redCardText(displayName(fouler)))
  } else if (rng.chance(MATCH.card.yellowPerFoul * (fouler.yellowCards > 0 ? MATCH.card.bookedCaution : 1))) {
    fouler.yellowCards++
    foulingSide.tally.yellowCards++
    addEvent(ctx, foulingSide, 'yellow-card', fouler, text.yellowCardText(displayName(fouler), foulingSide.team.name))
    if (fouler.yellowCards >= 2) sendOff(ctx, foulingSide, fouler, text.secondYellowText(displayName(fouler)))
  }

  if (!dangerous) return
  if (rng.chance(MATCH.foul.penalty)) {
    const taker = setPieceTaker(fouledSide, fouledSide.team.tactic.penaltyTakerIds, 'finishing')
    if (taker) shoot(ctx, fouledSide, foulingSide, taker, 'penalty')
  } else if (rng.chance(MATCH.foul.freeKickShot)) {
    const taker = setPieceTaker(fouledSide, fouledSide.team.tactic.freeKickTakerIds, 'finishing')
    if (taker) shoot(ctx, fouledSide, foulingSide, taker, 'freeKick')
  }
}

function sendOff(ctx: MatchContext, side: SideState, player: PitchPlayer, message: string): void {
  if (player.minuteOff !== null) return
  player.sentOff = true
  player.minuteOff = ctx.minute
  side.tally.redCards++
  addEvent(ctx, side, 'red-card', player, message)

  // Goleiro expulso: entra o reserva no lugar de um jogador de linha, se der.
  if (player.slot === 'GK') {
    const keeper = side.bench.find((p) => p.position === 'GK')
    if (keeper && side.subsLeft > 0) {
      const outfield = activePlayers(side).filter((p) => p.slot !== 'GK')
      const weakest = [...outfield].sort((a, b) => overallAt(a.player, a.slot) - overallAt(b.player, b.slot))[0]
      if (weakest) substitute(ctx, side, weakest, keeper, 'GK')
    }
  }
}

function checkInjury(ctx: MatchContext): void {
  const { rng } = ctx
  const candidates = [...activePlayers(ctx.home), ...activePlayers(ctx.away)]
  const risk = (p: PitchPlayer) =>
    (p.player.hidden.injuryProneness / 50) * (p.fitness < MATCH.injuryLowFitness ? MATCH.injuryLowFitnessFactor : 1)
  const totalRisk = candidates.reduce((sum, p) => sum + risk(p), 0)
  if (!rng.chance(MATCH.injuryPerMoment * totalRisk)) return

  const injured = rng.weighted(candidates, risk)
  const side = ctx.home.players.includes(injured) ? ctx.home : ctx.away
  const severity = rng.weighted(
    [
      { min: 3, max: 10, weight: 70 },
      { min: 11, max: 30, weight: 25 },
      { min: 31, max: 90, weight: 5 },
    ],
    (s) => s.weight,
  )
  injured.injuryDays = rng.int(severity.min, severity.max)
  addEvent(ctx, side, 'injury', injured, text.injuryText(displayName(injured)))

  const replacement = bestReplacement(side, injured)
  if (side.holdInjury) {
    // O jogador sai e o jogo espera o técnico, se ainda há troca e parada; sem elas o time segue com um a menos.
    injured.minuteOff = ctx.minute
    if (replacement && side.subsLeft > 0 && canSubstituteAt(side, ctx.minute)) ctx.pendingInjury = { side: side === ctx.home ? 'home' : 'away', playerId: injured.player.id }
    return
  }
  if (replacement && side.subsLeft > 0) substitute(ctx, side, injured, replacement)
  else injured.minuteOff = ctx.minute
}

/** Substituição voluntária: no intervalo, numa parada já aberta neste minuto ou abrindo uma nova (até o limite). */
function canSubstituteAt(side: SideState, minute: number): boolean {
  return side.subsLeft > 0 && (minute === MATCH.halftimeMinute || side.subStops.includes(minute) || side.subStops.length < MATCH.maxSubStops)
}

/** Estrangeiros em campo do time (limite `lineup` da liga, que vale também depois do apito inicial). */
function foreignOnPitch(side: SideState): number {
  return activePlayers(side).filter((p) => isForeign(p.player, side.team)).length
}

/** A troca respeita o limite de estrangeiros em campo? Passa se não aumenta o número de estrangeiros ou se fica dentro do máximo. */
function foreignSubOk(side: SideState, outgoing: Player, incoming: Player): boolean {
  const max = side.team.foreignLimit?.lineup
  if (max === undefined || !isForeign(incoming, side.team) || isForeign(outgoing, side.team)) return true
  return foreignOnPitch(side) + 1 <= max
}

function assertForeignOk(side: SideState, outgoing: Player, incoming: Player): void {
  if (!foreignSubOk(side, outgoing, incoming)) throw new Error(`Limite de estrangeiros da liga: no máximo ${side.team.foreignLimit?.lineup} em campo ao mesmo tempo. Escolha um jogador da casa para entrar.`)
}

function bestReplacement(side: SideState, outgoing: PitchPlayer): Player | undefined {
  return [...side.bench].filter((p) => foreignSubOk(side, outgoing.player, p)).sort((a, b) => overallAt(b, outgoing.slot) - overallAt(a, outgoing.slot))[0]
}

function substitute(
  ctx: MatchContext,
  side: SideState,
  outgoing: PitchPlayer,
  incoming: Player,
  slot = outgoing.slot,
): void {
  if (outgoing.minuteOff === null) outgoing.minuteOff = ctx.minute
  side.bench = side.bench.filter((p) => p !== incoming)
  side.subsLeft--
  if (ctx.minute !== MATCH.halftimeMinute && !side.subStops.includes(ctx.minute)) side.subStops.push(ctx.minute)
  const sector = slot === 'GK' ? 'defense' : outgoing.sector
  side.players.push(
    createPitchPlayer(incoming, slot, sector, ctx.minute, side.sideFactor, dayFactorFor(ctx.rng, incoming), slot === 'GK' ? GK_POINT : outgoing.point),
  )
  addEvent(
    ctx,
    side,
    'substitution',
    outgoing,
    text.substitutionText(side.team.name, displayName(outgoing), displayName(incoming)),
    incoming,
  )
}

function addEvent(
  ctx: MatchContext,
  side: SideState,
  type: MatchEvent['type'],
  player: PitchPlayer | undefined,
  message: string,
  related?: PitchPlayer | Player,
): void {
  if (!player) return
  const event: MatchEvent = { minute: ctx.minute, type, teamId: side.team.id, playerId: player.player.id, text: message }
  if (related) event.relatedPlayerId = 'player' in related ? related.player.id : related.id
  ctx.events.push(event)
}

// ---------------------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------------------

function teamStats(side: SideState, possessionShare: number): TeamMatchStats {
  const t = side.tally
  return {
    possession: possessionShare,
    shots: t.shots,
    shotsOnTarget: t.shotsOnTarget,
    corners: t.corners,
    fouls: t.fouls,
    yellowCards: t.yellowCards,
    redCards: t.redCards,
    xg: Math.round(t.xg * 100) / 100,
  }
}

function playerResults(side: SideState, opponent: SideState, end: number): PlayerMatchResult[] {
  return side.players.map((p) => {
    const minutesPlayed = (p.minuteOff ?? end) - p.minuteOn
    const result: PlayerMatchResult = {
      playerId: p.player.id,
      teamId: side.team.id,
      minutesPlayed,
      rating: playerRating(p, minutesPlayed, side.goals, opponent.goals),
      finalFitness: Math.round(p.fitness),
    }
    if (p.injuryDays > 0) result.injuryDays = p.injuryDays
    return result
  })
}

/** Quem está em campo no fim e o goleiro dele: os cobradores da disputa de pênaltis. */
function shootoutSide(side: SideState): ShootoutSide {
  const on = activePlayers(side)
  return { teamId: side.team.id, onPitch: on.map((p) => p.player), preferred: side.team.tactic.penaltyTakerIds, keeper: on.find((p) => p.slot === 'GK')?.player }
}

function buildResult(ctx: MatchContext, knockout?: KnockoutRules): MatchResult {
  const { home, away } = ctx
  const end = ctx.extra ? EXTRA_END : MATCH_MINUTES
  // Prorrogação acabada e confronto ainda empatado: pênaltis (sorteio separado, que não mexe nos outros).
  const shootout = knockout?.penalties && knockoutLeader(knockout, home.goals, away.goals) === null ? runShootout(ctx.rng.fork('shootout'), shootoutSide(home), shootoutSide(away)) : undefined
  const totalPossession = home.tally.possession + away.tally.possession
  const homeShare = totalPossession === 0 ? 50 : Math.round((100 * home.tally.possession) / totalPossession)
  return {
    homeGoals: home.goals,
    awayGoals: away.goals,
    events: ctx.events,
    homeStats: teamStats(home, homeShare),
    awayStats: teamStats(away, 100 - homeShare),
    playerResults: [...playerResults(home, away, end), ...playerResults(away, home, end)],
    ...(ctx.extra ? { extraTime: true } : {}),
    ...(shootout ? { penalties: { home: shootout.home, away: shootout.away }, shootout: shootout.kicks } : {}),
  }
}
