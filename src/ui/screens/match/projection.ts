/**
 * "Se terminar assim": a posição do seu time na tabela se a partida acabasse agora, e o prognóstico de antes do jogo
 * (posição se vencer, empatar ou perder). Tudo derivado das partidas decididas (nada é guardado) e só leitura.
 *
 * Os outros jogos do mesmo dia o motor já decidiu: a tabela-base deixa todos eles de fora e só os soma com o placar que
 * o relógio da partida já revelou (`scoreAt`), então a projeção nunca entrega um resultado que ainda não apareceu.
 * Antes do apito (minuto 0) os outros jogos ainda não contam.
 */
import { computeStandings } from '../../../engine/season/standings'
import type { Competition, Match, StandingRow, TeamId, TeamMatchStats } from '../../../engine/types'
import type { Game } from '../../../store/game'
import { otherGamesOf, scoreAt } from './otherGames'
import { zoneOf } from '../standings/Table'

export type ProjectionZone = 'leader' | 'promotion' | 'relegation'

export interface Projection {
  position: number
  size: number
  points: number
  zone: ProjectionZone | null
  /** Posição na tabela de hoje (só as partidas já decididas, sem este jogo): serve para a seta de subiu ou desceu. */
  current: number
}

export interface Prognosis {
  win: Projection
  draw: Projection
  lose: Projection
}

const NO_STATS: TeamMatchStats = { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, xg: 0 }

/** A liga do jogo do técnico (copa não tem tabela de pontos corridos). */
export function leagueOf(game: Game, match: Match | undefined): Competition | undefined {
  if (!match || match.cup) return undefined
  const competition = game.season.season.competitions.find((c) => c.id === match.competitionId)
  return competition && competition.type === 'league' ? competition : undefined
}

const asFinished = (m: Match, homeGoals: number, awayGoals: number): Match => ({
  ...m,
  status: 'finished',
  result: m.result ? { ...m.result, homeGoals, awayGoals } : { homeGoals, awayGoals, events: [], homeStats: NO_STATS, awayStats: NO_STATS, playerResults: [] },
})

function zoneAt(competition: Competition, position: number, size: number): ProjectionZone | null {
  if (position === 1) return 'leader'
  const z = zoneOf(position, size, competition)
  return z
}

const positionOf = (table: readonly StandingRow[], teamId: TeamId): StandingRow & { position: number } => {
  const i = table.findIndex((r) => r.teamId === teamId)
  return { ...(table[i] as StandingRow), position: i + 1 }
}

/** Tabela com este jogo no placar dado e os outros jogos do dia no minuto indicado (`null` = ainda não contam). */
function tableWith(game: Game, competition: Competition, match: Match, home: number, away: number, otherMinute: number | null): StandingRow[] {
  const others = otherGamesOf(game)
  const left = new Set<string>([match.id, ...others.map((m) => m.id)])
  const base = game.season.matches.filter((m) => m.competitionId === competition.id && m.status === 'finished' && !left.has(m.id))
  const live: Match[] = [asFinished(match, home, away)]
  if (otherMinute !== null && otherMinute > 0) {
    for (const m of others) {
      const s = scoreAt(m, otherMinute)
      live.push(asFinished(m, s.home, s.away))
    }
  }
  return computeStandings(competition.teamIds, [...base, ...live])
}

/** Posição de hoje (só as partidas decididas, sem este jogo nem os outros do dia). */
function currentPosition(game: Game, competition: Competition, match: Match, teamId: TeamId): number {
  const others = otherGamesOf(game)
  const left = new Set<string>([match.id, ...others.map((m) => m.id)])
  const base = game.season.matches.filter((m) => m.competitionId === competition.id && m.status === 'finished' && !left.has(m.id))
  return positionOf(computeStandings(competition.teamIds, base), teamId).position
}

function project(game: Game, competition: Competition, match: Match, teamId: TeamId, home: number, away: number, otherMinute: number | null): Projection {
  const table = tableWith(game, competition, match, home, away, otherMinute)
  const row = positionOf(table, teamId)
  return { position: row.position, size: table.length, points: row.points, zone: zoneAt(competition, row.position, table.length), current: currentPosition(game, competition, match, teamId) }
}

/** A posição do seu time se a partida acabasse agora, com o placar ao vivo e os outros jogos no minuto da partida. */
export function projectNow(game: Game, match: Match | undefined, teamId: TeamId, score: { home: number; away: number }, minute: number): Projection | null {
  const competition = leagueOf(game, match)
  if (!competition || !match || !competition.teamIds.includes(teamId)) return null
  return project(game, competition, match, teamId, score.home, score.away, minute)
}

/** Antes do apito: a posição se vencer (1 a 0), empatar (0 a 0) ou perder (0 a 1), com os outros jogos do dia ainda por decidir. */
export function prognosisOf(game: Game, match: Match | undefined, teamId: TeamId): Prognosis | null {
  const competition = leagueOf(game, match)
  if (!competition || !match || !competition.teamIds.includes(teamId)) return null
  const mine = match.homeTeamId === teamId ? 'home' : 'away'
  const at = (win: boolean | null) => {
    const g = win === null ? [0, 0] : win ? [1, 0] : [0, 1]
    const [h, a] = mine === 'home' ? [g[0] as number, g[1] as number] : [g[1] as number, g[0] as number]
    return project(game, competition, match, teamId, h, a, null)
  }
  return { win: at(true), draw: at(null), lose: at(false) }
}
