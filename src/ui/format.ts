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
