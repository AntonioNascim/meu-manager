/**
 * Contratos na virada de temporada: empréstimos voltam para o clube de origem, contratos que vencem
 * no fim do ano são renovados pela IA (quando o jogador ainda serve ao time) ou viram jogador livre.
 */
import { OFFSEASON } from '../config'
import { squadRole } from '../market/value'
import { playerOverall } from '../overall'
import type { Rng } from '../rng'
import { contractEndFor } from '../season/dates'
import { CORE_COUNTS, desiredSquadSize } from './squad'
import { renewalDecision, renewalDemand } from './renewal'
import type { DepartedPlayer, Player, PlayerId, Team, TeamId } from '../types'

/** Anos de um contrato novo, sorteados pela idade. */
export function contractYearsFor(rng: Rng, age: number): number {
  const [, range] = OFFSEASON.contracts.years.find(([maxAge]) => age <= maxAge) ?? OFFSEASON.contracts.years[OFFSEASON.contracts.years.length - 1]!
  return rng.int(range[0], range[1])
}

/** O contrato vence no fim de `year` (ou antes)? */
export const expiresBy = (player: Pick<Player, 'contract'>, year: number): boolean => Number(player.contract.endDate.slice(0, 4)) <= year

/** O clube da IA quer manter o jogador? Quem é importante no elenco ou é jovem promissor fica; sobra e veterano não. */
export function aiWantsToKeep(player: Player, squad: readonly Player[]): boolean {
  if (player.age > OFFSEASON.contracts.aiMaxAge) return false
  const role = squadRole(player, squad)
  if (role !== 'surplus') return true
  // Sobra só fica se o elenco precisa dela para cobrir a posição ou se é jovem com potencial.
  if (squad.filter((p) => p.position === player.position).length <= (CORE_COUNTS[player.position] ?? 2)) return true
  return player.age <= 21 && player.hidden.potential - playerOverall(player) >= 8
}

/** Contrato novo do jogador com o salário combinado e a duração sorteada pela idade. */
export function renewedContract(rng: Rng, player: Player, year: number, salary: number, split = false): Player['contract'] {
  return {
    salary,
    endDate: contractEndFor(year + contractYearsFor(rng, player.age), split),
    releaseClause: Math.round((salary * rng.int(24, 48)) / 1000) * 1000,
  }
}

export interface ExpireInput {
  players: Player[]
  teams: readonly Team[]
  /** Ano da temporada que acabou. */
  year: number
  /** A temporada atravessa o ano (contratos terminam em 30/6). */
  split?: boolean
  rng: Rng
  userTeamId?: TeamId
  /** Quais contratos vencem agora (padrão: os que terminam até o fim da temporada `year`, a regra da virada). */
  due?: (player: Player) => boolean
  /** Temporada de cada clube, quando os contratos de várias pirâmides vencem juntos (padrão: `year` e `split` para todos). */
  cycleOf?: (teamId: TeamId) => { year: number; split: boolean }
  /** Só os clubes deste conjunto têm contratos resolvidos e empréstimos devolvidos (a virada de um país); padrão: todos. */
  scope?: ReadonlySet<TeamId>
  /** Os empréstimos acabam e voltam para o clube de origem (padrão: sim, na virada). */
  returnLoans?: boolean
}

export interface ExpireResult {
  players: Player[]
  /** Quem virou jogador livre. */
  released: DepartedPlayer[]
  renewed: number
}

export function expireContracts(input: ExpireInput): ExpireResult {
  const { teams, year, rng, userTeamId } = input
  const due = input.due ?? ((p: Player) => p.contract.endDate <= contractEndFor(year, input.split ?? false))
  const inScope = (p: Player) => !input.scope || (p.teamId !== null && input.scope.has(p.teamId))
  // Empréstimos acabam: o jogador volta ao clube de origem, com o contrato que tinha lá.
  let players = input.players.map((p) => {
    const origin = p.contract.loanedFrom
    if (input.returnLoans === false || !origin || !inScope(p) || !teams.some((t) => t.id === origin)) return p
    const back = p.contract.loanOriginal ?? { salary: p.contract.salary, endDate: p.contract.endDate, releaseClause: p.contract.releaseClause }
    return { ...p, teamId: origin, contract: { ...back } }
  })

  const released: DepartedPlayer[] = []
  let renewed = 0
  const squads = new Map<TeamId, Player[]>()
  for (const p of players) if (p.teamId) (squads.get(p.teamId) ?? squads.set(p.teamId, []).get(p.teamId)!).push(p)

  const freed = new Set<PlayerId>()
  const renewals = new Map<PlayerId, Player['contract']>()
  const free = (p: Player) => {
    freed.add(p.id)
    released.push({ playerId: p.id, name: p.nickname ?? p.name, age: p.age, teamId: p.teamId })
  }
  const renew = (p: Player, salary: number) => {
    const cycle = p.teamId && input.cycleOf ? input.cycleOf(p.teamId) : { year, split: input.split ?? false }
    renewals.set(p.id, renewedContract(rng, p, cycle.year, salary, cycle.split))
    renewed++
  }
  for (const team of teams) {
    if (input.scope && !input.scope.has(team.id)) continue
    const squad = squads.get(team.id) ?? []
    const expiring = squad.filter(due)
    if (expiring.length === 0) continue
    if (team.id === userTeamId) {
      for (const p of expiring) free(p)
      continue
    }
    // A IA oferece o salário que o jogador pede (que pode ser menor que o atual, se ele caiu de nível).
    const accepts = (p: Player) => renewalDecision({ player: p, team, squad, salary: renewalDemand(p, team) }).accepted
    const wanted = expiring.filter((p) => aiWantsToKeep(p, squad)).sort((a, b) => playerOverall(b) - playerOverall(a))
    const others = expiring.filter((p) => !wanted.includes(p)).sort((a, b) => playerOverall(b) - playerOverall(a))
    let size = squad.length - expiring.length
    for (const p of wanted) {
      if (accepts(p)) {
        renew(p, renewalDemand(p, team))
        size++
      } else free(p)
    }
    // Reservas: ficam enquanto o elenco não chega ao tamanho que o clube quer (menos uma vaga para a base).
    for (const p of others) {
      if (size < desiredSquadSize(team.reputation) - 1 && p.age <= OFFSEASON.contracts.reserveMaxAge && accepts(p)) {
        renew(p, renewalDemand(p, team))
        size++
      } else free(p)
    }
  }
  players = players.map((p) => {
    const renewal = renewals.get(p.id)
    if (renewal) return { ...p, contract: renewal }
    return freed.has(p.id) ? { ...p, teamId: null } : p
  })
  return { players, released, renewed }
}
