/**
 * "Meu clube" numa liga online (Fase 6, B8.7): o que o técnico humano decide antes da virada de temporada, já que a virada o protege da IA
 * (`OffseasonOptions.humanTeamIds`): **renovar contratos** que vencem com a temporada e **decidir sobre os jovens de 20 anos da base**
 * (promover ou dispensar). Quem não decide perde o jogador (contrato) ou deixa a decisão para a regra da IA na virada seguinte (base).
 * Puro: recebe o mundo e devolve o mundo novo, sem relógio nem rede. Usa as mesmas regras do jogo solo (`renewUserContract`, `promoteYouth`).
 */
import { ACADEMY } from '../config'
import { AcademyError, academyOf, pendingDecisions, potentialStars, promoteYouth, releaseYouth, type PotentialStars } from '../academy'
import { OfferError } from '../market/offers'
import { expiringContracts, renewalDemand, renewUserContract } from '../offseason/renewal'
import { playerOverall } from '../overall'
import type { SeasonState } from '../season'
import { cycleOfTeam, seasonLabel } from '../season/cycles'
import type { BoardObjective, IsoDate, OfferReason, Player, PlayerId, SeasonRecord, TeamId } from '../types'

export interface ClubPlayer {
  playerId: PlayerId
  name: string
  position: string
  age: number
  overall: number
  salary: number
  endDate: IsoDate
  /** Salário que ele pede para ficar (contratos que vencem). */
  demand?: number
}

export interface ClubYouth {
  playerId: PlayerId
  name: string
  position: string
  age: number
  overall: number
  stars: PotentialStars
}

export interface ClubView {
  teamId: TeamId
  /** "2026" ou "2026/27": a temporada em que o clube está. */
  seasonLabel: string
  /** Último dia da temporada do clube (os contratos que vencem até ele saem na virada). */
  seasonEnd: IsoDate
  objective: BoardObjective
  squadSize: number
  payroll: number
  salaryBudget: number
  /** Contratos que vencem com esta temporada, os que vencem primeiro no começo. */
  expiring: ClubPlayer[]
  /** Jovens com 20 anos esperando decisão. */
  academyPending: ClubYouth[]
  academySize: number
  /** A temporada anterior (se já houve virada). */
  lastSeason?: SeasonRecord
}

const row = (p: Player, withDemand?: number): ClubPlayer => ({
  playerId: p.id,
  name: p.nickname ?? p.name,
  position: p.position,
  age: p.age,
  overall: Math.round(playerOverall(p)),
  salary: p.contract.salary,
  endDate: p.contract.endDate,
  ...(withDemand !== undefined ? { demand: withDemand } : {}),
})

export function clubView(world: SeasonState, teamId: TeamId): ClubView | undefined {
  const team = world.teams.find((t) => t.id === teamId)
  if (!team) return undefined
  const cycle = cycleOfTeam(world, teamId)
  const squad = world.players.filter((p) => p.teamId === teamId)
  const last = team.history.at(-1)
  return {
    teamId,
    seasonLabel: seasonLabel(cycle),
    seasonEnd: cycle.end,
    objective: team.objective,
    squadSize: squad.length,
    payroll: squad.reduce((s, p) => s + p.contract.salary, 0),
    salaryBudget: team.finances.salaryBudget,
    expiring: expiringContracts(world, teamId).map((p) => row(p, renewalDemand(p, team))),
    academyPending: pendingDecisions(world, teamId).map((p) => ({ playerId: p.id, name: p.nickname ?? p.name, position: p.position, age: p.age, overall: Math.round(playerOverall(p)), stars: potentialStars(p) })),
    academySize: academyOf(world, teamId).length,
    ...(last ? { lastSeason: last } : {}),
  }
}

export type ClubAction =
  | { type: 'renew'; playerId: PlayerId; years: number; salary?: number }
  | { type: 'promote'; playerId: PlayerId }
  | { type: 'release-youth'; playerId: PlayerId }

export type ClubError = OfferReason | 'not-found'
export type ClubResult = { ok: true; world: SeasonState } | { ok: false; error: ClubError; minimumSalary?: number }

/** No máximo isto vezes o que ele pede: o técnico pode pagar mais, mas não vale um salário absurdo. */
const MAX_SALARY_OVER_DEMAND = 3

export function applyClubAction(world: SeasonState, teamId: TeamId, action: ClubAction): ClubResult {
  const team = world.teams.find((t) => t.id === teamId)
  if (!team) return { ok: false, error: 'not-found' }
  try {
    if (action.type === 'renew') {
      const player = world.players.find((p) => p.id === action.playerId)
      if (!player || player.teamId !== teamId) return { ok: false, error: 'unavailable' }
      const demand = renewalDemand(player, team)
      const salary = action.salary ?? demand
      if (!Number.isFinite(salary) || salary <= 0 || salary > demand * MAX_SALARY_OVER_DEMAND) return { ok: false, error: 'invalid' }
      const r = renewUserContract(world, teamId, { playerId: action.playerId, salary: Math.round(salary), years: action.years })
      return r.accepted ? { ok: true, world: r.state } : { ok: false, error: r.reason ?? 'salary', ...(r.minimumSalary !== undefined ? { minimumSalary: r.minimumSalary } : {}) }
    }
    const youth = world.academy.find((p) => p.id === action.playerId)
    if (!youth || youth.teamId !== teamId) return { ok: false, error: 'not-found' }
    if (youth.age < ACADEMY.graduationAge) return { ok: false, error: 'not-eligible' }
    return { ok: true, world: action.type === 'promote' ? promoteYouth(world, action.playerId) : releaseYouth(world, action.playerId) }
  } catch (e) {
    if (e instanceof OfferError) return { ok: false, error: e.code }
    if (e instanceof AcademyError) return { ok: false, error: e.code === 'squad-full' ? 'squad-full' : e.code === 'foreign-limit' ? 'foreign-limit' : 'not-found' }
    throw e
  }
}
