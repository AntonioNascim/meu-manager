/**
 * Orçamento do clube: a divisão entre salários (por mês) e compras (de uma vez) e o pedido de verba à diretoria.
 *
 * - Divisão: o total é `compras + salários × FINANCE.budget.salaryMonths` (um ano de salário). Mover dinheiro para
 *   um lado tira do outro e o total não muda. A mudança vale até a virada de temporada.
 * - Verba: uma vez por janela de transferências, a diretoria pode liberar um valor extra para compras, conforme a
 *   confiança e o caixa, e nunca mais do que o caixa aguenta sem atrasar os salários.
 */
import { FINANCE } from '../config'
import type { SeasonState } from '../season/calendar'
import { windowAt } from '../market/windows'
import type { Finances, Team, TeamId } from '../types'
import { monthlyOperations, monthlyPayroll } from './finance'

const round = (v: number, step: number) => Math.round(v / step) * step

/** Quanto do orçamento total vai para salários, de 0 a 1. */
export function salaryShare(f: Pick<Finances, 'salaryBudget' | 'transferBudget'>): number {
  const salaries = f.salaryBudget * FINANCE.budget.salaryMonths
  const total = salaries + f.transferBudget
  return total <= 0 ? 0 : salaries / total
}

/** Orçamento total em dinheiro de compras: compras + um ano de salários. */
export const budgetTotal = (f: Pick<Finances, 'salaryBudget' | 'transferBudget'>): number => f.transferBudget + f.salaryBudget * FINANCE.budget.salaryMonths

export interface SplitLimits {
  /** Menor orçamento de salários possível: a folha de hoje (não dá para pagar menos que os contratos). */
  minSalary: number
  /** Maior: o que sobra quando as compras chegam a zero. */
  maxSalary: number
}

export function splitLimits(f: Pick<Finances, 'salaryBudget' | 'transferBudget'>, payroll: number): SplitLimits {
  const months = FINANCE.budget.salaryMonths
  return { minSalary: Math.min(f.salaryBudget, Math.ceil(payroll / 1_000) * 1_000), maxSalary: f.salaryBudget + Math.floor(f.transferBudget / months / 1_000) * 1_000 }
}

/**
 * Muda o orçamento de salários (por mês) para `salary`, ajustando as compras no sentido contrário, com o total
 * igual. O valor fica entre a folha de hoje e o máximo que o total permite.
 */
export function setSalaryBudget(team: Team, salary: number, payroll: number): Team {
  const f = team.finances
  const { minSalary, maxSalary } = splitLimits(f, payroll)
  const next = Math.min(maxSalary, Math.max(minSalary, round(salary, 1_000)))
  const moved = (next - f.salaryBudget) * FINANCE.budget.salaryMonths
  if (moved === 0) return team
  return { ...team, finances: { ...f, salaryBudget: next, transferBudget: Math.max(0, f.transferBudget - moved), budgetShift: f.budgetShift + moved } }
}

export type FundsReason = 'window-closed' | 'already-asked' | 'low-confidence' | 'no-cash'

export interface FundsResult {
  state: SeasonState
  granted: boolean
  amount: number
  reason?: FundsReason
  /** Explicação em números, para a tela: o que a diretoria considerou. */
  detail: { confidence: number; balance: number; reserve: number; headroom: number }
}

/** Chave da janela de transferências aberta (uma verba por janela). */
export function fundsWindowKey(state: Pick<SeasonState, 'season' | 'matches'>): string | null {
  const w = windowAt(state.season, state.matches, state.season.currentDate)
  return w ? `${state.season.year}:${w.name}` : null
}

/** Pedir verba: quanto a diretoria libera agora, ou por que recusa. Não altera nada (ver `requestFunds`). */
export function fundsDecision(state: SeasonState, teamId: TeamId, confidence: number): Omit<FundsResult, 'state'> {
  const F = FINANCE.funds
  const team = state.teams.find((t) => t.id === teamId) as Team
  const payroll = monthlyPayroll(state.players.filter((p) => p.teamId === teamId))
  const reserve = F.reserveMonths * (payroll + monthlyOperations(team))
  const balance = team.finances.balance
  const headroom = Math.max(0, balance - reserve - team.finances.transferBudget)
  const detail = { confidence, balance, reserve, headroom }
  const key = fundsWindowKey(state)
  if (!key) return { granted: false, amount: 0, reason: 'window-closed', detail }
  if (team.finances.fundsRequests.includes(key)) return { granted: false, amount: 0, reason: 'already-asked', detail }
  if (confidence < F.minConfidence) return { granted: false, amount: 0, reason: 'low-confidence', detail }
  const wanted = balance * F.maxShareOfCash * (confidence / 100)
  const amount = Math.floor(Math.min(headroom, wanted) / 10_000) * 10_000
  if (amount < F.minGrant) return { granted: false, amount: 0, reason: 'no-cash', detail }
  return { granted: true, amount, detail }
}

/** O jogador pede verba à diretoria. Se ela libera, o orçamento de compras sobe e o pedido conta para a janela; uma recusa não gasta o pedido (dá para tentar de novo quando a confiança ou o caixa melhorarem). */
export function requestFunds(state: SeasonState, teamId: TeamId, confidence: number): FundsResult {
  const decision = fundsDecision(state, teamId, confidence)
  const key = fundsWindowKey(state)
  if (!decision.granted || !key) return { state, ...decision }
  const teams = state.teams.map((t) =>
    t.id === teamId ? { ...t, finances: { ...t.finances, fundsRequests: [...t.finances.fundsRequests, key], transferBudget: t.finances.transferBudget + decision.amount, purchaseBonus: t.finances.purchaseBonus + decision.amount } } : t,
  )
  return { state: { ...state, teams }, ...decision }
}
