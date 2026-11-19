/**
 * Pré-temporada do técnico (estudo do concorrente, Parte 4). Antes da primeira rodada o técnico monta três decisões, uma vez por temporada:
 * onde (CT, praça do país ou excursão no exterior), quantos dias de acampamento e contra quem (até 5 amistosos). Os amistosos ficam num
 * registro próprio no clube (`Team.preseason`): não entram no calendário de partidas, na tabela, nas copas nem no arquivo da temporada.
 *
 * Efeitos (só do técnico humano; a IA e o resto do mundo não mudam): custo do local, torcida, bilheteria e cachê dos amistosos, risco de
 * lesão no exterior e +1 de moral por amistoso vencido (até \`PRESEASON.moraleCap\`). Funções puras: recebem o estado e devolvem outro.
 */
import { PRESEASON } from './config'
import { matchAttendance, expectedAnnualRevenue, recordEntry } from './finance'
import { simulateQuick } from './match/quick'
import { hashSeed } from './rng'
import type { SeasonState } from './season/calendar'
import { competitionsOf, pyramidOfTeamId } from './season/cycles'
import { addDays, daysBetween } from './season/dates'
import type { IsoDate, Player, PreseasonFriendly, PreseasonPlace, Team, TeamId } from './types'
import { PRESEASON_PLACES } from './types'

export class PreseasonError extends Error {
  constructor(
    readonly code: 'invalid' | 'preseason-done' | 'too-late' | 'not-found',
    message: string,
  ) {
    super(message)
  }
}

export const isPlace = (v: unknown): v is PreseasonPlace => typeof v === 'string' && (PRESEASON_PLACES as readonly string[]).includes(v)

const teamOf = (state: Pick<SeasonState, 'teams'>, id: TeamId): Team | undefined => state.teams.find((t) => t.id === id)

/** Dia do primeiro jogo de liga ainda por jogar do time, e se já jogou alguma coisa nesta temporada. */
function leagueSpan(state: Pick<SeasonState, 'matches'>, teamId: TeamId): { first?: IsoDate; lastPlayed?: IsoDate } {
  let first: IsoDate | undefined
  let lastPlayed: IsoDate | undefined
  for (const m of state.matches) {
    if (m.cup !== undefined || (m.homeTeamId !== teamId && m.awayTeamId !== teamId)) continue
    if (m.status === 'finished') {
      if (lastPlayed === undefined || m.date > lastPlayed) lastPlayed = m.date
    } else if (first === undefined || m.date < first) first = m.date
  }
  return { ...(first ? { first } : {}), ...(lastPlayed ? { lastPlayed } : {}) }
}

export interface PreseasonWindow {
  /** O técnico ainda pode montar a pré-temporada? */
  open: boolean
  /** Hoje e o último dia possível do acampamento (um antes do primeiro jogo). */
  start: IsoDate
  end: IsoDate
  /** Máximo de dias do acampamento (do calendário) e o mínimo. */
  maxDays: number
  minDays: number
  reason?: 'started' | 'too-late' | 'planned' | 'no-match'
}

/** A janela da pré-temporada: aberta antes de qualquer jogo da temporada, com dias até o primeiro jogo, e uma vez só. */
export function preseasonWindow(state: Pick<SeasonState, 'matches' | 'season' | 'teams'>, teamId: TeamId): PreseasonWindow {
  const today = state.season.currentDate
  const { first, lastPlayed } = leagueSpan(state, teamId)
  const base = { start: today, end: today, maxDays: 0, minDays: PRESEASON.minDays }
  if (!first) return { ...base, open: false, reason: 'no-match' }
  if (lastPlayed !== undefined) return { ...base, open: false, reason: 'started' }
  const maxDays = Math.max(0, daysBetween(today, first) - 1)
  const plan = teamOf(state, teamId)?.preseason
  if (plan && !hasPlayedSince(state, teamId, plan.start)) return { ...base, end: addDays(today, Math.max(0, maxDays - 1)), maxDays, open: false, reason: 'planned' }
  if (maxDays < PRESEASON.minDays) return { ...base, maxDays, open: false, reason: 'too-late' }
  return { open: true, start: today, end: addDays(today, maxDays - 1), maxDays, minDays: PRESEASON.minDays }
}

const hasPlayedSince = (state: Pick<SeasonState, 'matches'>, teamId: TeamId, date: IsoDate): boolean => state.matches.some((m) => m.cup === undefined && m.status === 'finished' && (m.homeTeamId === teamId || m.awayTeamId === teamId) && m.date >= date)

/** Custo do local, parcela da receita mensal esperada, arredondado a R$ 1.000. */
export function placeCost(team: Team, place: PreseasonPlace): number {
  const share = PRESEASON.places[place].cost
  return share === 0 ? 0 : Math.round((expectedAnnualRevenue(team) / 12 * share) / 1_000) * 1_000
}

/** Cachê que o clube paga ao adversário do amistoso: cresce com a reputação dele (parcela da receita mensal). */
export function friendlyFee(team: Team, opponent: Pick<Team, 'reputation'>): number {
  return Math.round(((expectedAnnualRevenue(team) / 12) * PRESEASON.feeShare * (opponent.reputation / 10)) / 500) * 500
}

/** Público e renda de um amistoso em casa (ou no exterior, onde a bilheteria vale mais). */
export function friendlyGate(team: Team, opponent: Pick<Team, 'reputation'>, place: PreseasonPlace): { attendance: number; revenue: number } {
  const attendance = Math.round(matchAttendance(team, opponent) * PRESEASON.attendanceShare)
  return { attendance, revenue: Math.round(attendance * team.ticketPrice * PRESEASON.ticketShare * PRESEASON.places[place].ticket) }
}

/** Adversários possíveis: clubes da mesma pirâmide, da reputação mais próxima da sua (em ordem de reputação), até `limit`. */
export function friendlyCandidates(state: Pick<SeasonState, 'teams' | 'season'>, teamId: TeamId, limit = 14): Team[] {
  const me = teamOf(state, teamId)
  const pyramid = pyramidOfTeamId(state, teamId)
  if (!me || pyramid === undefined) return []
  const ids = new Set(competitionsOf(state, pyramid).flatMap((c) => c.teamIds))
  return state.teams
    .filter((t) => t.id !== teamId && ids.has(t.id))
    .sort((a, b) => Math.abs(a.reputation - me.reputation) - Math.abs(b.reputation - me.reputation) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
}

/** Dias dos amistosos: espalhados pelo acampamento, nunca no primeiro nem no último dia. */
export function friendlyDates(start: IsoDate, days: number, count: number): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDays(start, 1 + Math.floor(((i + 1) * (days - 2)) / (count + 1))))
}

export interface PreseasonChoice {
  place: PreseasonPlace
  days: number
  opponents: readonly TeamId[]
}

/** Monta a pré-temporada do clube: confere as regras, cobra o local e a torcida sobe. */
export function planPreseason(state: SeasonState, teamId: TeamId, choice: PreseasonChoice): SeasonState {
  const team = teamOf(state, teamId)
  if (!team) throw new PreseasonError('not-found', 'Clube não encontrado.')
  const window = preseasonWindow(state, teamId)
  if (!window.open) throw new PreseasonError(window.reason === 'planned' ? 'preseason-done' : 'too-late', 'A pré-temporada não pode ser montada agora.')
  if (!isPlace(choice.place) || !Number.isInteger(choice.days) || choice.days < window.minDays || choice.days > window.maxDays) throw new PreseasonError('invalid', 'Escolha inválida.')
  const unique = [...new Set(choice.opponents)]
  const allowed = new Set(friendlyCandidates(state, teamId, 40).map((t) => t.id))
  if (unique.length !== choice.opponents.length || unique.length > PRESEASON.maxFriendlies || unique.some((id) => !allowed.has(id))) throw new PreseasonError('invalid', 'Adversários inválidos.')
  const dates = friendlyDates(window.start, choice.days, unique.length)
  const friendlies: PreseasonFriendly[] = unique.map((opponentId, i) => ({ opponentId, date: dates[i] as IsoDate, fee: friendlyFee(team, teamOf(state, opponentId) as Team) }))
  const today = state.season.currentDate
  let next: Team = { ...team, preseason: { place: choice.place, days: choice.days, start: window.start, friendlies, moraleGiven: 0 } }
  const cost = placeCost(team, choice.place)
  if (cost > 0) next = recordEntry(next, today, 'operations', -cost, `Pré-temporada: ${choice.place === 'abroad' ? 'excursão no exterior' : 'praça do país'}`)
  const fan = PRESEASON.places[choice.place].fan
  if (fan > 0) next = { ...next, fanBase: Math.round(next.fanBase * (1 + fan)) }
  return { ...state, teams: state.teams.map((t) => (t.id === teamId ? next : t)) }
}

/** Fator do risco de lesão no treino de `from` a `to`: o acampamento no exterior pesa nos dias em que acontece. */
export function preseasonInjuryFactor(team: Pick<Team, 'preseason'>, from: IsoDate, to: IsoDate): number {
  const plan = team.preseason
  if (!plan) return 1
  const extra = PRESEASON.places[plan.place].injury - 1
  if (extra <= 0) return 1
  const end = addDays(plan.start, plan.days)
  const a = from > plan.start ? from : plan.start
  const b = to < end ? to : end
  const total = daysBetween(from, to)
  return total > 0 && b > a ? 1 + (extra * daysBetween(a, b)) / total : 1
}

const playersOf = (state: Pick<SeasonState, 'players'>, teamId: TeamId): Player[] => state.players.filter((p) => p.teamId === teamId)

/**
 * Joga os amistosos que caem nos dias de `from` (inclusive) a `to` (exclusive): resultado simplificado com a semente do mundo, público e renda,
 * cachê e moral (+1 por vitória até o limite). Quem não montou nada não muda nada.
 */
export function applyPreseason(state: SeasonState, from: IsoDate, to: IsoDate): SeasonState {
  if (!state.teams.some((t) => t.preseason && t.preseason.friendlies.some((f) => !f.result && f.date >= from && f.date < to))) return state
  let current = state
  for (const owner of state.teams) {
    const plan = owner.preseason
    if (!plan) continue
    const due = plan.friendlies.filter((f) => !f.result && f.date >= from && f.date < to)
    if (due.length === 0) continue
    let team: Team = owner
    let players = state.players
    let moraleGiven = plan.moraleGiven
    const friendlies = plan.friendlies.map((f) => {
      if (f.result || f.date < from || f.date >= to) return f
      const opp = teamOf(state, f.opponentId)
      if (!opp) return f
      const gate = friendlyGate(team, opp, plan.place)
      const quick = simulateQuick({
        home: { team, players: playersOf({ players }, team.id) },
        away: { team: opp, players: playersOf(state, opp.id) },
        seed: hashSeed(`${state.market.seed}:friendly:${team.id}:${opp.id}:${f.date}`),
        attendance: gate.attendance,
        capacity: team.stadium.capacity,
        neutral: plan.place === 'abroad',
      })
      team = recordEntry(team, f.date, 'ticket-sales', gate.revenue, `Amistoso contra ${opp.name}: ${gate.attendance.toLocaleString('pt-BR')} pagantes`)
      team = recordEntry(team, f.date, 'operations', -f.fee, `Cachê do amistoso contra ${opp.name}`)
      if (quick.homeGoals > quick.awayGoals && moraleGiven < PRESEASON.moraleCap) {
        moraleGiven += PRESEASON.moralePerWin
        players = players.map((p) => (p.teamId === team.id ? { ...p, condition: { ...p.condition, morale: Math.min(100, p.condition.morale + PRESEASON.moralePerWin) } } : p))
      }
      return { ...f, result: { goalsFor: quick.homeGoals, goalsAgainst: quick.awayGoals, attendance: gate.attendance, revenue: gate.revenue } }
    })
    team = { ...team, preseason: { ...plan, friendlies, moraleGiven } }
    current = { ...current, players, teams: current.teams.map((t) => (t.id === team.id ? team : t)) }
  }
  return current
}

/** Totais da pré-temporada para a tela: gasto com o local, cachês, rendas e quantos amistosos já foram jogados. */
export function preseasonTotals(team: Team): { placeCost: number; fees: number; revenue: number; played: number; wins: number } | undefined {
  const plan = team.preseason
  if (!plan) return undefined
  const played = plan.friendlies.filter((f) => f.result)
  return {
    placeCost: placeCost(team, plan.place),
    fees: played.reduce((s, f) => s + f.fee, 0),
    revenue: played.reduce((s, f) => s + (f.result?.revenue ?? 0), 0),
    played: played.length,
    wins: played.filter((f) => (f.result?.goalsFor ?? 0) > (f.result?.goalsAgainst ?? 0)).length,
  }
}

