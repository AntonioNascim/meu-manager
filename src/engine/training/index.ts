/**
 * Treino. Durante a temporada, a cada avanço, os jogadores evoluem um pouco (proporcional aos dias passados, entre a
 * primeira e a última rodada); a virada de temporada só cuida do envelhecimento e do declínio dos veteranos.
 *
 * - Treino coletivo: intensidade (Leve, Normal, Intensa) e foco (atributos que evoluem mais, sem aumentar o total).
 *   Quem não escolheu nada (a IA) treina Leve em semana com jogo no meio da semana e Normal nas demais.
 * - Treino individual: uma vaga por time, por cerca de 30 dias: acelera um grupo de atributos ou ensina uma posição secundária.
 * - A base também treina, em ritmo menor (os jovens contam como quem jogou `ACADEMY.evolutionShare` dos minutos).
 * Funções puras: recebem o estado e devolvem outro.
 */
import { ACADEMY, ATTRIBUTE_MAX, ATTRIBUTE_MIN, OFFSEASON, TRAINING } from '../config'
import { playerOverall } from '../overall'
import { developmentFactor, stochasticRound, yearlyGain } from '../offseason/evolution'
import { createRng } from '../rng'
import type { Rng } from '../rng'
import type { SeasonState } from '../season/calendar'
import { addDays, ageAtSeasonStart, ageOn, daysBetween } from '../season/dates'
import { competitionsOf, cycleOfPyramid, focusPyramid, pyramidOfTeamId } from '../season/cycles'
import { GOALKEEPER_ATTRIBUTES, MENTAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, TECHNICAL_ATTRIBUTES } from '../types'
import type {
  AttributeName,
  Attributes,
  IndividualGoal,
  IsoDate,
  Player,
  PlayerId,
  Position,
  StrengthSnapshot,
  TeamId,
  TrainingFocus,
  TrainingGroup,
  TrainingPlan,
  TrainingState,
} from '../types'
import { emptyTraining } from '../types'

const E = OFFSEASON.evolution
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export class TrainingError extends Error {
  constructor(
    readonly code: 'not-found' | 'busy' | 'invalid',
    message: string,
  ) {
    super(message)
  }
}

export const GROUP_ATTRIBUTES: Record<TrainingGroup, readonly AttributeName[]> = {
  technical: TECHNICAL_ATTRIBUTES,
  physical: PHYSICAL_ATTRIBUTES,
  mental: MENTAL_ATTRIBUTES,
  goalkeeper: GOALKEEPER_ATTRIBUTES,
}

/** Atributos que cada foco direciona (goleiros também treinam reflexos e saída do gol no foco defensivo). */
const FOCUS_ATTRIBUTES: Record<TrainingFocus, readonly AttributeName[]> = {
  balanced: [],
  physical: ['pace', 'stamina', 'strength'],
  technical: ['passing', 'finishing', 'dribbling', 'crossing', 'ballControl'],
  defensive: ['tackling', 'heading', 'positioning', 'strength', 'determination', 'reflexes', 'rushingOut'],
  offensive: ['finishing', 'dribbling', 'crossing', 'passing', 'pace', 'vision'],
}

const ALL_ATTRIBUTES: readonly AttributeName[] = [...TECHNICAL_ATTRIBUTES, ...PHYSICAL_ATTRIBUTES, ...MENTAL_ATTRIBUTES, ...GOALKEEPER_ATTRIBUTES]
const FIELD_ATTRIBUTES: readonly AttributeName[] = ALL_ATTRIBUTES.filter((n) => n !== 'reflexes' && n !== 'rushingOut')

/** Peso de cada atributo no ganho do foco: a média dos pesos é 1, então o foco muda para onde vai o ganho, não quanto. */
export function focusWeights(focus: TrainingFocus, goalkeeper: boolean): Record<AttributeName, number> {
  const eligible = goalkeeper ? ALL_ATTRIBUTES : FIELD_ATTRIBUTES
  const focused = eligible.filter((n) => FOCUS_ATTRIBUTES[focus].includes(n))
  const weights = {} as Record<AttributeName, number>
  const boost = focused.length === 0 ? 1 : Math.min(TRAINING.focusBoost, (eligible.length - 0.2 * (eligible.length - focused.length)) / focused.length)
  const rest = focused.length === 0 || focused.length === eligible.length ? 1 : (eligible.length - focused.length * boost) / (eligible.length - focused.length)
  for (const name of ALL_ATTRIBUTES) weights[name] = focused.includes(name) ? boost : rest
  return weights
}

const WEIGHTS = new Map<string, Record<AttributeName, number>>()
function weightsFor(focus: TrainingFocus, goalkeeper: boolean): Record<AttributeName, number> {
  const key = `${focus}:${goalkeeper}`
  let w = WEIGHTS.get(key)
  if (!w) WEIGHTS.set(key, (w = focusWeights(focus, goalkeeper)))
  return w
}

export const DEFAULT_PLAN: TrainingPlan = { intensity: 'normal', focus: 'balanced' }

/** Plano do time para os próximos `days` dias: o escolhido, ou (IA) Leve em intervalo curto e Normal nos demais. */
export function planFor(training: Pick<TrainingState, 'plans'>, teamId: TeamId, days: number): TrainingPlan {
  return training.plans[teamId] ?? { intensity: days >= TRAINING.ai.shortWeek[0] && days <= TRAINING.ai.shortWeek[1] ? 'light' : 'normal', focus: 'balanced' }
}

/** Primeira e última data de jogos de liga da temporada de uma pirâmide (cada país tem a sua). */
function competitionSpan(state: SeasonState, pyramid: string): { first: IsoDate; last: IsoDate; rounds: number } | null {
  // O treino se reparte pelos jogos de liga: as copas (que entram em outras datas) não mexem no ritmo.
  const comps = competitionsOf(state, pyramid)
  const ids = new Set(comps.map((c) => c.id))
  let first: IsoDate | undefined
  let last: IsoDate | undefined
  for (const m of state.matches) {
    if (m.cup !== undefined || !ids.has(m.competitionId)) continue
    if (first === undefined || m.date < first) first = m.date
    if (last === undefined || m.date > last) last = m.date
  }
  if (!first || !last) return null
  return { first, last, rounds: comps[0]?.roundCount ?? 38 }
}

/** Fração do ganho da temporada que cabe nos dias de `from` a `to` (a soma de todos os avanços dá 1), na temporada da pirâmide (padrão: a do foco). */
export function seasonShare(state: SeasonState, from: IsoDate, to: IsoDate, pyramid: string = focusPyramid(state)): number {
  const span = competitionSpan(state, pyramid)
  if (!span) return 0
  const total = daysBetween(span.first, span.last)
  if (total <= 0) return 0
  const start = from > span.first ? from : span.first
  const end = to < span.last ? to : span.last
  return end > start ? daysBetween(start, end) / total : 0
}

/** Quantas rodadas já se passaram na data (mínimo 3, para o começo da temporada não zerar a fração de minutos). */
function gamesElapsed(state: SeasonState, date: IsoDate, pyramid: string = focusPyramid(state)): number {
  const span = competitionSpan(state, pyramid)
  if (!span) return 3
  const total = Math.max(1, daysBetween(span.first, span.last))
  return Math.max(3, clamp(daysBetween(span.first, date) / total, 0, 1) * span.rounds)
}

/** Fração dos minutos possíveis que o jogador já jogou nesta temporada (cai no ritmo de quem joga a rodada toda). */
export function minutesShareSoFar(state: SeasonState, player: Player, date: IsoDate): number {
  const pyramid = (player.teamId ? pyramidOfTeamId(state, player.teamId) : undefined) ?? focusPyramid(state)
  return clamp(player.seasonStats.minutes / (90 * gamesElapsed(state, date, pyramid)), 0, 1)
}

/** Ritmo de evolução: pontos de força por temporada que o jogador deve ganhar com o plano dado (sem ruído). */
export function projectedGrowth(player: Player, plan: TrainingPlan, minutesShare: number): number {
  const gain = yearlyGain(player.age, playerOverall(player), player.hidden.potential)
  if (gain <= 0) return 0
  const rate = gain * developmentFactor(player, minutesShare) * TRAINING.intensity[plan.intensity].growth * TRAINING.growthScale
  return Math.min(rate, Math.max(0, player.hidden.potential - playerOverall(player)))
}

/**
 * Faixa estimada do potencial (o valor de verdade é oculto): a estimativa soma um erro que diminui com a idade e
 * fica sempre igual para o mesmo jogador na mesma idade. Nunca fica abaixo da força de hoje.
 */
export function potentialRange(player: Player): { low: number; high: number } {
  const R = TRAINING.potentialRange
  const t = clamp((player.age - R.youngAge) / (R.oldAge - R.youngAge), 0, 1)
  const sd = R.sdYoung + (R.sdOld - R.sdYoung) * t
  const estimate = player.hidden.potential + createRng(`${player.id}:${player.age}:range`).normal(0, sd * 0.6)
  const now = Math.ceil(playerOverall(player))
  const low = clamp(Math.max(now, Math.round(estimate - sd)), ATTRIBUTE_MIN, ATTRIBUTE_MAX)
  const high = clamp(Math.max(low, Math.round(estimate + sd)), ATTRIBUTE_MIN, ATTRIBUTE_MAX)
  return { low, high }
}

/** Diferença da força arredondada desde o último mês (histórico do time do jogador). 0 = igual ou sem histórico. */
export function strengthTrend(history: readonly StrengthSnapshot[] | undefined, overall: number, date: IsoDate): number {
  if (!history || history.length === 0) return 0
  const limit = addDays(date, -TRAINING.history.compareDays)
  let reference: StrengthSnapshot | undefined
  for (const s of history) if (s[0] <= limit) reference = s
  return reference ? Math.round(overall) - Math.round(reference[1]) : 0
}

// ---------------------------------------------------------------------------
// Escolhas do jogador
// ---------------------------------------------------------------------------

export function setTrainingPlan(state: SeasonState, teamId: TeamId, plan: TrainingPlan): SeasonState {
  return { ...state, training: { ...state.training, plans: { ...state.training.plans, [teamId]: plan } } }
}

/** Posições que o jogador pode aprender: goleiro não vira jogador de linha (e vice-versa), até 2 secundárias. */
export function learnablePositions(player: Player): Position[] {
  if (player.position === 'GK' || player.secondaryPositions.length >= 2) return []
  const all: Position[] = ['RB', 'LB', 'CB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST']
  return all.filter((p) => p !== player.position && !player.secondaryPositions.includes(p))
}

/** Grupos que o treino individual aceita para o jogador (o de goleiro só para goleiros). */
export const trainableGroups = (player: Player): TrainingGroup[] => (player.position === 'GK' ? ['goalkeeper', 'physical', 'mental', 'technical'] : ['technical', 'physical', 'mental'])

export function startIndividualTraining(state: SeasonState, teamId: TeamId, playerId: PlayerId, goal: IndividualGoal): SeasonState {
  const player = state.players.find((p) => p.id === playerId && p.teamId === teamId)
  if (!player) throw new TrainingError('not-found', 'Jogador não encontrado no elenco')
  if (state.training.individual[teamId]) throw new TrainingError('busy', 'A vaga de treino individual já está ocupada')
  if (goal.type === 'group' && !trainableGroups(player).includes(goal.group)) throw new TrainingError('invalid', 'Esse grupo de atributos não serve para esse jogador')
  if (goal.type === 'position' && !learnablePositions(player).includes(goal.position)) throw new TrainingError('invalid', 'Esse jogador não pode aprender essa posição')
  const days = TRAINING.individual.days
  const { [teamId]: _old, ...finished } = state.training.finished
  return {
    ...state,
    training: { ...state.training, finished, individual: { ...state.training.individual, [teamId]: { playerId, goal, startDate: state.season.currentDate, daysLeft: days, totalDays: days } } },
  }
}

export function cancelIndividualTraining(state: SeasonState, teamId: TeamId): SeasonState {
  const { [teamId]: _gone, ...individual } = state.training.individual
  return { ...state, training: { ...state.training, individual } }
}

// ---------------------------------------------------------------------------
// Passagem do tempo
// ---------------------------------------------------------------------------

interface TickInput {
  year: number
  /** Primeiro dia da temporada do país (a curva de crescimento segue a idade nesse dia); padrão: 1º de janeiro de `year`. */
  seasonStart?: IsoDate
  /** Fração do ganho da temporada deste avanço. */
  share: number
  minutesShare: number
  growth: number
  weights: Record<AttributeName, number>
  /** Pontos extras por atributo do grupo (treino individual) neste avanço. */
  extra?: { attributes: readonly AttributeName[]; points: number }
}

/** Evolução de um jogador neste avanço: sua parte do ganho da temporada (com o ruído fixo do ano) mais o treino individual. */
export function trainPlayer(rng: Rng, player: Player, input: TickInput): Player {
  const overall = playerOverall(player)
  const potential = player.hidden.potential
  // O ritmo do ano parte da força do começo da temporada (senão o bônus de potencial encolheria a cada semana e o total ficaria menor).
  const start = player.seasonStats.startOverall ?? overall
  if (player.seasonStats.startOverall === undefined) player = { ...player, seasonStats: { ...player.seasonStats, startOverall: start } }
  const noise = createRng(`${player.id}:${input.year}:talent`).normal(0, E.playerNoise)
  // O crescimento da temporada segue a idade do começo dela (a curva foi calibrada assim); o aniversário no meio do ano não muda o ritmo do treino.
  const annual = yearlyGain(input.seasonStart ? ageOn(player.birthDate, input.seasonStart) : ageAtSeasonStart(player.birthDate, input.year), start, potential) + noise
  let gain = annual > 0 ? annual * developmentFactor(player, input.minutesShare) * input.growth * TRAINING.growthScale : annual
  gain *= input.share
  if (gain > 0) gain = Math.min(gain, Math.max(0, potential - overall))
  let extra = input.extra?.points ?? 0
  if (extra > 0) extra = Math.min(extra, Math.max(0, potential - overall - Math.max(0, gain)))
  if (gain === 0 && extra === 0) return player

  const attributes = { ...player.attributes } as Attributes
  let changed = false
  const goalkeeper = player.position === 'GK'
  for (const name of ALL_ATTRIBUTES) {
    if (!goalkeeper && (name === 'reflexes' || name === 'rushingOut')) continue
    let delta = gain * input.weights[name]
    if (extra > 0 && input.extra?.attributes.includes(name)) delta += extra
    if (delta === 0) continue
    const value = clamp(attributes[name] + stochasticRound(rng, delta), ATTRIBUTE_MIN, ATTRIBUTE_MAX)
    if (value !== attributes[name]) {
      attributes[name] = value
      changed = true
    }
  }
  return changed ? { ...player, attributes } : player
}

/** Lesão sofrida no treino durante os `days` dias: chance maior com intensidade alta e propensão a lesão. */
function trainingInjury(rng: Rng, player: Player, intensity: TrainingPlan['intensity'], days: number): Player {
  if (player.condition.injuryDaysLeft > 0) return player
  const perDay = TRAINING.injury.perDay * TRAINING.intensity[intensity].injury * (0.5 + (TRAINING.injury.pronenessWeight * player.hidden.injuryProneness) / 100)
  if (!rng.chance(1 - (1 - perDay) ** days)) return player
  // A lesão aconteceu num dia qualquer do intervalo: o que sobra dela é o que ainda falta no fim.
  const left = rng.int(TRAINING.injury.days[0], TRAINING.injury.days[1]) - Math.floor(rng.float(0, days))
  return left > 0 ? { ...player, condition: { ...player.condition, injuryDaysLeft: left } } : player
}

/**
 * Treina de `from` a `to`: evolução do dia (coletivo e individual), lesões de treino, fim do treino individual e
 * histórico mensal da força do time do jogador (`userTeamId`).
 */
export function applyTraining(state: SeasonState, from: IsoDate, to: IsoDate, userTeamId?: TeamId): SeasonState {
  const days = daysBetween(from, to)
  if (days <= 0) return state
  // Cada país tem a sua temporada: o ganho do ano, o ritmo e os minutos possíveis seguem a pirâmide do clube.
  const infos = new Map<string, { year: number; seasonStart: IsoDate; share: number; minutesBase: number }>()
  const infoOf = (teamId: TeamId) => {
    const pyramid = pyramidOfTeamId(state, teamId) ?? focusPyramid(state)
    let info = infos.get(pyramid)
    if (!info) {
      const cycle = cycleOfPyramid(state, pyramid)
      infos.set(pyramid, (info = { year: cycle.year, seasonStart: cycle.start, share: seasonShare(state, from, to, pyramid), minutesBase: 90 * gamesElapsed(state, to, pyramid) }))
    }
    return info
  }
  const rng = createRng(`${state.market.seed}:${to}:training`)
  const training = state.training
  const individual = { ...training.individual }
  const finished = { ...training.finished }

  const plans = new Map<TeamId, TrainingPlan>()
  const planOf = (teamId: TeamId) => {
    let plan = plans.get(teamId)
    if (!plan) plans.set(teamId, (plan = planFor(training, teamId, days)))
    return plan
  }
  // Treino individual: quantos dias dele cabem neste avanço.
  const extras = new Map<PlayerId, { teamId: TeamId; attributes: readonly AttributeName[]; points: number }>()
  const learning = new Map<PlayerId, Position>()
  for (const [teamId, slot] of Object.entries(individual)) {
    const player = state.players.find((p) => p.id === slot.playerId && p.teamId === teamId)
    if (!player) {
      delete individual[teamId]
      continue
    }
    const used = Math.min(days, slot.daysLeft)
    if (slot.goal.type === 'group') extras.set(player.id, { teamId, attributes: GROUP_ATTRIBUTES[slot.goal.group], points: (TRAINING.individual.pointsPerAttribute * used) / slot.totalDays })
    if (slot.daysLeft - days <= 0) {
      if (slot.goal.type === 'position') learning.set(player.id, slot.goal.position)
      finished[teamId] = { playerId: player.id, goal: slot.goal, date: to }
      delete individual[teamId]
    } else individual[teamId] = { ...slot, daysLeft: slot.daysLeft - days }
  }

  const history: Record<PlayerId, StrengthSnapshot[]> = { ...training.history }
  const monthStart = from.slice(0, 7) !== to.slice(0, 7)
  const tracked = userTeamId === undefined ? [] : state.players.filter((p) => p.teamId === userTeamId)
  for (const p of tracked) if (!history[p.id]?.length) history[p.id] = [[from, round1(playerOverall(p))]]

  const players = state.players.map((p) => {
    if (p.teamId === null) return p
    const plan = planOf(p.teamId)
    const e = extras.get(p.id)
    const info = infoOf(p.teamId)
    let next = trainPlayer(rng, p, {
      year: info.year,
      seasonStart: info.seasonStart,
      share: info.share,
      minutesShare: clamp(p.seasonStats.minutes / info.minutesBase, 0, 1),
      growth: TRAINING.intensity[plan.intensity].growth,
      weights: weightsFor(plan.focus, p.position === 'GK'),
      ...(e ? { extra: { attributes: e.attributes, points: e.points } } : {}),
    })
    next = trainingInjury(rng, next, plan.intensity, days)
    const learned = learning.get(p.id)
    if (learned && !next.secondaryPositions.includes(learned) && next.secondaryPositions.length < 2) next = { ...next, secondaryPositions: [...next.secondaryPositions, learned] }
    return next
  })

  // A base treina junto, em ritmo menor: conta como quem jogou `evolutionShare` dos minutos; sem lesões nem treino individual.
  const academy = state.academy.map((p) => {
    if (p.teamId === null) return p
    const plan = planOf(p.teamId)
    const info = infoOf(p.teamId)
    return trainPlayer(rng, p, { year: info.year, seasonStart: info.seasonStart, share: info.share, minutesShare: ACADEMY.evolutionShare, growth: 1, weights: weightsFor(plan.focus, p.position === 'GK') })
  })

  if (userTeamId !== undefined) {
    const squadIds = new Set(players.filter((p) => p.teamId === userTeamId).map((p) => p.id))
    if (monthStart) {
      for (const id of Object.keys(history)) if (!squadIds.has(id)) delete history[id]
      const date = `${to.slice(0, 7)}-01`
      for (const p of players) {
        if (!squadIds.has(p.id)) continue
        const list = history[p.id] ?? []
        if (list.length > 0 && (list[list.length - 1] as StrengthSnapshot)[0] >= date) continue
        history[p.id] = [...list, [date, round1(playerOverall(p))] as StrengthSnapshot].slice(-TRAINING.history.maxEntries)
      }
    }
  }

  return { ...state, players, academy, training: { ...training, individual, finished, history } }
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** Recuperação diária e teto da condição do time para o intervalo (intensidade do treino). */
export function fitnessProfile(training: Pick<TrainingState, 'plans'>, teamId: TeamId | null, days: number): { recovery: number; ceiling: number } {
  if (teamId === null) return { recovery: 1, ceiling: 100 }
  const level = TRAINING.intensity[planFor(training, teamId, days).intensity]
  return { recovery: level.recovery, ceiling: level.fitnessCeiling }
}

export { emptyTraining }
