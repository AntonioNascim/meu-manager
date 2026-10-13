/**
 * Panorama do caixa do clube: folha e folga por mês, até quando o caixa paga os salários e os alertas de risco
 * (folha acima da sustentável, caixa caminhando para a dívida que leva à demissão). Tudo derivado, nunca guardado.
 */
import { BOARD, FINANCE } from '../config'
import { addDays, daysBetween } from '../season/dates'
import type { FinanceEntry, IsoDate, Team } from '../types'
import { annualSponsorship, annualTvRights, matchTicketRevenue, monthlyOperations, sustainablePayroll } from './finance'

export type CashAlertKind = 'payroll' | 'debt'

export interface CashOutlook {
  /** Folha e folga do orçamento de salários, por mês. */
  payroll: number
  slack: number
  /** Folha que o clube aguenta no longo prazo (por mês). */
  sustainable: number
  /** Resultado médio do mês: patrocínio + TV + bilheteria média − folha − operação. */
  monthlyNet: number
  /** Meses que o caixa aguenta no ritmo atual; `null` quando o resultado do mês é positivo. */
  runwayMonths: number | null
  /** Data em que o caixa deixa de pagar os salários; `null` quando o caixa se sustenta. */
  coversUntil: IsoDate | null
  /** O caixa paga os salários até o fim da temporada? */
  coversSeason: boolean
  /** Saldo projetado para o fim da temporada, se nada mudar. */
  projectedEndBalance: number
  /** Dívida a partir da qual a diretoria demite o técnico. */
  dismissalDebt: number
  /** Risco: folha acima da sustentável, ou caixa indo para a dívida. */
  alerts: CashAlertKind[]
}

/** Receita média de bilheteria por mês: a estimativa de 19 jogos em casa contra um rival médio, dividida em 12. */
export const monthlyGate = (team: Team): number => Math.round((19 * matchTicketRevenue(team, { reputation: 10 })) / 12)

export function cashOutlook(team: Team, payroll: number, today: IsoDate, seasonEnd: IsoDate): CashOutlook {
  const operations = monthlyOperations(team)
  const monthlyNet = Math.round((annualSponsorship(team) + annualTvRights(team)) / 12 + monthlyGate(team) - payroll - operations)
  const balance = team.finances.balance
  const monthsLeft = Math.max(0, daysBetween(today, seasonEnd) / 30)
  const runwayMonths = monthlyNet >= 0 ? null : Math.max(0, balance) / -monthlyNet
  const coversUntil = runwayMonths === null ? null : addDays(today, Math.floor(runwayMonths * 30))
  const coversSeason = runwayMonths === null || (balance > 0 && runwayMonths >= monthsLeft)
  const projectedEndBalance = Math.round(balance + monthlyNet * monthsLeft)
  const dismissalDebt = BOARD.debtMonths * (payroll + operations)
  const alerts: CashAlertKind[] = []
  if (payroll > sustainablePayroll(team) * FINANCE.payrollCutMargin) alerts.push('payroll')
  if (balance < 0 || projectedEndBalance < 0) alerts.push('debt')
  return {
    payroll,
    slack: team.finances.salaryBudget - payroll,
    sustainable: sustainablePayroll(team),
    monthlyNet,
    runwayMonths,
    coversUntil,
    coversSeason,
    projectedEndBalance,
    dismissalDebt,
    alerts,
  }
}

/** Média da renda dos jogos em casa (lançamentos de bilheteria) e quantos jogos entraram na conta. */
export function averageGate(ledger: readonly FinanceEntry[]): { average: number; games: number; last: number | null } {
  const gates = ledger.filter((e) => e.category === 'ticket-sales' && e.amount > 0)
  const total = gates.reduce((sum, e) => sum + e.amount, 0)
  return { average: gates.length > 0 ? Math.round(total / gates.length) : 0, games: gates.length, last: gates.length > 0 ? (gates[gates.length - 1] as FinanceEntry).amount : null }
}
