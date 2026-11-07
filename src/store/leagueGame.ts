/**
 * O `Game` de uma liga online (Fase 6C, C2): as telas do jogo solo leem um `Game`; na liga online ele é montado do espelho (`LeagueMirror`), com o
 * clube do técnico como `userTeamId`. O que o jogo solo guarda no `Game` e o servidor ainda não manda (temporadas passadas, notas) começa vazio.
 */
import { startingCoach } from '../engine/career'
import type { SeasonState } from '../engine/season'
import type { Team } from '../engine/types'
import type { Game, OnlineInfo } from './game'

export function leagueGame(season: SeasonState, userTeamId: string, online: OnlineInfo): Game {
  const team = season.teams.find((t) => t.id === userTeamId) as Team
  return { seed: 0, userTeamId, season, lastDay: [], notices: [], seasonLog: [], archive: [], coach: startingCoach(team), online }
}
