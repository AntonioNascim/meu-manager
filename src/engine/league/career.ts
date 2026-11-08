/**
 * Carreira, demissão e detalhe de clubes numa liga online (Fase 6C, C6). Puro: recebe o mundo e os registros e devolve dados.
 *
 * - **Demissão:** a diretoria avalia o técnico humano como no jogo solo (`evaluateBoard`: resultados e finanças). Demitido, o clube volta à IA e a vaga fica
 *   com o técnico, que escolhe outro clube **livre, de reputação igual ou menor** que o do clube que perdeu (`freeClubsFor`).
 * - **Carreira:** cada passagem por um clube (`Stint`) com as temporadas que o clube fez enquanto ele esteve lá (`careerView`).
 * - **Detalhe ao tocar:** a condição física e a moral reais de um clube e a tática salva dele (o espelho só leva a condição neutra de outros clubes).
 * - **Preferências por conta:** favoritos e escalações guardadas, conferidos antes de guardar (`parsePrefs`).
 */
import { evaluateBoard } from '../board'
import { monthlyOperations, monthlyPayroll } from '../finance'
import { computeStandings } from '../season'
import type { SeasonState } from '../season'
import { PLAY_STYLES } from '../types'
import type { BoardEvaluation, Dismissal, IsoDate, PlayStyle, PlayerCondition, SavedLineup, SeasonRecord, Tactic, TeamId } from '../types'
import { isGridPoint } from '../grid'

/** A avaliação da diretoria hoje (a mesma conta de `boardOf` do jogo solo, sem a campanha de antes da chegada). */
export function boardEvaluation(world: SeasonState, teamId: TeamId): BoardEvaluation | undefined {
  const team = world.teams.find((t) => t.id === teamId)
  const competition = world.season.competitions.find((c) => c.teamIds.includes(teamId))
  if (!team || !competition) return undefined
  const table = computeStandings(competition.teamIds, world.matches.filter((m) => m.competitionId === competition.id))
  const index = table.findIndex((r) => r.teamId === teamId)
  return evaluateBoard({
    objective: team.objective,
    row: table[index],
    position: index + 1,
    teamCount: table.length,
    totalGames: (table.length - 1) * 2,
    balance: team.finances.balance,
    monthlyCost: monthlyPayroll(world.players.filter((p) => p.teamId === teamId)) + monthlyOperations(team),
  })
}

/** A diretoria demitiria o técnico agora? Devolve o registro da demissão. */
export function dismissalCheck(world: SeasonState, teamId: TeamId): Dismissal | undefined {
  const board = boardEvaluation(world, teamId)
  if (!board?.dismissal) return undefined
  const competition = world.season.competitions.find((c) => c.teamIds.includes(teamId))
  const table = competition ? computeStandings(competition.teamIds, world.matches.filter((m) => m.competitionId === competition.id)) : []
  return { date: world.season.currentDate, reason: board.dismissal, confidence: board.confidence, position: table.findIndex((r) => r.teamId === teamId) + 1 }
}

export interface FreeClubRow {
  teamId: TeamId
  name: string
  shortName?: string
  reputation: number
  /** Divisão (1 = primeira). */
  tier: number
  competition: string
}

/** Quantos clubes a lista de escolha mostra. */
export const FREE_CLUBS_SHOWN = 30

/**
 * Clubes que o técnico demitido pode assumir: sem técnico humano, de **reputação igual ou menor** que a do clube que ele perdeu, os maiores primeiro.
 * (O clube que ele perdeu também entra se a IA ainda o tem: ele pode voltar, a diretoria já o conhece.)
 */
export function freeClubsFor(world: SeasonState, humanTeamIds: ReadonlySet<TeamId>, previousTeamId: TeamId, shown = FREE_CLUBS_SHOWN): FreeClubRow[] {
  const previous = world.teams.find((t) => t.id === previousTeamId)
  if (!previous) return []
  const rows: FreeClubRow[] = []
  for (const t of world.teams) {
    if (humanTeamIds.has(t.id) || t.reputation > previous.reputation) continue
    const competition = world.season.competitions.find((c) => c.teamIds.includes(t.id))
    if (!competition) continue
    rows.push({ teamId: t.id, name: t.name, ...(t.shortName ? { shortName: t.shortName } : {}), reputation: t.reputation, tier: competition.tier, competition: competition.name })
  }
  return rows.sort((a, b) => b.reputation - a.reputation || a.tier - b.tier || (a.teamId < b.teamId ? -1 : 1)).slice(0, shown)
}

/** Uma passagem do técnico por um clube. */
export interface Stint {
  teamId: TeamId
  since: IsoDate
  until?: IsoDate
  ended?: 'dismissed' | 'moved'
}

export interface CareerRow {
  teamId: TeamId
  teamName: string
  since: IsoDate
  until?: IsoDate
  ended?: Stint['ended']
  /** Temporadas que o clube fechou enquanto ele estava lá (posição final e título). */
  seasons: SeasonRecord[]
  /** Posição e pontos hoje, na passagem em andamento. */
  current?: { position: number; points: number; played: number }
}

const yearOf = (d: IsoDate): number => Number(d.slice(0, 4))

/** O histórico do técnico: as passagens (a mais recente primeiro) com as temporadas fechadas e a campanha de hoje. */
export function careerView(world: SeasonState, stints: readonly Stint[]): CareerRow[] {
  return [...stints]
    .reverse()
    .map((s): CareerRow => {
      const team = world.teams.find((t) => t.id === s.teamId)
      const first = yearOf(s.since)
      const last = s.until ? yearOf(s.until) : Number.POSITIVE_INFINITY
      const seasons = (team?.history ?? []).filter((h) => h.year >= first && h.year <= last)
      let current: CareerRow['current']
      if (!s.until) {
        const competition = world.season.competitions.find((c) => c.teamIds.includes(s.teamId))
        if (competition) {
          const table = computeStandings(competition.teamIds, world.matches.filter((m) => m.competitionId === competition.id))
          const i = table.findIndex((r) => r.teamId === s.teamId)
          if (i >= 0) current = { position: i + 1, points: table[i]!.points, played: table[i]!.played }
        }
      }
      return { teamId: s.teamId, teamName: team?.name ?? s.teamId, since: s.since, ...(s.until ? { until: s.until } : {}), ...(s.ended ? { ended: s.ended } : {}), seasons, ...(current ? { current } : {}) }
    })
}

export interface TeamDetail {
  conditions: Record<string, PlayerCondition>
  tactic: Tactic
}

/** A condição física e a moral reais do elenco de um clube e a tática salva dele (o que o espelho não leva de clubes dos outros). */
export function teamDetail(world: SeasonState, teamId: TeamId): TeamDetail | undefined {
  const team = world.teams.find((t) => t.id === teamId)
  if (!team) return undefined
  const conditions: Record<string, PlayerCondition> = {}
  for (const p of world.players) if (p.teamId === teamId) conditions[p.id] = p.condition
  return { conditions, tactic: team.tactic }
}

// ---------------------------------------------------------------------------
// Preferências por conta (favoritos e escalações guardadas)
// ---------------------------------------------------------------------------

export interface Prefs {
  favorites: string[]
  lineups: (SavedLineup | null)[]
}

export const EMPTY_PREFS: Prefs = { favorites: [], lineups: [null, null, null] }
const ID = /^[A-Za-z0-9_.:-]{1,64}$/
const STYLES: readonly PlayStyle[] = PLAY_STYLES
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Confere as preferências (lista fechada de campos, tamanhos limitados). `undefined` = corpo inválido. */
export function parsePrefs(raw: unknown): Prefs | undefined {
  if (!isObj(raw) || Object.keys(raw).some((k) => k !== 'favorites' && k !== 'lineups')) return undefined
  if (!Array.isArray(raw.favorites) || raw.favorites.length > 300 || !raw.favorites.every((x) => typeof x === 'string' && ID.test(x))) return undefined
  if (!Array.isArray(raw.lineups) || raw.lineups.length !== 3) return undefined
  const lineups: (SavedLineup | null)[] = []
  for (const l of raw.lineups) {
    if (l === null) {
      lineups.push(null)
      continue
    }
    if (!isObj(l) || Object.keys(l).some((k) => !['name', 'formationId', 'style', 'startingXI', 'grid'].includes(k))) return undefined
    if (typeof l.name !== 'string' || l.name.length > 30 || typeof l.formationId !== 'string' || l.formationId.length > 16 || !STYLES.includes(l.style as PlayStyle)) return undefined
    if (!Array.isArray(l.startingXI) || l.startingXI.length !== 11 || !l.startingXI.every((x) => typeof x === 'string' && ID.test(x))) return undefined
    let grid: SavedLineup['grid']
    if (l.grid !== undefined) {
      if (!Array.isArray(l.grid) || l.grid.length !== 11) return undefined
      grid = []
      for (const p of l.grid) {
        if (!isObj(p) || typeof p.row !== 'number' || typeof p.lane !== 'number' || !isGridPoint({ row: p.row, lane: p.lane })) return undefined
        grid.push({ row: p.row, lane: p.lane })
      }
    }
    lineups.push({ name: l.name, formationId: l.formationId, style: l.style as PlayStyle, startingXI: l.startingXI as string[], ...(grid ? { grid } : {}) })
  }
  return { favorites: [...new Set(raw.favorites as string[])], lineups }
}
