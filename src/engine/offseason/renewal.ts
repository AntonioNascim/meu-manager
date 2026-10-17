/**
 * Renovação de contrato. O jogador pede salário conforme a força, a idade/potencial e a reputação do clube,
 * e pode recusar (salário baixo ou falta de espaço no time). A decisão é determinística, para dar para negociar.
 */
import { OFFSEASON } from '../config'
import { OfferError } from '../market/offers'
import { playingTimeIn } from '../market/decision'
import { expectedSalary } from '../market/value'
import { playerOverall } from '../overall'
import type { SeasonState } from '../season/calendar'
import { contractEndAfter, cycleOfTeam } from '../season/cycles'
import type { OfferReason, Player, PlayerId, Team, TeamId } from '../types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Salário mensal que o jogador pede para ficar. */
export function renewalDemand(player: Player, team: Pick<Team, 'reputation'> & Partial<Pick<Team, 'tier' | 'economy'>>): number {
  const R = OFFSEASON.renewal
  const reputation = clamp(1 - R.reputationDiscount * (team.reputation - R.referenceReputation), R.reputationMin, R.reputationMax)
  const prospect = player.age <= R.prospectAge ? 1 + R.prospectPremium * clamp((player.hidden.potential - playerOverall(player)) / R.prospectGap, 0, 1) : 1
  const veteran = player.age >= R.veteranAge ? 1 - R.veteranDiscount * (player.age - R.veteranAge + 1) : 1
  return Math.max(R.minimumSalary, Math.round((expectedSalary(player, team) * reputation * prospect * Math.max(0.5, veteran)) / 500) * 500)
}

export interface RenewalDecision {
  accepted: boolean
  reason?: OfferReason
  /** Salário mínimo que ele aceitaria (quando recusa pelo valor). */
  minimumSalary?: number
}

export function renewalDecision(args: { player: Player; team: Pick<Team, 'reputation' | 'tactic'> & Partial<Pick<Team, 'tier' | 'economy'>>; squad: readonly Player[]; salary: number }): RenewalDecision {
  const { player, team, squad, salary } = args
  const R = OFFSEASON.renewal
  const demand = renewalDemand(player, team)
  const minimum = Math.round(demand * R.tolerance)
  if (salary < minimum) return { accepted: false, reason: 'salary', minimumSalary: minimum }
  // Sem espaço no time ele só fica se o salário compensar.
  if (playingTimeIn(player, squad, team) <= -1 && salary < demand * R.benchPremium) {
    return { accepted: false, reason: 'playing-time', minimumSalary: Math.round(demand * R.benchPremium) }
  }
  return { accepted: true }
}

/** Contratos que terminam até o último dia da temporada do clube (ou de `seasonsAhead` temporadas depois), dos que vencem primeiro aos últimos. */
export function expiringContracts(state: Pick<SeasonState, 'players' | 'cycles' | 'season' | 'focus'>, teamId: TeamId, seasonsAhead = 0): Player[] {
  const end = contractEndAfter(cycleOfTeam(state, teamId), seasonsAhead)
  return state.players
    .filter((p) => p.teamId === teamId && !p.contract.loanedFrom && p.contract.endDate <= end)
    .sort((a, b) => a.contract.endDate.localeCompare(b.contract.endDate) || playerOverall(b) - playerOverall(a))
}

export interface RenewalResult {
  state: SeasonState
  accepted: boolean
  reason?: OfferReason
  minimumSalary?: number
}

/**
 * O jogador do usuário renova um contrato: `years` anos a partir do fim do contrato atual (nunca encurta).
 * Lança `OfferError` se a renovação não é possível (jogador de outro time, emprestado, orçamento de salários).
 */
export function renewUserContract(state: SeasonState, teamId: TeamId, request: { playerId: PlayerId; salary: number; years: number }): RenewalResult {
  const player = state.players.find((p) => p.id === request.playerId)
  if (!player || player.teamId !== teamId || player.contract.loanedFrom) throw new OfferError('unavailable')
  if (!Number.isFinite(request.salary) || request.salary <= 0 || !Number.isInteger(request.years) || request.years < 1 || request.years > 5) throw new OfferError('invalid')
  const team = state.teams.find((t) => t.id === teamId) as Team
  const squad = state.players.filter((p) => p.teamId === teamId)
  const payroll = squad.reduce((sum, p) => sum + p.contract.salary, 0)
  if (payroll - player.contract.salary + request.salary > team.finances.salaryBudget) throw new OfferError('salary-budget')

  const verdict = renewalDecision({ player, team, squad, salary: request.salary })
  if (!verdict.accepted) return { state, accepted: false, ...(verdict.reason ? { reason: verdict.reason } : {}), ...(verdict.minimumSalary !== undefined ? { minimumSalary: verdict.minimumSalary } : {}) }

  // Contrato novo: `years` temporadas depois do fim do contrato atual (ou da temporada, se ele já vence antes dela).
  const cycle = cycleOfTeam(state, teamId)
  const currentEnd = player.contract.endDate > cycle.end ? player.contract.endDate : cycle.end
  const contract = { salary: request.salary, endDate: contractEndAfter({ end: currentEnd }, request.years), releaseClause: Math.round((request.salary * 36) / 1000) * 1000 }
  return { state: { ...state, players: state.players.map((p) => (p.id === player.id ? { ...p, contract } : p)) }, accepted: true }
}
