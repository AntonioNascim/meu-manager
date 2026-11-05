/**
 * O mundo de uma liga online (Fase 6, B8.3): o mesmo mundo do jogo solo (`loadWorld`), mas sem um técnico "dono". Não há pirâmide de foco: quem é
 * jogada lance a lance é decidido pelos clubes humanos (`humanTeamIds`), e o resto usa a partida simplificada. O relógio do mundo parte da abertura
 * da temporada mais cedo entre os países. Puro: a semente e o pacote entram por parâmetro.
 */
import type { DataPackage } from '../data/package/types'
import { loadWorld } from '../data/package/defaultPackage'
import { createSeason, makeCycle } from '../engine/season'
import type { SeasonState } from '../engine/season'
import { emptyTraining } from '../engine/types'

export interface LeagueWorldOptions {
  /** `false`: só ligas, sem copas (testes e mundos pequenos). */
  cups?: boolean
}

export function createLeagueWorld(seed: number, pkg?: DataPackage, options: LeagueWorldOptions = {}): SeasonState {
  const world = loadWorld(seed, pkg)
  const starts = (world.competitions ?? []).map((c) => makeCycle(world.startYear, c.split === true).start)
  const startDate = starts.length > 0 ? [...starts].sort()[0]! : makeCycle(world.startYear, false).start
  return createSeason({
    year: world.startYear,
    startDate,
    seed,
    teams: world.teams,
    players: world.players,
    academy: world.academy,
    training: emptyTraining(),
    ...(world.competitions ? { competitions: world.competitions } : {}),
    ...(options.cups === false ? { cupSpecs: [] } : world.cups && world.cups.length > 0 ? { cupSpecs: world.cups } : {}),
  })
}

