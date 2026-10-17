/**
 * Copas do pacote de dados: completa os campos que o pacote pode omitir (`normalizeCup`) e traduz os ids das ligas do pacote
 * para os das competições do jogo. As copas do mundo fictício (Brasil) ficam em `DEFAULT_CUPS`, com nomes genéricos: os nomes
 * oficiais de campeonatos são marcas, então o nome vem do pacote e o jogo publicado não leva nenhum.
 */
import type { CupSpec, CupStageSpec, Nationality } from '../../engine/types'
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
    format: cup.format,
    entrants: cup.entrants.map((e) => ({ source: mapSource(e.source), ...(e.fallback ? { fallback: mapSource(e.fallback) } : {}), ...(e.stage !== undefined ? { stage: e.stage } : {}) })),
    ...(cup.groups ? { groups: { ...cup.groups } } : {}),
    ...(cup.leaguePhase ? { leaguePhase: { ...cup.leaguePhase } } : {}),
    stages: cup.stages.map((s): CupStageSpec => ({ ...s, date: [s.date[0], s.date[1]] })),
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

/** As copas da competição brasileira do mundo fictício (nomes genéricos; troque o nome no pacote para usar outro). */
export const DEFAULT_CUPS: PackageCup[] = [
  {
    id: 'cup-br',
    name: 'Copa Nacional',
    kind: 'cup',
    country: 'Brazil',
    format: 'knockout',
    entrants: [{ source: { type: 'league', league: 'br-1' } }, { source: { type: 'league', league: 'br-2' } }, { source: { type: 'league', league: 'br-3' } }],
    stages: [
      { name: 'Primeira fase', legs: 1, date: [2, 4] },
      { name: 'Segunda fase', legs: 1, date: [2, 25] },
      { name: 'Oitavas de final', legs: 2, date: [3, 25] },
      { name: 'Quartas de final', legs: 2, date: [5, 6] },
      { name: 'Semifinais', legs: 2, date: [7, 22] },
      { name: 'Final', legs: 2, date: [10, 14], legGap: 14 },
    ],
    seeding: 'seeded',
    homeOfSingleLeg: 'lower-reputation',
    awayGoals: false,
    extraTime: true,
    penalties: true,
    discipline: { yellowsPerSuspension: 3, redCardGames: 1, clearYellowsAfterStage: 3 },
    prize: { perStage: [100_000, 150_000, 400_000, 800_000, 1_500_000, 2_500_000], champion: 12_000_000, runnerUp: 5_000_000 },
  },
  {
    id: 'supercup-br',
    name: 'Supercopa Nacional',
    kind: 'supercup',
    country: 'Brazil',
    format: 'knockout',
    // O campeão da liga contra o campeão da copa; se for o mesmo clube, o vice da liga joga no lugar.
    entrants: [{ source: { type: 'league', league: 'br-1', positions: [1, 1] } }, { source: { type: 'cup', cup: 'cup-br', place: 'winner' }, fallback: { type: 'league', league: 'br-1', positions: [2, 2] } }],
    stages: [{ name: 'Final', legs: 1, date: [2, 1], neutral: true }],
    seeding: 'random',
    homeOfSingleLeg: 'draw',
    awayGoals: false,
    extraTime: true,
    penalties: true,
    discipline: { yellowsPerSuspension: 3, redCardGames: 1 },
    prize: { perStage: [0], champion: 3_000_000, runnerUp: 1_000_000 },
  },
]

/** Letra da competição brasileira padrão de cada nível (o mundo clássico usa `serie-a`, `serie-b`...). */
export const classicLeagueId = (packageLeagueId: string): string => {
  const level = Number(/-(\d+)$/.exec(packageLeagueId)?.[1] ?? 1)
  return `serie-${['a', 'b', 'c', 'd'][level - 1] ?? level}`
}

/** As copas padrão do mundo fictício, prontas para o jogo. */
export const defaultCupSpecs = (): CupSpec[] => DEFAULT_CUPS.map((c) => normalizeCup(c, classicLeagueId))
