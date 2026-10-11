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
  | 'player-sales'
  | 'salaries'
  | 'player-purchases'

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
}
