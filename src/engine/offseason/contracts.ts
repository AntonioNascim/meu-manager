/**
 * Contratos na virada de temporada: empréstimos voltam para o clube de origem, contratos que vencem
 * no fim do ano são renovados pela IA (quando o jogador ainda serve ao time) ou viram jogador livre.
 */
import { OFFSEASON } from '../config'
import { expectedSalary, squadRole } from '../market/value'
import { playerOverall } from '../overall'
import type { Rng } from '../rng'
import { makeDate } from '../season/dates'
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
  if (role === 'key' || role === 'starter') return true
  if (role === 'rotation') return player.age <= 33
  return player.age <= 21 && player.hidden.potential - playerOverall(player) >= 8
}

/** Contrato novo do jogador pelo salário de mercado (a IA nunca baixa o salário de quem renova). */
export function renewedContract(rng: Rng, player: Player, year: number, salary: number = Math.max(player.contract.salary, expectedSalary(player))): Player['contract'] {
  return {
    salary,
    endDate: makeDate(year + contractYearsFor(rng, player.age), 12, 31),
    releaseClause: Math.round((salary * rng.int(24, 48)) / 1000) * 1000,
  }
}

export interface ExpireInput {
  players: Player[]
  teams: readonly Team[]
  /** Ano da temporada que acabou. */
  year: number
  rng: Rng
  userTeamId?: TeamId
}

export interface ExpireResult {
  players: Player[]
  /** Quem virou jogador livre. */
  released: DepartedPlayer[]
  renewed: number
}

export function expireContracts(input: ExpireInput): ExpireResult {
  const { teams, year, rng, userTeamId } = input
  // Empréstimos acabam: o jogador volta ao clube de origem, com o contrato que tinha lá.
  let players = input.players.map((p) => {
    const origin = p.contract.loanedFrom
    if (!origin || !teams.some((t) => t.id === origin)) return p
    const back = p.contract.loanOriginal ?? { salary: p.contract.salary, endDate: p.contract.endDate, releaseClause: p.contract.releaseClause }
    return { ...p, teamId: origin, contract: { ...back } }
  })

  const released: DepartedPlayer[] = []
  let renewed = 0
  const squads = new Map<TeamId, Player[]>()
  for (const p of players) if (p.teamId) (squads.get(p.teamId) ?? squads.set(p.teamId, []).get(p.teamId)!).push(p)

  const freed = new Set<PlayerId>()
  const renewals = new Map<PlayerId, Player['contract']>()
  for (const p of players) {
    if (!p.teamId || !expiresBy(p, year)) continue
    if (p.teamId !== userTeamId && aiWantsToKeep(p, squads.get(p.teamId) ?? [])) {
      renewals.set(p.id, renewedContract(rng, p, year))
      renewed++
    } else {
      freed.add(p.id)
      released.push({ playerId: p.id, name: p.nickname ?? p.name, age: p.age, teamId: p.teamId })
    }
  }
  players = players.map((p) => {
    const renewal = renewals.get(p.id)
    if (renewal) return { ...p, contract: renewal }
    return freed.has(p.id) ? { ...p, teamId: null } : p
  })
  return { players, released, renewed }
}
