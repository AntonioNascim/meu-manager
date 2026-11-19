/**
 * Promessa na coletiva de apresentação (estudo do concorrente, Parte 5). O técnico promete lutar pelo título, brigar por uma vaga continental ou
 * não prometer nada. A promessa mexe na paciência da diretoria em **uma posição**: ele ganha 1 posição de margem (`sackingPosition` + 1) se está
 * cumprindo e perde 1 se está falhando. Nada é guardado além da promessa: o "cumprindo" sai da classificação de hoje. Funções puras.
 */
import { BOARD } from './config'
import { isContinental } from './cups/plan'
import type { BoardObjective, CupSpec, Team } from './types'

export const PROMISE_KINDS = ['title', 'continental', 'none'] as const
export type PromiseKind = (typeof PROMISE_KINDS)[number]

export const isPromiseKind = (v: unknown): v is PromiseKind => typeof v === 'string' && (PROMISE_KINDS as readonly string[]).includes(v)

/** Última colocação da liga que dá vaga a uma copa continental (0 sem copas continentais). */
export function continentalLastPlace(specs: readonly CupSpec[] | undefined, leagueId: string): number {
  let last = 0
  for (const spec of specs ?? []) {
    if (!isContinental(spec)) continue
    for (const e of spec.entrants) {
      const s = e.source
      if (s.type === 'league' && s.league === leagueId && s.positions) last = Math.max(last, s.positions[1])
    }
  }
  return last
}

/** A colocação que a promessa pede: 1 para o título; a última vaga continental da liga (ou o terço de cima, sem copas) para a vaga. */
export function promiseGoal(kind: PromiseKind, teamCount: number, continentalLast: number): number | null {
  if (kind === 'none') return null
  if (kind === 'title') return 1
  return continentalLast > 0 ? continentalLast : Math.max(2, Math.round(teamCount / 3))
}

export interface PromiseInput {
  promise: Team['promise']
  /** Ano da temporada de hoje: a promessa vale só na temporada em que foi feita. */
  year: number
  position: number
  teamCount: number
  played: number
  totalGames: number
  continentalLast: number
}

/**
 * +1 se está cumprindo, -1 se está falhando, 0 se ainda é cedo ou está no meio do caminho. Depois de `BOARD.judgeAfterGames` jogos: cumprindo é
 * estar na colocação pedida ou melhor; falhando é estar mais de `slack` posições abaixo dela. No fim da temporada vale só a colocação final.
 */
export function promiseShift(input: PromiseInput): -1 | 0 | 1 {
  const p = input.promise
  if (!p || p.kind === 'none' || p.year !== input.year || input.played < BOARD.judgeAfterGames) return 0
  const goal = promiseGoal(p.kind, input.teamCount, input.continentalLast) as number
  if (input.position <= goal) return 1
  const slack = input.played >= input.totalGames ? 0 : Math.max(2, Math.ceil(input.teamCount * 0.15))
  return input.position > goal + slack ? -1 : 0
}

/** A meta da diretoria com a promessa: a margem até a demissão sobe ou desce uma posição (nunca passa dos limites da tabela). */
export function adjustObjective(objective: BoardObjective, shift: -1 | 0 | 1, teamCount: number): BoardObjective {
  if (shift === 0) return objective
  const sacking = Math.min(teamCount, Math.max(objective.targetPosition, objective.sackingPosition + shift))
  return { ...objective, sackingPosition: sacking }
}

/** Faz a promessa no clube (uma por temporada). */
export function makePromise(team: Team, kind: PromiseKind, year: number): Team {
  return { ...team, promise: { kind, year } }
}

export class PromiseError extends Error {
  constructor(
    readonly code: 'promise-done' | 'promise-closed' | 'invalid',
    message: string,
  ) {
    super(message)
  }
}

/** Confere se ainda dá para prometer: uma vez por temporada e só nas primeiras rodadas. */
export function checkPromise(team: Team | undefined, kind: unknown, year: number, played: number): asserts kind is PromiseKind {
  if (!isPromiseKind(kind)) throw new PromiseError('invalid', 'Promessa inválida.')
  if (team?.promise?.year === year) throw new PromiseError('promise-done', 'Você já falou com a imprensa nesta temporada.')
  if (played > 4) throw new PromiseError('promise-closed', 'A coletiva de apresentação já passou.')
}

