/** Datas ISO (`AAAA-MM-DD`) em aritmética UTC, sem depender do fuso do navegador. */
import { SEASON } from '../config'
import { hashSeed } from '../rng'
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

/** Último dia de um contrato que termina no fim do ano `year` do calendário (31/12 no brasileiro). */
export function contractEndOn(year: number): IsoDate {
  return makeDate(year, SEASON.contractEnd.month, SEASON.contractEnd.day)
}

/** Último dia de um contrato que termina com a temporada `year`: 31/12 no ano civil, 30/6 do ano seguinte na temporada que atravessa o ano. */
export function contractEndFor(year: number, split = false): IsoDate {
  return split ? makeDate(year + 1, 6, 30) : contractEndOn(year)
}

/** Idade completa em `onDate`. */
export function ageOn(birthDate: IsoDate, onDate: IsoDate): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number]
  const [y, m, d] = onDate.split('-').map(Number) as [number, number, number]
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

/** Idade no primeiro dia do ano `year` (quem faz anos depois de 1º de janeiro ainda não fez neste ano). A curva de crescimento do treino é calibrada por essa idade. */
export function ageAtSeasonStart(birthDate: IsoDate, year: number): number {
  return year - Number(birthDate.slice(0, 4)) - (birthDate.slice(5) > '01-01' ? 1 : 0)
}

/**
 * Data de nascimento de um jogador que tem `age` anos completos em `reference`. O dia do ano vem só do texto `key`
 * (uma conta, sem sorteio), então gerar a data não desloca nenhum outro sorteio do jogo e o mesmo jogador tem sempre a mesma data.
 * Nunca cai em 29 de fevereiro.
 */
export function birthDateFor(key: string, age: number, reference: IsoDate): IsoDate {
  const [y, m, d] = reference.split('-').map(Number) as [number, number, number]
  const born = addDays(makeDate(y - age, m, d), -(hashSeed(`birth:${key}`) % 365))
  return born.endsWith('-02-29') ? `${born.slice(0, 8)}28` : born
}

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

/** Quantos aniversários do nascido em `birthDate` caem em (from, to]. Quem nasceu em 29 de fevereiro faz anos em 1º de março nos anos comuns. */
export function birthdaysBetween(birthDate: IsoDate, from: IsoDate, to: IsoDate): number {
  const monthDay = birthDate.slice(5)
  const bornYear = Number(birthDate.slice(0, 4))
  let count = 0
  for (let y = Math.max(Number(from.slice(0, 4)), bornYear + 1); y <= Number(to.slice(0, 4)); y++) {
    const day = monthDay === '02-29' && !isLeapYear(y) ? '03-01' : monthDay
    const anniversary = `${y}-${day}`
    if (anniversary > from && anniversary <= to) count++
  }
  return count
}

/** Primeiro dia, a partir de `date` (inclusive), que cai no dia da semana pedido. */
export function onOrAfterWeekday(date: IsoDate, day: number): IsoDate {
  return addDays(date, (day - weekday(date) + 7) % 7)
}
