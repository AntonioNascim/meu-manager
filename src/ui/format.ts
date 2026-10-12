import type { IsoDate, Match, Player, TeamId } from '../engine/types'

/** "sáb., 11 de abril" a partir de uma data ISO (sem fuso: a data é do calendário do jogo). */
export function formatDate(date: IsoDate): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export const playerName = (p: Pick<Player, 'name' | 'nickname'>) => p.nickname ?? p.name

export const formatMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Resultado do ponto de vista de um time: V, E ou D (undefined se a partida não foi jogada). */
export function outcomeFor(match: Match, teamId: TeamId): 'W' | 'D' | 'L' | undefined {
  const r = match.result
  if (!r) return undefined
  const mine = match.homeTeamId === teamId ? r.homeGoals : r.awayGoals
  const theirs = match.homeTeamId === teamId ? r.awayGoals : r.homeGoals
  return mine > theirs ? 'W' : mine === theirs ? 'D' : 'L'
}

/** Valor curto para cabeçalhos: "R$ 1,03 mi", "R$ 840 mil". */
export function formatCompactMoney(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (abs >= 1_000) return `${sign}R$ ${Math.round(abs / 1_000).toLocaleString('pt-BR')} mil`
  return `${sign}R$ ${Math.round(abs)}`
}

/** Partes da data para o destaque do painel: dia, mês, dia da semana e ano. */
export function dateParts(date: IsoDate): { day: string; month: string; weekday: string; year: string } {
  const d = new Date(`${date}T12:00:00Z`)
  const part = (options: Intl.DateTimeFormatOptions) => d.toLocaleDateString('pt-BR', { ...options, timeZone: 'UTC' }).replace('.', '')
  return { day: part({ day: 'numeric' }), month: part({ month: 'short' }), weekday: part({ weekday: 'short' }), year: part({ year: 'numeric' }) }
}

/** Dias entre duas datas ISO (b − a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}
