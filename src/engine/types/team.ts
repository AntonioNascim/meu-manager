import type { IsoDate, PlayerId, TeamId } from './common'
import type { Tactic } from './tactics'

export const SQUAD_MIN = 18
export const SQUAD_MAX = 30

export interface Stadium {
  name: string
  capacity: number
}

export type FinanceCategory =
  | 'ticket-sales'
  | 'sponsorship'
  | 'tv-rights'
  | 'player-sales'
  | 'salaries'
  | 'player-purchases'
  | 'severance'
  | 'operations'

export interface FinanceEntry {
  date: IsoDate
  category: FinanceCategory
  /** Positivo = receita, negativo = despesa. */
  amount: number
  description?: string
}

export interface Finances {
  balance: number
  salaryBudget: number
  transferBudget: number
  /** Lançamentos da temporada corrente. */
  ledger: FinanceEntry[]
  /** Fechamento das temporadas anteriores. */
  pastSeasons: SeasonFinance[]
  /** Dinheiro de compras que o jogador moveu para salários na barra do orçamento (negativo = o contrário); zera na virada. */
  budgetShift: number
  /** Verba extra liberada pela diretoria e ainda não gasta: entra no orçamento de compras todo mês até acabar. */
  purchaseBonus: number
  /** Janelas de transferência em que a diretoria já liberou verba (`ano:janela`). */
  fundsRequests: string[]
}

export interface SeasonFinance {
  year: number
  income: number
  expenses: number
  endBalance: number
  /** Resultado por categoria da temporada (positivo = receita); ausente nos saves antigos. */
  byCategory?: Partial<Record<FinanceCategory, number>>
}

export interface BoardObjective {
  /** Posição final esperada na liga. */
  targetPosition: number
  /** Posição final abaixo da qual o técnico é demitido. */
  sackingPosition: number
}

export interface SeasonRecord {
  year: number
  tier: number
  finalPosition: number
  champion: boolean
}

/** Economia da liga em que o clube joga, em relação ao Brasil (Série A, B e C = 1): `revenue` multiplica TV, patrocínio, ingresso, operação, salários e preços; `level` é quantos pontos de força a mais (ou a menos) os jogadores do país têm. */
export interface LeagueEconomy {
  revenue: number
  level: number
}

export interface Team {
  id: TeamId
  name: string
  /** Abreviação de 3 letras. */
  abbreviation: string
  city: string
  state: string
  /** Duas cores (hex). */
  colors: [string, string]
  stadium: Stadium
  /** Reputação, 1 a 20. */
  reputation: number
  /** Ids dos jogadores do elenco (mín. 18, máx. 30). */
  squad: PlayerId[]
  tactic: Tactic
  finances: Finances
  /** Tamanho da torcida. */
  fanBase: number
  /** Preço do ingresso. */
  ticketPrice: number
  objective: BoardObjective
  history: SeasonRecord[]
  /** Série em que o time joga (1 = A, 2 = B). */
  tier: number
  /** Economia da liga do clube; ausente = a do Brasil. Vem da competição e acompanha o clube no acesso e rebaixamento. */
  economy?: LeagueEconomy
}
