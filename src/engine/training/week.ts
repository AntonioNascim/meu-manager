/**
 * Treino por dia. O técnico monta a agenda dos dias até o próximo jogo do time (um exercício e a intensidade em cada dia, ou folga);
 * quem não montou, ou o dia sem sessão, segue o plano do time (intensidade e foco). A agenda só **reparte** o ganho que a intensidade e
 * o foco já calibram: o ganho do dia usa a média dos dias, os pesos dos atributos são a média dos focos dos dias (média 1, como sempre)
 * e o risco de lesão e a recuperação da condição seguem a carga de cada dia. Sem agenda o treino é exatamente o de antes.
 * Funções puras: recebem o estado e devolvem outro.
 */
import { TRAINING } from '../config'
import type { SeasonState } from '../season/calendar'
import { addDays } from '../season/dates'
import type { DrillId, DrillTheme, IsoDate, TeamId, TrainingFocus, TrainingPlan, TrainingSession, TrainingState } from '../types'
import { DRILL_IDS, DRILL_THEMES, TRAINING_INTENSITIES } from '../types'
import { DRILLS, REST_DAY } from './drills'

/** Quantos dias, no máximo, a agenda cobre (os dias seguintes seguem o plano até o próximo avanço). */
export const AGENDA_MAX_DAYS = 7

export interface DayEffect {
  /** Multiplica o ganho do dia. */
  growth: number
  /** Para onde vai o ganho de atributos do dia. */
  focus: TrainingFocus
  /** Multiplica a recuperação diária da condição. */
  recovery: number
  /** Teto da condição. */
  ceiling: number
  /** Multiplica o risco de lesão no treino do dia. */
  injury: number
}

export const isDrill = (id: unknown): id is DrillId => typeof id === 'string' && (DRILL_IDS as readonly string[]).includes(id)

export function isSession(value: unknown): value is TrainingSession {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (s.drill === 'rest' || isDrill(s.drill)) && (TRAINING_INTENSITIES as readonly string[]).includes(s.intensity as string)
}

/** Efeito de um dia com sessão. */
export function sessionEffect(session: TrainingSession): DayEffect {
  if (session.drill === 'rest') return { growth: REST_DAY.growth, focus: 'balanced', recovery: REST_DAY.recovery, ceiling: REST_DAY.ceiling, injury: REST_DAY.injury }
  const drill = DRILLS[session.drill]
  const level = TRAINING.intensity[session.intensity]
  return { growth: level.growth * drill.growth, focus: drill.focus, recovery: level.recovery * (1.1 - 0.1 * drill.load), ceiling: level.fitnessCeiling, injury: level.injury * drill.load }
}

/** Efeito de um dia sem sessão: o plano do time. */
export function planEffect(plan: TrainingPlan): DayEffect {
  const level = TRAINING.intensity[plan.intensity]
  return { growth: level.growth, focus: plan.focus, recovery: level.recovery, ceiling: level.fitnessCeiling, injury: level.injury }
}

export const agendaOf = (training: Pick<TrainingState, 'agenda'>, teamId: TeamId): Readonly<Record<IsoDate, TrainingSession>> => training.agenda?.[teamId] ?? {}

/** Os dias de `from` (inclusive) a `to` (exclusive). */
export function daysOf(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = []
  for (let d = from; d < to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * Efeito de cada dia de `from` a `to` para o time, ou `undefined` se a agenda não tem sessão nenhuma nesse intervalo
 * (então vale o caminho de sempre, só com o plano).
 */
export function dayEffects(training: Pick<TrainingState, 'agenda'>, teamId: TeamId, from: IsoDate, to: IsoDate, plan: TrainingPlan): DayEffect[] | undefined {
  const agenda = agendaOf(training, teamId)
  const days = daysOf(from, to)
  if (!days.some((d) => agenda[d] !== undefined)) return undefined
  return days.map((d) => (agenda[d] ? sessionEffect(agenda[d] as TrainingSession) : planEffect(plan)))
}

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)

/** Média dos dias: ganho, recuperação e teto da condição (os pesos e as lesões usam cada dia, no motor do treino). */
export function summarize(effects: readonly DayEffect[]): { growth: number; recovery: number; ceiling: number } {
  return { growth: mean(effects.map((e) => e.growth)), recovery: mean(effects.map((e) => e.recovery)), ceiling: mean(effects.map((e) => e.ceiling)) }
}

// ---------------------------------------------------------------------------
// Janela de dias e escolhas do técnico
// ---------------------------------------------------------------------------

/**
 * Os dias que o técnico pode montar: de hoje (ou de amanhã, se o time já jogou hoje) até o dia anterior ao próximo jogo do time, no máximo
 * `AGENDA_MAX_DAYS`. Vazio se o jogo é hoje ou se o time não tem mais jogos.
 */
export function trainingWindow(state: Pick<SeasonState, 'matches' | 'season'>, teamId: TeamId, today: IsoDate = state.season.currentDate): IsoDate[] {
  let next: IsoDate | undefined
  let playedToday = false
  for (const m of state.matches) {
    if (m.homeTeamId !== teamId && m.awayTeamId !== teamId) continue
    if (m.status === 'finished') {
      if (m.date === today) playedToday = true
      continue
    }
    if (m.date >= today && (next === undefined || m.date < next)) next = m.date
  }
  if (!next) return []
  const start = playedToday ? addDays(today, 1) : today
  return daysOf(start, next).slice(0, AGENDA_MAX_DAYS)
}

export class AgendaError extends Error {
  constructor(
    readonly code: 'invalid' | 'out-of-window',
    message: string,
  ) {
    super(message)
  }
}

function withAgenda(state: SeasonState, teamId: TeamId, agenda: Record<IsoDate, TrainingSession>): SeasonState {
  const all = { ...(state.training.agenda ?? {}) }
  if (Object.keys(agenda).length === 0) delete all[teamId]
  else all[teamId] = agenda
  return { ...state, training: { ...state.training, agenda: all } }
}

/** Põe (ou tira, com `null`) a sessão de um dia da janela. */
export function setSession(state: SeasonState, teamId: TeamId, date: IsoDate, session: TrainingSession | null): SeasonState {
  if (session !== null && !isSession(session)) throw new AgendaError('invalid', 'Exercício inválido.')
  if (!trainingWindow(state, teamId).includes(date)) throw new AgendaError('out-of-window', 'Esse dia não está na semana de treino.')
  const agenda = { ...agendaOf(state.training, teamId) }
  if (session === null) delete agenda[date]
  else agenda[date] = session
  return withAgenda(state, teamId, agenda)
}

/** Troca a agenda inteira da janela de uma vez (o aparelho manda tudo junto, o servidor confere cada dia). */
export function setAgenda(state: SeasonState, teamId: TeamId, sessions: Readonly<Record<IsoDate, TrainingSession | null>>): SeasonState {
  const window = new Set(trainingWindow(state, teamId))
  const next: Record<IsoDate, TrainingSession> = {}
  for (const [date, session] of Object.entries(sessions)) {
    if (session === null) continue
    if (!isSession(session)) throw new AgendaError('invalid', 'Exercício inválido.')
    if (!window.has(date)) throw new AgendaError('out-of-window', 'Esse dia não está na semana de treino.')
    next[date] = session
  }
  return withAgenda(state, teamId, next)
}

export const clearAgenda = (state: SeasonState, teamId: TeamId): SeasonState => withAgenda(state, teamId, {})

const BY_FOCUS: Record<TrainingFocus, readonly DrillId[]> = {
  balanced: ['full-match', 'joker-possession', 'build-from-back'],
  physical: ['conditioning-circuit', 'eight-a-side', 'speed-agility'],
  technical: ['rondo', 'one-two-wall', 'through-balls'],
  defensive: ['mid-block', 'six-a-side', 'high-press-trigger'],
  offensive: ['finishing-box', 'overlap-crosses', 'counter-run'],
}

/**
 * "Delegar à comissão": monta a janela pelo plano do time (foco e intensidade). Dois dias antes do jogo a carga cai, na véspera só bola
 * parada leve, e numa semana longa um dia é de folga.
 */
export function committeeAgenda(plan: TrainingPlan, window: readonly IsoDate[]): Record<IsoDate, TrainingSession> {
  const out: Record<IsoDate, TrainingSession> = {}
  const drills = BY_FOCUS[plan.focus]
  const n = window.length
  window.forEach((date, i) => {
    const left = n - i
    if (left === 1) out[date] = { drill: 'corners-for', intensity: 'light' }
    else if (left === 2 && n >= 3) out[date] = { drill: 'recovery-session', intensity: 'light' }
    else if (n >= 6 && left === 4) out[date] = { drill: 'rest', intensity: 'light' }
    else out[date] = { drill: drills[i % drills.length] as DrillId, intensity: plan.intensity }
  })
  return out
}

export function delegateAgenda(state: SeasonState, teamId: TeamId, plan: TrainingPlan): SeasonState {
  return withAgenda(state, teamId, committeeAgenda(plan, trainingWindow(state, teamId)))
}

/** Tira da agenda os dias que já passaram (antes de `date`). */
export function pruneAgenda(training: TrainingState, date: IsoDate): TrainingState {
  if (!training.agenda) return training
  let changed = false
  const next: Record<TeamId, Record<IsoDate, TrainingSession>> = {}
  for (const [teamId, days] of Object.entries(training.agenda)) {
    const kept = Object.fromEntries(Object.entries(days).filter(([d]) => d >= date))
    if (Object.keys(kept).length !== Object.keys(days).length) changed = true
    if (Object.keys(kept).length > 0) next[teamId] = kept
    else changed = true
  }
  return changed ? { ...training, agenda: next } : training
}

// ---------------------------------------------------------------------------
// O que a semana ensaia (só informa)
// ---------------------------------------------------------------------------

export type Rehearsal = 0 | 1 | 2 | 3

/** Medidores dos seis temas: 0 sem trabalhar, 1 visto por cima, 2 ensaiado, 3 dominado. Só leitura, sem efeito no motor de partida. */
export function rehearsal(sessions: Iterable<TrainingSession>): Record<DrillTheme, Rehearsal> {
  const points = Object.fromEntries(DRILL_THEMES.map((t) => [t, 0])) as Record<DrillTheme, number>
  for (const s of sessions) {
    if (s.drill === 'rest') continue
    const themes = DRILLS[s.drill].themes
    for (const t of DRILL_THEMES) points[t] += themes[t] ?? 0
  }
  const level = (p: number): Rehearsal => (p >= 5 ? 3 : p >= 3 ? 2 : p >= 1 ? 1 : 0)
  return Object.fromEntries(DRILL_THEMES.map((t) => [t, level(points[t])])) as Record<DrillTheme, Rehearsal>
}
