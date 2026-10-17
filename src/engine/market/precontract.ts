/**
 * Pré-contrato: no último ano de contrato, a partir do meio da temporada, um jogador pode combinar com outro clube
 * e chegar de graça na virada, se aceitar pelas mesmas regras de interesse das propostas (`playerDecision`).
 * O jogador e a IA fazem pré-contratos; a IA com moderação (poucos por clube e por temporada). O contrato novo só
 * passa a valer na virada de temporada (`applyPreContracts`).
 */
import { MARKET } from '../config'
import { monthlyPayroll } from '../finance'
import { overallAt } from '../overall'
import { createRng } from '../rng'
import type { Rng } from '../rng'
import type { SeasonState } from '../season/calendar'
import { contractEndOn, makeDate } from '../season/dates'
import { actsThisRound, quickTeamIds } from '../season/fidelity'
import { SQUAD_MAX } from '../types'
import type { IsoDate, OfferReason, Player, PlayerId, PreContract, Team, TeamId } from '../types'
import { playerDecision } from './decision'
import { needsOf } from './ai'
import { OfferError } from './offers'
import { isLastContractYear } from './search'
import { expectedSalary } from './value'

const teamOf = (state: SeasonState, id: TeamId) => state.teams.find((t) => t.id === id) as Team

/** Primeiro dia em que o jogador pode assinar pré-contrato: `windowMonths` meses antes do fim do contrato dele (ex.: contrato até 31/12, abre em 1º de julho). */
export function preContractOpensOn(endDate: IsoDate): IsoDate {
  const [year, month] = endDate.split('-').map(Number) as [number, number]
  const open = month - (MARKET.preContract.windowMonths - 1)
  return open >= 1 ? makeDate(year, open, 1) : makeDate(year - 1, open + 12, 1)
}

/** O jogador está nos últimos meses do contrato (e o contrato ainda não acabou)? */
export const inPreContractWindow = (player: Pick<Player, 'contract'>, date: IsoDate): boolean => date >= preContractOpensOn(player.contract.endDate) && date <= player.contract.endDate

/** O período de pré-contratos do calendário da liga já abriu (os contratos terminam em `SEASON.contractEnd`)? */
export const preContractsOpen = (state: Pick<SeasonState, 'season'>, date: IsoDate = state.season.currentDate): boolean => date >= preContractOpensOn(contractEndOn(state.season.year))

export const preContractOf = (state: Pick<SeasonState, 'market'>, playerId: PlayerId): PreContract | undefined => state.market.preContracts.find((c) => c.playerId === playerId)

/** O jogador pode assinar um pré-contrato com outro clube agora? */
export function canPreContract(state: SeasonState, player: Player, date: IsoDate = state.season.currentDate): boolean {
  return inPreContractWindow(player, date) && player.teamId !== null && !player.contract.loanedFrom && !preContractOf(state, player.id)
}

/** Jogadores do clube que continuam no ano que vem (contrato depois do fim desta temporada), mais os que chegam por pré-contrato. */
function nextSeasonSquad(state: SeasonState, teamId: TeamId): Player[] {
  const year = state.season.year
  const keeps = state.players.filter((p) => p.teamId === teamId && !isLastContractYear(p, year))
  const arriving = state.market.preContracts.filter((c) => c.toTeamId === teamId).map((c) => state.players.find((p) => p.id === c.playerId)).filter((p): p is Player => p !== undefined)
  return [...keeps, ...arriving]
}

/** Quanto o clube já se comprometeu a pagar por mês no ano que vem (quem fica e quem chega). */
function committedPayroll(state: SeasonState, teamId: TeamId): number {
  const year = state.season.year
  const keeps = state.players.filter((p) => p.teamId === teamId && !isLastContractYear(p, year))
  const incoming = state.market.preContracts.filter((c) => c.toTeamId === teamId).reduce((sum, c) => sum + c.salary, 0)
  return monthlyPayroll(keeps) + incoming
}

/** O clube comprador pode assumir o pré-contrato (vaga no elenco do ano que vem e orçamento de salários)? */
export function preContractBuyerCheck(state: SeasonState, buyerId: TeamId, salary: number): OfferReason | null {
  if (nextSeasonSquad(state, buyerId).length >= Math.min(SQUAD_MAX - 1, MARKET.maxSquadBeforeSigning)) return 'squad-full'
  if (committedPayroll(state, buyerId) + salary > teamOf(state, buyerId).finances.salaryBudget) return 'salary-budget'
  return null
}

export interface PreContractOffer {
  salary: number
  years: number
}

export interface PreContractResult {
  state: SeasonState
  accepted: boolean
  reason?: OfferReason
  /** Salário mínimo que o jogador aceitaria, quando recusa pelo salário. */
  minimumSalary?: number
}

/** Quanto tempo de contrato (anos) o pré-contrato pode ter. */
export const PRE_CONTRACT_YEARS = [1, 2, 3, 4, 5] as const

function sign(state: SeasonState, player: Player, buyerId: TeamId, offer: PreContractOffer, date: IsoDate): SeasonState {
  const contract: PreContract = { playerId: player.id, fromTeamId: player.teamId as TeamId, toTeamId: buyerId, salary: offer.salary, years: offer.years, signedOn: date }
  return { ...state, market: { ...state.market, preContracts: [...state.market.preContracts, contract] } }
}

/** O time `buyerId` propõe um pré-contrato; o jogador responde na hora pelas regras de interesse. */
export function offerPreContract(state: SeasonState, buyerId: TeamId, playerId: PlayerId, offer: PreContractOffer, date: IsoDate = state.season.currentDate): PreContractResult {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || !Number.isFinite(offer.salary) || offer.salary <= 0 || !PRE_CONTRACT_YEARS.includes(offer.years as 1)) throw new OfferError('invalid')
  if (player.teamId === buyerId) throw new OfferError('own-player')
  if (!canPreContract(state, player, date)) throw new OfferError('not-eligible')
  const problem = preContractBuyerCheck(state, buyerId, offer.salary)
  if (problem) return { state, accepted: false, reason: problem }
  const buyer = teamOf(state, buyerId)
  const from = teamOf(state, player.teamId as TeamId)
  const verdict = playerDecision({
    player,
    buyer,
    buyerSquad: state.players.filter((p) => p.teamId === buyerId),
    from,
    fromSquad: state.players.filter((p) => p.teamId === from.id),
    salary: offer.salary,
    kind: 'purchase',
  })
  if (!verdict.accepted) return { state, accepted: false, ...(verdict.reason ? { reason: verdict.reason } : {}), ...(verdict.minimumSalary !== null ? { minimumSalary: verdict.minimumSalary } : {}) }
  return { state: sign(state, player, buyerId, offer, date), accepted: true }
}

export interface PreContractTick {
  state: SeasonState
  /** Jogadores do time do jogador que assinaram com outro clube (para avisar). */
  lost: PreContract[]
}

/** Uma rodada de pré-contratos da IA: poucos clubes, um por clube, e ninguém perde mais que o limite por temporada. */
export function runPreContractTick(state: SeasonState, date: IsoDate, userTeamId?: TeamId): PreContractTick {
  const P = MARKET.preContract.ai
  const rng = createRng(`${state.market.seed}:${date}:pre-contracts`)
  let current = state
  const lost: PreContract[] = []
  if (!preContractsOpen(state, date)) return { state, lost }
  const quick = quickTeamIds(state)
  for (const base of rng.shuffle(state.teams)) {
    if (base.id === userTeamId || !actsThisRound(quick, base.id, date) || !rng.chance(P.chance)) continue
    if (current.market.preContracts.filter((c) => c.toTeamId === base.id).length >= P.maxPerClub) continue
    const made = pickTarget(current, base.id, date, rng)
    if (!made) continue
    const before = current.market.preContracts.length
    const result = offerPreContract(current, base.id, made.player.id, { salary: made.salary, years: made.years }, date)
    current = result.state
    if (result.accepted && current.market.preContracts.length > before && made.player.teamId === userTeamId) lost.push(current.market.preContracts[current.market.preContracts.length - 1] as PreContract)
  }
  return { state: current, lost }
}

function pickTarget(state: SeasonState, buyerId: TeamId, date: IsoDate, rng: Rng): { player: Player; salary: number; years: number } | undefined {
  const P = MARKET.preContract.ai
  const buyer = teamOf(state, buyerId)
  const squad = nextSeasonSquad(state, buyerId)
  const needs = needsOf(buyer, squad)
  const losses = new Map<TeamId, number>()
  for (const c of state.market.preContracts) losses.set(c.fromTeamId, (losses.get(c.fromTeamId) ?? 0) + 1)
  let best: { player: Player; salary: number; score: number } | undefined
  // Mesmas condições de `canPreContract`, com o que não muda de jogador para jogador calculado uma vez só.
  if (!preContractsOpen(state, date)) return undefined
  const signed = new Set(state.market.preContracts.map((c) => c.playerId))
  for (const p of state.players) {
    if (p.teamId === buyerId || p.teamId === null || p.contract.loanedFrom || !inPreContractWindow(p, date) || signed.has(p.id) || p.age > MARKET.ai.maxAge) continue
    if ((losses.get(p.teamId as TeamId) ?? 0) >= P.maxLossPerClub) continue
    const need = needs.find((n) => n.position === p.position)
    if (!need) continue
    const gain = overallAt(p, p.position) - need.weakest
    if (gain < MARKET.ai.minUpgrade + P.extraUpgrade) continue
    const salary = Math.ceil(expectedSalary(p, buyer) / 500) * 500
    const score = gain + rng.float(-1, 1)
    if (!best || score > best.score) best = { player: p, salary, score }
  }
  if (!best) return undefined
  const [minYears, maxYears] = MARKET.ai.contractYears
  return { player: best.player, salary: best.salary, years: Math.max(2, rng.int(minYears, maxYears)) }
}

export interface AppliedPreContract {
  playerId: PlayerId
  fromTeamId: TeamId
  toTeamId: TeamId
}

/**
 * Na virada: quem assinou pré-contrato muda de clube com o contrato combinado (de graça). O pré-contrato cai se o
 * jogador já saiu do clube, se o contrato dele não vence mais ou se o comprador ficou sem vaga no elenco.
 */
export function applyPreContracts(players: readonly Player[], preContracts: readonly PreContract[], year: number, due: (player: Player) => boolean = (p) => isLastContractYear(p, year)): { players: Player[]; applied: AppliedPreContract[] } {
  const applied: AppliedPreContract[] = []
  const byId = new Map(players.map((p) => [p.id, p]))
  const stays = new Map<TeamId, number>()
  for (const p of players) if (p.teamId && !due(p)) stays.set(p.teamId, (stays.get(p.teamId) ?? 0) + 1)
  const moved = new Map<PlayerId, Player>()
  for (const c of preContracts) {
    const p = byId.get(c.playerId)
    if (!p || p.teamId !== c.fromTeamId || !due(p)) continue
    if ((stays.get(c.toTeamId) ?? 0) >= SQUAD_MAX - 1) continue
    stays.set(c.toTeamId, (stays.get(c.toTeamId) ?? 0) + 1)
    moved.set(p.id, { ...p, teamId: c.toTeamId, contract: { salary: c.salary, endDate: contractEndOn(year + c.years), releaseClause: Math.round((c.salary * 36) / 1000) * 1000 } })
    applied.push({ playerId: p.id, fromTeamId: c.fromTeamId, toTeamId: c.toTeamId })
  }
  return { players: players.map((p) => moved.get(p.id) ?? p), applied }
}

/** Jogadores livres de contrato no ano que vem que o time do jogador acertou (chegam) e os seus que vão embora. */
export function userPreContracts(state: Pick<SeasonState, 'market'>, userTeamId: TeamId): { arriving: PreContract[]; leaving: PreContract[] } {
  return { arriving: state.market.preContracts.filter((c) => c.toTeamId === userTeamId), leaving: state.market.preContracts.filter((c) => c.fromTeamId === userTeamId) }
}
