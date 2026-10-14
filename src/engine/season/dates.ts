/** Datas ISO (`AAAA-MM-DD`) em aritmética UTC, sem depender do fuso do navegador. */
import type { IsoDate } from '../types'

const DAY_MS = 86_400_000

export const SATURDAY = 6
export const SUNDAY = 0
export const WEDNESDAY = 3

/** As mesmas datas são convertidas milhões de vezes (valor de mercado, contratos): guarda o resultado. */
const MS_CACHE = new Map<IsoDate, number>()

function toMs(date: IsoDate): number {
  let ms = MS_CACHE.get(date)
  if (ms === undefined) {
    const [y, m, d] = date.split('-').map(Number)
    ms = Date.UTC(y as number, (m as number) - 1, d as number)
    if (MS_CACHE.size > 50_000) MS_CACHE.clear()
    MS_CACHE.set(date, ms)
  }
  return ms
}

export function makeDate(year: number, month: number, day: number): IsoDate {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toMs(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/** 0 = domingo ... 6 = sábado. */
export function weekday(date: IsoDate): number {
  return new Date(toMs(date)).getUTCDay()
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS)
}

/** Primeiro dia, a partir de `date` (inclusive), que cai no dia da semana pedido. */
export function onOrAfterWeekday(date: IsoDate, day: number): IsoDate {
  return addDays(date, (day - weekday(date) + 7) % 7)
}
