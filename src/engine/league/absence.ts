/**
 * Ausência e abandono na liga online (Fase 6, B7; proposta, seção 2.9). Puro: recebe as vagas (`Seat`) e devolve vagas novas.
 *
 * | Situação                              | Estado             | Efeito                                                          |
 * | 1 ou 2 partidas seguidas sem aparecer | `absent`           | autopiloto, conta como pronto, mercado respondido pela IA       |
 * | 3 partidas seguidas                   | `autopilot`        | igual; não compra; o ADM recebe aviso                           |
 * | 6 partidas ou 21 dias reais           | vaga aberta        | SÓ em liga aberta: o técnico perde o clube e a vaga reabre      |
 *
 * Em liga de amigos nada abre vaga sozinho: o ADM recebe sugestões (`suggestionsFor`).
 */
import type { Seat } from './runner'

export type LeagueKind = 'open' | 'friends'

/** Limites da proposta, seção 2.9. */
export const ABSENCE = {
  /** A partir de quantas partidas seguidas o técnico é "ausente". */
  absentAfter: 1,
  /** A partir de quantas vira "autopiloto longo" (o ADM é avisado). */
  autopilotAfter: 3,
  /** A partir de quantas a vaga abre (só liga aberta). */
  vacancyAfter: 6,
  /** Dias reais sem presença que abrem a vaga (só liga aberta). */
  vacancyDays: 21,
} as const

const DAY_MS = 24 * 60 * 60 * 1000

export type AbsenceLevel = 'present' | 'absent' | 'long-autopilot'

export const missedOf = (seat: Seat): number => seat.missed ?? 0

/** Nível da ausência de uma vaga, pelas partidas perdidas. */
export function levelOf(seat: Seat): AbsenceLevel {
  const m = missedOf(seat)
  if (m >= ABSENCE.autopilotAfter) return 'long-autopilot'
  if (m >= ABSENCE.absentAfter) return 'absent'
  return 'present'
}

/** O técnico esteve presente (deu Pronto ou comandou a partida): zera a contagem e volta a `active`. */
export function markPresent(seat: Seat, now: number): Seat {
  return { ...seat, missed: 0, lastActiveAt: now, status: 'active' }
}

/**
 * Fim de uma partida humana: quem não esteve presente soma uma falta e muda de estado; quem esteve zera a contagem.
 * `present` diz se o técnico estava conectado (ou tinha dado Pronto) durante a partida.
 */
export function recordMatch(seat: Seat, present: boolean, now: number): Seat {
  if (present) return markPresent(seat, now)
  const missed = missedOf(seat) + 1
  const status: Seat['status'] = missed >= ABSENCE.autopilotAfter ? 'autopilot' : 'absent'
  return { ...seat, missed, status }
}

/** Dias reais desde a última presença (ou desde a entrada, `joinedAt`). */
export const idleDays = (seat: Seat, now: number, joinedAt: number): number => Math.floor((now - (seat.lastActiveAt ?? joinedAt)) / DAY_MS)

/** A vaga deve abrir? Só em liga aberta; em liga de amigos nunca abre sozinha. */
export function shouldOpenVacancy(seat: Seat, kind: LeagueKind, now: number, joinedAt: number): boolean {
  if (kind !== 'open') return false
  return missedOf(seat) >= ABSENCE.vacancyAfter || idleDays(seat, now, joinedAt) >= ABSENCE.vacancyDays
}

export interface AbsenceOutcome {
  seats: Seat[]
  /** Vagas que abriram (técnico perdeu o clube; o clube vira IA). */
  vacated: Seat[]
  /** Quem passou a "autopiloto longo" agora (aviso ao ADM). */
  newLongAutopilot: Seat[]
}

/**
 * Depois de um evento: aplica `recordMatch` a cada vaga que tinha partida (`played`, ids dos técnicos) e, em liga aberta, retira quem passou do limite.
 * `presentIds` são os técnicos que estiveram presentes.
 */
export function applyEventAbsence(
  seats: readonly Seat[],
  played: ReadonlySet<string>,
  presentIds: ReadonlySet<string>,
  kind: LeagueKind,
  now: number,
  joinedAt: (playerId: string) => number,
): AbsenceOutcome {
  const next: Seat[] = []
  const vacated: Seat[] = []
  const newLongAutopilot: Seat[] = []
  for (const seat of seats) {
    const updated = played.has(seat.playerId) ? recordMatch(seat, presentIds.has(seat.playerId), now) : seat
    if (levelOf(seat) !== 'long-autopilot' && levelOf(updated) === 'long-autopilot') newLongAutopilot.push(updated)
    if (shouldOpenVacancy(updated, kind, now, joinedAt(seat.playerId))) vacated.push(updated)
    else next.push(updated)
  }
  return { seats: next, vacated, newLongAutopilot }
}

export interface AbsenceSuggestion {
  playerId: string
  teamId: string
  missed: number
  idleDays: number
}

/** Sugestões ao ADM de uma liga de amigos: quem já passaria do limite de uma liga aberta (a decisão de tirar é só do ADM). */
export function suggestionsFor(seats: readonly Seat[], now: number, joinedAt: (playerId: string) => number): AbsenceSuggestion[] {
  return seats
    .filter((s) => shouldOpenVacancy(s, 'open', now, joinedAt(s.playerId)))
    .map((s) => ({ playerId: s.playerId, teamId: s.teamId, missed: missedOf(s), idleDays: idleDays(s, now, joinedAt(s.playerId)) }))
}
