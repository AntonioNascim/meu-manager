/**
 * Mercado com os clubes da IA numa liga online (Fase 6, B8.6b; proposta, seção 28). Puro: usa as mesmas regras do jogo solo (`makeOffer`, `resolveDueOffers`,
 * `respondToOffer`, `searchPlayers`, `interestIn`) sobre o mundo da liga; o servidor valida tudo (janela, orçamento, limite de estrangeiros, consentimento do jogador).
 *
 * - **Buscar** jogadores de clubes da IA e livres, com os filtros do solo (texto, posição, série, idade, valor, força, situação, atalhos e ordem). Jogador de outro
 *   técnico da liga não aparece aqui (negocia-se pelo mercado entre técnicos, B8.6).
 * - **Anúncios** dos clubes da IA (o preço anunciado vale na compra).
 * - **Propostas à IA**: a resposta chega com o tempo do mundo (\`responseDays\`), quando a liga passa pela data (\`resolveDueOffers\` no avanço).
 * - **Propostas da IA** pelos jogadores dos técnicos (\`runMarketTick\`, que agora sorteia o alvo entre os humanos): o técnico aceita ou recusa.
 */
import { OfferError, makeOffer, respondToOffer, withdrawOffer } from '../market/offers'
import { interestContext, interestIn, type InterestLevel } from '../market/interest'
import { defaultFilters, searchPlayers, type MarketSort, type PositionGroup, type QuickFilter, type Situation } from '../market/search'
import { askingPrice, expectedSalary, loanFee, marketValue } from '../market/value'
import { playerOverall } from '../overall'
import type { SeasonState } from '../season'
import type { IsoDate, OfferKind, OfferReason, Player, PlayerId, Position, TeamId, TransferOffer } from '../types'
import type { LeagueState } from './runner'

const MAX_OPEN = 5
const ROWS = 40

export type AiError = OfferReason | 'not-seated' | 'human-club' | 'not-found' | 'too-many-offers' | 'invalid'

export interface AiSearchFilters {
  query?: string
  group?: PositionGroup
  position?: Position
  situation?: Situation
  tier?: 1 | 2 | 3
  /** Idade máxima, valor máximo, força mínima. */
  ageMax?: number
  valueMax?: number
  overallMin?: number
  quick?: QuickFilter[]
  sort?: MarketSort
}

export interface MarketRow {
  playerId: PlayerId
  name: string
  position: string
  age: number
  overall: number
  /** Clube dono (`null` = jogador livre). */
  clubId: TeamId | null
  value: number
  /** O que o clube pede pela compra e pela taxa de empréstimo. */
  asking: number
  loanAsking: number
  salary: number
  endDate: IsoDate
  /** Interesse dele em vir e o salário que costuma pedir neste clube. */
  interest: InterestLevel
  salaryHint: number
  listing?: { kind: string; price: number }
}

export interface AiOfferRow {
  id: string
  kind: OfferKind
  playerId: PlayerId
  playerName: string
  /** O outro clube (a IA que vende ou a IA que compra; `null` = jogador livre). */
  otherId: TeamId | null
  fee: number
  salary: number
  contractEnd: IsoDate
  createdOn: IsoDate
  dueOn: IsoDate
  status: TransferOffer['status']
  reason?: OfferReason
  counter?: number
}

export interface AiOffersBody {
  /** As minhas propostas a clubes da IA e a jogadores livres (as abertas primeiro, depois as últimas respondidas). */
  outgoing: AiOfferRow[]
  /** Propostas de clubes da IA pelos meus jogadores, esperando a minha resposta. */
  incoming: AiOfferRow[]
}

const seatOf = (league: LeagueState, playerId: string) => league.seats.find((s) => s.playerId === playerId)
const humanTeams = (league: LeagueState): Set<TeamId> => new Set(league.seats.map((s) => s.teamId))
const nameOf = (p: Player): string => p.nickname ?? p.name

export function searchAi(league: LeagueState, world: SeasonState, playerId: string, f: AiSearchFilters): MarketRow[] | undefined {
  const seat = seatOf(league, playerId)
  if (!seat) return undefined
  const humans = humanTeams(league)
  const filters = {
    ...defaultFilters(),
    ...(f.query ? { query: f.query.slice(0, 40) } : {}),
    ...(f.group ? { group: f.group } : {}),
    ...(f.position ? { position: f.position } : {}),
    ...(f.situation ? { situation: f.situation } : {}),
    ...(f.tier ? { tier: f.tier } : {}),
    ...(f.ageMax !== undefined ? { age: { min: -Infinity, max: f.ageMax } } : {}),
    ...(f.valueMax !== undefined ? { value: { min: -Infinity, max: f.valueMax } } : {}),
    ...(f.overallMin !== undefined ? { overall: { min: f.overallMin, max: Infinity } } : {}),
    ...(f.quick ? { quick: f.quick } : {}),
    ...(f.sort ? { sort: f.sort } : {}),
  }
  const found = searchPlayers(world, seat.teamId, filters, (p) => p.teamId === null || !humans.has(p.teamId)).slice(0, ROWS)
  return rowsOf(league, world, seat.teamId, found)
}

function rowsOf(_league: LeagueState, world: SeasonState, teamId: TeamId, players: readonly Player[]): MarketRow[] {
  const date = world.season.currentDate
  const ctx = interestContext(world, teamId)
  const buyer = ctx.buyer
  return players.map((p) => {
    const club = p.teamId ? ctx.teams.get(p.teamId) : undefined
    const squad = p.teamId ? (ctx.squads.get(p.teamId) ?? []) : []
    const interest = interestIn(ctx, p)
    const listing = world.market.listings.find((l) => l.playerId === p.id && l.by === 'ai')
    const hint = Math.max(expectedSalary(p, buyer), interest.minimumSalary ? Math.ceil(interest.minimumSalary * 1.02) : 0)
    return {
      playerId: p.id,
      name: nameOf(p),
      position: p.position,
      age: p.age,
      overall: Math.round(playerOverall(p)),
      clubId: p.teamId,
      value: club ? marketValue(p, date, club) : 0,
      asking: club ? askingPrice(p, squad, date, club) : 0,
      loanAsking: club ? loanFee(p, date, club) : 0,
      salary: p.contract.salary,
      endDate: p.contract.endDate,
      interest: interest.level,
      salaryHint: Math.round(hint / 1_000) * 1_000,
      ...(listing ? { listing: { kind: listing.kind, price: listing.price } } : {}),
    }
  })
}

/** Os anúncios dos clubes da IA (jogador à venda ou para empréstimo), os mais fortes primeiro. */
export function listingsAi(league: LeagueState, world: SeasonState, playerId: string): MarketRow[] | undefined {
  const seat = seatOf(league, playerId)
  if (!seat) return undefined
  const humans = humanTeams(league)
  const ids = new Set(world.market.listings.filter((l) => l.by === 'ai' && !humans.has(l.teamId)).map((l) => l.playerId))
  const players = world.players.filter((p) => ids.has(p.id) && p.teamId !== null && p.teamId !== seat.teamId).sort((a, b) => playerOverall(b) - playerOverall(a) || (a.id < b.id ? -1 : 1)).slice(0, 60)
  return rowsOf(league, world, seat.teamId, players)
}

const offerRow = (world: SeasonState, o: TransferOffer, mine: TeamId): AiOfferRow => {
  const p = world.players.find((x) => x.id === o.playerId)
  return {
    id: o.id,
    kind: o.kind,
    playerId: o.playerId,
    playerName: p ? nameOf(p) : o.playerId,
    otherId: o.buyerId === mine ? o.sellerId : o.buyerId,
    fee: o.fee,
    salary: o.salary,
    contractEnd: o.contractEnd,
    createdOn: o.createdOn,
    dueOn: o.dueOn,
    status: o.status,
    ...(o.reason ? { reason: o.reason } : {}),
    ...(o.counter !== undefined ? { counter: o.counter } : {}),
  }
}

export function aiOffers(league: LeagueState, world: SeasonState, playerId: string): AiOffersBody | undefined {
  const seat = seatOf(league, playerId)
  if (!seat) return undefined
  const mine = world.market.offers.filter((o) => o.direction === 'outgoing' && o.buyerId === seat.teamId)
  const open = mine.filter((o) => o.status === 'pending')
  const done = mine.filter((o) => o.status !== 'pending').slice(-10).reverse()
  return {
    outgoing: [...open, ...done].map((o) => offerRow(world, o, seat.teamId)),
    incoming: world.market.offers.filter((o) => o.direction === 'incoming' && o.status === 'pending' && o.sellerId === seat.teamId).map((o) => offerRow(world, o, seat.teamId)),
  }
}

/** Quantas propostas da IA esperam a minha resposta (para o aviso na sala). */
export const aiAwaiting = (league: LeagueState, world: SeasonState, playerId: string): number => {
  const seat = seatOf(league, playerId)
  return seat ? world.market.offers.filter((o) => o.direction === 'incoming' && o.status === 'pending' && o.sellerId === seat.teamId).length : 0
}

export type AiResult = { ok: true; world: SeasonState } | { ok: false; error: AiError }

const fromOfferError = (e: unknown): AiResult => {
  if (e instanceof OfferError) return { ok: false, error: e.code }
  throw e
}

/** Proposta de compra, empréstimo ou contratação de jogador livre a um clube da IA. A resposta chega quando a liga passa pela data (`dueOn`). */
export function makeAiOffer(league: LeagueState, world: SeasonState, playerId: string, req: { kind: OfferKind; playerId: PlayerId; fee: number; salary: number; contractEnd: IsoDate }): AiResult {
  const seat = seatOf(league, playerId)
  if (!seat) return { ok: false, error: 'not-seated' }
  const player = world.players.find((p) => p.id === req.playerId)
  if (!player) return { ok: false, error: 'not-found' }
  if (player.teamId !== null && humanTeams(league).has(player.teamId)) return { ok: false, error: 'human-club' }
  if (world.market.offers.filter((o) => o.direction === 'outgoing' && o.status === 'pending' && o.buyerId === seat.teamId).length >= MAX_OPEN) return { ok: false, error: 'too-many-offers' }
  try {
    return { ok: true, world: makeOffer(world, seat.teamId, { kind: req.kind, playerId: req.playerId, fee: Math.round(req.fee), salary: Math.round(req.salary), contractEnd: req.contractEnd }) }
  } catch (e) {
    return fromOfferError(e)
  }
}

export function withdrawAiOffer(league: LeagueState, world: SeasonState, playerId: string, offerId: string): AiResult {
  const seat = seatOf(league, playerId)
  if (!seat) return { ok: false, error: 'not-seated' }
  try {
    return { ok: true, world: withdrawOffer(world, offerId, seat.teamId) }
  } catch (e) {
    return fromOfferError(e)
  }
}

/** O técnico responde a uma proposta de um clube da IA por um jogador dele: aceitar executa a transferência. */
export function respondAiOffer(league: LeagueState, world: SeasonState, playerId: string, offerId: string, accept: boolean): AiResult {
  const seat = seatOf(league, playerId)
  if (!seat) return { ok: false, error: 'not-seated' }
  const offer = world.market.offers.find((o) => o.id === offerId)
  if (!offer || offer.direction !== 'incoming' || offer.status !== 'pending' || offer.sellerId !== seat.teamId) return { ok: false, error: 'not-found' }
  try {
    return { ok: true, world: respondToOffer(world, offerId, accept) }
  } catch (e) {
    return fromOfferError(e)
  }
}
