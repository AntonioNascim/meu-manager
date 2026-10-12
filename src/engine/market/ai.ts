/**
 * Mercado da IA: a cada rodada de negociações cada clube procura reforço onde o time é mais fraco,
 * respeitando orçamento, folha e elenco; os clubes negociam entre si e fazem propostas pelos jogadores
 * do time do jogador (que ele aceita ou recusa).
 */
import { MARKET } from '../config'
import { getFormation } from '../formations'
import { monthlyOperations, monthlyPayroll } from '../finance'
import { playerOverall } from '../overall'
import { createRng } from '../rng'
import type { Rng } from '../rng'
import type { SeasonState } from '../season/calendar'
import { addDays } from '../season/dates'
import type { IsoDate, OfferKind, Player, Position, Team, TeamId, TransferOffer, TransferWindow } from '../types'
import { buyerCheck, playerDecision, sellerDecision } from './decision'
import { executeTransfer, playersOf, releasePlayer } from './transfer'
import { askingPrice, expectedSalary, loanFee, marketValue, squadRole } from './value'
import { windowAt } from './windows'

export interface MarketTickResult {
  state: SeasonState
  /** Propostas novas para o time do jogador. */
  incoming: TransferOffer[]
}

interface Need {
  position: Position
  /** Força do titular mais fraco da vaga (0 se faltam jogadores). */
  weakest: number
}

/** Posições em que o time pode melhorar, com a força do titular mais fraco de cada uma. */
function needsOf(team: Team, squad: readonly Player[]): Need[] {
  const slots = new Map<Position, number>()
  for (const s of getFormation(team.tactic.formationId).slots) slots.set(s.position, (slots.get(s.position) ?? 0) + 1)
  const needs: Need[] = []
  for (const [position, count] of slots) {
    // Titulares da vaga + 1 reserva de verdade: o reserva também conta para a profundidade.
    const strengths = squad.filter((p) => p.position === position).map(playerOverall).sort((a, b) => b - a)
    needs.push({ position, weakest: strengths[count] ?? strengths[count - 1] ?? 0 })
  }
  return needs
}

const spendableOf = (team: Team, squad: readonly Player[]): number => {
  const reserve = MARKET.ai.reserveMonths * (monthlyPayroll(squad) + monthlyOperations(team))
  return Math.max(0, Math.min(team.finances.transferBudget, team.finances.balance - reserve))
}

interface Candidate {
  player: Player
  fee: number
  utility: number
}

/** Melhor alvo para o time entre `pool`: ganho de força sobre o titular mais fraco da vaga, menos o custo. */
function bestTarget(rng: Rng, team: Team, squad: readonly Player[], pool: readonly Player[], date: IsoDate, spendable: number, kind: OfferKind, sellers: Map<TeamId, Player[]>): Candidate | undefined {
  const needs = needsOf(team, squad)
  const roomForSalary = team.finances.salaryBudget - monthlyPayroll(squad)
  let best: Candidate | undefined
  for (const player of pool) {
    const need = needs.find((n) => n.position === player.position)
    if (!need || player.age > MARKET.ai.maxAge) continue
    const gain = playerOverall(player) - need.weakest
    if (gain < MARKET.ai.minUpgrade) continue
    const sellerSquad = player.teamId ? sellers.get(player.teamId) ?? [] : []
    const fee = player.teamId === null ? 0 : kind === 'loan' ? loanFee(player, date) : askingPrice(player, sellerSquad, date)
    if (fee > spendable) continue
    const salary = kind === 'loan' ? player.contract.salary : expectedSalary(player)
    if (salary > roomForSalary) continue
    const utility = gain - (spendable > 0 ? (3 * fee) / spendable : 0) + rng.float(-1, 1)
    if (!best || utility > best.utility) best = { player, fee, utility }
  }
  return best
}

/** Libera o reserva de menor valor quando o elenco passa do tamanho confortável. */
function trimSquad(state: SeasonState, teamId: TeamId, date: IsoDate): SeasonState {
  let current = state
  for (;;) {
    const squad = playersOf(current, teamId)
    if (squad.length <= MARKET.ai.releaseAbove) return current
    const counts = new Map<Position, number>()
    for (const p of squad) counts.set(p.position, (counts.get(p.position) ?? 0) + 1)
    const releasable = squad
      .filter((p) => (counts.get(p.position) ?? 0) > (MARKET.minByPosition[p.position] ?? 1) + 1 && squadRole(p, squad) === 'surplus' && !p.contract.loanedFrom)
      .sort((a, b) => marketValue(a, date) - marketValue(b, date))[0]
    if (!releasable) return current
    current = releasePlayer(current, releasable.id, date)
  }
}

/** Uma rodada de negociações da IA. Só age dentro de uma janela aberta. */
export function runMarketTick(state: SeasonState, date: IsoDate, userTeamId?: TeamId): MarketTickResult {
  const window = windowAt(state.season, state.matches, date)
  if (!window) return { state, incoming: [] }
  const rng = createRng(`${state.market.seed}:${date}:market`)
  let current = state
  const incoming: TransferOffer[] = []
  const aiTeams = rng.shuffle(state.teams.filter((t) => t.id !== userTeamId))

  for (const base of aiTeams) {
    const team = current.teams.find((t) => t.id === base.id) as Team
    const squad = playersOf(current, team.id)
    if (signingsInWindow(current, team.id, window) >= MARKET.ai.maxSigningsPerWindow) continue
    const spendable = spendableOf(team, squad)
    const sellers = new Map<TeamId, Player[]>()
    for (const p of current.players) if (p.teamId) (sellers.get(p.teamId) ?? sellers.set(p.teamId, []).get(p.teamId)!).push(p)

    // 1) Propostas pelos jogadores do time do jogador.
    if (userTeamId && incomingCount(current) < MARKET.ai.maxPendingIncoming && rng.chance(MARKET.ai.userOfferChance)) {
      const offer = proposeToUser(current, team, squad, userTeamId, date, window, spendable, rng, sellers)
      if (offer) {
        current = { ...current, market: { ...current.market, offers: [...current.market.offers, offer], counter: current.market.counter + 1 } }
        incoming.push(offer)
        continue
      }
    }

    // 2) Compra no mercado (jogadores livres e de outros clubes da IA).
    const pool = current.players.filter((p) => p.teamId !== team.id && p.teamId !== userTeamId && !p.contract.loanedFrom && p.condition.injuryDaysLeft === 0)
    const target = bestTarget(rng, team, squad, pool, date, spendable, 'purchase', sellers)
    if (!target) continue
    const seller = target.player.teamId ? (current.teams.find((t) => t.id === target.player.teamId) as Team) : null
    const sellerSquad = seller ? playersOf(current, seller.id) : []
    if (seller && !sellerDecision({ seller, sellerSquad, player: target.player, fee: target.fee, kind: 'purchase', date }).accepted) continue

    const baseSalary = expectedSalary(target.player)
    const verdict = playerDecision({ player: target.player, buyer: team, buyerSquad: squad, from: seller, fromSquad: sellerSquad, salary: baseSalary, kind: 'purchase' })
    const salary = verdict.accepted ? baseSalary : verdict.minimumSalary === null ? null : Math.max(baseSalary, Math.ceil(verdict.minimumSalary * 1.02))
    if (salary === null) continue
    if (buyerCheck({ buyer: team, buyerSquad: squad, payroll: monthlyPayroll(squad), fee: target.fee, salary })) continue
    const [minYears, maxYears] = MARKET.ai.contractYears
    current = executeTransfer(current, {
      playerId: target.player.id,
      toTeamId: team.id,
      fee: target.fee,
      salary,
      contractEnd: `${current.season.year + rng.int(minYears, maxYears)}-12-31`,
      kind: 'purchase',
      date,
    })
    current = trimSquad(current, team.id, date)
  }
  return { state: current, incoming }
}

const incomingCount = (state: SeasonState): number => state.market.offers.filter((o) => o.status === 'pending' && o.direction === 'incoming').length

const signingsInWindow = (state: SeasonState, teamId: TeamId, window: TransferWindow): number =>
  state.market.history.filter((r) => r.toTeamId === teamId && r.date >= window.start && r.date <= window.end).length

/** Proposta de um clube da IA por um jogador do time do jogador (só nasce se o jogador aceitaria o contrato). */
function proposeToUser(
  state: SeasonState,
  team: Team,
  squad: readonly Player[],
  userTeamId: TeamId,
  date: IsoDate,
  window: TransferWindow,
  spendable: number,
  rng: Rng,
  sellers: Map<TeamId, Player[]>,
): TransferOffer | undefined {
  const userSquad = sellers.get(userTeamId) ?? []
  if (userSquad.length - 1 < MARKET.minSquadAfterSale) return undefined
  const kind: OfferKind = rng.chance(MARKET.ai.userLoanShare) ? 'loan' : 'purchase'
  // Empréstimo: jogador de rodízio ou sobra; compra: qualquer um.
  const pool = userSquad.filter((p) => !p.contract.loanedFrom && p.teamId === userTeamId && (kind === 'purchase' || squadRole(p, userSquad) === 'rotation' || squadRole(p, userSquad) === 'surplus'))
  const target = bestTarget(rng, team, squad, pool, date, spendable, kind, sellers)
  if (!target) return undefined
  const user = state.teams.find((t) => t.id === userTeamId) as Team
  const samePosition = userSquad.filter((p) => p.position === target.player.position).length
  if (samePosition - 1 < (MARKET.minByPosition[target.player.position] ?? 1)) return undefined

  const [low, high] = MARKET.ai.userOfferFee
  const fee = kind === 'loan' ? target.fee : Math.round((askingPrice(target.player, userSquad, date) * rng.float(low, high)) / 10_000) * 10_000
  if (fee > spendable) return undefined
  const salary = kind === 'loan' ? target.player.contract.salary : Math.max(expectedSalary(target.player), Math.round(target.player.contract.salary * 1.1))
  const verdict = playerDecision({ player: target.player, buyer: team, buyerSquad: squad, from: user, fromSquad: userSquad, salary, kind })
  if (!verdict.accepted) return undefined
  if (buyerCheck({ buyer: team, buyerSquad: squad, payroll: monthlyPayroll(squad), fee, salary })) return undefined
  const lastDay = addDays(date, MARKET.windows.offerValidDays)
  return {
    id: `offer-${state.market.counter + 1}`,
    direction: 'incoming',
    kind,
    playerId: target.player.id,
    buyerId: team.id,
    sellerId: userTeamId,
    fee,
    salary,
    contractEnd: kind === 'loan' ? `${state.season.year}-12-31` : `${state.season.year + rng.int(...MARKET.ai.contractYears)}-12-31`,
    createdOn: date,
    dueOn: lastDay < window.end ? lastDay : window.end,
    status: 'pending',
  }
}
