import type { Cup, Match, Player, Team, TeamId } from '../../../engine/types'
import type { Game } from '../../../store/game'

export interface CupScorer {
  player: Player
  team: Team
  goals: number
  assists: number
}

/** Artilharia de uma copa, só pelos gols e assistências dos jogos dela (os lances de cada jogo guardam o autor e o assistente). */
export function cupScorers(game: Game, cupId: string, limit = 20): CupScorer[] {
  const players = new Map(game.season.players.map((p) => [p.id, p]))
  const teams = new Map(game.season.teams.map((t) => [t.id, t]))
  const goals = new Map<string, number>()
  const assists = new Map<string, number>()
  for (const m of game.season.matches) {
    if (m.competitionId !== cupId || m.status !== 'finished' || !m.result) continue
    for (const e of m.result.events) {
      if (e.type !== 'goal') continue
      goals.set(e.playerId, (goals.get(e.playerId) ?? 0) + 1)
      if (e.relatedPlayerId) assists.set(e.relatedPlayerId, (assists.get(e.relatedPlayerId) ?? 0) + 1)
    }
  }
  return [...goals.entries()]
    .flatMap(([id, g]) => {
      const player = players.get(id)
      const team = player?.teamId ? teams.get(player.teamId) : undefined
      return player && team ? [{ player, team, goals: g, assists: assists.get(id) ?? 0 }] : []
    })
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.player.name.localeCompare(b.player.name, 'pt-BR'))
    .slice(0, limit)
}

/** Placar de um jogo de copa com a prorrogação e os pênaltis ("2 x 2 (4 x 3 pên.)"). */
export function scoreText(m: Match): string {
  const r = m.result
  if (m.status !== 'finished' || !r) return 'x'
  const base = `${r.homeGoals} x ${r.awayGoals}`
  if (r.penalties) return `${base} (${r.penalties.home} x ${r.penalties.away} pên.)`
  return r.extraTime ? `${base} pror.` : base
}

/** A copa em que o time do jogador joga (a primeira da lista em que ele está), para abrir a tela já nela. */
export function defaultCup(game: Game): Cup | undefined {
  const cups = game.season.cups ?? []
  return cups.find((c) => c.entrants.some((e) => e.teamId === game.userTeamId)) ?? cups[0]
}

export const dateRange = (matches: readonly Match[]): string[] => [...new Set(matches.map((m) => m.date))].sort()

export type CupTeamId = TeamId
