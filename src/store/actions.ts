/**
 * Ações do técnico (Fase 6C, C2): a interface pede uma ação e este módulo decide o caminho. No jogo solo a ação muda o jogo na hora; na liga online
 * ela vai ao servidor como comando (e o aparelho já mostra o resultado, que o servidor confirma ou corrige). A regra é a mesma nos dois lados
 * (`applyCommand`), então a tela não precisa saber onde está.
 */
import { applyCommand } from '../engine/league'
import type { LeagueCommand } from '../engine/league'
import type { Outcome } from './leagueMirror'
import { getGame, updateGame } from './gameStore'
import { activeMirror } from './leagueSession'

export async function perform(command: LeagueCommand): Promise<Outcome> {
  const game = getGame()
  if (!game) return { ok: false, error: 'no-mirror' }
  if (game.online) {
    const mirror = activeMirror()
    return mirror ? mirror.perform(command) : { ok: false, error: 'no-mirror' }
  }
  const r = applyCommand(game.season, game.userTeamId, command)
  if (!r.ok) return { ok: false, error: r.error, ...(r.minimumSalary !== undefined ? { minimumSalary: r.minimumSalary } : {}) }
  updateGame((g) => ({ ...g, season: r.world }))
  return { ok: true, ...(r.info ? { info: r.info } : {}) }
}
