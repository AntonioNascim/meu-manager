/**
 * Ficha de um clube na escolha de carreira (só leitura): meta da diretoria, estádio, orçamento contra os da mesma liga, elenco que o técnico herda
 * (nível dos onze, idade, estrangeiros, destaques) e o ponto forte e o fraco por setor.
 */
import { playerOverall } from '../../../engine/overall'
import type { Player, Position, Team } from '../../../engine/types'

export type StartSector = 'goalkeeper' | 'defence' | 'midfield' | 'attack'

const SECTOR_OF: Record<Position, StartSector> = { GK: 'goalkeeper', RB: 'defence', LB: 'defence', CB: 'defence', DM: 'midfield', CM: 'midfield', AM: 'midfield', RW: 'attack', LW: 'attack', ST: 'attack' }
const TAKE: Record<StartSector, number> = { goalkeeper: 1, defence: 4, midfield: 3, attack: 3 }
export const START_SECTORS: readonly StartSector[] = ['goalkeeper', 'defence', 'midfield', 'attack']

export interface ClubReport {
  team: Team
  /** Clubes da mesma liga (país e divisão), incluindo este. */
  leagueSize: number
  /** Posição do orçamento de compras e da força dos onze entre eles (1 = o maior / o mais forte). */
  budgetRank: number
  strengthRank: number
  squadSize: number
  /** Força média dos onze, idade média do elenco e dos onze, estrangeiros. */
  starters: number
  averageAge: number
  startersAge: number
  foreigners: number
  best: { player: Player; overall: number }[]
  sectors: Record<StartSector, number>
  strongest: StartSector
  weakest: StartSector
}

export function clubReport(world: { teams: readonly Team[]; players: readonly Player[] }, teamId: string): ClubReport | undefined {
  const team = world.teams.find((t) => t.id === teamId)
  if (!team) return undefined
  const byId = new Map(world.players.map((p) => [p.id, p]))
  const home = team.country ?? 'Brazil'
  const startersOf = (t: Team) => t.tactic.startingXI.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined)
  const strengthOf = (t: Team) => {
    const xi = startersOf(t)
    return xi.reduce((s, p) => s + playerOverall(p), 0) / Math.max(1, xi.length)
  }
  const league = world.teams.filter((t) => t.tier === team.tier && (t.country ?? 'Brazil') === home)
  const squad = world.players.filter((p) => p.teamId === teamId)
  const xi = startersOf(team)
  const mean = (list: readonly number[]) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length)
  const sectors = {} as Record<StartSector, number>
  for (const s of START_SECTORS) sectors[s] = mean(squad.filter((p) => SECTOR_OF[p.position] === s).map((p) => playerOverall(p)).sort((a, b) => b - a).slice(0, TAKE[s]))
  const ranked = [...START_SECTORS].sort((a, b) => sectors[b] - sectors[a])
  return {
    team,
    leagueSize: league.length,
    budgetRank: 1 + league.filter((t) => t.finances.transferBudget > team.finances.transferBudget).length,
    strengthRank: 1 + league.filter((t) => strengthOf(t) > strengthOf(team)).length,
    squadSize: squad.length,
    starters: strengthOf(team),
    averageAge: mean(squad.map((p) => p.age)),
    startersAge: mean(xi.map((p) => p.age)),
    foreigners: squad.filter((p) => p.nationality !== home).length,
    best: [...squad].sort((a, b) => playerOverall(b) - playerOverall(a)).slice(0, 3).map((player) => ({ player, overall: playerOverall(player) })),
    sectors,
    strongest: ranked[0] as StartSector,
    weakest: ranked[ranked.length - 1] as StartSector,
  }
}
