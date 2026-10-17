/**
 * O jogador vende, empresta ou libera os próprios jogadores. Vender e emprestar são respondidos na hora
 * pelo clube interessado (que paga até um teto sobre o valor de mercado); liberar custa uma rescisão.
 */
import { MARKET } from '../config'
import { monthlyPayroll, recordEntry } from '../finance'
import { playerOverall } from '../overall'
import type { SeasonState } from '../season/calendar'
import { daysBetween } from '../season/dates'
import { SQUAD_MIN } from '../types'
import type { IsoDate, OfferKind, OfferReason, Player, PlayerId, Team, TeamId } from '../types'
import { needsOf } from './ai'
import { buyerCheck, playerDecision } from './decision'
import { OfferError, isWindowOpen } from './offers'
import { executeTransfer, playersOf, releasePlayer } from './transfer'
import { expectedSalary, loanFee, marketValue } from './value'

export interface BuyerInterest {
  teamId: TeamId
  /** Quanto o clube paga no máximo (compra) ou de taxa (empréstimo); `null` se não tem interesse ou condição. */
  maxFee: number | null
  reason?: OfferReason
}

const teamOf = (state: SeasonState, id: TeamId) => state.teams.find((t) => t.id === id) as Team

/** O que o clube `buyerId` faria com esta proposta pelo jogador do time do jogador. */
export function buyerInterest(state: SeasonState, buyerId: TeamId, player: Player, kind: OfferKind, date: IsoDate = state.season.currentDate): BuyerInterest {
  const buyer = teamOf(state, buyerId)
  const squad = playersOf(state, buyerId)
  const userClub = teamOf(state, player.teamId as TeamId)
  const need = needsOf(buyer, squad).find((n) => n.position === player.position)
  if (!need || playerOverall(player) < need.weakest) return { teamId: buyerId, maxFee: null, reason: 'no-interest' }
  const ceiling = kind === 'loan' ? loanFee(player, date, userClub) * MARKET.userSale.loanWillingness : marketValue(player, date, userClub) * MARKET.userSale.purchaseWillingness
  const maxFee = Math.round(ceiling / 10_000) * 10_000
  const salary = kind === 'loan' ? player.contract.salary : Math.max(expectedSalary(player, buyer), player.contract.salary)
  const problem = buyerCheck({ buyer, buyerSquad: squad, payroll: monthlyPayroll(squad), fee: 0, salary, player })
  if (problem) return { teamId: buyerId, maxFee: null, reason: problem }
  return { teamId: buyerId, maxFee: Math.min(maxFee, buyer.finances.transferBudget, buyer.finances.balance) }
}

/** O jogador pode sair do elenco (janela, elenco mínimo e cobertura da posição)? Lança `OfferError` se não. */
function assertCanLose(state: SeasonState, userTeamId: TeamId, playerId: PlayerId, needsWindow: boolean, buyerId?: TeamId): Player {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.teamId !== userTeamId || player.contract.loanedFrom) throw new OfferError('unavailable')
  if (needsWindow && !isWindowOpen(state, state.season.currentDate, [userTeamId, buyerId])) throw new OfferError('window-closed')
  const squad = playersOf(state, userTeamId)
  if (squad.length - 1 < SQUAD_MIN) throw new OfferError('squad-size')
  if (squad.filter((p) => p.position === player.position).length - 1 < (MARKET.minByPosition[player.position] ?? 1)) throw new OfferError('position-cover')
  return player
}

export interface SaleResult {
  state: SeasonState
  accepted: boolean
  reason?: OfferReason
  /** Quando o clube recusa pelo valor: o máximo que pagaria. */
  counter?: number
}

/** Vende ou empresta o jogador para um clube da IA, que responde na hora. */
export function sellPlayer(state: SeasonState, userTeamId: TeamId, request: { playerId: PlayerId; buyerId: TeamId; kind: OfferKind; fee: number; contractEnd: IsoDate }): SaleResult {
  const date = state.season.currentDate
  const player = assertCanLose(state, userTeamId, request.playerId, true, request.buyerId)
  if (request.buyerId === userTeamId || request.fee < 0 || !Number.isFinite(request.fee) || request.contractEnd <= date) throw new OfferError('invalid')
  const interest = buyerInterest(state, request.buyerId, player, request.kind, date)
  if (interest.maxFee === null) return { state, accepted: false, ...(interest.reason ? { reason: interest.reason } : {}) }
  if (request.fee > interest.maxFee) return { state, accepted: false, reason: 'fee', counter: interest.maxFee }

  const buyer = teamOf(state, request.buyerId)
  const buyerSquad = playersOf(state, request.buyerId)
  const user = teamOf(state, userTeamId)
  const salary = request.kind === 'loan' ? player.contract.salary : Math.max(expectedSalary(player, buyer), player.contract.salary)
  const verdict = playerDecision({ player, buyer, buyerSquad, from: user, fromSquad: playersOf(state, userTeamId), salary, kind: request.kind })
  if (!verdict.accepted) return { state, accepted: false, ...(verdict.reason ? { reason: verdict.reason } : {}) }
  const done = executeTransfer(state, { playerId: player.id, toTeamId: request.buyerId, fee: request.fee, salary, contractEnd: request.contractEnd, kind: request.kind, date })
  return { state: done, accepted: true }
}

/** Rescisão ao liberar: parte do salário dos meses que faltam para o contrato acabar. */
export function releaseCost(player: Player, date: IsoDate): number {
  const months = Math.max(0, daysBetween(date, player.contract.endDate) / 30)
  return Math.round((player.contract.salary * months * MARKET.userSale.releaseCostShare) / 1000) * 1000
}

/** O jogador libera um dos seus: vira jogador livre e o clube paga a rescisão. */
export function releaseUserPlayer(state: SeasonState, userTeamId: TeamId, playerId: PlayerId): SeasonState {
  const date = state.season.currentDate
  const player = assertCanLose(state, userTeamId, playerId, false)
  const cost = releaseCost(player, date)
  const released = releasePlayer(state, playerId, date)
  const teams = released.teams.map((t) => (t.id === userTeamId ? recordEntry(t, date, 'severance', -cost, `Rescisão: ${player.nickname ?? player.name}`) : t))
  return { ...released, teams }
}
