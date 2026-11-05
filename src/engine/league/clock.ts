/**
 * O relógio de uma liga online (Fase 6, B6; proposta, seções 2.2 e 2.5). Puro: o tempo real entra como parâmetro (`now`, em milissegundos), então tudo
 * roda em teste com tempo simulado.
 *
 * - A liga tem uma **data do jogo `D`** (em dias, com fração) que anda com o tempo real.
 * - **Eventos** são as datas em que há partida de técnico humano (`match`); **âncoras** são datas que só fixam `D` (virada de um país, por exemplo).
 *   Cada evento recebe um **horário real de início**, escolhido na faixa da liga com sorteio de semente fixa.
 * - `D` é amarrada aos eventos: no horário de início de um evento vale exatamente a data dele; entre dois eventos é interpolada, então `D` nunca
 *   passa da data do próximo evento antes do início dele. O ritmo só decide **quando** cada evento cai (data ÷ dias por dia real).
 * - **Pausar** congela `D` (e o "relógio efetivo" usado nos prazos); **retomar** refaz os horários futuros a partir de agora, com as mesmas regras.
 * - Fuso: deslocamento fixo em minutos (o padrão, America/Sao_Paulo, não tem horário de verão desde 2019). Fusos com horário de verão ficam
 *   para a B8, que pode passar a função de deslocamento.
 */
import { createRng } from '../rng'
import { addDays, daysBetween } from '../season/dates'
import type { IsoDate } from '../types'
import { MAX_DELAY_MS, MS_DAY, MS_MINUTE, PACES, SLOT_OPTIONS, bandOf, type Band, type PaceId } from './pace'

export interface ClockConfig {
  pace: PaceId
  band: Band
  /** Deslocamento do fuso da liga em minutos em relação ao UTC (padrão: -180). */
  tzOffsetMin: number
  /** Semente da liga: o sorteio dos horários é sempre o mesmo para a mesma liga. */
  seed: string
  /** Mínimo entre dois eventos (padrão: o do ritmo). */
  minGapMs?: number
}

export const DEFAULT_CONFIG = (seed: string): ClockConfig => ({ pace: 'normal', band: bandOf('classic'), tzOffsetMin: -180, seed })

export interface ScheduledEvent {
  /** Dia do jogo (número de dias desde `EPOCH`). */
  day: number
  startAt: number
  kind: 'match' | 'anchor'
}

export interface ClockState {
  /** `D` valia `anchorDay` em `anchorAt` (o último evento que começou, o início da liga ou a retomada). */
  anchorDay: number
  anchorAt: number
  /** Eventos que ainda não começaram, em ordem. */
  events: ScheduledEvent[]
  /** Horário (dia da semana e minuto) do último evento de partidas: o próximo não repete. */
  lastSlot?: number
  /** Em pausa desde este instante. */
  pausedAt?: number
  /** Soma das pausas já encerradas (o relógio efetivo dos prazos desconta isto). */
  pausedTotalMs: number
}

const EPOCH: IsoDate = '2000-01-01'

export const dayOf = (date: IsoDate): number => daysBetween(EPOCH, date)
export const dateOfDay = (day: number): IsoDate => addDays(EPOCH, Math.floor(day))

/** Instantes (ms) dos horários da faixa dentro de [from, to], em ordem. */
export function slotTimes(from: number, to: number, config: Pick<ClockConfig, 'band' | 'tzOffsetMin'>): number[] {
  const out: number[] = []
  const offset = config.tzOffsetMin * MS_MINUTE
  // Primeiro dia local que pode conter um horário.
  const firstLocalDay = Math.floor((from + offset) / MS_DAY)
  const lastLocalDay = Math.floor((to + offset) / MS_DAY)
  for (let d = firstLocalDay; d <= lastLocalDay; d++) {
    const dow = (((d + 4) % 7) + 7) % 7 // 1970-01-01 foi quinta-feira (4)
    for (const slot of config.band.slots) {
      if (slot.dow !== dow) continue
      const t = d * MS_DAY + slot.minute * MS_MINUTE - offset
      if (t >= from && t <= to) out.push(t)
    }
  }
  return out.sort((a, b) => a - b)
}

const slotKeyOf = (t: number, tzOffsetMin: number): number => {
  const local = t + tzOffsetMin * MS_MINUTE
  const day = Math.floor(local / MS_DAY)
  return ((((day + 4) % 7) + 7) % 7) * 1440 + Math.round((local - day * MS_DAY) / MS_MINUTE)
}

const gapOf = (config: ClockConfig): number => config.minGapMs ?? PACES[config.pace].minGapMs

/**
 * Agenda os eventos `days` (ordenados, depois de `anchorDay`) a partir da âncora. O horário ideal de cada evento vem do ritmo
 * (`anchorAt + dias ÷ dias por dia real`); ele é encaixado no próximo horário da faixa, sorteado entre as primeiras opções livres, nunca repetindo o
 * horário do evento anterior (quando há outra opção), com o mínimo entre eventos e no máximo 36 h de atraso sobre o ideal; se um evento atrasa,
 * os seguintes se deslocam em cascata.
 */
export function scheduleEvents(config: ClockConfig, anchorDay: number, anchorAt: number, days: readonly { day: number; kind: ScheduledEvent['kind'] }[], lastSlot?: number): { events: ScheduledEvent[]; lastSlot?: number } {
  const perDay = PACES[config.pace].daysPerDay
  const gap = gapOf(config)
  const events: ScheduledEvent[] = []
  let prevMatchStart = -Infinity
  let prevAny = anchorAt
  let last = lastSlot
  for (const item of [...days].sort((a, b) => a.day - b.day)) {
    if (item.day <= anchorDay) continue
    const idealRaw = anchorAt + ((item.day - anchorDay) / perDay) * MS_DAY
    if (item.kind === 'anchor') {
      const startAt = Math.max(idealRaw, prevAny + 1000)
      events.push({ day: item.day, startAt, kind: 'anchor' })
      prevAny = startAt
      continue
    }
    const ideal = Math.max(idealRaw, prevMatchStart + gap, prevAny + 1000)
    const limit = Math.max(idealRaw + MAX_DELAY_MS, ideal)
    let options = slotTimes(ideal, limit, config)
    // Sem horário na janela: o primeiro depois dela (a cascata aceita passar das 36 h).
    if (options.length === 0) options = slotTimes(limit, limit + 14 * MS_DAY, config).slice(0, 1)
    if (options.length === 0) options = [ideal]
    options = options.slice(0, SLOT_OPTIONS)
    const different = options.filter((t) => slotKeyOf(t, config.tzOffsetMin) !== last)
    const pool = different.length > 0 ? different : options
    const startAt = createRng(`${config.seed}:slot:${item.day}`).pick(pool)
    events.push({ day: item.day, startAt, kind: 'match' })
    prevMatchStart = startAt
    prevAny = startAt
    last = slotKeyOf(startAt, config.tzOffsetMin)
  }
  return { events, ...(last !== undefined ? { lastSlot: last } : {}) }
}

/** Liga nova: `D` vale `startDate` agora; os eventos são agendados a partir daí. */
export function newClock(config: ClockConfig, now: number, startDate: IsoDate, days: readonly { day: number; kind: ScheduledEvent['kind'] }[]): ClockState {
  const anchorDay = dayOf(startDate)
  const planned = scheduleEvents(config, anchorDay, now, days)
  return { anchorDay, anchorAt: now, events: planned.events, ...(planned.lastSlot !== undefined ? { lastSlot: planned.lastSlot } : {}), pausedTotalMs: 0 }
}

/** O instante a partir do qual o relógio anda (em pausa, o instante da pausa). */
const effective = (clock: ClockState, now: number): number => (clock.pausedAt !== undefined ? clock.pausedAt : now)

/** `D` em `now`, com fração de dia. Interpola até o próximo evento e nunca o passa; sem eventos futuros, anda no ritmo. */
export function gameDay(clock: ClockState, now: number, config: ClockConfig): number {
  const t = effective(clock, now)
  const next = clock.events[0]
  if (!next) return clock.anchorDay + ((t - clock.anchorAt) / MS_DAY) * PACES[config.pace].daysPerDay
  if (t >= next.startAt) return next.day
  const span = next.startAt - clock.anchorAt
  if (span <= 0) return next.day
  return clock.anchorDay + ((t - clock.anchorAt) / span) * (next.day - clock.anchorDay)
}

/** A data (dia inteiro) que o mundo deve ter alcançado em `now`: os dias completos de `D`. */
export const gameDate = (clock: ClockState, now: number, config: ClockConfig): IsoDate => dateOfDay(gameDay(clock, now, config))

/** O relógio dos prazos: o tempo real menos o tempo em que a liga esteve pausada. Congela sozinho na pausa. */
export const effectiveNow = (clock: ClockState, now: number): number => effective(clock, now) - clock.pausedTotalMs

/** Próximo evento que ainda não começou. */
export const nextEvent = (clock: ClockState): ScheduledEvent | undefined => clock.events[0]

/** Um evento começou em `at` (no horário, por "todos prontos" ou pelo Avançar): `D` passa a valer a data dele nesse instante. */
export function startEvent(clock: ClockState, at: number): { clock: ClockState; event: ScheduledEvent } {
  const [event, ...rest] = clock.events
  if (!event) throw new Error('Não há evento para começar.')
  return { clock: { ...clock, anchorDay: event.day, anchorAt: at, events: rest }, event }
}

/**
 * Pausa: `D` e os prazos congelam. Retomada: `D` continua de onde parou e os horários futuros são **refeitos a partir de agora** com as regras da faixa
 * (não apenas deslocados: uma pausa de 3 dias numa liga "só à noite" não pode cair às 4h).
 */
export function pauseClock(clock: ClockState, now: number): ClockState {
  return clock.pausedAt !== undefined ? clock : { ...clock, pausedAt: now }
}

export function resumeClock(clock: ClockState, now: number, config: ClockConfig, days: readonly { day: number; kind: ScheduledEvent['kind'] }[]): ClockState {
  if (clock.pausedAt === undefined) return clock
  const day = gameDay(clock, now, config)
  const planned = scheduleEvents(config, day, now, days, clock.lastSlot)
  return { anchorDay: day, anchorAt: now, events: planned.events, ...(planned.lastSlot !== undefined ? { lastSlot: planned.lastSlot } : {}), pausedTotalMs: clock.pausedTotalMs + (now - clock.pausedAt) }
}

/** Troca a lista de eventos futuros (um sorteio de copa criou jogos novos, por exemplo), mantendo a âncora. */
export function replanClock(clock: ClockState, config: ClockConfig, days: readonly { day: number; kind: ScheduledEvent['kind'] }[]): ClockState {
  const planned = scheduleEvents(config, clock.anchorDay, clock.anchorAt, days, clock.lastSlot)
  return { ...clock, events: planned.events }
}

/** Próximo instante de passagem diária (a hora local `hour`) depois de `after`. */
export function nextTickAt(after: number, config: Pick<ClockConfig, 'tzOffsetMin'>, hour: number): number {
  const offset = config.tzOffsetMin * MS_MINUTE
  let day = Math.floor((after + offset) / MS_DAY)
  for (;;) {
    const t = day * MS_DAY + hour * 60 * MS_MINUTE - offset
    if (t > after) return t
    day++
  }
}
