/**
 * Partida simplificada: as ligas fora do foco do técnico (ninguém vê o lance) usam isto em vez do motor completo, mais de mil
 * vezes mais barato. O resultado tem a mesma forma de `MatchResult` (placar, gols com assistência, cartões, notas, minutos, condição
 * final e lesões), então a classificação, a artilharia, a forma, a moral e a evolução dos jogadores funcionam como nas ligas completas.
 *
 * Em vez de lances, sorteia os gols de cada time (Poisson, a partir da força das quatro linhas e da vantagem de jogar em casa) e depois
 * distribui gols, assistências, cartões e lesões entre os jogadores por posição e atributo. Os coeficientes (`QUICK`) são ajustados
 * contra o motor completo por `tools/quickCompare.ts` e conferidos em `tests/balance/quick.test.ts`.
 */
import { MATCH, QUICK } from '../config'
import { FORMATIONS } from '../formations'
import { restedFactor } from '../lineup'
import { playerOverall } from '../overall'
import { createRng } from '../rng'
import type { Rng } from '../rng'
import type { MatchEvent, MatchResult, Player, PlayerMatchResult, Position, Team, TeamMatchStats } from '../types'

export interface QuickSide {
  /** A formação do time define quantos jogadores de cada linha entram (opcional). */
  team: Pick<Team, 'id' | 'name'> & { tactic?: Pick<Team['tactic'], 'formationId'> }
  players: readonly Player[]
}

export interface QuickInput {
  home: QuickSide
  away: QuickSide
  /** Mesma semente = mesmo resultado. */
  seed: number
  /** Público presente, para a vantagem de jogar em casa (opcional). */
  attendance?: number
  /** Lotação do estádio do mandante, de 0 a 1, usada com o público. */
  capacity?: number
}

const GROUP_OF: Record<Position, 0 | 1 | 2 | 3> = { GK: 0, RB: 1, LB: 1, CB: 1, DM: 2, CM: 2, AM: 2, RW: 3, LW: 3, ST: 3 }

/** Quem joga no lado simplificado: titular ou reserva que entrou. */
interface Participant {
  player: Player
  /** Força efetiva (com a condição física). */
  strength: number
  from: number
  to: number
  group: 0 | 1 | 2 | 3
  goals: number
  assists: number
  yellow: number
  red: boolean
}

interface SideState {
  side: QuickSide
  xi: Participant[]
  all: Participant[]
  /** Média de força de cada linha. */
  lines: number[]
  goals: number
  goalsAgainst: number
}

const playing = (list: readonly Participant[], minute: number) => list.filter((p) => p.from <= minute && minute <= p.to)

function effectiveStrength(p: Player): number {
  return playerOverall(p) * restedFactor(p.condition.fitness)
}

function participant(player: Player, from: number, to: number): Participant {
  return { player, strength: effectiveStrength(player), from, to, group: GROUP_OF[player.position], goals: 0, assists: 0, yellow: 0, red: false }
}

const QUOTAS = new Map<string, number[]>()

/** Quantos jogadores de cada linha a formação do time usa (formação desconhecida: `QUICK.quotas`). */
function quotasOf(formationId: string | undefined): readonly number[] {
  const formation = formationId ? FORMATIONS[formationId] : undefined
  if (!formation || !formationId) return QUICK.quotas
  let quotas = QUOTAS.get(formationId)
  if (!quotas) {
    quotas = [0, 0, 0, 0]
    for (const slot of formation.slots) quotas[GROUP_OF[slot.position]] = (quotas[GROUP_OF[slot.position]] ?? 0) + 1
    QUOTAS.set(formationId, quotas)
  }
  return quotas
}

/** Os 11 melhores disponíveis por linha, nas cotas da formação do time; a falta de jogador numa linha é coberta pelos melhores que sobram. */
export function quickLineup(players: readonly Player[], formationId?: string): { xi: Player[]; bench: Player[] } {
  const available = players.filter((p) => p.condition.injuryDaysLeft === 0 && p.condition.suspensionGames === 0)
  const ranked = available.map((p) => ({ p, s: effectiveStrength(p) })).sort((a, b) => b.s - a.s)
  const xi: Player[] = []
  const used = new Set<Player>()
  quotasOf(formationId).forEach((quota, group) => {
    let taken = 0
    for (const { p } of ranked) {
      if (taken >= quota) break
      if (GROUP_OF[p.position] === group && !used.has(p)) {
        xi.push(p)
        used.add(p)
        taken++
      }
    }
  })
  for (const { p } of ranked) {
    if (xi.length >= 11) break
    // Sem goleiro disponível, ninguém de linha vai ao gol: o time joga sem ele (raro).
    if (!used.has(p) && p.position !== 'GK') {
      xi.push(p)
      used.add(p)
    }
  }
  const bench = ranked.filter(({ p }) => !used.has(p)).map(({ p }) => p)
  return { xi, bench }
}

function poisson(rng: Rng, lambda: number): number {
  const limit = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng.next()
  } while (p > limit)
  return k - 1
}

/** Força média de cada linha (goleiro, defesa, meio, ataque) da escalação simplificada do elenco: base do ajuste dos coeficientes. */
export function quickLines(players: readonly Player[], formationId?: string): number[] {
  return lineMeans(quickLineup(players, formationId).xi.map((p) => participant(p, 0, 90)))
}

/** Gols de um time: o número de chances que viram gol entre `trials` tentativas (menos disperso que Poisson, como no motor completo, que tem menos empates). */
function goalCount(rng: Rng, lambda: number): number {
  const trials = QUICK.goals.trials
  const p = Math.min(1, lambda / trials)
  let goals = 0
  for (let i = 0; i < trials; i++) if (rng.next() < p) goals++
  return goals
}

function dayFactor(rng: Rng): number {
  const sd = QUICK.goals.dayNoise
  return Math.exp(rng.normal(0, sd) - (sd * sd) / 2)
}

function lineMeans(xi: readonly Participant[]): number[] {
  return QUICK.quotas.map((_, group) => {
    const members = xi.filter((p) => p.group === group)
    if (members.length === 0) return QUICK.reference - 15
    return members.reduce((sum, p) => sum + p.strength, 0) / members.length
  })
}

function expectedGoals(attack: SideState, defense: SideState, isHome: boolean, fill: number): number {
  const g = QUICK.goals
  let x = g.intercept
  for (let i = 0; i < 4; i++) {
    x += g.scale * (g.own[i] as number) * ((attack.lines[i] as number) - QUICK.reference)
    x += g.scale * (g.opponent[i] as number) * ((defense.lines[i] as number) - QUICK.reference)
  }
  const level = ((attack.lines.reduce((a, b) => a + b, 0) + defense.lines.reduce((a, b) => a + b, 0)) / 8 - QUICK.reference) / 10
  if (isHome) x += g.home + g.occupancy * (fill - 0.5) + g.homeLevel * level
  return Math.exp(x + g.level * level * level)
}

function buildSide(side: QuickSide, rng: Rng): SideState {
  const { xi, bench } = quickLineup(side.players, side.team.tactic?.formationId)
  const starters = xi.map((p) => participant(p, 0, 90))
  const all = [...starters]
  // Trocas: o mais cansado de linha sai e o melhor reserva entra, uma vez cada.
  const outfield = starters.filter((p) => p.group !== 0).sort((a, b) => a.player.condition.fitness - b.player.condition.fitness)
  const bunch = bench.filter((p) => p.position !== 'GK')
  for (let i = 0; i < QUICK.subs.count && i < outfield.length && i < bunch.length; i++) {
    const minute = rng.int(QUICK.subs.from, QUICK.subs.to)
    const out = outfield[i] as Participant
    out.to = minute
    all.push(participant(bunch[i] as Player, minute + 1, 90))
  }
  return { side, xi: starters, all, lines: lineMeans(starters), goals: 0, goalsAgainst: 0 }
}

function pickWeighted(rng: Rng, list: readonly Participant[], weight: (p: Participant) => number): Participant | undefined {
  if (list.length === 0) return undefined
  let total = 0
  for (const p of list) total += weight(p)
  if (total <= 0) return rng.pick(list)
  return rng.weighted(list, weight)
}

/** Quem finaliza pesa pela finalização; quem dá o passe, por passe e visão, ou pelo cruzamento nas posições que mais cruzam. */
const finishingSkill = (p: Participant, power: number) => (p.player.attributes.finishing / 60) ** power
const passingSkill = (p: Participant, power: number) => {
  const { passing, vision, crossing } = p.player.attributes
  const cross = QUICK.assist.crossShare[p.player.position]
  return (((1 - cross) * (passing + vision)) / 2 / 60 + (cross * crossing) / 60) ** power
}

function addGoals(events: MatchEvent[], rng: Rng, scoring: SideState, conceding: SideState): void {
  for (let i = 0; i < scoring.goals; i++) {
    const minute = rng.int(1, 90)
    if (rng.chance(QUICK.ownGoalPerGoal)) {
      const unlucky = pickWeighted(rng, playing(conceding.all, minute).filter((p) => p.group !== 0), () => 1)
      if (unlucky) {
        events.push({ minute, type: 'own-goal', teamId: conceding.side.team.id, playerId: unlucky.player.id, text: '' })
        continue
      }
    }
    const on = playing(scoring.all, minute)
    const scorer = pickWeighted(rng, on, (p) => QUICK.scorer.weights[p.player.position] * finishingSkill(p, QUICK.scorer.power))
    if (!scorer) continue
    scorer.goals++
    const event: MatchEvent = { minute, type: 'goal', teamId: scoring.side.team.id, playerId: scorer.player.id, text: '' }
    if (rng.chance(QUICK.assist.share)) {
      const helper = pickWeighted(rng, on.filter((p) => p !== scorer), (p) => QUICK.assist.weights[p.player.position] * passingSkill(p, QUICK.assist.power))
      if (helper) {
        helper.assists++
        event.relatedPlayerId = helper.player.id
        event.assistKind = rng.chance(QUICK.assist.crossShare[helper.player.position]) ? 'cross' : 'pass'
      }
    }
    events.push(event)
  }
}

function addCards(events: MatchEvent[], rng: Rng, side: SideState): void {
  const teamId = side.side.team.id
  const book = (p: Participant, minute: number) => {
    p.yellow++
    events.push({ minute, type: 'yellow-card', teamId, playerId: p.player.id, text: '' })
    if (p.yellow >= 2 && !p.red) {
      p.red = true
      events.push({ minute, type: 'red-card', teamId, playerId: p.player.id, text: '' })
    }
  }
  const weight = (p: Participant) => QUICK.cards.weights[p.player.position] * (p.yellow > 0 ? 0.35 : 1)
  const yellows = poisson(rng, QUICK.cards.yellowPerTeam)
  for (let i = 0; i < yellows; i++) {
    const minute = rng.int(5, 90)
    const target = pickWeighted(rng, playing(side.all, minute).filter((p) => !p.red), weight)
    if (target) book(target, minute)
  }
  if (rng.chance(QUICK.cards.redPerTeam)) {
    const minute = rng.int(10, 90)
    const target = pickWeighted(rng, playing(side.all, minute).filter((p) => !p.red), weight)
    if (target) {
      target.red = true
      events.push({ minute, type: 'red-card', teamId, playerId: target.player.id, text: '' })
    }
  }
}

const INJURY_SEVERITY = [
  { min: 3, max: 10, weight: 70 },
  { min: 11, max: 30, weight: 25 },
  { min: 31, max: 90, weight: 5 },
] as const

function injuryOf(rng: Rng, p: Participant): number {
  const minutes = Math.min(90, p.to - p.from + 1) / 90
  const risk = QUICK.injury.perPlayer * (p.player.hidden.injuryProneness / 50) * (p.player.condition.fitness < MATCH.injuryLowFitness ? QUICK.injury.lowFitnessFactor : 1) * minutes
  if (!rng.chance(risk)) return 0
  const severity = rng.weighted(INJURY_SEVERITY, (s) => s.weight)
  return rng.int(severity.min, severity.max)
}

function rate(rng: Rng, side: SideState, p: Participant, minutes: number): number {
  const r = QUICK.rating
  let delta = p.goals * 1 + p.assists * 0.6 + Math.min(p.yellow, 1) * -0.4 + (p.red ? -1.5 : 0)
  const cleanSheet = side.goalsAgainst === 0 && minutes >= 60
  if (p.group === 0) delta += (cleanSheet ? 0.6 : 0) - 0.35 * side.goalsAgainst
  else if (p.group === 1) delta += (cleanSheet ? 0.4 : 0) - 0.15 * side.goalsAgainst
  delta += side.goals > side.goalsAgainst ? 0.3 : side.goals < side.goalsAgainst ? -0.3 : 0
  delta += r.skill * (p.strength - QUICK.reference) + (r.shift[p.group] as number)
  // A consistência do jogador aperta a variação das notas.
  const noise = rng.normal(0, (r.sd[p.group] as number) * (1.4 - p.player.hidden.consistency / 100))
  const weight = Math.min(1, minutes / 30)
  return Math.round(Math.min(10, Math.max(1, 6 + (delta + noise) * weight)) * 10) / 10
}

function playerResults(rng: Rng, side: SideState, events: readonly MatchEvent[]): PlayerMatchResult[] {
  const redMinute = new Map<string, number>()
  for (const e of events) if (e.type === 'red-card') redMinute.set(e.playerId, e.minute)
  const results: PlayerMatchResult[] = []
  for (const p of side.all) {
    const sentOff = redMinute.get(p.player.id)
    const to = sentOff !== undefined ? Math.min(p.to, sentOff) : p.to
    const minutes = Math.max(0, to - p.from + (p.from === 0 ? 0 : 1))
    if (minutes <= 0) continue
    const stamina = p.player.attributes.stamina
    const drop = QUICK.fitness.dropPer90 * (minutes / 90) * (1 - (QUICK.fitness.staminaSlope * (stamina - 60)) / 40)
    const injuryDays = injuryOf(rng, p)
    results.push({
      playerId: p.player.id,
      teamId: side.side.team.id,
      minutesPlayed: minutes,
      rating: rate(rng, side, p, minutes),
      finalFitness: Math.round(Math.max(0, p.player.condition.fitness - drop)),
      ...(injuryDays > 0 ? { injuryDays } : {}),
    })
  }
  return results
}

function stats(rng: Rng, side: SideState, other: SideState, events: readonly MatchEvent[], lambda: number): TeamMatchStats {
  const teamId = side.side.team.id
  const count = (type: MatchEvent['type']) => events.filter((e) => e.teamId === teamId && e.type === type).length
  const shots = Math.max(side.goals, poisson(rng, lambda * QUICK.stats.shotsPerGoal))
  const midfield = (side.lines[2] as number) - (other.lines[2] as number)
  return {
    possession: Math.round(Math.min(75, Math.max(25, 50 + QUICK.stats.possessionSlope * midfield))),
    shots,
    shotsOnTarget: Math.min(shots, side.goals + poisson(rng, shots * 0.25)),
    corners: poisson(rng, shots * 0.4),
    fouls: poisson(rng, 12),
    yellowCards: count('yellow-card'),
    redCards: count('red-card'),
    xg: Math.round(lambda * 100) / 100,
  }
}

/** Resultado simplificado de uma partida: mesmo formato do motor completo, sem narração. */
export function simulateQuick(input: QuickInput): MatchResult {
  const rng = createRng(input.seed)
  const home = buildSide(input.home, rng)
  const away = buildSide(input.away, rng)
  const fill = input.attendance !== undefined && input.capacity ? Math.min(1, input.attendance / input.capacity) : 0.5
  const lambdaHome = expectedGoals(home, away, true, fill)
  const lambdaAway = expectedGoals(away, home, false, fill)
  home.goals = away.goalsAgainst = goalCount(rng, lambdaHome * dayFactor(rng))
  away.goals = home.goalsAgainst = goalCount(rng, lambdaAway * dayFactor(rng))

  const events: MatchEvent[] = []
  addGoals(events, rng, home, away)
  addGoals(events, rng, away, home)
  addCards(events, rng, home)
  addCards(events, rng, away)
  events.sort((a, b) => a.minute - b.minute)
  return {
    homeGoals: home.goals,
    awayGoals: away.goals,
    events,
    homeStats: stats(rng, home, away, events, lambdaHome),
    awayStats: stats(rng, away, home, events, lambdaAway),
    playerResults: [...playerResults(rng, home, events), ...playerResults(rng, away, events)],
  }
}
