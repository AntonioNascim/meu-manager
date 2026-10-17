/** Busca de jogadores no mercado: filtros, atalhos rápidos e ordenação (funções puras). */
import { MARKET } from '../config'
import { valueScale } from '../economy'
import { playerOverall } from '../overall'
import type { SeasonState } from '../season/calendar'
import { cycleOfTeam } from '../season/cycles'
import { potentialRange } from '../training'
import type { IsoDate, Nationality, Player, Position, Team, TeamId } from '../types'
import { marketValue } from './value'

export type PositionGroup = 'all' | 'GK' | 'DEF' | 'MID' | 'FWD'

export const POSITION_GROUPS: Record<Exclude<PositionGroup, 'all'>, readonly Position[]> = {
  GK: ['GK'],
  DEF: ['CB', 'RB', 'LB'],
  MID: ['DM', 'CM', 'AM'],
  FWD: ['RW', 'LW', 'ST'],
}

export const inGroup = (p: Pick<Player, 'position'>, group: PositionGroup): boolean => group === 'all' || POSITION_GROUPS[group].includes(p.position)

/** Situação do jogador no mercado. */
export type Situation = 'all' | 'free' | 'club' | 'expiring'
export type QuickFilter = 'budget' | 'bargain' | 'prospect' | 'expiring'
export type MarketSort = 'overall' | 'age' | 'value-desc' | 'value-asc' | 'salary'

/** Faixa fechada; `Infinity` no máximo (ou `-Infinity` no mínimo) = sem limite. */
export interface Range {
  min: number
  max: number
}

export interface MarketFilters {
  query: string
  /** Série do clube atual (os livres só aparecem em "todas"). */
  tier: 'all' | 1 | 2 | 3
  group: PositionGroup
  position: Position | 'all'
  nationality: Nationality | 'all'
  situation: Situation
  overall: Range
  age: Range
  value: Range
  salary: Range
  quick: QuickFilter[]
  sort: MarketSort
}

export const ANY: Range = { min: -Infinity, max: Infinity }

export const defaultFilters = (): MarketFilters => ({
  query: '',
  tier: 'all',
  group: 'all',
  position: 'all',
  nationality: 'all',
  situation: 'all',
  overall: ANY,
  age: ANY,
  value: ANY,
  salary: ANY,
  quick: [],
  sort: 'overall',
})

/** Sem acento e em minúsculas, para comparar nomes. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const within = (v: number, r: Range) => v >= r.min && v <= r.max
const isOpen = (r: Range) => r.min === -Infinity && r.max === Infinity

/** Valor que a força sozinha daria (sem idade, potencial nem contrato): referência das barganhas. */
export function strengthValue(overall: number): number {
  const v = MARKET.value
  return v.base * Math.exp(v.perPoint * (overall - v.referenceOverall))
}

export const isLastContractYear = (p: Pick<Player, 'contract'>, year: number): boolean => Number(p.contract.endDate.slice(0, 4)) <= year

/** O contrato termina até o último dia da temporada do clube dele? */
export const expiresThisSeason = (state: Pick<SeasonState, 'cycles' | 'season' | 'focus'>, p: Pick<Player, 'contract' | 'teamId'>): boolean => p.teamId !== null && p.contract.endDate <= cycleOfTeam(state, p.teamId).end

export interface SearchContext {
  date: IsoDate
  year: number
  /** O contrato do jogador termina nesta temporada (a do clube dele)? */
  expiring: (p: Pick<Player, 'contract' | 'teamId'>) => boolean
  /** Dinheiro que o time pode gastar em compras (orçamento de transferências limitado ao caixa). */
  budget: number
  /** Força mediana do elenco do time: as barganhas precisam ao menos servir. */
  medianOverall: number
  /** Clubes por id: o preço de um jogador depende da liga do clube dele. */
  teams: ReadonlyMap<TeamId, Team>
}

/** Valor de mercado do jogador no clube em que está. */
const valueAt = (p: Player, ctx: Pick<SearchContext, 'date' | 'teams'>): number => marketValue(p, ctx.date, p.teamId ? ctx.teams.get(p.teamId) : undefined)

export function searchContext(state: SeasonState, userTeamId: TeamId): SearchContext {
  const team = state.teams.find((t) => t.id === userTeamId)
  const squad = state.players
    .filter((p) => p.teamId === userTeamId)
    .map(playerOverall)
    .sort((a, b) => a - b)
  return {
    date: state.season.currentDate,
    year: state.season.year,
    expiring: (p) => expiresThisSeason(state, p),
    budget: team ? Math.min(team.finances.transferBudget, team.finances.balance) : 0,
    medianOverall: squad[Math.floor(squad.length / 2)] ?? 0,
    teams: new Map(state.teams.map((t) => [t.id, t])),
  }
}

/** Passa pelo atalho rápido? */
export function matchesQuick(p: Player, quick: QuickFilter, ctx: SearchContext): boolean {
  switch (quick) {
    case 'budget':
      return p.teamId === null || valueAt(p, ctx) <= ctx.budget
    case 'bargain': {
      const overall = playerOverall(p)
      return overall >= ctx.medianOverall && valueAt(p, ctx) <= strengthValue(overall) * valueScale(ctx.teams.get(p.teamId as TeamId) ?? {}) * MARKET.search.bargainShare
    }
    case 'prospect':
      return p.age <= MARKET.search.prospectAge && potentialRange(p).high >= MARKET.search.prospectPotential
    case 'expiring':
      return p.teamId !== null && ctx.expiring(p)
  }
}

/** Jogadores de outros clubes (e livres) que passam pelos filtros, ordenados. Emprestados ficam de fora. */
export function searchPlayers(state: SeasonState, userTeamId: TeamId, filters: MarketFilters, extra?: (p: Player) => boolean): Player[] {
  const ctx = searchContext(state, userTeamId)
  const query = fold(filters.query.trim())
  const teamNames = new Map(state.teams.map((t) => [t.id, fold(t.name)]))
  const tiers = new Map(state.teams.map((t) => [t.id, t.tier]))
  const valueOf = (p: Player) => (p.teamId === null ? 0 : valueAt(p, ctx))
  const list = state.players.filter((p) => {
    if (p.teamId === userTeamId || p.contract.loanedFrom) return false
    if (extra && !extra(p)) return false
    if (filters.tier !== 'all' && (p.teamId === null || tiers.get(p.teamId) !== filters.tier)) return false
    if (filters.situation === 'free' && p.teamId !== null) return false
    if (filters.situation === 'club' && p.teamId === null) return false
    if (filters.situation === 'expiring' && (p.teamId === null || !ctx.expiring(p))) return false
    if (!inGroup(p, filters.group)) return false
    if (filters.position !== 'all' && p.position !== filters.position) return false
    if (filters.nationality !== 'all' && p.nationality !== filters.nationality) return false
    if (!within(playerOverall(p), filters.overall) || !within(p.age, filters.age) || !within(p.contract.salary, filters.salary)) return false
    if (!isOpen(filters.value) && !within(valueOf(p), filters.value)) return false
    if (query) {
      const club = p.teamId ? (teamNames.get(p.teamId) ?? '') : 'livre'
      if (!fold(p.name).includes(query) && !fold(p.nickname ?? '').includes(query) && !club.includes(query)) return false
    }
    return filters.quick.every((q) => matchesQuick(p, q, ctx))
  })
  const by: Record<MarketSort, (a: Player, b: Player) => number> = {
    overall: (a, b) => playerOverall(b) - playerOverall(a),
    age: (a, b) => a.age - b.age,
    'value-desc': (a, b) => valueOf(b) - valueOf(a),
    'value-asc': (a, b) => valueOf(a) - valueOf(b),
    salary: (a, b) => a.contract.salary - b.contract.salary,
  }
  return list.sort((a, b) => by[filters.sort](a, b) || playerOverall(b) - playerOverall(a) || a.id.localeCompare(b.id))
}
