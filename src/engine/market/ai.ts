/**
 * Mercado da IA: a cada rodada de negociações cada clube procura reforço onde o time é mais fraco,
 * respeitando orçamento, folha e elenco; os clubes negociam entre si e fazem propostas pelos jogadores
 * do time do jogador (que ele aceita ou recusa).
 */
import { MARKET } from '../config'
import { salaryScale } from '../economy'
import { formationOf } from '../formations'
import { monthlyOperations, monthlyPayroll } from '../finance'
import { playerOverall } from '../overall'
import { createRng } from '../rng'
import type { Rng } from '../rng'
import type { SeasonState } from '../season/calendar'
import { addDays, contractEndOn } from '../season/dates'
import { actsThisRound, quickTeamIds } from '../season/fidelity'
import type { IsoDate, Listing, OfferKind, Player, Position, Team, TeamId, TransferOffer, TransferWindow } from '../types'
import { buyerCheck, playerDecision, premiumPrice, sellerDecision } from './decision'
import { listingOf } from './listings'
import { executeTransfer, playersOf, releasePlayer } from './transfer'
import { askingPrice, askingPriceAs, expectedSalary, loanFee, marketValue, salaryForOverall, squadRole, squadRoleIn } from './value'
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
export function needsOf(team: Team, squad: readonly Player[]): Need[] {
  const slots = new Map<Position, number>()
  for (const s of formationOf(team.tactic).slots) slots.set(s.position, (slots.get(s.position) ?? 0) + 1)
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

/** Jogadores que podem ser comprados (sem emprestados nem lesionados), por posição, do mais forte ao mais fraco, com a ordem original da lista. */
interface PoolEntry {
  player: Player
  overall: number
  order: number
}

class PoolIndex {
  private readonly lists = new Map<Position, PoolEntry[]>()
  private readonly at: (PoolEntry | undefined)[]

  constructor(private players: readonly Player[]) {
    this.at = players.map((player, order) => {
      if (!isBuyable(player)) return undefined
      const entry: PoolEntry = { player, overall: playerOverall(player), order }
      const list = this.lists.get(player.position)
      if (list) list.push(entry)
      else this.lists.set(player.position, [entry])
      return entry
    })
    for (const list of this.lists.values()) list.sort((a, b) => b.overall - a.overall)
  }

  listOf(position: Position): readonly PoolEntry[] {
    return this.lists.get(position) ?? []
  }

  /** Acompanha a lista nova de jogadores trocando só quem mudou (uma transferência muda um jogador); devolve false se a conta não fecha e é preciso refazer. */
  update(players: readonly Player[]): boolean {
    if (players === this.players) return true
    if (players.length !== this.players.length) return false
    for (let i = 0; i < players.length; i++) {
      const next = players[i] as Player
      const before = this.players[i] as Player
      if (next === before) continue
      const entry = this.at[i]
      if (isBuyable(next) !== (entry !== undefined) || next.position !== before.position || next.attributes !== before.attributes) return false
      if (entry) entry.player = next
    }
    this.players = players
    return true
  }
}

const isBuyable = (p: Player): boolean => !p.contract.loanedFrom && p.condition.injuryDaysLeft === 0

/**
 * Os mesmos jogadores que `bestTarget` consideraria no mercado inteiro, na mesma ordem, sem passar por quem não tem como
 * dar o ganho mínimo de força: o resultado é igual ao de olhar a lista toda, só que a rodada deixa de custar clubes × jogadores.
 */
function marketPool(index: PoolIndex, team: Team, squad: readonly Player[], userTeamId: TeamId | undefined): Player[] {
  const picked: { player: Player; order: number }[] = []
  const roomForSalary = team.finances.salaryBudget - monthlyPayroll(squad)
  const scale = salaryScale(team)
  for (const need of needsOf(team, squad)) {
    const list = index.listOf(need.position)
    // O salário esperado só cresce com a força: quem passa da folga do clube fica no começo da lista (do mais forte ao mais fraco) e é pulado de uma vez.
    let low = 0
    let high = list.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (salaryForOverall((list[mid] as { overall: number }).overall) * scale - 250 > roomForSalary) low = mid + 1
      else high = mid
    }
    for (let i = low; i < list.length; i++) {
      const entry = list[i] as PoolEntry
      if (entry.overall - need.weakest < MARKET.ai.minUpgrade) break
      const p = entry.player
      if (p.teamId === team.id || p.teamId === userTeamId) continue
      picked.push(entry)
    }
  }
  return picked.sort((a, b) => a.order - b.order).map((e) => e.player)
}

interface Candidate {
  player: Player
  fee: number
  utility: number
}

/** Para os testes: o que o mercado olha por um clube, sem ter de rodar uma rodada inteira. */
export function marketPoolOf(players: readonly Player[], team: Team, squad: readonly Player[], userTeamId?: TeamId): Player[] {
  return marketPool(new PoolIndex(players), team, squad, userTeamId)
}

/** Forças do elenco em ordem decrescente, guardadas por elenco (o array do elenco só é trocado quando o elenco muda). */
const STRENGTH_ORDER = new WeakMap<readonly Player[], number[]>()
function strengthsOf(squad: readonly Player[]): number[] {
  let sorted = STRENGTH_ORDER.get(squad)
  if (!sorted) {
    sorted = squad.map(playerOverall).sort((a, b) => b - a)
    STRENGTH_ORDER.set(squad, sorted)
  }
  return sorted
}

/** Preço pelo qual o clube vende: igual a `salePrice`, mas o papel do jogador no elenco vem da lista de forças já ordenada. */
const LISTING_INDEX = new WeakMap<readonly Listing[], Map<string, Listing>>()

/** Anúncio por jogador e tipo de negócio, guardado enquanto a lista de anúncios for a mesma (igual a `listingOf`, sem varrer a lista a cada jogador). */
function listingFor(market: SeasonState['market'], playerId: string, kind: OfferKind): Listing | undefined {
  let index = LISTING_INDEX.get(market.listings)
  if (!index) {
    index = new Map()
    for (const l of market.listings) {
      const key = `${l.playerId}:${l.kind}`
      if (!index.has(key)) index.set(key, l)
    }
    LISTING_INDEX.set(market.listings, index)
  }
  return index.get(`${playerId}:${kind === 'loan' ? 'loan' : 'transfer'}`)
}

function priceOf(market: SeasonState['market'], player: Player, sellerSquad: readonly Player[], kind: OfferKind, date: IsoDate, seller: Team | undefined, buyer: Team): number {
  const base = kind === 'loan' ? loanFee(player, date, seller) : premiumPrice(askingPriceAs(player, squadRoleIn(playerOverall(player), strengthsOf(sellerSquad)), date, seller), seller ?? {}, buyer)
  const listed = listingFor(market, player.id, kind)
  return listed ? Math.min(base, listed.price) : base
}

/** Melhor alvo para o time entre `pool`: ganho de força sobre o titular mais fraco da vaga, menos o custo. */
function bestTarget(rng: Rng, team: Team, squad: readonly Player[], pool: readonly Player[], date: IsoDate, spendable: number, kind: OfferKind, sellers: Map<TeamId, Player[]>, market: SeasonState['market'], clubs: ReadonlyMap<TeamId, Team>): Candidate | undefined {
  const needs = needsOf(team, squad)
  const roomForSalary = team.finances.salaryBudget - monthlyPayroll(squad)
  let best: Candidate | undefined
  for (const player of pool) {
    const need = needs.find((n) => n.position === player.position)
    if (!need || player.age > MARKET.ai.maxAge) continue
    const gain = playerOverall(player) - need.weakest
    if (gain < MARKET.ai.minUpgrade) continue
    // O salário é barato de calcular e o preço não: quem não cabe na folha sai antes de o preço ser calculado (os dois cortes não sorteiam nada, a ordem não muda o resultado).
    const salary = kind === 'loan' ? player.contract.salary : expectedSalary(player, team)
    if (salary > roomForSalary) continue
    const sellerSquad = player.teamId ? sellers.get(player.teamId) ?? [] : []
    const fee = player.teamId === null ? 0 : priceOf(market, player, sellerSquad, kind, date, player.teamId ? clubs.get(player.teamId) : undefined, team)
    if (fee > spendable) continue
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
  const quick = quickTeamIds(state)
  // Série e liga de cada clube não mudam dentro da rodada: o preço de quem vende vem daqui.
  const clubs = new Map(state.teams.map((t) => [t.id, t]))
  const aiTeams = rng.shuffle(state.teams.filter((t) => t.id !== userTeamId)).filter((t) => actsThisRound(quick, t.id, date))

  // Elenco de cada clube, refeito só quando uma transferência muda a lista de jogadores (antes era refeito a cada clube: custo quadrático).
  let squadsOf: Map<TeamId, Player[]> | undefined
  let squadsFor: readonly Player[] | undefined
  const squadsNow = (): Map<TeamId, Player[]> => {
    if (squadsOf && squadsFor === current.players) return squadsOf
    const map = new Map<TeamId, Player[]>()
    for (const p of current.players) {
      if (!p.teamId) continue
      const list = map.get(p.teamId)
      if (list) list.push(p)
      else map.set(p.teamId, [p])
    }
    // Elenco que não mudou mantém o mesmo array: os cálculos guardados por elenco (ordem de força) continuam valendo.
    if (squadsOf) {
      for (const [teamId, list] of map) {
        const before = squadsOf.get(teamId)
        if (before && before.length === list.length && before.every((p, i) => p === list[i])) map.set(teamId, before)
      }
    }
    squadsOf = map
    squadsFor = current.players
    return map
  }

  let poolIndex: PoolIndex | undefined

  for (const base of aiTeams) {
    const team = current.teams.find((t) => t.id === base.id) as Team
    const sellers = squadsNow()
    const squad = sellers.get(team.id) ?? []
    if (signingsInWindow(current, team.id, window) >= MARKET.ai.maxSigningsPerWindow) continue
    const spendable = spendableOf(team, squad)
    // 1) Propostas pelos jogadores do time do jogador.
    if (userTeamId && incomingCount(current) < MARKET.ai.maxPendingIncoming && rng.chance(MARKET.ai.userOfferChance)) {
      const offer = proposeToUser(current, team, squad, userTeamId, date, window, spendable, rng, sellers, clubs)
      if (offer) {
        current = { ...current, market: { ...current.market, offers: [...current.market.offers, offer], counter: current.market.counter + 1 } }
        incoming.push(offer)
        continue
      }
    }

    // 2) Compra no mercado (jogadores livres e de outros clubes da IA).
    if (!poolIndex || !poolIndex.update(current.players)) poolIndex = new PoolIndex(current.players)
    const pool = marketPool(poolIndex, team, squad, userTeamId)
    const target = bestTarget(rng, team, squad, pool, date, spendable, 'purchase', sellers, current.market, clubs)
    if (!target) continue
    const seller = target.player.teamId ? (current.teams.find((t) => t.id === target.player.teamId) as Team) : null
    const sellerSquad = seller ? (sellers.get(seller.id) ?? []) : []
    const listed = listingOf(current, target.player.id, 'purchase')
    if (seller && !sellerDecision({ seller, sellerSquad, player: target.player, fee: target.fee, kind: 'purchase', date, buyer: team, ...(listed ? { listedPrice: listed.price } : {}) }).accepted) continue

    const baseSalary = expectedSalary(target.player, team)
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
      contractEnd: contractEndOn(current.season.year + rng.int(minYears, maxYears)),
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
  clubs: ReadonlyMap<TeamId, Team>,
): TransferOffer | undefined {
  const userSquad = sellers.get(userTeamId) ?? []
  if (userSquad.length - 1 < MARKET.minSquadAfterSale) return undefined
  // Jogadores que o próprio jogador anunciou atraem mais propostas, pelo preço anunciado.
  const mine = state.market.listings.filter((l) => l.by === 'user' && l.teamId === userTeamId)
  const listing = mine.length > 0 && rng.chance(MARKET.listing.userBias) ? rng.pick(mine) : undefined
  const kind: OfferKind = listing ? (listing.kind === 'loan' ? 'loan' : 'purchase') : rng.chance(MARKET.ai.userLoanShare) ? 'loan' : 'purchase'
  // Empréstimo: jogador de rodízio ou sobra; compra: qualquer um.
  const pool = listing
    ? userSquad.filter((p) => p.id === listing.playerId)
    : userSquad.filter((p) => !p.contract.loanedFrom && p.teamId === userTeamId && (kind === 'purchase' || squadRole(p, userSquad) === 'rotation' || squadRole(p, userSquad) === 'surplus'))
  const target = bestTarget(rng, team, squad, pool, date, spendable, kind, sellers, state.market, clubs)
  if (!target) return undefined
  const user = state.teams.find((t) => t.id === userTeamId) as Team
  const samePosition = userSquad.filter((p) => p.position === target.player.position).length
  if (samePosition - 1 < (MARKET.minByPosition[target.player.position] ?? 1)) return undefined

  const [low, high] = MARKET.ai.userOfferFee
  const fee = listing ? listing.price : kind === 'loan' ? target.fee : Math.round((askingPrice(target.player, userSquad, date, user) * rng.float(low, high)) / 10_000) * 10_000
  if (fee > spendable) return undefined
  const salary = kind === 'loan' ? target.player.contract.salary : Math.max(expectedSalary(target.player, team), Math.round(target.player.contract.salary * 1.1))
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
    contractEnd: kind === 'loan' ? contractEndOn(state.season.year) : contractEndOn(state.season.year + rng.int(...MARKET.ai.contractYears)),
    createdOn: date,
    dueOn: lastDay < window.end ? lastDay : window.end,
    status: 'pending',
  }
}
