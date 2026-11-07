/**
 * Comandos do técnico numa liga online (Fase 6C, C2). Cada ação do técnico no jogo é um `LeagueCommand`: o aparelho a aplica na hora no espelho
 * e o servidor a valida e aplica no mundo oficial com **a mesma função** (`applyCommand`), sobre `SeasonState`. As funções de `store/game.ts` do
 * jogo solo já eram `(estado, time, argumentos) -> estado`; aqui só são reunidas, com validação estrita do corpo (lista fechada de campos).
 * Puro: sem relógio, rede nem sorteio fora da semente do estado.
 */
import { AcademyError } from '../academy'
import { cancelIndividualTraining, startIndividualTraining, setTrainingPlan, TrainingError } from '../training'
import { lineupForeignCount } from '../foreign'
import { monthlyPayroll, setSalaryBudget, setTicketPrice } from '../finance'
import { listUserPlayer, ListingError, unlistUserPlayer } from '../market/listings'
import { OfferError } from '../market/offers'
import { releaseUserPlayer } from '../market/sell'
import { setTeamTactic } from '../season/advance'
import type { SeasonState } from '../season'
import { isGridPoint } from '../grid'
import { applyClubAction, type ClubAction } from './club'
import { POSITIONS, TRAINING_FOCUSES, TRAINING_GROUPS, TRAINING_INTENSITIES } from '../types'
import type { GridPoint, IndividualGoal, Mentality, PlayStyle, Tactic, TeamId, TrainingGroup, TrainingPlan } from '../types'

export type LeagueCommand =
  | { type: 'tactic'; tactic: Tactic }
  | { type: 'training-plan'; plan: TrainingPlan }
  | { type: 'individual-training'; playerId: string; goal: IndividualGoal }
  | { type: 'cancel-individual-training' }
  | { type: 'ticket-price'; price: number }
  | { type: 'salary-budget'; salary: number }
  | { type: 'list-player'; playerId: string; kind: 'transfer' | 'loan'; price: number }
  | { type: 'unlist-player'; playerId: string }
  | { type: 'release-player'; playerId: string }
  | { type: 'club'; action: ClubAction }

export type CommandError = 'invalid' | 'not-found' | 'busy' | 'squad-full' | 'foreign-limit' | 'refused' | 'salary' | string
export type CommandResult = { ok: true; world: SeasonState } | { ok: false; error: CommandError; minimumSalary?: number }

const STYLES: readonly PlayStyle[] = ['possession', 'counter-attack', 'high-press']
const MENTALITIES: readonly Mentality[] = [-2, -1, 0, 1, 2]
const ID = /^[A-Za-z0-9_.:-]{1,64}$/
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isIds = (v: unknown, min: number, max: number): v is string[] => Array.isArray(v) && v.length >= min && v.length <= max && v.every(isId)
/** Só estes campos (e nenhum outro) vêm no corpo. */
const only = (o: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(o).every((k) => keys.includes(k))
const money = (v: unknown, max = 5_000_000_000): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max

function parseTactic(v: unknown): Tactic | undefined {
  if (!isObj(v) || !only(v, ['formationId', 'grid', 'style', 'mentality', 'startingXI', 'bench', 'captainId', 'penaltyTakerIds', 'freeKickTakerIds'])) return undefined
  if (typeof v.formationId !== 'string' || v.formationId.length > 16 || !STYLES.includes(v.style as PlayStyle) || !MENTALITIES.includes(v.mentality as Mentality)) return undefined
  if (!isIds(v.startingXI, 11, 11) || !isIds(v.bench, 0, 12) || !isId(v.captainId) || !isIds(v.penaltyTakerIds, 0, 11) || !isIds(v.freeKickTakerIds, 0, 11)) return undefined
  let grid: GridPoint[] | undefined
  if (v.grid !== undefined) {
    if (!Array.isArray(v.grid) || v.grid.length !== 11) return undefined
    grid = []
    for (const p of v.grid) {
      if (!isObj(p) || !only(p, ['row', 'lane']) || typeof p.row !== 'number' || typeof p.lane !== 'number') return undefined
      const point = { row: p.row, lane: p.lane }
      if (!isGridPoint(point)) return undefined
      grid.push(point)
    }
  }
  return { formationId: v.formationId, ...(grid ? { grid } : {}), style: v.style as PlayStyle, mentality: v.mentality as Mentality, startingXI: v.startingXI, bench: v.bench, captainId: v.captainId, penaltyTakerIds: v.penaltyTakerIds, freeKickTakerIds: v.freeKickTakerIds }
}

function parseGoal(v: unknown): IndividualGoal | undefined {
  if (!isObj(v)) return undefined
  if (v.type === 'group' && only(v, ['type', 'group']) && TRAINING_GROUPS.includes(v.group as never)) return { type: 'group', group: v.group as TrainingGroup }
  if (v.type === 'position' && only(v, ['type', 'position']) && POSITIONS.includes(v.position as never)) return { type: 'position', position: v.position as never }
  return undefined
}

function parseClub(v: unknown): ClubAction | undefined {
  if (!isObj(v)) return undefined
  if (v.type === 'renew' && only(v, ['type', 'playerId', 'years', 'salary']) && isId(v.playerId) && Number.isInteger(v.years) && (v.years as number) >= 1 && (v.years as number) <= 5 && (v.salary === undefined || money(v.salary)))
    return { type: 'renew', playerId: v.playerId, years: v.years as number, ...(v.salary !== undefined ? { salary: v.salary as number } : {}) }
  if ((v.type === 'promote' || v.type === 'release-youth') && only(v, ['type', 'playerId']) && isId(v.playerId)) return { type: v.type, playerId: v.playerId }
  return undefined
}

/** Valida o corpo de um comando (lista fechada de tipos e campos). `undefined` = corpo inválido. */
export function parseCommand(raw: unknown): LeagueCommand | undefined {
  if (!isObj(raw) || typeof raw.type !== 'string') return undefined
  switch (raw.type) {
    case 'tactic': {
      const tactic = only(raw, ['type', 'tactic']) ? parseTactic(raw.tactic) : undefined
      return tactic ? { type: 'tactic', tactic } : undefined
    }
    case 'training-plan': {
      const p = raw.plan
      if (!only(raw, ['type', 'plan']) || !isObj(p) || !only(p, ['intensity', 'focus']) || !TRAINING_INTENSITIES.includes(p.intensity as never) || !TRAINING_FOCUSES.includes(p.focus as never)) return undefined
      return { type: 'training-plan', plan: { intensity: p.intensity as TrainingPlan['intensity'], focus: p.focus as TrainingPlan['focus'] } }
    }
    case 'individual-training': {
      const goal = only(raw, ['type', 'playerId', 'goal']) ? parseGoal(raw.goal) : undefined
      return goal && isId(raw.playerId) ? { type: 'individual-training', playerId: raw.playerId, goal } : undefined
    }
    case 'cancel-individual-training':
      return only(raw, ['type']) ? { type: 'cancel-individual-training' } : undefined
    case 'ticket-price':
      return only(raw, ['type', 'price']) && money(raw.price, 100_000) ? { type: 'ticket-price', price: raw.price } : undefined
    case 'salary-budget':
      return only(raw, ['type', 'salary']) && money(raw.salary) ? { type: 'salary-budget', salary: raw.salary } : undefined
    case 'list-player':
      return only(raw, ['type', 'playerId', 'kind', 'price']) && isId(raw.playerId) && (raw.kind === 'transfer' || raw.kind === 'loan') && money(raw.price) && raw.price > 0 ? { type: 'list-player', playerId: raw.playerId, kind: raw.kind, price: raw.price } : undefined
    case 'unlist-player':
    case 'release-player':
      return only(raw, ['type', 'playerId']) && isId(raw.playerId) ? { type: raw.type, playerId: raw.playerId } : undefined
    case 'club': {
      const action = only(raw, ['type', 'action']) ? parseClub(raw.action) : undefined
      return action ? { type: 'club', action } : undefined
    }
    default:
      return undefined
  }
}

/** Aplica o comando ao mundo do clube `teamId`. Nunca lança por regra do jogo: devolve o motivo. */
export function applyCommand(world: SeasonState, teamId: TeamId, command: LeagueCommand): CommandResult {
  const team = world.teams.find((t) => t.id === teamId)
  if (!team) return { ok: false, error: 'not-found' }
  try {
    switch (command.type) {
      case 'tactic': {
        const max = team.foreignLimit?.lineup
        if (max !== undefined) {
          const squad = world.players.filter((p) => p.teamId === teamId)
          const now = lineupForeignCount(command.tactic, squad, team)
          if (now > max && now > lineupForeignCount(team.tactic, squad, team)) return { ok: false, error: 'foreign-limit' }
        }
        return { ok: true, world: setTeamTactic(world, teamId, command.tactic) }
      }
      case 'training-plan':
        return { ok: true, world: setTrainingPlan(world, teamId, command.plan) }
      case 'individual-training':
        return { ok: true, world: startIndividualTraining(world, teamId, command.playerId, command.goal) }
      case 'cancel-individual-training':
        return { ok: true, world: cancelIndividualTraining(world, teamId) }
      case 'ticket-price': {
        const next = setTicketPrice(team, command.price)
        return { ok: true, world: { ...world, teams: world.teams.map((t) => (t.id === teamId ? next : t)) } }
      }
      case 'salary-budget': {
        const payroll = monthlyPayroll(world.players.filter((p) => p.teamId === teamId))
        const next = setSalaryBudget(team, command.salary, payroll)
        return { ok: true, world: { ...world, teams: world.teams.map((t) => (t.id === teamId ? next : t)) } }
      }
      case 'list-player':
        return { ok: true, world: listUserPlayer(world, teamId, command.playerId, command.kind, command.price) }
      case 'unlist-player':
        return { ok: true, world: unlistUserPlayer(world, teamId, command.playerId) }
      case 'release-player':
        return { ok: true, world: releaseUserPlayer(world, teamId, command.playerId) }
      case 'club': {
        const r = applyClubAction(world, teamId, command.action)
        return r.ok ? r : { ok: false, error: r.error, ...(r.minimumSalary !== undefined ? { minimumSalary: r.minimumSalary } : {}) }
      }
    }
  } catch (e) {
    if (e instanceof OfferError) return { ok: false, error: e.code }
    if (e instanceof AcademyError) return { ok: false, error: e.code }
    if (e instanceof TrainingError) return { ok: false, error: e.code }
    if (e instanceof ListingError) return { ok: false, error: e.code }
    // Escalação inválida e outras regras que o motor sinaliza com Error comum.
    if (e instanceof Error) return { ok: false, error: 'invalid' }
    throw e
  }
}
