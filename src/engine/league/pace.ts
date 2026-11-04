/**
 * Ritmos e faixas de horário de uma liga online (Fase 6, B6; proposta, seção 2.2). Valores de produto, não de equilíbrio do jogo.
 */

export const MS_MINUTE = 60_000
export const MS_HOUR = 60 * MS_MINUTE
export const MS_DAY = 24 * MS_HOUR

export type PaceId = 'calm' | 'normal' | 'fast' | 'very-fast'

export interface Pace {
  /** Quantos dias de jogo passam por dia real. */
  daysPerDay: number
  /** Tempo mínimo entre dois eventos. */
  minGapMs: number
}

export const PACES: Record<PaceId, Pace> = {
  calm: { daysPerDay: 2, minGapMs: 8 * MS_HOUR },
  normal: { daysPerDay: 3, minGapMs: 8 * MS_HOUR },
  fast: { daysPerDay: 7, minGapMs: 8 * MS_HOUR },
  'very-fast': { daysPerDay: 14, minGapMs: 6 * MS_HOUR },
}

/** Ligas abertas só usam o ritmo Normal; as de amigos escolhem entre os quatro. */
export const OPEN_LEAGUE_PACE: PaceId = 'normal'

/** Atraso máximo de um evento sobre o horário ideal (a não ser que a cascata de eventos anteriores empurre além). */
export const MAX_DELAY_MS = 36 * MS_HOUR
/** Quantas opções de horário o sorteio considera a partir do primeiro horário livre. */
export const SLOT_OPTIONS = 3
/** A sala abre este tempo antes do horário do evento. */
export const ROOM_OPENS_BEFORE_MS = 5 * MS_MINUTE
/** A pausa do ADM dura no máximo isto (depois a liga volta sozinha e avisa). */
export const MAX_PAUSE_MS = 30 * MS_DAY
/** Quanto do calendário futuro fica agendado e visível. */
export const SCHEDULE_HORIZON_MS = 28 * MS_DAY
/** Hora local da passagem diária (tick). */
export const DEFAULT_TICK_HOUR = 4

/** Um horário permitido da semana: dia (0 = domingo) e minuto do dia. */
export interface BandSlot {
  dow: number
  minute: number
}

export type BandId = 'classic' | 'night' | 'weekend' | 'custom'

const h = (hours: number, minutes = 0) => hours * 60 + minutes
const on = (dows: number[], minutes: number[]): BandSlot[] => dows.flatMap((dow) => minutes.map((minute) => ({ dow, minute })))

export const BANDS: Record<Exclude<BandId, 'custom'>, BandSlot[]> = {
  // Futebol clássico: sábado 16h / 18h30 / 21h; domingo 11h / 16h / 18h30 / 20h30; meio de semana (terça a quinta) 19h30 / 21h30.
  classic: [...on([6], [h(16), h(18, 30), h(21)]), ...on([0], [h(11), h(16), h(18, 30), h(20, 30)]), ...on([2, 3, 4], [h(19, 30), h(21, 30)])],
  night: on([0, 1, 2, 3, 4, 5, 6], [h(19), h(20, 30), h(21, 30), h(22, 30)]),
  // Sábado e domingo, das 10h às 22h, de hora em hora.
  weekend: on([6, 0], Array.from({ length: 13 }, (_, i) => h(10 + i))),
}

/** Faixa personalizada: até 12 horários, mínimo de 3 h entre dois no mesmo dia. Devolve o problema ou `undefined`. */
export function customBandProblem(slots: readonly BandSlot[]): 'empty' | 'too-many' | 'invalid' | 'too-close' | undefined {
  if (slots.length === 0) return 'empty'
  if (slots.length > 12) return 'too-many'
  if (slots.some((s) => !Number.isInteger(s.dow) || s.dow < 0 || s.dow > 6 || !Number.isInteger(s.minute) || s.minute < 0 || s.minute >= 24 * 60)) return 'invalid'
  for (const a of slots) for (const b of slots) if (a !== b && a.dow === b.dow && Math.abs(a.minute - b.minute) < 180) return 'too-close'
  return undefined
}

export interface Band {
  id: BandId
  slots: readonly BandSlot[]
}

export function bandOf(id: Exclude<BandId, 'custom'>): Band {
  return { id, slots: BANDS[id] }
}
