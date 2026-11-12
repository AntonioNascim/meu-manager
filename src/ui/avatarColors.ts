import type { Player } from '../engine/types'
import type { Game } from '../store/game'

/** Cores da camisa do bonequinho: as do clube atual do jogador (sem clube, o avatar usa o cinza padrão). */
export function avatarColors(game: Pick<Game, 'season'>, player: Pick<Player, 'teamId'>): [string, string] | undefined {
  if (player.teamId === null) return undefined
  return game.season.teams.find((t) => t.id === player.teamId)?.colors
}
