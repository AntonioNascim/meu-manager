/** Janelas de transferência: pré-temporada (até o dia antes da 1ª rodada) e meio do ano. */
import { MARKET } from '../config'
import { addDays, makeDate } from '../season/dates'
import type { IsoDate, Match, Region, Season, TransferWindow } from '../types'

/** Janelas da região (Brasil por padrão): o fim "até a véspera da primeira rodada" usa as partidas dadas. */
export function transferWindows(season: Pick<Season, 'year'>, matches: readonly Pick<Match, 'date' | 'cup'>[], region: Region = 'BR'): TransferWindow[] {
  const year = season.year
  // Só os jogos de liga marcam a véspera da primeira rodada: uma copa em fevereiro não fecha a janela.
  const firstMatch = matches.reduce<IsoDate | undefined>((first, m) => (m.cup !== undefined || (first !== undefined && m.date >= first) ? first : m.date), undefined)
  return MARKET.windows.regions[region]
    .map((w) => ({
      name: w.name,
      start: makeDate(year, w.start[0], w.start[1]),
      end: w.end ? makeDate(year, w.end[0], w.end[1]) : firstMatch ? addDays(firstMatch, -1) : makeDate(year, 3, 31),
    }))
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function windowAt(season: Pick<Season, 'year'>, matches: readonly Pick<Match, 'date' | 'cup'>[], date: IsoDate, region: Region = 'BR'): TransferWindow | null {
  return transferWindows(season, matches, region).find((w) => date >= w.start && date <= w.end) ?? null
}

/** Dias de negociação da IA dentro de uma janela: um a cada `tickDays`, depois da abertura. */
export function tickDates(window: TransferWindow): IsoDate[] {
  const dates: IsoDate[] = []
  for (let d = addDays(window.start, MARKET.windows.tickDays); d <= window.end; d = addDays(d, MARKET.windows.tickDays)) dates.push(d)
  return dates
}
