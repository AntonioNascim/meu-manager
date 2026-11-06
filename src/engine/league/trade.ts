/**
 * Mercado entre técnicos humanos de uma liga online (Fase 6, B8.6; proposta, seção 27). Puro: o mundo, a liga e o relógio (`now`) entram por parâmetro.
 *
 * - **Propostas** de compra ou empréstimo de um jogador de outro técnico humano, com **dinheiro reservado** (a taxa das propostas abertas sai do orçamento
 *   de compras de quem propõe), **contrapropostas** (até `maxRounds`), prazo de 48 h (24 h por contraproposta) que **congela na pausa** (`deadlineIn`).
 * - **Jogador livre**: contratação na hora, só com o jogador e o clube.
 * - **Proteção contra "laranja"** (`LEAGUE_TRADE`): preço entre 60% e 250% do valor, no máximo 2 negócios e 3× o maior valor por par de técnicos por janela,
 *   bloqueio de 90 dias para recomprar de quem comprou. Janelas de transferência dos dois clubes e limite de estrangeiros valem como no solo.
 * - **Histórico público**: toda transferência fica no histórico da liga (`TradeRecord`) e qualquer técnico pode **denunciar** uma delas (o ADM vê).
 * O estado fica em `LeagueState.trades` (opcional: ligas de antes da B8.6 não o têm).
 */
import { LEAGUE_TRADE, MARKET } from '../config'
import { monthlyPayroll } from '../finance'
import { buyerCheck, playerDecision } from '../market/decision'
import { isWindowOpen } from '../market/offers'
import { executeTransfer, playersOf } from '../market/transfer'
import { expectedSalary, loanFee, marketValue } from '../market/value'
import { windowOfTeam } from '../market/windows'
import type { SeasonState } from '../season'
import { daysBetween } from '../season/dates'
import { SQUAD_MIN } from '../types'
import type { IsoDate, OfferKind, OfferReason, Player, PlayerId, Team, TeamId } from '../types'
import { deadlineExpired, deadlineIn, deadlineLeft, type LeagueState, type Seat } from './runner'

export type TradeKind = OfferKind | 'free'
export type TradeStatus = 'open' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'refused'

export interface TradeOffer {
  id: string
  kind: OfferKind
  playerId: PlayerId
  playerName: string
  /** Técnico e clube que compram / emprestam. */
  buyer: { playerId: string; teamId: TeamId }
  /** Técnico e clube dono do jogador. */
  seller: { playerId: string; teamId: TeamId }
  fee: number
  salary: number
  contractEnd: IsoDate
  /** Quantas contrapropostas já houve. */
  round: number
  /** De quem é a vez de responder. */
  turn: 'seller' | 'buyer'
  /** Prazo no relógio dos prazos da liga (congela na pausa). */
  due: number
  status: TradeStatus
  reason?: TradeError | OfferReason
  minimumSalary?: number
  createdAt: number
}

/** Uma transferência feita (a mesma lista é o histórico público e a base dos limites por par). */
export interface TradeRecord {
  id: string
  at: number
  date: IsoDate
  /** Início da janela de transferências em que aconteceu (chave dos limites por par). */
  windowStart: IsoDate
  kind: TradeKind
  playerId: PlayerId
  playerName: string
  fromTeamId: TeamId | null
  toTeamId: TeamId
  fee: number
  /** Valor de mercado do jogador na época. */
  value: number
}

export interface TradeReport {
  id: string
  at: number
  by: string
  recordId: string
  reason: 'laranja' | 'abusivo' | 'outro'
}

export interface TradeBook {
  offers: TradeOffer[]
  history: TradeRecord[]
  reports: TradeReport[]
  counter: number
}

export type TradeError =
  | 'not-seated'
  | 'not-human-club'
  | 'unavailable'
  | 'own-player'
  | 'window-closed'
  | 'invalid'
  | 'fee-too-low'
  | 'fee-too-high'
  | 'duplicate'
  | 'too-many-offers'
  | 'pair-limit'
  | 'pair-money'
  | 'return-blocked'
  | 'not-your-turn'
  | 'max-rounds'
  | 'not-found'
  | 'closed'
  | 'squad-size'
  | 'position-cover'

export type TradeResult = { ok: true; league: LeagueState; world: SeasonState; offer?: TradeOffer } | { ok: false; error: TradeError | OfferReason; minimumSalary?: number; league?: LeagueState }

const T = LEAGUE_TRADE
export const emptyBook = (): TradeBook => ({ offers: [], history: [], reports: [], counter: 0 })
export const bookOf = (league: LeagueState): TradeBook => league.trades ?? emptyBook()
const withBook = (league: LeagueState, book: TradeBook): LeagueState => ({ ...league, trades: book })
const round10k = (n: number) => Math.round(n / 10_000) * 10_000

const seatOf = (league: LeagueState, playerId: string): Seat | undefined => league.seats.find((s) => s.playerId === playerId)
const seatOfTeam = (league: LeagueState, teamId: TeamId | null): Seat | undefined => (teamId === null ? undefined : league.seats.find((s) => s.teamId === teamId))
const teamOf = (world: SeasonState, id: TeamId): Team => world.teams.find((t) => t.id === id) as Team
const nameOf = (p: Player): string => p.nickname ?? p.name

/** Dinheiro das propostas abertas de um clube (a taxa fica reservada até a proposta acabar). */
export const reservedBy = (league: LeagueState, teamId: TeamId, exceptOfferId?: string): number =>
  bookOf(league)
    .offers.filter((o) => o.status === 'open' && o.buyer.teamId === teamId && o.id !== exceptOfferId)
    .reduce((s, o) => s + o.fee, 0)

/** O clube comprador com o orçamento de compras e o caixa já descontados do que está reservado em outras propostas. */
function buyerWithReserve(world: SeasonState, league: LeagueState, teamId: TeamId, exceptOfferId?: string): Team {
  const team = teamOf(world, teamId)
  const held = reservedBy(league, teamId, exceptOfferId)
  return { ...team, finances: { ...team.finances, transferBudget: team.finances.transferBudget - held, balance: team.finances.balance - held } }
}

/** Faixa de preço permitida (compra: 60% a 250% de V; empréstimo: 50% a 250% da taxa padrão). */
export function feeRange(player: Player, kind: OfferKind, date: IsoDate, club: Pick<Team, 'tier' | 'economy'>): { min: number; max: number } {
  if (kind === 'loan') {
    const base = loanFee(player, date, club)
    return { min: round10k(base * T.loanFloorShare), max: round10k(base * T.loanCeilingShare) }
  }
  const value = marketValue(player, date, club)
  return { min: round10k(value * T.floorShare), max: round10k(value * T.ceilingShare) }
}

const windowStartOf = (world: SeasonState, teamId: TeamId, date: IsoDate): IsoDate | null => windowOfTeam(world, date, teamId)?.start ?? null

/** Negócios entre o par de clubes na janela. */
function pairDeals(book: TradeBook, a: TeamId, b: TeamId, windowStart: IsoDate): TradeRecord[] {
  return book.history.filter((r) => r.windowStart === windowStart && r.kind !== 'free' && r.fromTeamId !== null && ((r.fromTeamId === a && r.toTeamId === b) || (r.fromTeamId === b && r.toTeamId === a)))
}

/** Os limites de "laranja" para fechar um negócio de `fee` por um jogador de valor `value` entre os dois clubes. */
function pairProblem(book: TradeBook, a: TeamId, b: TeamId, windowStart: IsoDate, fee: number, value: number): TradeError | null {
  const deals = pairDeals(book, a, b, windowStart)
  if (deals.length >= T.maxDealsPerPair) return 'pair-limit'
  const cap = T.maxPairValueMultiple * Math.max(value, ...deals.map((d) => d.value))
  if (deals.reduce((s, d) => s + d.fee, 0) + fee > cap) return 'pair-money'
  return null
}

/** Quem vendeu o jogador há menos de `returnBlockDays` dias do jogo não o recompra do mesmo técnico. */
function returnBlocked(book: TradeBook, world: SeasonState, playerId: PlayerId, buyerTeam: TeamId, sellerTeam: TeamId): boolean {
  const date = world.season.currentDate
  return book.history.some((r) => r.kind === 'purchase' && r.playerId === playerId && r.fromTeamId === buyerTeam && r.toTeamId === sellerTeam && daysBetween(r.date, date) < T.returnBlockDays)
}

const record = (book: TradeBook, world: SeasonState, now: number, windowStart: IsoDate, spec: Omit<TradeRecord, 'id' | 'at' | 'date' | 'windowStart'>): TradeBook => {
  const entry: TradeRecord = { id: `tr-${book.counter + 1}`, at: now, date: world.season.currentDate, windowStart, ...spec }
  return { ...book, counter: book.counter + 1, history: [...book.history, entry].slice(-T.historyKept) }
}

/** Só pode sair do elenco quem deixa o clube com o mínimo de jogadores e cobertura da posição (as regras do jogo solo). */
function sellerProblem(world: SeasonState, teamId: TeamId, player: Player): 'squad-size' | 'position-cover' | null {
  const squad = playersOf(world, teamId)
  if (squad.length - 1 < SQUAD_MIN) return 'squad-size'
  if (squad.filter((p) => p.position === player.position).length - 1 < (MARKET.minByPosition[player.position] ?? 1)) return 'position-cover'
  return null
}

/** Tudo o que precisa valer para o negócio acontecer agora (na proposta e de novo na aceitação). */
function dealProblem(
  league: LeagueState,
  world: SeasonState,
  p: { kind: OfferKind; player: Player; buyerTeam: TeamId; sellerTeam: TeamId; fee: number; salary: number; contractEnd: IsoDate; exceptOfferId?: string },
): { error: TradeError | OfferReason; minimumSalary?: number } | null {
  const { player, buyerTeam, sellerTeam, kind, fee, salary } = p
  const date = world.season.currentDate
  if (player.teamId !== sellerTeam || player.contract.loanedFrom) return { error: 'unavailable' }
  if (buyerTeam === sellerTeam) return { error: 'own-player' }
  if (!isWindowOpen(world, date, [buyerTeam, sellerTeam])) return { error: 'window-closed' }
  const seller = teamOf(world, sellerTeam)
  const range = feeRange(player, kind, date, seller)
  if (!Number.isFinite(fee) || !Number.isFinite(salary) || salary <= 0 || p.contractEnd <= date) return { error: 'invalid' }
  if (fee < range.min) return { error: 'fee-too-low' }
  if (fee > range.max) return { error: 'fee-too-high' }
  const windowStart = windowStartOf(world, buyerTeam, date)
  const book = bookOf(league)
  if (kind === 'purchase' && returnBlocked(book, world, player.id, buyerTeam, sellerTeam)) return { error: 'return-blocked' }
  if (windowStart) {
    const pair = pairProblem(book, buyerTeam, sellerTeam, windowStart, fee, marketValue(player, date, seller))
    if (pair) return { error: pair }
  }
  const lose = sellerProblem(world, sellerTeam, player)
  if (lose) return { error: lose }
  const buyer = buyerWithReserve(world, league, buyerTeam, p.exceptOfferId)
  const buyerSquad = playersOf(world, buyerTeam)
  const problem = buyerCheck({ buyer, buyerSquad, payroll: monthlyPayroll(buyerSquad), fee, salary, player })
  if (problem) return { error: problem }
  const verdict = playerDecision({ player, buyer, buyerSquad, from: seller, fromSquad: playersOf(world, sellerTeam), salary, kind })
  if (!verdict.accepted) return { error: (verdict.reason ?? 'salary') as OfferReason, ...(verdict.minimumSalary ? { minimumSalary: verdict.minimumSalary } : {}) }
  return null
}

export interface TradeRequest {
  kind: OfferKind
  playerId: PlayerId
  fee: number
  salary: number
  contractEnd: IsoDate
}

/** O técnico `buyerPlayerId` propõe comprar ou pegar emprestado um jogador de outro técnico humano. */
export function makeTradeOffer(league: LeagueState, world: SeasonState, now: number, buyerPlayerId: string, req: TradeRequest): TradeResult {
  const buyerSeat = seatOf(league, buyerPlayerId)
  if (!buyerSeat) return { ok: false, error: 'not-seated' }
  const player = world.players.find((p) => p.id === req.playerId)
  if (!player || player.teamId === null) return { ok: false, error: 'unavailable' }
  const sellerSeat = seatOfTeam(league, player.teamId)
  if (!sellerSeat) return { ok: false, error: 'not-human-club' }
  const book = bookOf(league)
  if (book.offers.some((o) => o.status === 'open' && o.playerId === player.id)) return { ok: false, error: 'duplicate' }
  if (book.offers.filter((o) => o.status === 'open' && o.buyer.playerId === buyerPlayerId).length >= T.maxOpenOffers) return { ok: false, error: 'too-many-offers' }
  const problem = dealProblem(league, world, { kind: req.kind, player, buyerTeam: buyerSeat.teamId, sellerTeam: sellerSeat.teamId, fee: req.fee, salary: req.salary, contractEnd: req.contractEnd })
  if (problem) return { ok: false, ...problem }
  const offer: TradeOffer = {
    id: `of-${book.counter + 1}`,
    kind: req.kind,
    playerId: player.id,
    playerName: nameOf(player),
    buyer: { playerId: buyerPlayerId, teamId: buyerSeat.teamId },
    seller: { playerId: sellerSeat.playerId, teamId: sellerSeat.teamId },
    fee: Math.round(req.fee),
    salary: Math.round(req.salary),
    contractEnd: req.contractEnd,
    round: 0,
    turn: 'seller',
    due: deadlineIn(league, now, T.offerTtlMs),
    status: 'open',
    createdAt: now,
  }
  return { ok: true, league: withBook(league, { ...book, counter: book.counter + 1, offers: [...book.offers, offer] }), world, offer }
}

export type TradeResponse = { type: 'accept' } | { type: 'decline' } | { type: 'counter'; fee: number }

const setOffer = (league: LeagueState, offer: TradeOffer): LeagueState => withBook(league, { ...bookOf(league), offers: bookOf(league).offers.map((o) => (o.id === offer.id ? offer : o)) })

/** A vez de quem responde: aceita (a transferência acontece), recusa ou contrapropõe a taxa. */
export function respondTrade(league: LeagueState, world: SeasonState, now: number, playerId: string, offerId: string, response: TradeResponse): TradeResult {
  const offer = bookOf(league).offers.find((o) => o.id === offerId)
  if (!offer) return { ok: false, error: 'not-found' }
  if (offer.status !== 'open' || deadlineExpired(league, now, offer.due)) return { ok: false, error: 'closed' }
  const mine = offer.turn === 'seller' ? offer.seller.playerId : offer.buyer.playerId
  if (mine !== playerId) return { ok: false, error: 'not-your-turn' }
  const close = (status: TradeStatus, reason?: TradeError | OfferReason, minimumSalary?: number): TradeResult => {
    const closed: TradeOffer = { ...offer, status, ...(reason ? { reason } : {}), ...(minimumSalary ? { minimumSalary } : {}) }
    return { ok: true, league: setOffer(league, closed), world, offer: closed }
  }
  if (response.type === 'decline') return close('declined')
  const player = world.players.find((p) => p.id === offer.playerId)
  if (!player) return close('expired', 'unavailable')
  const seller = teamOf(world, offer.seller.teamId)
  if (response.type === 'counter') {
    if (offer.round >= T.maxRounds) return { ok: false, error: 'max-rounds' }
    const range = feeRange(player, offer.kind, world.season.currentDate, seller)
    const fee = Math.round(response.fee)
    if (!Number.isFinite(fee)) return { ok: false, error: 'invalid' }
    if (fee < range.min) return { ok: false, error: 'fee-too-low' }
    if (fee > range.max) return { ok: false, error: 'fee-too-high' }
    const next: TradeOffer = { ...offer, fee, round: offer.round + 1, turn: offer.turn === 'seller' ? 'buyer' : 'seller', due: deadlineIn(league, now, T.counterTtlMs) }
    return { ok: true, league: setOffer(league, next), world, offer: next }
  }
  // aceitar: tudo é conferido de novo (janela, elenco, orçamento, limites, consentimento do jogador)
  const problem = dealProblem(league, world, { kind: offer.kind, player, buyerTeam: offer.buyer.teamId, sellerTeam: offer.seller.teamId, fee: offer.fee, salary: offer.salary, contractEnd: offer.contractEnd, exceptOfferId: offer.id })
  if (problem) {
    // O jogador (ou o clube) que ficou impossível encerra a proposta; falta de dinheiro ou limite deixa aberta para tentar de novo até o prazo.
    const hard = problem.error === 'unavailable' || problem.error === 'window-closed' || problem.error === 'salary' || problem.error === 'playing-time' || problem.error === 'club-reputation' || problem.error === 'no-interest' || problem.error === 'own-player'
    if (hard) return close(problem.error === 'unavailable' || problem.error === 'window-closed' ? 'expired' : 'refused', problem.error, problem.minimumSalary)
    return { ok: false, ...problem }
  }
  const date = world.season.currentDate
  const windowStart = windowStartOf(world, offer.buyer.teamId, date) ?? date
  const value = marketValue(player, date, seller)
  const done = executeTransfer(world, { playerId: player.id, toTeamId: offer.buyer.teamId, fee: offer.fee, salary: offer.salary, contractEnd: offer.contractEnd, kind: offer.kind, date })
  const book = record(bookOf(league), done, now, windowStart, { kind: offer.kind, playerId: player.id, playerName: nameOf(player), fromTeamId: offer.seller.teamId, toTeamId: offer.buyer.teamId, fee: offer.fee, value })
  const closed = { ...offer, status: 'accepted' as const }
  // As outras propostas pelo mesmo jogador (não há: só uma aberta por jogador) e as do jogador que saiu caem.
  const offers = book.offers.map((o) => (o.id === closed.id ? closed : o.status === 'open' && o.playerId === player.id ? { ...o, status: 'expired' as const, reason: 'unavailable' as const } : o))
  return { ok: true, league: withBook(league, { ...book, offers }), world: done, offer: closed }
}

/** O comprador retira a proposta (a taxa reservada volta). */
export function withdrawTrade(league: LeagueState, world: SeasonState, playerId: string, offerId: string): TradeResult {
  const offer = bookOf(league).offers.find((o) => o.id === offerId)
  if (!offer) return { ok: false, error: 'not-found' }
  if (offer.status !== 'open') return { ok: false, error: 'closed' }
  if (offer.buyer.playerId !== playerId) return { ok: false, error: 'not-your-turn' }
  return { ok: true, league: setOffer(league, { ...offer, status: 'withdrawn' }), world }
}

/** Contratação de jogador livre: o jogador responde na hora. */
export function signFreeAgent(league: LeagueState, world: SeasonState, now: number, buyerPlayerId: string, req: { playerId: PlayerId; salary: number; contractEnd: IsoDate }): TradeResult {
  const seat = seatOf(league, buyerPlayerId)
  if (!seat) return { ok: false, error: 'not-seated' }
  const player = world.players.find((p) => p.id === req.playerId)
  if (!player || player.teamId !== null) return { ok: false, error: 'unavailable' }
  const date = world.season.currentDate
  if (!isWindowOpen(world, date, [seat.teamId])) return { ok: false, error: 'window-closed' }
  if (!Number.isFinite(req.salary) || req.salary <= 0 || req.contractEnd <= date) return { ok: false, error: 'invalid' }
  const buyer = buyerWithReserve(world, league, seat.teamId)
  const squad = playersOf(world, seat.teamId)
  const problem = buyerCheck({ buyer, buyerSquad: squad, payroll: monthlyPayroll(squad), fee: 0, salary: req.salary, player })
  if (problem) return { ok: false, error: problem }
  const verdict = playerDecision({ player, buyer, buyerSquad: squad, from: null, fromSquad: [], salary: req.salary, kind: 'purchase' })
  if (!verdict.accepted) return { ok: false, error: (verdict.reason ?? 'salary') as OfferReason, ...(verdict.minimumSalary ? { minimumSalary: verdict.minimumSalary } : {}) }
  const done = executeTransfer(world, { playerId: player.id, toTeamId: seat.teamId, fee: 0, salary: Math.round(req.salary), contractEnd: req.contractEnd, kind: 'purchase', date })
  const windowStart = windowStartOf(world, seat.teamId, date) ?? date
  const book = record(bookOf(league), done, now, windowStart, { kind: 'free', playerId: player.id, playerName: nameOf(player), fromTeamId: null, toTeamId: seat.teamId, fee: 0, value: marketValue(player, date, teamOf(world, seat.teamId)) })
  return { ok: true, league: withBook(league, book), world: done }
}

/** Propostas que passaram do prazo (ou cujo jogador mudou de clube ou cuja janela fechou) deixam de valer e a taxa reservada volta. */
export function sweepTrades(league: LeagueState, world: SeasonState, now: number): LeagueState {
  const book = bookOf(league)
  if (!book.offers.some((o) => o.status === 'open')) return league
  const date = world.season.currentDate
  let changed = false
  const offers = book.offers.map((o) => {
    if (o.status !== 'open') return o
    const player = world.players.find((p) => p.id === o.playerId)
    const gone = !player || player.teamId !== o.seller.teamId
    const closedWindow = !isWindowOpen(world, date, [o.buyer.teamId, o.seller.teamId])
    if (!gone && !closedWindow && !deadlineExpired(league, now, o.due)) return o
    changed = true
    return { ...o, status: 'expired' as const, ...(gone ? { reason: 'unavailable' as const } : closedWindow ? { reason: 'window-closed' as const } : {}) }
  })
  if (!changed) return league
  // As encerradas há muito tempo saem da lista (ficam só as 30 mais recentes).
  const open = offers.filter((o) => o.status === 'open')
  const done = offers.filter((o) => o.status !== 'open').slice(-30)
  return withBook(league, { ...book, offers: [...done, ...open] })
}

/** Quando a liga precisa acordar por causa de uma proposta (o prazo mais próximo em tempo real); `undefined` em pausa ou sem propostas abertas. */
export function tradeWakeup(league: LeagueState, now: number): number | undefined {
  if (league.clock.pausedAt !== undefined) return undefined
  const open = bookOf(league).offers.filter((o) => o.status === 'open')
  if (open.length === 0) return undefined
  return now + Math.min(...open.map((o) => deadlineLeft(league, now, o.due))) + 25
}

/** Denúncia de uma transferência do histórico (uma por técnico e transferência). */
export function reportTrade(league: LeagueState, now: number, playerId: string, recordId: string, reason: TradeReport['reason']): { ok: true; league: LeagueState } | { ok: false; error: TradeError } {
  if (!seatOf(league, playerId)) return { ok: false, error: 'not-seated' }
  const book = bookOf(league)
  if (!book.history.some((r) => r.id === recordId)) return { ok: false, error: 'not-found' }
  if (book.reports.some((r) => r.by === playerId && r.recordId === recordId)) return { ok: true, league }
  const report: TradeReport = { id: `rp-${book.counter + 1}`, at: now, by: playerId, recordId, reason }
  return { ok: true, league: withBook(league, { ...book, counter: book.counter + 1, reports: [...book.reports, report].slice(-T.reportsKept) }) }
}

// ------------------------------------------------------------------------ o que a tela vê

export interface TradeOfferView extends TradeOffer {
  /** Tempo que falta (ms, no relógio dos prazos). */
  left: number
  /** É a minha vez de responder? */
  mine: boolean
  /** Faixa de preço permitida. */
  min: number
  max: number
  /** Valor de mercado. */
  value: number
}

export interface TradeBody {
  /** As janelas do meu clube estão abertas? */
  windowOpen: boolean
  /** Propostas em que sou comprador ou vendedor (as abertas e as últimas encerradas). */
  offers: TradeOfferView[]
  /** O que ainda posso propor: quantas propostas abertas já tenho. */
  openAsBuyer: number
  /** Dinheiro das minhas propostas abertas. */
  reserved: number
  history: TradeRecord[]
  /** Só o ADM recebe. */
  reports: TradeReport[]
}

export function tradeBody(league: LeagueState, world: SeasonState, now: number, playerId: string): TradeBody | undefined {
  const seat = seatOf(league, playerId)
  if (!seat) return undefined
  const book = bookOf(league)
  const date = world.season.currentDate
  const offers = book.offers
    .filter((o) => o.buyer.playerId === playerId || o.seller.playerId === playerId)
    .map((o): TradeOfferView => {
      const player = world.players.find((p) => p.id === o.playerId)
      const seller = teamOf(world, o.seller.teamId)
      const range = player ? feeRange(player, o.kind, date, seller) : { min: 0, max: 0 }
      return { ...o, left: deadlineLeft(league, now, o.due), mine: o.status === 'open' && (o.turn === 'seller' ? o.seller.playerId : o.buyer.playerId) === playerId, ...range, value: player ? marketValue(player, date, seller) : 0 }
    })
  return {
    windowOpen: isWindowOpen(world, date, [seat.teamId]),
    offers,
    openAsBuyer: book.offers.filter((o) => o.status === 'open' && o.buyer.playerId === playerId).length,
    reserved: reservedBy(league, seat.teamId),
    history: [...book.history].reverse().slice(0, T.historyShown),
    reports: book.reports,
  }
}

/** Quantas propostas esperam a minha resposta (para o aviso na sala). */
export const awaitingFor = (league: LeagueState, now: number, playerId: string): number =>
  bookOf(league).offers.filter((o) => o.status === 'open' && !deadlineExpired(league, now, o.due) && (o.turn === 'seller' ? o.seller.playerId : o.buyer.playerId) === playerId).length

export interface SquadRow {
  playerId: PlayerId
  name: string
  position: string
  age: number
  overall: number
  salary: number
  endDate: IsoDate
  value: number
  loaned: boolean
  /** Faixa de compra permitida e de empréstimo. */
  buy: { min: number; max: number }
  loan: { min: number; max: number }
}

/** O elenco de outro técnico humano da liga, com o que cada um custa (a tela para propor). */
export function squadOfHuman(league: LeagueState, world: SeasonState, teamId: TeamId, overall: (p: Player) => number): SquadRow[] | undefined {
  if (!seatOfTeam(league, teamId)) return undefined
  const date = world.season.currentDate
  const club = teamOf(world, teamId)
  return playersOf(world, teamId)
    .map((p) => ({
      playerId: p.id,
      name: nameOf(p),
      position: p.position,
      age: p.age,
      overall: Math.round(overall(p)),
      salary: p.contract.salary,
      endDate: p.contract.endDate,
      value: marketValue(p, date, club),
      loaned: p.contract.loanedFrom !== undefined,
      buy: feeRange(p, 'purchase', date, club),
      loan: feeRange(p, 'loan', date, club),
    }))
    .sort((a, b) => b.overall - a.overall)
}

export interface FreeAgentRow {
  playerId: PlayerId
  name: string
  position: string
  age: number
  overall: number
  /** Salário que a força dele costuma pedir neste clube (ponto de partida da proposta). */
  salaryHint: number
}

/** Jogadores livres, os mais fortes primeiro (até 40), com filtro opcional por posição. */
export function freeAgentsFor(world: SeasonState, teamId: TeamId, overall: (p: Player) => number, position?: string, limit = 40): FreeAgentRow[] {
  const club = teamOf(world, teamId)
  return world.players
    .filter((p) => p.teamId === null && (position === undefined || p.position === position))
    .map((p) => ({ playerId: p.id, name: nameOf(p), position: p.position, age: p.age, overall: Math.round(overall(p)), salaryHint: Math.round(expectedSalary(p, club) / 1_000) * 1_000 }))
    .sort((a, b) => b.overall - a.overall || (a.playerId < b.playerId ? -1 : 1))
    .slice(0, limit)
}
