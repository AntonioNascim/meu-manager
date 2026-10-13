/**
 * Outros jogos da mesma rodada e série, que acontecem ao mesmo tempo que o do jogador. O motor já simulou esses jogos
 * (ficam em `Game.lastDay` com o resultado fechado); aqui só se revelam os gols conforme o relógio da partida, então
 * o resultado nunca muda: no minuto 90 o placar é exatamente o do resultado.
 */
import type { Match, MatchEvent } from '../../../engine/types'
import type { Game } from '../../../store/game'

const isGoal = (e: MatchEvent) => e.type === 'goal' || e.type === 'own-goal'

/** Jogos da mesma competição, rodada e data do jogo pendente do jogador (já decididos). */
export function otherGamesOf(game: Game): Match[] {
  const mine = game.pendingUserMatch
  if (!mine) return []
  return game.lastDay
    .filter((m) => m.id !== mine.id && m.status === 'finished' && m.result && m.competitionId === mine.competitionId && m.round === mine.round && m.date === mine.date)
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
}

export interface ScoreAt {
  home: number
  away: number
  /** Gols já revelados, na ordem. */
  goals: MatchEvent[]
}

/** Placar do jogo no minuto indicado: só os gols até ali (o gol contra vale para o time do evento, como no motor). */
export function scoreAt(match: Match, minute: number): ScoreAt {
  const result = match.result
  if (!result) return { home: 0, away: 0, goals: [] }
  const goals = result.events.filter(isGoal).sort((a, b) => a.minute - b.minute).filter((e) => minute >= 90 || e.minute <= minute)
  if (minute >= 90) return { home: result.homeGoals, away: result.awayGoals, goals }
  const home = goals.filter((e) => e.teamId === match.homeTeamId).length
  return { home, away: goals.length - home, goals }
}
