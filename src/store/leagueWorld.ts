/**
 * O mundo de uma liga online (Fase 6, B8.3): o mesmo mundo do jogo solo (`loadWorld`), mas sem um técnico "dono". Não há pirâmide de foco: quem é
 * jogada lance a lance é decidido pelos clubes humanos (`humanTeamIds`), e o resto usa a partida simplificada. O relógio do mundo parte da abertura
 * da temporada mais cedo entre os países. Puro: a semente e o pacote entram por parâmetro.
 */
import type { DataPackage } from '../data/package/types'
import { loadWorld } from '../data/package/defaultPackage'
import { createSeason, makeCycle, sharedCupSpecs, sharedSetups } from '../engine/season'
import type { SeasonState } from '../engine/season'
import { emptyTraining } from '../engine/types'

export interface LeagueWorldOptions {
  /** `false`: só ligas, sem copas (testes e mundos pequenos). */
  cups?: boolean
  /** Calendário comum (Fase 6D): temporada única, as mesmas rodadas e copas nas mesmas datas para todos os países. As ligas novas usam; as antigas seguem o calendário de cada país. */
  shared?: boolean
}

export function createLeagueWorld(seed: number, pkg?: DataPackage, options: LeagueWorldOptions = {}): SeasonState {
  const world = loadWorld(seed, pkg)
  const competitions = options.shared && world.competitions ? sharedSetups(world.competitions) : world.competitions
  const cups = options.shared && world.cups ? sharedCupSpecs(world.cups, world.competitions ?? []) : world.cups
  const starts = (competitions ?? []).map((c) => makeCycle(world.startYear, c.split === true).start)
  const startDate = starts.length > 0 ? [...starts].sort()[0]! : makeCycle(world.startYear, false).start
  return createSeason({
    year: world.startYear,
    startDate,
    seed,
    teams: world.teams,
    players: world.players,
    academy: world.academy,
    training: emptyTraining(),
    ...(competitions ? { competitions } : {}),
    ...(options.cups === false ? { cupSpecs: [] } : cups && cups.length > 0 ? { cupSpecs: cups } : {}),
  })
}

