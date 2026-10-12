import { CONDITION } from '../engine/config'
import { playerOverall } from '../engine/overall'
import { POSITIONS } from '../engine/types'
import type { Player, Position } from '../engine/types'
import { playerName } from './format'

export type SquadSortKey = 'position' | 'name' | 'age' | 'overall' | 'fitness' | 'form' | 'morale'

/** Ordem natural de cada critério (o primeiro toque vai nessa direção; inverter troca o sinal). */
export const NATURAL_DIRECTION: Record<SquadSortKey, 1 | -1> = { position: 1, name: 1, age: 1, overall: -1, fitness: -1, form: -1, morale: -1 }

export function sortSquad(players: readonly Player[], key: SquadSortKey, direction: 1 | -1): Player[] {
  const value = (p: Player): number | string => {
    switch (key) {
      case 'position': return POSITIONS.indexOf(p.position)
      case 'name': return playerName(p)
      case 'age': return p.age
      case 'overall': return playerOverall(p)
      case 'fitness': return p.condition.fitness
      case 'form': return p.condition.form
      case 'morale': return p.condition.morale
    }
  }
  return [...players].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    const order = typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : (va as number) - (vb as number)
    // Desempate: posição e depois força, para a lista ficar estável e útil.
    return direction * order || POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || playerOverall(b) - playerOverall(a)
  })
}

export type PositionGroup = 'all' | 'GK' | 'DEF' | 'MID' | 'FWD'

export const POSITION_GROUPS: Record<Exclude<PositionGroup, 'all'>, readonly Position[]> = {
  GK: ['GK'],
  DEF: ['CB', 'RB', 'LB'],
  MID: ['DM', 'CM', 'AM'],
  FWD: ['RW', 'LW', 'ST'],
}

export const inGroup = (p: Player, group: PositionGroup): boolean => group === 'all' || POSITION_GROUPS[group].includes(p.position)

export const isUnavailable = (p: Player): boolean => p.condition.injuryDaysLeft > 0 || p.condition.suspensionGames > 0

/** "Pendurado": um amarelo a menos da suspensão (o próximo cartão tira o jogador do jogo seguinte). */
export const isOnYellowEdge = (p: Player): boolean => p.condition.suspensionGames === 0 && p.condition.yellowCards >= CONDITION.yellowsPerSuspension - 1

/** Nota média na temporada (undefined quando ainda não jogou o mínimo de minutos em nenhum jogo). */
export const averageRating = (p: Player): number | undefined => (p.seasonStats.ratedGames > 0 ? p.seasonStats.ratingSum / p.seasonStats.ratedGames : undefined)

export type NumbersKey = 'name' | 'games' | 'goals' | 'assists' | 'yellow' | 'red' | 'rating'

export const NUMBERS_NATURAL_DIRECTION: Record<NumbersKey, 1 | -1> = { name: 1, games: -1, goals: -1, assists: -1, yellow: -1, red: -1, rating: -1 }

/** Ordena a tabela de números por qualquer coluna; quem não tem nota fica sempre no fim da ordem por nota. */
export function sortNumbers(players: readonly Player[], key: NumbersKey, direction: 1 | -1): Player[] {
  const value = (p: Player): number | string => {
    const s = p.seasonStats
    switch (key) {
      case 'name': return playerName(p)
      case 'games': return s.appearances
      case 'goals': return s.goals
      case 'assists': return s.assists
      case 'yellow': return s.yellowCards
      case 'red': return s.redCards
      case 'rating': return averageRating(p) ?? -1
    }
  }
  return [...players].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    const order = typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : (va as number) - (vb as number)
    const sa = a.seasonStats
    const sb = b.seasonStats
    return direction * order || sb.goals - sa.goals || sb.assists - sa.assists || (averageRating(b) ?? -1) - (averageRating(a) ?? -1) || playerName(a).localeCompare(playerName(b), 'pt-BR')
  })
}
