/**
 * Janelas de transferência de cada região: Brasil (pré-temporada e julho), América do Sul (até meados de março e julho) e Europa
 * (janeiro e julho a agosto). Cada clube segue a janela da região da liga dele, então a janela de verão europeia cai no meio da
 * temporada brasileira, como na vida real.
 */
import { MARKET } from '../config'
import type { SeasonState } from '../season/calendar'
import { focusPyramid, regionOfTeam } from '../season/cycles'
import { pyramidOf } from '../season/fidelity'
import { addDays, makeDate } from '../season/dates'
import type { IsoDate, Match, Region, Season, TeamId, TransferWindow } from '../types'

type Windowed = Pick<SeasonState, 'matches' | 'season' | 'focus' | 'cycles'>

/** Janelas de uma região num ano civil: o fim "até a véspera da primeira rodada" usa a primeira rodada de liga do ano. */
function yearWindows(year: number, firstMatch: IsoDate | undefined, region: Region): TransferWindow[] {
  return MARKET.windows.regions[region]
    .map((w) => ({
      name: w.name,
      start: makeDate(year, w.start[0], w.start[1]),
      end: w.end ? makeDate(year, w.end[0], w.end[1]) : firstMatch ? addDays(firstMatch, -1) : makeDate(year, 3, 31),
    }))
    .sort((a, b) => a.start.localeCompare(b.start))
}

/** Janelas da região no ano da temporada dada (o fim "até a véspera da primeira rodada" usa as partidas dadas). */
export function transferWindows(season: Pick<Season, 'year'>, matches: readonly Pick<Match, 'date' | 'cup'>[], region: Region = 'BR'): TransferWindow[] {
  // Só os jogos de liga marcam a véspera da primeira rodada: uma copa em fevereiro não fecha a janela.
  const firstMatch = matches.reduce<IsoDate | undefined>((first, m) => (m.cup !== undefined || (first !== undefined && m.date >= first) ? first : m.date), undefined)
  return yearWindows(season.year, firstMatch, region)
}

export function windowAt(season: Pick<Season, 'year'>, matches: readonly Pick<Match, 'date' | 'cup'>[], date: IsoDate, region: Region = 'BR'): TransferWindow | null {
  return transferWindows(season, matches, region).find((w) => date >= w.start && date <= w.end) ?? null
}

const FIRST_MATCH = new WeakMap<readonly Match[], Map<string, IsoDate | null>>()

/** Primeira rodada de liga das ligas da região num ano civil (o mundo todo olha as mesmas partidas, então a conta é guardada). */
function firstLeagueDate(state: Windowed, region: Region, year: number): IsoDate | undefined {
  let cache = FIRST_MATCH.get(state.matches)
  if (!cache) FIRST_MATCH.set(state.matches, (cache = new Map()))
  const key = `${region}:${year}`
  const known = cache.get(key)
  if (known !== undefined) return known ?? undefined
  const ids = new Set(state.season.competitions.filter((c) => (c.region ?? 'BR') === region).map((c) => c.id))
  const prefix = `${year}-`
  let first: IsoDate | null = null
  for (const m of state.matches) if (m.cup === undefined && ids.has(m.competitionId) && m.date.startsWith(prefix) && (first === null || m.date < first)) first = m.date
  cache.set(key, first)
  return first ?? undefined
}

/** Janelas da região em torno de uma data (do ano anterior ao seguinte), em ordem: o relógio do mundo atravessa os anos. */
export function windowsFor(state: Windowed, region: Region, date: IsoDate): TransferWindow[] {
  const year = Number(date.slice(0, 4))
  return [year - 1, year, year + 1].flatMap((y) => yearWindows(y, firstLeagueDate(state, region, y), region)).sort((a, b) => a.start.localeCompare(b.start))
}

/** A janela da região aberta na data (ou `null`). */
export function windowOf(state: Windowed, date: IsoDate, region: Region): TransferWindow | null {
  return windowsFor(state, region, date).find((w) => date >= w.start && date <= w.end) ?? null
}

/** A janela do clube (a da região da liga dele) aberta na data (ou `null`). */
export function windowOfTeam(state: Windowed, date: IsoDate, teamId: TeamId): TransferWindow | null {
  return windowOf(state, date, regionOfTeam(state, teamId))
}

/** A região da pirâmide do foco (a do técnico). */
export function focusRegion(state: Pick<SeasonState, 'season' | 'focus'>): Region {
  const pyramid = focusPyramid(state)
  return state.season.competitions.find((c) => pyramidOf(c) === pyramid)?.region ?? 'BR'
}

/** As regiões que têm liga no mundo. */
export function regionsOf(state: Pick<SeasonState, 'season'>): Region[] {
  return [...new Set(state.season.competitions.map((c) => c.region ?? 'BR'))]
}

/** Dias de negociação da IA dentro de uma janela: um a cada `tickDays`, depois da abertura. */
export function tickDates(window: TransferWindow): IsoDate[] {
  const dates: IsoDate[] = []
  for (let d = addDays(window.start, MARKET.windows.tickDays); d <= window.end; d = addDays(d, MARKET.windows.tickDays)) dates.push(d)
  return dates
}
