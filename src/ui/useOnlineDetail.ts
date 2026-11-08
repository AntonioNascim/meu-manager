import { useEffect } from 'react'
import type { Player } from '../engine/types'
import { useGame } from '../store/gameStore'
import { activeMirror } from '../store/leagueSession'

/**
 * Detalhe ao tocar (Fase 6C, C6): na liga online o espelho leva a condição física e a moral dos outros clubes como neutras (100 e 70). Ao abrir a página de
 * um time ou a ficha de um jogador, baixa as reais (uma vez por revisão). No jogo solo não faz nada.
 */
export function useOnlineDetail(teamId: string | null | undefined): void {
  const game = useGame()
  const online = game?.online !== undefined
  const rev = game?.online?.rev
  useEffect(() => {
    if (!online || !teamId) return
    void activeMirror()?.loadDetail(teamId)
  }, [online, teamId, rev])
}

/** O jogador como o jogo o tem agora (com a condição real depois do detalhe); no solo, o próprio. */
export function useFreshPlayer(player: Player): Player {
  const game = useGame()
  useOnlineDetail(player.teamId)
  if (!game?.online) return player
  return game.season.players.find((p) => p.id === player.id) ?? player
}
