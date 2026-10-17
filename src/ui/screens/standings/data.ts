import { computeStandings } from '../../../engine/season'
import type { Competition, Match, Player, StandingRow, Team, TeamId } from '../../../engine/types'
import type { ArchivedRow, Game } from '../../../store/game'

/** Os últimos `n` resultados do time na competição, do mais antigo ao mais recente. */
export function teamForm(matches: readonly Match[], teamId: TeamId, n = 5): ('W' | 'D' | 'L')[] {
  return matches
    .filter((m) => m.status === 'finished' && m.result && (m.homeTeamId === teamId || m.awayTeamId === teamId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round)
    .slice(-n)
    .map((m) => {
      const r = m.result as NonNullable<Match['result']>
      const mine = m.homeTeamId === teamId ? r.homeGoals : r.awayGoals
      const theirs = m.homeTeamId === teamId ? r.awayGoals : r.homeGoals
      return mine > theirs ? 'W' : mine === theirs ? 'D' : 'L'
    })
}

/** Linha de uma temporada passada, no mesmo formato da classificação atual (sem os últimos jogos). */
export function archivedStandings(rows: readonly ArchivedRow[]): StandingRow[] {
  return rows.map(([teamId, played, wins, draws, losses, goalsFor, goalsAgainst, points]) => ({
    teamId,
    played,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    points,
    yellowCards: 0,
    redCards: 0,
  })) as StandingRow[]
}

/** Anos disponíveis na tela: as temporadas passadas guardadas e a atual (última). */
export function seasonYears(game: Game): number[] {
  return [...game.archive.map((a) => a.year), game.season.season.year]
}

export function standingsFor(game: Game, competition: Competition, year: number): StandingRow[] {
  if (year === game.season.season.year) {
    return computeStandings(
      competition.teamIds,
      game.season.matches.filter((m) => m.competitionId === competition.id),
    )
  }
  const archive = game.archive.find((a) => a.year === year)
  return archivedStandings(archive?.tables[archive.competitions ? archive.competitions.indexOf(competition.id) : competition.tier - 1] ?? [])
}

export type LeaderKind = 'goals' | 'home-goals' | 'away-goals' | 'brazilians' | 'under-23' | 'assists' | 'pass-assists' | 'cross-assists' | 'yellow' | 'red'

const VALUE: Record<LeaderKind, (p: Player) => number> = {
  goals: (p) => p.seasonStats.goals - (p.seasonStats.cupGoals ?? 0),
  'home-goals': (p) => p.seasonStats.homeGoals ?? 0,
  'away-goals': (p) => p.seasonStats.awayGoals ?? 0,
  brazilians: (p) => (p.nationality === 'Brazil' ? p.seasonStats.goals - (p.seasonStats.cupGoals ?? 0) : 0),
  'under-23': (p) => (p.age <= 23 ? p.seasonStats.goals - (p.seasonStats.cupGoals ?? 0) : 0),
  assists: (p) => p.seasonStats.assists - (p.seasonStats.cupAssists ?? 0),
  'pass-assists': (p) => p.seasonStats.passAssists ?? 0,
  'cross-assists': (p) => p.seasonStats.crossAssists ?? 0,
  yellow: (p) => p.seasonStats.yellowCards - (p.seasonStats.cupYellowCards ?? 0),
  red: (p) => p.seasonStats.redCards - (p.seasonStats.cupRedCards ?? 0),
}

export interface Leader {
  player: Player
  team: Team
  value: number
}

/** Ranking da competição (só jogadores de times dela), do maior para o menor; empate: quem jogou menos minutos, depois o nome. */
export function leaders(game: Game, competition: Competition, kind: LeaderKind, limit = 30): Leader[] {
  const teams = new Map(game.season.teams.map((t) => [t.id, t]))
  const ids = new Set(competition.teamIds)
  const value = VALUE[kind]
  const out: Leader[] = []
  for (const p of game.season.players) {
    if (!p.teamId || !ids.has(p.teamId)) continue
    const v = value(p)
    if (v > 0) out.push({ player: p, team: teams.get(p.teamId) as Team, value: v })
  }
  return out.sort((a, b) => b.value - a.value || a.player.seasonStats.minutes - b.player.seasonStats.minutes || a.player.name.localeCompare(b.player.name, 'pt-BR')).slice(0, limit)
}
