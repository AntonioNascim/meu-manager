import type { MatchResult } from '../types'

/** Já está enxuto: sem notas dos jogadores e sem texto de narração em nenhum lance. */
export const isSlim = (r: MatchResult): boolean => r.playerResults.length === 0 && r.events.every((e) => e.text === '')

/**
 * Resultado enxuto de uma partida decidida: placar, estatísticas, gols (com assistência) e cartões, para o resumo
 * do jogo e a classificação. Narração, lesões, trocas e notas saem, porque só servem na hora da partida.
 */
export function slimResult(r: MatchResult): MatchResult {
  if (isSlim(r)) return r
  const events = r.events
    .filter((e) => e.type === 'goal' || e.type === 'own-goal' || e.type === 'yellow-card' || e.type === 'red-card')
    .map(({ minute, type, teamId, playerId, relatedPlayerId, assistKind }) => ({ minute, type, teamId, playerId, text: '', ...(relatedPlayerId ? { relatedPlayerId } : {}), ...(assistKind ? { assistKind } : {}) }))
  return { homeGoals: r.homeGoals, awayGoals: r.awayGoals, homeStats: r.homeStats, awayStats: r.awayStats, events, playerResults: [], ...(r.extraTime ? { extraTime: true } : {}), ...(r.penalties ? { penalties: r.penalties } : {}), ...(r.shootout ? { shootout: r.shootout } : {}) }
}
