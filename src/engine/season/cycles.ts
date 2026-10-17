/**
 * Temporadas por pirâmide. O relógio do jogo é um só, mas cada país tem a sua temporada: no ano civil (Brasil e América do Sul:
 * de 1º de janeiro a 31 de dezembro) ou atravessando o ano (Europa: de 1º de julho a 30 de junho, jogada de agosto a maio). A virada
 * de temporada, os contratos, as metas e as copas de um país seguem o ciclo dele (`SeasonState.cycles`).
 */
import type { Competition, Cycle, IsoDate, Match, Region, SeasonPhase, TeamId } from '../types'
import { DEFAULT_PYRAMID, pyramidOf } from './fidelity'
import { makeDate } from './dates'
import type { SeasonState } from './calendar'

/** Uma temporada: o ano em que começa e se atravessa o ano. */
export function makeCycle(year: number, split: boolean): Cycle {
  return split ? { year, split, start: makeDate(year, 7, 1), end: makeDate(year + 1, 6, 30) } : { year, split, start: makeDate(year, 1, 1), end: makeDate(year, 12, 31) }
}

export const nextCycle = (cycle: Cycle): Cycle => makeCycle(cycle.year + 1, cycle.split)

/** A primeira temporada que começa em `startDate` ou depois (o jogo nasce em 1º/1 ou em 1º/7 do ano inicial). */
export function firstCycle(split: boolean, startDate: IsoDate): Cycle {
  const year = Number(startDate.slice(0, 4))
  let cycle = makeCycle(year, split)
  while (cycle.start < startDate) cycle = nextCycle(cycle)
  return cycle
}

/** "2026" no ano civil, "2026/27" na temporada que atravessa o ano. */
export function seasonLabel(cycle: Pick<Cycle, 'year' | 'split'>): string {
  return cycle.split ? `${cycle.year}/${String((cycle.year + 1) % 100).padStart(2, '0')}` : String(cycle.year)
}

/** Fim do contrato `years` temporadas depois do fim da temporada dada (contratos terminam no último dia dela). */
export function contractEndAfter(cycle: Pick<Cycle, 'end'>, years: number): IsoDate {
  const [y, m, d] = cycle.end.split('-').map(Number) as [number, number, number]
  return makeDate(y + years, m, d)
}

/** Fim do contrato `years` temporadas depois da temporada atual do clube (contrato novo de quem chega ou renova hoje). */
export function contractEndIn(state: Pick<SeasonState, 'cycles' | 'season' | 'focus'>, teamId: TeamId, years: number): IsoDate {
  const cycle = cycleOfTeam(state, teamId)
  return contractEndAfter(cycle, years)
}

/** A pirâmide do técnico (a do foco); sem foco, a da primeira competição. */
export function focusPyramid(state: Pick<SeasonState, 'focus' | 'season'>): string {
  return state.focus ?? (state.season.competitions[0] ? pyramidOf(state.season.competitions[0]) : DEFAULT_PYRAMID)
}

/** A temporada de uma pirâmide. */
export function cycleOfPyramid(state: Pick<SeasonState, 'cycles' | 'season'>, pyramid: string): Cycle {
  return state.cycles[pyramid] ?? makeCycle(state.season.year, false)
}

const TEAM_COMPETITION = new WeakMap<readonly Competition[], Map<TeamId, Competition>>()

/** A divisão em que o clube joga. */
export function competitionOfTeamId(state: Pick<SeasonState, 'season'>, teamId: TeamId): Competition | undefined {
  const competitions = state.season.competitions
  let map = TEAM_COMPETITION.get(competitions)
  if (!map) {
    map = new Map()
    for (const c of competitions) for (const id of c.teamIds) map.set(id, c)
    TEAM_COMPETITION.set(competitions, map)
  }
  return map.get(teamId)
}

/** A pirâmide de um clube (pelas competições em que está). */
export function pyramidOfTeamId(state: Pick<SeasonState, 'season'>, teamId: TeamId): string | undefined {
  const competition = competitionOfTeamId(state, teamId)
  return competition ? pyramidOf(competition) : undefined
}

/** A região do clube (as janelas de transferência seguem a liga dele); padrão: Brasil. */
export function regionOfTeam(state: Pick<SeasonState, 'season'>, teamId: TeamId): Region {
  return competitionOfTeamId(state, teamId)?.region ?? 'BR'
}

/** A temporada do clube (a do país dele); clube sem competição usa a do foco. */
export function cycleOfTeam(state: Pick<SeasonState, 'cycles' | 'season' | 'focus'>, teamId: TeamId): Cycle {
  const pyramid = pyramidOfTeamId(state, teamId)
  return cycleOfPyramid(state, pyramid ?? focusPyramid(state))
}

/** As competições (ligas) de uma pirâmide. */
export const competitionsOf = (state: Pick<SeasonState, 'season'>, pyramid: string): Competition[] => state.season.competitions.filter((c) => pyramidOf(c) === pyramid)

/** Todos os jogos da pirâmide (ligas e copas) já foram jogados? */
export function pyramidFinished(state: Pick<SeasonState, 'season' | 'matches' | 'cups'>, pyramid: string): boolean {
  const ids = new Set(competitionsOf(state, pyramid).map((c) => c.id))
  for (const cup of state.cups ?? []) if (cup.pyramid === pyramid) ids.add(cup.id)
  let any = false
  for (const m of state.matches) {
    if (!ids.has(m.competitionId)) continue
    if (m.status !== 'finished') return false
    any = true
  }
  return any
}

/** Fase da temporada de uma pirâmide, pelos jogos: antes do primeiro, no meio, depois do último. */
export function phaseOfPyramid(state: Pick<SeasonState, 'season' | 'matches' | 'cups'>, pyramid: string): SeasonPhase {
  const ids = new Set(competitionsOf(state, pyramid).map((c) => c.id))
  for (const cup of state.cups ?? []) if (cup.pyramid === pyramid) ids.add(cup.id)
  let finished = 0
  let open = 0
  for (const m of state.matches as readonly Match[]) {
    if (!ids.has(m.competitionId)) continue
    if (m.status === 'finished') finished++
    else open++
  }
  if (open === 0 && finished > 0) return 'end-of-season'
  return finished > 0 ? 'in-season' : 'pre-season'
}
