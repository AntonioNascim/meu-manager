/**
 * Finanças dos clubes: bilheteria (preço do ingresso × público), patrocínio pela reputação, salários
 * e custos de operação pagos por mês, e vendas/compras de jogadores (lançadas pelo mercado).
 * Tudo em funções puras: recebem o time e devolvem outro.
 */
import { FINANCE } from '../config'
import { addDays, daysBetween } from '../season/dates'
import type { FinanceCategory, FinanceEntry, Finances, IsoDate, Player, Team } from '../types'

const roundTo = (value: number, step: number) => Math.round(value / step) * step

export const defaultTicketPrice = (reputation: number): number => Math.round(FINANCE.ticket.base + FINANCE.ticket.perReputation * reputation)

/** Procura por ingressos (pode passar da capacidade): torcida × comparecimento, preço e rival. */
export function ticketDemand(home: Team, away: Pick<Team, 'reputation'>, price: number = home.ticketPrice): number {
  const t = FINANCE.ticket
  const base = home.fanBase * 0.012
  const priceFactor = (defaultTicketPrice(home.reputation) / Math.max(1, price)) ** t.elasticity
  const opponent = Math.min(t.opponentFactorMax, Math.max(t.opponentFactorMin, 1 + t.opponentPerReputation * (away.reputation - 10)))
  return base * priceFactor * opponent
}

/** Público do jogo: a procura limitada à capacidade do estádio. */
export function matchAttendance(home: Team, away: Pick<Team, 'reputation'>, price: number = home.ticketPrice): number {
  return Math.round(Math.min(home.stadium.capacity, ticketDemand(home, away, price)))
}

export const matchTicketRevenue = (home: Team, away: Pick<Team, 'reputation'>, price: number = home.ticketPrice): number =>
  matchAttendance(home, away, price) * price

export const annualSponsorship = (team: Pick<Team, 'reputation' | 'tier'>): number =>
  roundTo((FINANCE.sponsorship.base + FINANCE.sponsorship.perReputation * team.reputation ** FINANCE.sponsorship.power) * (FINANCE.sponsorshipTierScale[team.tier] ?? 1), 10_000)

/** Cota de TV anual da divisão do clube. */
export const annualTvRights = (team: Pick<Team, 'tier'>): number => FINANCE.tvRights[team.tier] ?? 0

export const monthlyOperations = (team: Pick<Team, 'stadium' | 'tier'>): number => Math.round((team.stadium.capacity * FINANCE.operationsPerSeat * (FINANCE.operationsTierScale[team.tier] ?? 1)) / 12)

/** Folha mensal: salários de quem está no clube (o emprestado é pago por quem o recebeu). */
export const monthlyPayroll = (players: readonly Pick<Player, 'contract'>[]): number => players.reduce((sum, p) => sum + p.contract.salary, 0)

/** Receita anual esperada sem contar vendas de jogadores (para o teto do saldo e as projeções). */
export function expectedAnnualRevenue(team: Team, averageOpponentReputation = 10, homeGames = 19): number {
  return annualSponsorship(team) + annualTvRights(team) + homeGames * matchTicketRevenue(team, { reputation: averageOpponentReputation })
}

/** Folha mensal que o clube aguenta no longo prazo: receita esperada menos a operação, dividida em 12. */
export const sustainablePayroll = (team: Team): number =>
  Math.max(0, Math.round(((expectedAnnualRevenue(team) - monthlyOperations(team) * 12) * FINANCE.payrollShareOfNet) / 12))

/** Lança uma receita (positiva) ou despesa (negativa), atualizando o saldo. */
export function addEntry(finances: Finances, entry: FinanceEntry): Finances {
  const ledger = [...finances.ledger, entry]
  return { ...finances, balance: finances.balance + entry.amount, ledger: ledger.length > FINANCE.ledgerMax ? ledger.slice(-FINANCE.ledgerMax) : ledger }
}

export function recordEntry(team: Team, date: IsoDate, category: FinanceCategory, amount: number, description?: string): Team {
  if (amount === 0) return team
  return { ...team, finances: addEntry(team.finances, { date, category, amount, ...(description ? { description } : {}) }) }
}

/** Bilheteria do mandante num jogo. */
export function collectGate(home: Team, away: Pick<Team, 'reputation'>, date: IsoDate): { team: Team; attendance: number; revenue: number } {
  const attendance = matchAttendance(home, away)
  const revenue = attendance * home.ticketPrice
  return { team: recordEntry(home, date, 'ticket-sales', revenue, `Bilheteria: ${attendance.toLocaleString("pt-BR")} pagantes`), attendance, revenue }
}

/**
 * Fechamento do mês: patrocínio e cota de TV entram, salários e operação saem. Clubes da IA com saldo acima do teto
 * reinvestem o excesso em estrutura (`ai`). O orçamento de transferências é refeito a partir do saldo.
 */
export function settleMonth(team: Team, players: readonly Player[], date: IsoDate, ai: boolean): Team {
  let next = recordEntry(team, date, 'sponsorship', Math.round(annualSponsorship(team) / 12), 'Patrocínio')
  next = recordEntry(next, date, 'tv-rights', Math.round(annualTvRights(team) / 12), 'Cota de TV')
  next = recordEntry(next, date, 'salaries', -monthlyPayroll(players), 'Folha salarial')
  next = recordEntry(next, date, 'operations', -monthlyOperations(team), 'Operação do clube')
  if (ai) {
    const ceiling = FINANCE.ceilingYears * expectedAnnualRevenue(team)
    const excess = next.finances.balance - ceiling
    if (excess > 0) next = recordEntry(next, date, 'operations', -Math.round((excess * FINANCE.ceilingSpendPerMonth) / 1_000) * 1_000, 'Investimento em estrutura')
  }
  // Compras do mês: parte do caixa, menos o que o jogador moveu para salários, mais a verba extra que a diretoria liberou e ainda não foi gasta.
  const natural = Math.round((next.finances.balance * FINANCE.transferShare) / 10_000) * 10_000
  return { ...next, finances: { ...next.finances, transferBudget: Math.max(0, natural - next.finances.budgetShift) + next.finances.purchaseBonus } }
}

/** Primeiros dias de mês no intervalo (de, até]. */
export function monthStartsBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const starts: IsoDate[] = []
  for (let d = 1; d <= daysBetween(from, to); d++) {
    const day = addDays(from, d)
    if (day.endsWith('-01')) starts.push(day)
  }
  return starts
}

/** Valida e muda o preço do ingresso. */
export function setTicketPrice(team: Team, price: number): Team {
  const { min, max } = FINANCE.ticket
  if (!Number.isFinite(price) || price < min || price > max) throw new Error(`Preço do ingresso deve ficar entre ${min} e ${max}`)
  return { ...team, ticketPrice: Math.round(price) }
}

/** Preço que mais rende: o que enche o estádio exatamente (acima dele o público cai mais que o preço sobe). */
export function bestTicketPrice(team: Team, opponentReputation = 10): number {
  const { elasticity, min, max } = FINANCE.ticket
  const ref = defaultTicketPrice(team.reputation)
  const demandAtRef = ticketDemand(team, { reputation: opponentReputation }, ref)
  const fillingPrice = ref * (demandAtRef / team.stadium.capacity) ** (1 / elasticity)
  return Math.min(max, Math.max(min, Math.round(fillingPrice)))
}

export interface LedgerSummary {
  income: number
  expenses: number
  byCategory: Partial<Record<FinanceCategory, number>>
  /** Resultado de cada mês (`AAAA-MM`), em ordem. */
  byMonth: { month: string; income: number; expenses: number }[]
}

/** Resumo dos lançamentos (derivado, nunca guardado). */
export function summarizeLedger(ledger: readonly FinanceEntry[]): LedgerSummary {
  const summary: LedgerSummary = { income: 0, expenses: 0, byCategory: {}, byMonth: [] }
  const months = new Map<string, { month: string; income: number; expenses: number }>()
  for (const e of ledger) {
    if (e.amount >= 0) summary.income += e.amount
    else summary.expenses += -e.amount
    summary.byCategory[e.category] = (summary.byCategory[e.category] ?? 0) + e.amount
    const key = e.date.slice(0, 7)
    const month = months.get(key) ?? { month: key, income: 0, expenses: 0 }
    if (e.amount >= 0) month.income += e.amount
    else month.expenses += -e.amount
    months.set(key, month)
  }
  summary.byMonth = [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
  return summary
}
