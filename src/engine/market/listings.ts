/**
 * Listas do mercado: jogadores colocados à venda ou para empréstimo, com preço menor que o valor de mercado.
 * Os clubes da IA anunciam quem sobra no elenco; o jogador também pode anunciar os seus (e a IA passa a fazer
 * propostas por eles, pelo preço anunciado).
 */
import { MARKET } from '../config'
import { createRng } from '../rng'
import type { SeasonState } from '../season/calendar'
import type { IsoDate, Listing, ListingKind, OfferKind, Player, PlayerId, TeamId } from '../types'
import { askingPrice, loanFee, marketValue, squadRole } from './value'

const round10k = (v: number) => Math.max(10_000, Math.round(v / 10_000) * 10_000)

/** Preço anunciado de um jogador: a venda sai abaixo do valor de mercado e o empréstimo abaixo da taxa normal. */
export const listingPrice = (player: Player, kind: ListingKind, date: IsoDate): number =>
  kind === 'loan' ? round10k(loanFee(player, date) * MARKET.listing.loanShare) : round10k(marketValue(player, date) * MARKET.listing.transferShare)

/** Anúncio do jogador para esse tipo de negócio (compra ↔ transferência). */
export function listingOf(state: Pick<SeasonState, 'market'>, playerId: PlayerId, kind: OfferKind): Listing | undefined {
  const wanted: ListingKind = kind === 'loan' ? 'loan' : 'transfer'
  return state.market.listings.find((l) => l.playerId === playerId && l.kind === wanted)
}

/** Preço pelo qual o clube vende (ou empresta): o pedido normal ou o anunciado, o que for menor. */
export function salePrice(state: Pick<SeasonState, 'market'>, player: Player, squad: readonly Player[], kind: OfferKind, date: IsoDate): number {
  const base = kind === 'loan' ? loanFee(player, date) : askingPrice(player, squad, date)
  const listed = listingOf(state, player.id, kind)
  return listed ? Math.min(base, listed.price) : base
}

export const withoutListings = (state: SeasonState, playerId: PlayerId): SeasonState =>
  state.market.listings.some((l) => l.playerId === playerId) ? { ...state, market: { ...state.market, listings: state.market.listings.filter((l) => l.playerId !== playerId) } } : state

/**
 * Atualiza os anúncios dos clubes da IA: tira os que não valem mais (o jogador saiu, deixou de ser sobra ou o
 * elenco ficou curto) e anuncia, aos poucos, quem sobra. Os anúncios do jogador ficam como estão.
 */
export function refreshListings(state: SeasonState, date: IsoDate, userTeamId?: TeamId): SeasonState {
  const L = MARKET.listing
  const rng = createRng(`${state.market.seed}:${date}:listings`)
  const squads = new Map<TeamId, Player[]>()
  for (const p of state.players) {
    if (!p.teamId) continue
    const list = squads.get(p.teamId)
    if (list) list.push(p)
    else squads.set(p.teamId, [p])
  }
  const byId = new Map(state.players.map((p) => [p.id, p]))
  const keep = state.market.listings.filter((l) => {
    const p = byId.get(l.playerId)
    if (!p || p.teamId !== l.teamId || p.contract.loanedFrom) return false
    if (l.by === 'user') return true
    if (l.teamId === userTeamId) return false
    const squad = squads.get(l.teamId) ?? []
    return squad.length > L.minSquad && squadRole(p, squad) === 'surplus'
  })
  const next = [...keep]
  for (const team of rng.shuffle(state.teams)) {
    if (team.id === userTeamId) continue
    const squad = squads.get(team.id) ?? []
    if (squad.length <= L.minSquad) continue
    const mine = next.filter((l) => l.teamId === team.id)
    if (mine.length >= L.maxPerTeam) continue
    const counts = new Map<string, number>()
    for (const p of squad) counts.set(p.position, (counts.get(p.position) ?? 0) + 1)
    const candidates = squad.filter(
      (p) => !p.contract.loanedFrom && !mine.some((l) => l.playerId === p.id) && squadRole(p, squad) === 'surplus' && (counts.get(p.position) ?? 0) > (MARKET.minByPosition[p.position] ?? 1),
    )
    for (const p of rng.shuffle(candidates)) {
      if (next.filter((l) => l.teamId === team.id).length >= L.maxPerTeam) break
      if (!rng.chance(L.listChance)) continue
      const kind: ListingKind = rng.chance(p.age <= L.loanAge ? L.youngLoanShare : L.oldLoanShare) ? 'loan' : 'transfer'
      next.push({ playerId: p.id, teamId: team.id, kind, price: listingPrice(p, kind, date), listedOn: date, by: 'ai' })
    }
  }
  return next.length === state.market.listings.length && next.every((l, i) => l === state.market.listings[i]) ? state : { ...state, market: { ...state.market, listings: next } }
}

export class ListingError extends Error {
  constructor(readonly code: 'not-found' | 'invalid') {
    super(code)
  }
}

/** O jogador anuncia um dos seus (venda ou empréstimo) por um preço; anunciar de novo troca o anúncio. */
export function listUserPlayer(state: SeasonState, userTeamId: TeamId, playerId: PlayerId, kind: ListingKind, price: number): SeasonState {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.teamId !== userTeamId || player.contract.loanedFrom) throw new ListingError('not-found')
  if (!Number.isFinite(price) || price <= 0) throw new ListingError('invalid')
  const others = state.market.listings.filter((l) => l.playerId !== playerId)
  const listing: Listing = { playerId, teamId: userTeamId, kind, price: Math.round(price), listedOn: state.season.currentDate, by: 'user' }
  return { ...state, market: { ...state.market, listings: [...others, listing] } }
}

/** Tira o anúncio de um jogador do jogador. */
export function unlistUserPlayer(state: SeasonState, userTeamId: TeamId, playerId: PlayerId): SeasonState {
  const own = state.market.listings.find((l) => l.playerId === playerId && l.teamId === userTeamId && l.by === 'user')
  if (!own) throw new ListingError('not-found')
  return withoutListings(state, playerId)
}
