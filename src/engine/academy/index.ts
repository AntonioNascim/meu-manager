/**
 * Categorias de base: cada clube tem um elenco de jovens (15 a 19 anos, até 15) separado do profissional.
 * Eles não jogam partidas; evoluem na virada de temporada. Quem faz 20 anos precisa ser promovido ou dispensado.
 * Aqui ficam as regras puras (estrelas de potencial, promoção, dispensa, decisão da IA); a virada de temporada
 * da base está em `turn.ts`.
 */
import { ACADEMY, OFFSEASON } from '../config'
import { foreignCount, squadForeignBlocked } from '../foreign'
import { salaryScale } from '../economy'
import { expectedSalary } from '../market/value'
import type { PricingClub } from '../market/value'
import { playerOverall } from '../overall'
import { createRng } from '../rng'
import { contractEndFor } from '../season/dates'
import { cycleOfTeam } from '../season/cycles'
import type { SeasonState } from '../season/calendar'
import { SQUAD_MAX } from '../types'
import type { Player, PlayerId, TeamId } from '../types'

export type PotentialStars = 1 | 2 | 3 | 4 | 5

export class AcademyError extends Error {
  constructor(
    readonly code: 'squad-full' | 'not-found' | 'foreign-limit',
    message: string,
  ) {
    super(message)
  }
}

export const academyOf = (state: Pick<SeasonState, 'academy'>, teamId: TeamId): Player[] => state.academy.filter((p) => p.teamId === teamId)

/** Jovens que já fizeram 20 anos e esperam a decisão do jogador. */
export const pendingDecisions = (state: Pick<SeasonState, 'academy'>, teamId: TeamId): Player[] => academyOf(state, teamId).filter((p) => p.age >= ACADEMY.graduationAge)

/**
 * Estimativa do potencial em estrelas (1 a 5). O potencial de verdade é oculto: a estimativa soma um erro
 * que diminui com a idade (o olheiro erra mais com quem tem 15 anos) e é sempre a mesma para o mesmo jogador
 * na mesma idade, para a tela não mudar a cada abertura.
 */
export function potentialStars(player: Pick<Player, 'id' | 'age' | 'hidden'>): PotentialStars {
  const S = ACADEMY.stars
  const t = Math.max(0, Math.min(1, (player.age - ACADEMY.minAge) / (ACADEMY.graduationAge - 1 - ACADEMY.minAge)))
  const sd = S.uncertaintyAt15 + (S.uncertaintyAt19 - S.uncertaintyAt15) * t
  const estimate = player.hidden.potential + createRng(`${player.id}:${player.age}:stars`).normal(0, sd)
  return (1 + S.thresholds.filter((limit) => estimate >= limit).length) as PotentialStars
}

/** Salário do primeiro contrato profissional de um jovem. */
export const youthSalary = (player: Player, club?: PricingClub): number => Math.max(club && salaryScale(club) < 1 ? Math.round(OFFSEASON.renewal.minimumSalary * salaryScale(club)) : OFFSEASON.renewal.minimumSalary, Math.round((expectedSalary(player, club) * ACADEMY.salaryShare) / 1_000) * 1_000)

/** O jovem como jogador do elenco profissional, com contrato de jovem. `year` = ano em que a temporada começa/está em andamento. */
export function toProfessional(player: Player, year: number, club?: PricingClub, split = false): Player {
  const salary = youthSalary(player, club)
  return { ...player, contract: { salary, endDate: contractEndFor(year + ACADEMY.contractYears, split), releaseClause: salary * 36 } }
}

/** Valor do jovem para a IA: força de hoje mais parte da margem até o potencial. */
export const youthValue = (p: Player): number => playerOverall(p) + ACADEMY.ai.potentialShare * Math.max(0, p.hidden.potential - playerOverall(p))

/** A IA acha que o jovem já vale um lugar no elenco: o valor dele alcança o do jogador que ocupa a posição de referência do ranking do clube. */
export function worthPromoting(player: Player, squad: readonly Player[]): boolean {
  if (squad.length === 0) return true
  const ranked = squad.map(youthValue).sort((a, b) => b - a)
  const benchmark = ranked[Math.min(ACADEMY.ai.benchmarkRank, ranked.length) - 1] as number
  return youthValue(player) >= benchmark - ACADEMY.ai.tolerance
}

const find = (state: SeasonState, id: PlayerId): Player => {
  const p = state.academy.find((x) => x.id === id)
  if (!p) throw new AcademyError('not-found', 'Jovem não encontrado na base')
  return p
}

/** Promove um jovem da base ao elenco profissional (lança `AcademyError('squad-full')` se o elenco já tem 30 e `'foreign-limit'` se ele é estrangeiro e o elenco já está no limite da liga). */
export function promoteYouth(state: SeasonState, playerId: PlayerId): SeasonState {
  const youth = find(state, playerId)
  const team = state.teams.find((t) => t.id === youth.teamId)
  if (!team) throw new AcademyError('not-found', 'Clube não encontrado')
  if (state.players.filter((p) => p.teamId === team.id).length >= SQUAD_MAX) throw new AcademyError('squad-full', `O elenco profissional já tem ${SQUAD_MAX} jogadores`)
  const squad = state.players.filter((p) => p.teamId === team.id)
  if (squadForeignBlocked(team, squad, youth)) throw new AcademyError('foreign-limit', `Limite de estrangeiros da liga: o elenco já tem ${foreignCount(squad, team)} (máximo ${team.foreignLimit?.squad}) e ${youth.name} é estrangeiro. Dispense ou venda um estrangeiro antes, ou dispense o jovem.`)
  const cycle = cycleOfTeam(state, team.id)
  return {
    ...state,
    academy: state.academy.filter((p) => p.id !== playerId),
    players: [...state.players, toProfessional(youth, cycle.year, team, cycle.split)],
    teams: state.teams.map((t) => (t.id === team.id ? { ...t, squad: [...t.squad, playerId] } : t)),
  }
}

/** Dispensa um jovem da base: ele sai do clube e do jogo (não vai para o mercado). */
export function releaseYouth(state: SeasonState, playerId: PlayerId): SeasonState {
  find(state, playerId)
  return { ...state, academy: state.academy.filter((p) => p.id !== playerId) }
}

export * from './turn'
