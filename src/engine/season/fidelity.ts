/**
 * Duas fidelidades de simulação: as competições da pirâmide do técnico (as divisões ligadas à dele por acesso e rebaixamento)
 * são jogadas lance a lance; as demais usam a partida simplificada (`match/quick.ts`), mais de mil vezes mais barata. O foco
 * (`SeasonState.focus`) é a pirâmide do técnico; sem foco, todas as competições são lance a lance (o jogo de uma só pirâmide).
 */
import { MARKET } from '../config'
import { matchAttendance } from '../finance'
import { simulateQuick } from '../match'
import type { KnockoutRules } from '../match'
import { hashSeed } from '../rng'
import type { CompetitionId, Competition, IsoDate, Match, Player, Team, TeamId } from '../types'
import type { SeasonState } from './calendar'
import { daysBetween } from './dates'

export const DEFAULT_PYRAMID = 'default'

export const pyramidOf = (competition: Pick<Competition, 'pyramid'>): string => competition.pyramid ?? DEFAULT_PYRAMID

/** Competições simplificadas (vazio quando todas são lance a lance). */
export function quickCompetitionIds(state: Pick<SeasonState, 'focus' | 'season'>): ReadonlySet<CompetitionId> {
  if (state.focus === undefined) return NONE
  return new Set(state.season.competitions.filter((c) => pyramidOf(c) !== state.focus).map((c) => c.id))
}

const NONE: ReadonlySet<CompetitionId> = new Set()

/** Clubes que estão fora do foco (nas competições simplificadas). */
export function quickTeamIds(state: Pick<SeasonState, 'focus' | 'season'>): ReadonlySet<TeamId> {
  const ids = quickCompetitionIds(state)
  if (ids.size === 0) return new Set()
  return new Set(state.season.competitions.filter((c) => ids.has(c.id)).flatMap((c) => c.teamIds))
}

/** Um jogo de copa é simplificado se nenhum dos dois clubes é da pirâmide do técnico (copas só entre clubes de fora; as do foco, e as que têm um clube dele, são lance a lance). */
export function cupMatchIsQuick(state: Pick<SeasonState, 'focus' | 'season'>, match: Pick<Match, 'homeTeamId' | 'awayTeamId'>): boolean {
  if (state.focus === undefined) return false
  return pyramidOfTeam(state, match.homeTeamId) !== state.focus && pyramidOfTeam(state, match.awayTeamId) !== state.focus
}

export function pyramidOfTeam(state: Pick<SeasonState, 'season'>, teamId: TeamId): string | undefined {
  const competition = state.season.competitions.find((c) => c.teamIds.includes(teamId))
  return competition ? pyramidOf(competition) : undefined
}

/**
 * O técnico vai para o clube \`teamId\`: a pirâmide dele passa a ser lance a lance a partir de agora (as rodadas já jogadas
 * das outras ficam como estão) e a anterior, se não for a mesma, vira simplificada. Clube desconhecido não muda nada.
 */
export function refocus(state: SeasonState, teamId: TeamId): SeasonState {
  const pyramid = pyramidOfTeam(state, teamId)
  if (pyramid === undefined || pyramid === state.focus) return state
  return { ...state, focus: pyramid }
}

/** Joga uma partida pelo resultado simplificado: devolve o jogo decidido (ainda com as notas, para os jogadores), com o público calculado pelo mandante. */
export function playQuickMatch(match: Match, home: { team: Team; players: readonly Player[] }, away: { team: Team; players: readonly Player[] }, knockout?: KnockoutRules, neutral = false): Match {
  const attendance = matchAttendance(home.team, away.team)
  const result = simulateQuick({ home, away, seed: match.seed, attendance, capacity: home.team.stadium.capacity, ...(knockout ? { knockout } : {}), ...(neutral ? { neutral } : {}) })
  return { ...match, status: 'finished', result, attendance }
}


/**
 * Rodízio das negociações das ligas fora do foco: a cada rodada só um em cada `MARKET.rotation.outOfFocusEvery` clubes dessas
 * ligas age (a vez de cada clube anda uma casa por semana), porque o mercado é o maior custo do mundo grande e ninguém vê o que
 * acontece lá. Os clubes do foco agem sempre, então um mundo de uma só pirâmide não muda.
 */
export function actsThisRound(quickTeams: ReadonlySet<TeamId>, teamId: TeamId, date: IsoDate): boolean {
  if (!quickTeams.has(teamId)) return true
  const week = Math.floor(daysBetween(ROTATION_EPOCH, date) / 7)
  return (hashSeed(teamId) + week) % MARKET.rotation.outOfFocusEvery === 0
}

const ROTATION_EPOCH: IsoDate = '2000-01-03'
