/**
 * Partida do jogador em andamento. O motor guarda o estado da partida dentro de um objeto que muda
 * a cada passo, então ele fica aqui (fora do `Game`, que é só dado) e some quando a partida é registrada.
 * Trocar de tela no meio do jogo não perde a partida.
 */
import { startMatch } from '../engine/match'
import type { LiveMatch, MatchSide } from '../engine/match'
import { userMatchInput } from '../engine/season'
import type { Game } from './game'

export interface LiveSession {
  matchId: string
  match: LiveMatch
  /** Lado do time do jogador. */
  side: MatchSide
  /** O intervalo já aconteceu (o jogo não para de novo no minuto 45). */
  halftimeDone: boolean
}

let session: LiveSession | null = null

export const getLive = (matchId: string): LiveSession | null => (session?.matchId === matchId ? session : null)

/** Cria a partida ao vivo com a escalação atual do jogador (indisponíveis já trocados). */
/** `holdInjury`: lesão no time do jogador para o jogo e espera a escolha de quem entra (a tela de partida liga). */
export function beginLive(game: Game, holdInjury = false): LiveSession {
  const pending = game.pendingUserMatch
  if (!pending) throw new Error('Não há partida do jogador para jogar')
  if (session?.matchId === pending.id) return session
  session = {
    matchId: pending.id,
    match: startMatch({ ...userMatchInput(game.season, pending, game.userTeamId), ...(holdInjury ? { holdInjurySubs: true } : {}) }),
    side: pending.homeTeamId === game.userTeamId ? 'home' : 'away',
    halftimeDone: false,
  }
  return session
}

export function clearLive(): void {
  session = null
}
