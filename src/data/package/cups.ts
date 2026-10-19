/**
 * Copas do pacote de dados: completa os campos que o pacote pode omitir (`normalizeCup`) e traduz os ids das ligas do pacote
 * para os das competições do jogo. As copas do mundo fictício (Brasil) ficam em `DEFAULT_CUPS`, com nomes genéricos: os nomes
 * oficiais de campeonatos são marcas, então o nome vem do pacote e o jogo publicado não leva nenhum.
 */
import type { CupSpec, CupStageSpec, Nationality } from '../../engine/types'
import { defaultCupsFor } from './countryCups'
import type { PackageCup } from './types'

/** Padrões dos campos que o pacote pode omitir. */
export const CUP_DEFAULTS = {
  kind: 'cup',
  seeding: 'random',
  homeOfSingleLeg: 'draw',
  awayGoals: false,
  extraTime: true,
  penalties: true,
  discipline: { yellowsPerSuspension: 3, redCardGames: 1 },
} as const

/** Copa completa a partir da definição do pacote. `league` traduz o id de uma liga do pacote para o da competição do jogo. */
export function normalizeCup(cup: PackageCup, league: (packageLeagueId: string) => string = (id) => id): CupSpec {
  const mapSource = (source: CupSpec['entrants'][number]['source']): CupSpec['entrants'][number]['source'] => (source.type === 'league' ? { ...source, league: league(source.league) } : source)
  const spec: CupSpec = {
    id: cup.id,
    name: cup.name,
    kind: cup.kind ?? CUP_DEFAULTS.kind,
    ...(cup.country ? { country: cup.country as Nationality } : {}),
    ...(cup.region ? { region: cup.region } : {}),
    ...(cup.world ? { world: { every: cup.world.every, offset: cup.world.offset, from: [cup.world.from[0], cup.world.from[1]] as [number, number] } } : {}),
    format: cup.format,
    entrants: cup.entrants.map((e) => ({ source: mapSource(e.source), ...(e.fallback ? { fallback: mapSource(e.fallback) } : {}), ...(e.stage !== undefined ? { stage: e.stage } : {}) })),
    ...(cup.groups ? { groups: { ...cup.groups } } : {}),
    ...(cup.leaguePhase ? { leaguePhase: { ...cup.leaguePhase } } : {}),
    ...(cup.preliminary ? { preliminary: cup.preliminary.map((s): CupStageSpec => ({ ...s, date: [s.date[0], s.date[1]] })) } : {}),
    stages: cup.stages.map((s): CupStageSpec => ({ ...s, date: [s.date[0], s.date[1]] })),
    ...(cup.weekday ? { weekday: cup.weekday } : {}),
    ...(cup.excludeCups?.length ? { excludeCups: [...cup.excludeCups] } : {}),
    seeding: cup.seeding ?? CUP_DEFAULTS.seeding,
    homeOfSingleLeg: cup.homeOfSingleLeg ?? CUP_DEFAULTS.homeOfSingleLeg,
    awayGoals: cup.awayGoals ?? CUP_DEFAULTS.awayGoals,
    extraTime: cup.extraTime ?? CUP_DEFAULTS.extraTime,
    penalties: cup.penalties ?? CUP_DEFAULTS.penalties,
    discipline: { ...CUP_DEFAULTS.discipline, ...(cup.discipline ?? {}) },
    prize: { perStage: cup.prize?.perStage ? [...cup.prize.perStage] : [], champion: cup.prize?.champion ?? 0, ...(cup.prize?.runnerUp !== undefined ? { runnerUp: cup.prize.runnerUp } : {}) },
  }
  return spec
}

/** As copas do Brasil do mundo fictício (as copas padrão do país, com as três divisões do pacote padrão; nomes genéricos). */
export const DEFAULT_CUPS: PackageCup[] = defaultCupsFor('Brazil', [
  { id: 'br-1', level: 1 },
  { id: 'br-2', level: 2 },
  { id: 'br-3', level: 3 },
])

/** Letra da competição brasileira padrão de cada nível (o mundo clássico usa `serie-a`, `serie-b`...). */
export const classicLeagueId = (packageLeagueId: string): string => {
  const level = Number(/-(\d+)$/.exec(packageLeagueId)?.[1] ?? 1)
  return `serie-${['a', 'b', 'c', 'd'][level - 1] ?? level}`
}

/** As copas padrão do mundo fictício, prontas para o jogo. */
export const defaultCupSpecs = (): CupSpec[] => DEFAULT_CUPS.map((c) => normalizeCup(c, classicLeagueId))
