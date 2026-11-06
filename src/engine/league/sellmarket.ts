/**
 * Vender, anunciar e pré-contrato numa liga online (Fase 6, pendências antes do lançamento; proposta, seção 30). Puro: usa as mesmas regras do jogo solo
 * (`listUserPlayer`, `sellPlayer`, `buyerInterest`, `offerPreContract`) sobre o mundo da liga; o servidor valida tudo.
 *
 * - **Meu elenco** (`mineBody`): cada jogador com valor, anúncio e quanto a pedida sugerida; os que vão e os que chegam por pré-contrato.
 * - **Anunciar** (`listOwn`/`unlistOwn`): a IA passa a fazer propostas pelo jogador anunciado, pelo preço anunciado (`runMarketTick`).
 * - **Vender direto** a um clube da IA (`buyersFor`, `sellToAi`): o clube responde na hora; jogador de outro técnico não é comprador (isso é o mercado entre técnicos).
 * - **Pré-contrato** (`preTargets`, `preOffer`): jogadores no último ano de contrato de clubes da IA; o jogador responde na hora e o contrato vale na virada.
 */
import { OfferError, isWindowOpen } from '../market/offers'
import { buyerInterest, sellPlayer } from '../market/sell'
import { ListingError, listUserPlayer, listingPrice, unlistUserPlayer } from '../market/listings'
import { PRE_CONTRACT_YEARS, canPreContract, offerPreContract, preContractsOpen } from '../market/precontract'
import { interestContext, interestIn, type InterestLevel } from '../market/interest'
import { expectedSalary, marketValue } from '../market/value'
import { playerOverall } from '../overall'
import type { SeasonState } from '../season'
import { contractEndIn } from '../season'
import type { IsoDate, ListingKind, OfferKind, OfferReason, Player, PlayerId, Position, TeamId } from '../types'
import type { LeagueState } from './runner'

export type SellError = OfferReason | 'not-seated' | 'human-club' | 'not-found' | 'invalid'
export type SellResult = { ok: true; world: SeasonState; accepted?: boolean; reason?: OfferReason; counter?: number } | { ok: false; error: SellError }

export interface MineRow {
  playerId: PlayerId
  name: string
  position: string
  age: number
  overall: number
  value: number
  salary: number
  endDate: IsoDate
  /** Emprestado de outro clube: não se vende nem se anuncia. */
  loaned: boolean
  listing?: { kind: ListingKind; price: number }
  /** Preços sugeridos para anunciar (venda e empréstimo). */
  suggestSale: number
  suggestLoan: number
  /** Pode assinar pré-contrato com outro clube (último ano de contrato, janela aberta). */
  preContract: boolean
  /** Já assinou pré-contrato e sai na virada. */
  leaving?: { toTeamId: TeamId; salary: number }
}

export interface ArrivingRow {
  playerId: PlayerId
  name: string
  position: string
  fromTeamId: TeamId
  salary: number
  years: number
}

export interface MineBody {
  windowOpen: boolean
  preOpen: boolean
  players: MineRow[]
  arriving: ArrivingRow[]
}

export interface BuyerRow {
  teamId: TeamId
  /** O máximo que o clube paga (venda) ou de taxa (empréstimo). */
  maxFee: number
}

export interface PreRow {
  playerId: PlayerId
  name: string
  position: string
  age: number
  overall: number
  clubId: TeamId
  salary: number
  endDate: IsoDate
  interest: InterestLevel
  salaryHint: number
}

const seatOf = (league: LeagueState, playerId: string) => league.seats.find((s) => s.playerId === playerId)
const humanTeams = (league: LeagueState): Set<TeamId> => new Set(league.seats.map((s) => s.teamId))
const nameOf = (p: Player): string => p.nickname ?? p.name

export function mineBody(league: LeagueState, world: SeasonState, playerId: string): MineBody | undefined {
  const seat = seatOf(league, playerId)
  if (!seat) return undefined
  const date = world.season.currentDate
  const club = world.teams.find((t) => t.id === seat.teamId)
  const pre = world.market.preContracts
  const players = world.players
    .filter((p) => p.teamId === seat.teamId)
    .sort((a, b) => playerOverall(b) - playerOverall(a) || (a.id < b.id ? -1 : 1))
    .map((p): MineRow => {
      const listed = world.market.listings.find((l) => l.playerId === p.id && l.by === 'user')
      const leaving = pre.find((c) => c.playerId === p.id)
      return {
        playerId: p.id,
        name: nameOf(p),
        position: p.position,
        age: p.age,
        overall: Math.round(playerOverall(p)),
        value: marketValue(p, date, club),
        salary: p.contract.salary,
        endDate: p.contract.endDate,
        loaned: !!p.contract.loanedFrom,
        ...(listed ? { listing: { kind: listed.kind, price: listed.price } } : {}),
        suggestSale: listingPrice(p, 'transfer', date, club),
        suggestLoan: listingPrice(p, 'loan', date, club),
        preContract: canPreContract(world, p, date),
        ...(leaving ? { leaving: { toTeamId: leaving.toTeamId, salary: leaving.salary } } : {}),
      }
    })
  const arriving = pre
    .filter((c) => c.toTeamId === seat.teamId)
    .map((c): ArrivingRow | undefined => {
      const p = world.players.find((x) => x.id === c.playerId)
      return p ? { playerId: p.id, name: nameOf(p), position: p.position, fromTeamId: c.fromTeamId, salary: c.salary, years: c.years } : undefined
    })
    .filter((r): r is ArrivingRow => r !== undefined)
  return { windowOpen: isWindowOpen(world, date, [seat.teamId]), preOpen: preContractsOpen(world, date), players, arriving }
}

function ownPlayer(league: LeagueState, world: SeasonState, playerId: string, target: PlayerId): { seatTeam: TeamId; player: Player } | SellError {
  const seat = seatOf(league, playerId)
  if (!seat) return 'not-seated'
  const player = world.players.find((p) => p.id === target)
  if (!player || player.teamId !== seat.teamId) return 'not-found'
  return { seatTeam: seat.teamId, player }
}

const fromListing = (e: unknown): SellResult => {
  if (e instanceof ListingError) return { ok: false, error: e.code }
  if (e instanceof OfferError) return { ok: false, error: e.code }
  throw e
}

/** Anuncia um jogador meu (venda ou empréstimo) por um preço; anunciar de novo troca o anúncio. */
export function listOwn(league: LeagueState, world: SeasonState, playerId: string, req: { playerId: PlayerId; kind: ListingKind; price: number }): SellResult {
  const own = ownPlayer(league, world, playerId, req.playerId)
  if (typeof own === 'string') return { ok: false, error: own }
  try {
    return { ok: true, world: listUserPlayer(world, own.seatTeam, req.playerId, req.kind, req.price) }
  } catch (e) {
    return fromListing(e)
  }
}

export function unlistOwn(league: LeagueState, world: SeasonState, playerId: string, target: PlayerId): SellResult {
  const own = ownPlayer(league, world, playerId, target)
  if (typeof own === 'string') return { ok: false, error: own }
  try {
    return { ok: true, world: unlistUserPlayer(world, own.seatTeam, target) }
  } catch (e) {
    return fromListing(e)
  }
}

/** Clubes da IA interessados no jogador (os que mais pagam primeiro, até 12). */
export function buyersFor(league: LeagueState, world: SeasonState, playerId: string, target: PlayerId, kind: OfferKind): BuyerRow[] | undefined {
  const own = ownPlayer(league, world, playerId, target)
  if (typeof own === 'string' || own.player.contract.loanedFrom) return undefined
  const humans = humanTeams(league)
  return world.teams
    .filter((t) => !humans.has(t.id))
    .map((t) => ({ teamId: t.id, maxFee: buyerInterest(world, t.id, own.player, kind).maxFee }))
    .filter((b): b is BuyerRow => b.maxFee !== null && b.maxFee > 0)
    .sort((a, b) => b.maxFee - a.maxFee || (a.teamId < b.teamId ? -1 : 1))
    .slice(0, 12)
}

/** Vende ou empresta um jogador meu a um clube da IA, que responde na hora (`sellPlayer`). O contrato novo é de 3 anos (empréstimo: até o fim da temporada dele). */
export function sellToAi(league: LeagueState, world: SeasonState, playerId: string, req: { playerId: PlayerId; buyerId: TeamId; kind: OfferKind; fee: number }): SellResult {
  const own = ownPlayer(league, world, playerId, req.playerId)
  if (typeof own === 'string') return { ok: false, error: own }
  if (humanTeams(league).has(req.buyerId)) return { ok: false, error: 'human-club' }
  if (!world.teams.some((t) => t.id === req.buyerId)) return { ok: false, error: 'not-found' }
  try {
    const result = sellPlayer(world, own.seatTeam, { playerId: req.playerId, buyerId: req.buyerId, kind: req.kind, fee: Math.round(req.fee), contractEnd: contractEndIn(world, req.buyerId, req.kind === 'loan' ? 0 : 3) })
    return { ok: true, world: result.state, accepted: result.accepted, ...(result.reason ? { reason: result.reason } : {}), ...(result.counter !== undefined ? { counter: result.counter } : {}) }
  } catch (e) {
    return fromListing(e)
  }
}

/** Jogadores de clubes da IA no último ano de contrato, com a janela de pré-contrato aberta para eles (os mais fortes primeiro, até 40). */
export function preTargets(league: LeagueState, world: SeasonState, playerId: string, f: { query?: string; position?: Position }): PreRow[] | undefined {
  const seat = seatOf(league, playerId)
  if (!seat) return undefined
  const humans = humanTeams(league)
  const date = world.season.currentDate
  const q = (f.query ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const signed = new Set(world.market.preContracts.map((c) => c.playerId))
  const found = world.players
    .filter((p) => p.teamId !== null && p.teamId !== seat.teamId && !humans.has(p.teamId) && !signed.has(p.id) && canPreContract(world, p, date))
    .filter((p) => !f.position || p.position === f.position)
    .filter((p) => !q || `${p.name} ${p.nickname ?? ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
    .sort((a, b) => playerOverall(b) - playerOverall(a) || (a.id < b.id ? -1 : 1))
    .slice(0, 40)
  const ctx = interestContext(world, seat.teamId)
  return found.map((p) => {
    const interest = interestIn(ctx, p)
    const hint = Math.max(expectedSalary(p, ctx.buyer), interest.minimumSalary ? Math.ceil(interest.minimumSalary * 1.02) : 0)
    return {
      playerId: p.id,
      name: nameOf(p),
      position: p.position,
      age: p.age,
      overall: Math.round(playerOverall(p)),
      clubId: p.teamId as TeamId,
      salary: p.contract.salary,
      endDate: p.contract.endDate,
      interest: interest.level,
      salaryHint: Math.round(hint / 1_000) * 1_000,
    }
  })
}

/** Proposta de pré-contrato a um jogador de um clube da IA; ele responde na hora (mesmas regras do jogo solo). */
export function preOffer(league: LeagueState, world: SeasonState, playerId: string, req: { playerId: PlayerId; salary: number; years: number }): SellResult {
  const seat = seatOf(league, playerId)
  if (!seat) return { ok: false, error: 'not-seated' }
  const player = world.players.find((p) => p.id === req.playerId)
  if (!player) return { ok: false, error: 'not-found' }
  if (player.teamId !== null && humanTeams(league).has(player.teamId)) return { ok: false, error: 'human-club' }
  if (!(PRE_CONTRACT_YEARS as readonly number[]).includes(req.years)) return { ok: false, error: 'invalid' }
  try {
    const r = offerPreContract(world, seat.teamId, req.playerId, { salary: Math.round(req.salary), years: req.years })
    return { ok: true, world: r.state, accepted: r.accepted, ...(r.reason ? { reason: r.reason } : {}), ...(r.minimumSalary !== undefined ? { counter: r.minimumSalary } : {}) }
  } catch (e) {
    return fromListing(e)
  }
}
