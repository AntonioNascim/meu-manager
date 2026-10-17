/**
 * Propostas: as do jogador (resposta em alguns dias) e as recebidas da IA (o jogador aceita ou recusa).
 * Cada proposta passa por três decisões: o clube comprador pode pagar, o clube dono aceita vender e o
 * jogador aceita o contrato.
 */
import { MARKET } from '../config'
import { monthlyPayroll } from '../finance'
import type { SeasonState } from '../season/calendar'
import { addDays } from '../season/dates'
import { SQUAD_MIN } from '../types'
import type { IsoDate, OfferKind, OfferReason, Team, TeamId, TransferOffer } from '../types'
import { buyerCheck, playerDecision, sellerDecision } from './decision'
import { listingOf } from './listings'
import { executeTransfer, playersOf } from './transfer'
import { focusRegion, windowOf, windowOfTeam } from './windows'

/** Erro de uma proposta inválida; `code` é o motivo (rótulo em `labels.ts`). */
export class OfferError extends Error {
  constructor(readonly code: OfferReason) {
    super(code)
  }
}

export interface OfferRequest {
  kind: OfferKind
  playerId: string
  fee: number
  salary: number
  contractEnd: IsoDate
}

const teamOf = (state: SeasonState, id: TeamId) => state.teams.find((t) => t.id === id) as Team

/**
 * A janela de transferências está aberta? Com `teams`, a de todos esses clubes (cada um segue a janela da região da liga dele); sem,
 * a da região do foco (a do técnico).
 */
export const isWindowOpen = (state: SeasonState, date: IsoDate = state.season.currentDate, teams?: readonly (TeamId | null | undefined)[]): boolean => {
  const ids = (teams ?? []).filter((t): t is TeamId => typeof t === 'string')
  return ids.length > 0 ? ids.every((id) => windowOfTeam(state, date, id) !== null) : windowOf(state, date, focusRegion(state)) !== null
}

const nextOfferId = (state: SeasonState) => `offer-${state.market.counter + 1}`

function withOffer(state: SeasonState, offer: TransferOffer): SeasonState {
  return { ...state, market: { ...state.market, offers: [...state.market.offers, offer], counter: state.market.counter + 1 } }
}

function updateOffer(state: SeasonState, id: string, change: Partial<TransferOffer>): SeasonState {
  return { ...state, market: { ...state.market, offers: state.market.offers.map((o) => (o.id === id ? { ...o, ...change } : o)) } }
}

/** O jogador (time `buyerId`) faz uma proposta de compra, empréstimo ou contratação de jogador livre. */
export function makeOffer(state: SeasonState, buyerId: TeamId, request: OfferRequest, date: IsoDate = state.season.currentDate): SeasonState {
  if (!isWindowOpen(state, date, [buyerId])) throw new OfferError('window-closed')
  const player = state.players.find((p) => p.id === request.playerId)
  if (!player || request.salary <= 0 || request.fee < 0 || !Number.isFinite(request.fee + request.salary) || request.contractEnd <= date) throw new OfferError('invalid')
  if (player.teamId === buyerId) throw new OfferError('own-player')
  if (player.teamId === null && (request.kind === 'loan' || request.fee !== 0)) throw new OfferError('invalid')
  if (player.teamId !== null && request.fee <= 0) throw new OfferError('invalid')
  if (state.market.offers.some((o) => o.status === 'pending' && o.direction === 'outgoing' && o.playerId === player.id)) throw new OfferError('duplicate')

  const buyer = teamOf(state, buyerId)
  const problem = buyerCheck({ buyer, buyerSquad: playersOf(state, buyerId), payroll: monthlyPayroll(playersOf(state, buyerId)), fee: request.fee, salary: request.salary, player })
  if (problem) throw new OfferError(problem)

  return withOffer(state, {
    id: nextOfferId(state),
    direction: 'outgoing',
    kind: request.kind,
    playerId: player.id,
    buyerId,
    sellerId: player.teamId,
    fee: request.fee,
    salary: request.salary,
    contractEnd: request.contractEnd,
    createdOn: date,
    dueOn: addDays(date, MARKET.windows.responseDays),
    status: 'pending',
  })
}

/** Avalia uma proposta na data: se os três lados concordam, a transferência acontece. */
function decide(state: SeasonState, offer: TransferOffer, date: IsoDate): SeasonState {
  const reject = (reason: OfferReason, counter?: number) =>
    updateOffer(state, offer.id, { status: 'rejected', reason, decidedOn: date, ...(counter !== undefined ? { counter } : {}) })
  const player = state.players.find((p) => p.id === offer.playerId)
  if (!player || player.teamId !== offer.sellerId) return reject('unavailable')

  const buyer = teamOf(state, offer.buyerId)
  const buyerSquad = playersOf(state, offer.buyerId)
  const problem = buyerCheck({ buyer, buyerSquad, payroll: monthlyPayroll(buyerSquad), fee: offer.fee, salary: offer.salary, player })
  if (problem) return reject(problem)

  const seller = offer.sellerId ? teamOf(state, offer.sellerId) : null
  const sellerSquad = offer.sellerId ? playersOf(state, offer.sellerId) : []
  // A venda proposta pela IA ao time do jogador só depende dele (a resposta é dele); nas demais o dono decide.
  if (seller && offer.direction === 'outgoing') {
    const listed = listingOf(state, player.id, offer.kind)
    const club = sellerDecision({ seller, sellerSquad, player, fee: offer.fee, kind: offer.kind, date, buyer, ...(listed ? { listedPrice: listed.price } : {}) })
    if (!club.accepted) return reject(club.reason as OfferReason, club.counter)
  }
  const verdict = playerDecision({ player, buyer, buyerSquad, from: seller, fromSquad: sellerSquad, salary: offer.salary, kind: offer.kind })
  if (!verdict.accepted) return reject(verdict.reason as OfferReason, verdict.minimumSalary ?? undefined)

  const done = executeTransfer(state, { playerId: player.id, toTeamId: offer.buyerId, fee: offer.fee, salary: offer.salary, contractEnd: offer.contractEnd, kind: offer.kind, date })
  return updateOffer(done, offer.id, { status: 'accepted', decidedOn: date })
}

/** Responde às propostas do jogador que venceram até a data. Devolve o estado e as propostas decididas. */
export function resolveDueOffers(state: SeasonState, date: IsoDate): { state: SeasonState; decided: TransferOffer[] } {
  let current = state
  const decided: TransferOffer[] = []
  for (const offer of state.market.offers) {
    if (offer.status !== 'pending' || offer.direction !== 'outgoing' || offer.dueOn > date) continue
    current = decide(current, offer, date)
    decided.push(current.market.offers.find((o) => o.id === offer.id) as TransferOffer)
  }
  return { state: current, decided }
}

/** Propostas recebidas que passaram da validade (ou cuja janela fechou) deixam de valer. */
export function expireOffers(state: SeasonState, date: IsoDate): SeasonState {
  let changed = false
  const offers = state.market.offers.map((o) => {
    if (o.status !== 'pending' || o.direction !== 'incoming') return o
    if (o.dueOn >= date && isWindowOpen(state, date, [o.buyerId, o.sellerId])) return o
    changed = true
    return { ...o, status: 'expired' as const, decidedOn: date }
  })
  return changed ? { ...state, market: { ...state.market, offers } } : state
}

/** O jogador responde a uma proposta recebida: aceitar executa a transferência; recusar a encerra. */
export function respondToOffer(state: SeasonState, offerId: string, accept: boolean, date: IsoDate = state.season.currentDate): SeasonState {
  const offer = state.market.offers.find((o) => o.id === offerId)
  if (!offer || offer.direction !== 'incoming' || offer.status !== 'pending') throw new OfferError('invalid')
  if (!accept) return updateOffer(state, offerId, { status: 'rejected', decidedOn: date })
  if (!isWindowOpen(state, date, [offer.buyerId, offer.sellerId])) throw new OfferError('window-closed')

  const player = state.players.find((p) => p.id === offer.playerId)
  if (!player || player.teamId !== offer.sellerId) return updateOffer(state, offerId, { status: 'withdrawn', reason: 'unavailable', decidedOn: date })
  const buyerSquad = playersOf(state, offer.buyerId)
  const buyer = teamOf(state, offer.buyerId)
  const problem = buyerCheck({ buyer, buyerSquad, payroll: monthlyPayroll(buyerSquad), fee: offer.fee, salary: offer.salary, player })
  if (problem) return updateOffer(state, offerId, { status: 'withdrawn', reason: problem, decidedOn: date })
  if (playersOf(state, offer.sellerId as TeamId).length - 1 < SQUAD_MIN) throw new OfferError('squad-size')
  const done = executeTransfer(state, { playerId: player.id, toTeamId: offer.buyerId, fee: offer.fee, salary: offer.salary, contractEnd: offer.contractEnd, kind: offer.kind, date })
  return updateOffer(done, offerId, { status: 'accepted', decidedOn: date })
}

export const pendingIncoming = (state: Pick<SeasonState, 'market'>): TransferOffer[] =>
  state.market.offers.filter((o) => o.status === 'pending' && o.direction === 'incoming')
