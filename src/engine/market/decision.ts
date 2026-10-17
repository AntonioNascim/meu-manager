/**
 * Quem decide numa transferência: o jogador (salário, reputação do clube, tempo de jogo), o clube
 * vendedor (valor pedido, importância do jogador, elenco mínimo) e o clube comprador (orçamentos).
 * As decisões são determinísticas, para o jogador poder entender e negociar.
 */
import { MARKET } from '../config'
import { formationOf } from '../formations'
import { playerOverall } from '../overall'
import { SQUAD_MAX } from '../types'
import type { IsoDate, OfferKind, OfferReason, Player, Team } from '../types'
import { askingPrice, expectedSalary, loanFee, squadRole } from './value'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Quanto tempo de jogo o jogador teria no elenco: 1 = titular absoluto ... −1 = fora do time. */
export function playingTimeIn(player: Player, squad: readonly Player[], team: Pick<Team, 'tactic'>): number {
  const strength = playerOverall(player)
  const better = squad.filter((q) => q.id !== player.id && q.position === player.position && playerOverall(q) > strength).length
  const slots = Math.max(1, formationOf(team.tactic).slots.filter((s) => s.position === player.position).length)
  if (better === 0) return 1
  if (better < slots) return 0.5
  if (better === slots) return -0.3
  return -1
}

export interface PlayerDecision {
  accepted: boolean
  /** Motivo principal quando recusa. */
  reason?: OfferReason
  /** Salário mínimo que levaria o jogador a aceitar (null: não aceita com salário nenhum). */
  minimumSalary: number | null
}

export interface PlayerDecisionInput {
  player: Player
  buyer: Team
  buyerSquad: readonly Player[]
  /** Clube atual do jogador (null = livre). */
  from: Team | null
  fromSquad?: readonly Player[]
  salary: number
  kind: OfferKind
}

export function playerDecision(input: PlayerDecisionInput): PlayerDecision {
  const cfg = MARKET.player
  const { player, buyer, buyerSquad, from, salary, kind } = input
  const reference = Math.max(player.contract.salary, expectedSalary(player, buyer) * 0.8)
  const salaryPoints = clamp(Math.log(Math.max(1, salary) / reference) / Math.log(cfg.salaryStep), -cfg.salaryClamp, cfg.salaryClamp)

  const reputationShare = kind === 'loan' ? cfg.loanReputationShare : 1
  const fromReputation = from?.reputation ?? expectedClubReputation(player)
  const reputation = clamp((buyer.reputation - fromReputation) / cfg.reputationStep, -1.5, 1.5) * cfg.reputationWeight * reputationShare

  const now = playingTimeIn(player, buyerSquad, buyer)
  const before = from && input.fromSquad ? playingTimeIn(player, input.fromSquad, from) : 0
  const ambition = cfg.ambitionBase + (cfg.ambition * playerOverall(player)) / 100
  const playing = ambition * (0.6 * now + 0.4 * (now - before)) * cfg.playingTimeWeight

  const inertia = from ? cfg.inertia : 0
  const total = salaryPoints * cfg.salaryWeight + reputation + playing - inertia
  const minimumSalary = minimumFor(reference, reputation + playing - inertia)
  if (total >= 0) return { accepted: true, minimumSalary }

  const worst = Math.min(salaryPoints * cfg.salaryWeight, reputation, playing)
  const reason: OfferReason = worst === playing ? 'playing-time' : worst === reputation ? 'club-reputation' : 'salary'
  return { accepted: false, reason, minimumSalary }
}

/**
 * Reputação do clube que um jogador livre espera: quem é melhor quer um clube maior (curva inversa da
 * força média dos times por reputação, na Série B ou na A, a que pedir mais).
 */
export function expectedClubReputation(player: Player): number {
  const overall = playerOverall(player)
  const g = MARKET.player.freeAgent
  const b = g.b.referenceReputation + (overall - g.b.base) / g.b.perReputation
  const a = g.a.referenceReputation + (overall - g.a.base) / g.a.perReputation
  return clamp(Math.max(a, b), g.min, g.max)
}

/** Salário que zera a decisão: quanto falta em "pontos de salário" depois dos outros fatores. */
function minimumFor(reference: number, others: number): number | null {
  const cfg = MARKET.player
  const needed = -others / cfg.salaryWeight
  if (needed > cfg.salaryClamp) return null
  const points = Math.max(needed, -cfg.salaryClamp)
  return Math.ceil((reference * Math.pow(cfg.salaryStep, points)) / 500) * 500
}

export interface ClubDecision {
  accepted: boolean
  reason?: OfferReason
  /** Valor mínimo que o clube aceitaria, quando recusa pelo valor. */
  counter?: number
}

/** O clube dono aceita vender (ou emprestar) o jogador por esse valor? */
export function sellerDecision(args: { seller: Team; sellerSquad: readonly Player[]; player: Player; fee: number; kind: OfferKind; date: IsoDate; listedPrice?: number }): ClubDecision {
  const { seller, sellerSquad, player, fee, kind, date, listedPrice } = args
  const cheaper = (price: number) => (listedPrice === undefined ? price : Math.min(price, listedPrice))
  if (player.contract.loanedFrom) return { accepted: false, reason: 'unavailable' }
  if (sellerSquad.length - 1 < MARKET.minSquadAfterSale) return { accepted: false, reason: 'squad-size' }
  const samePosition = sellerSquad.filter((p) => p.position === player.position).length
  if (samePosition - 1 < (MARKET.minByPosition[player.position] ?? 1)) return { accepted: false, reason: 'position-cover' }
  if (kind === 'loan') {
    const role = squadRole(player, sellerSquad)
    if (role === 'key' || role === 'starter') return { accepted: false, reason: 'key-player' }
    const price = cheaper(loanFee(player, date, seller))
    return fee >= price ? { accepted: true } : { accepted: false, reason: 'fee', counter: price }
  }
  const price = cheaper(askingPrice(player, sellerSquad, date, seller))
  return fee >= price ? { accepted: true } : { accepted: false, reason: 'fee', counter: price }
}

/** O comprador pode pagar? Orçamento de transferências, caixa e folha. */
export function buyerCheck(args: { buyer: Team; buyerSquad: readonly Player[]; payroll: number; fee: number; salary: number }): OfferReason | null {
  const { buyer, buyerSquad, payroll, fee, salary } = args
  if (buyerSquad.length > Math.min(SQUAD_MAX - 1, MARKET.maxSquadBeforeSigning)) return 'squad-full'
  if (fee > buyer.finances.transferBudget || fee > buyer.finances.balance) return 'budget'
  if (payroll + salary > buyer.finances.salaryBudget) return 'salary-budget'
  return null
}
