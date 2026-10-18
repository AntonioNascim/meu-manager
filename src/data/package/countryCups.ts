/**
 * Copas padrão de cada país (Fase 3, partes 3A e 3B): formatos próximos dos reais e simplificados para o mundo que temos. Valem
 * quando um pacote tem o país com liga e não define nenhuma copa dele (`cupsForPackage`), e para saves antigos na virada de
 * temporada (`defaultCupsForCompetitions`). Onde a copa real inclui divisões que não existem no pacote só entram os clubes que
 * existem, com folgas para os cabeças de chave. Os nomes são genéricos: os nomes oficiais dos campeonatos são marcas e o nome vem
 * do pacote (quem monta um pacote pode renomear ou trocar qualquer copa).
 *
 * Datas de referência (mês e dia): a temporada do jogo é o ano civil e as ligas de todos os países começam no calendário da liga
 * brasileira (abril a dezembro), então as copas ficam entre fevereiro e novembro, e cada fase vai para a primeira quarta-feira livre.
 */
import type { Nationality } from '../../engine/types'
import type { PackageCup } from './types'

/** As divisões do país no pacote (id da liga e nível, 1 = principal). */
export interface CountryLeague {
  id: string
  level: number
}

type Builder = (leagues: readonly CountryLeague[]) => PackageCup[]

const top = (leagues: readonly CountryLeague[]): string => [...leagues].sort((a, b) => a.level - b.level)[0]?.id ?? ''
const allLeagues = (leagues: readonly CountryLeague[]) => [...leagues].sort((a, b) => a.level - b.level).map((l) => ({ source: { type: 'league' as const, league: l.id } }))
const position = (league: string, from: number, to = from) => ({ type: 'league' as const, league, positions: [from, to] as [number, number] })

/** Valores base em reais do Brasil; o índice de receita da liga multiplica (Inglaterra ×5...). */
const prize = (perStage: number[], champion: number, runnerUp: number) => ({ perStage, champion, runnerUp })

/** Supercopa de quatro clubes (campeão e vice da liga, campeão e finalista da copa), semifinais e final em campo neutro. */
function fourClubSupercup(id: string, name: string, country: Nationality, leagueId: string, cupId: string, dates: [[number, number], [number, number]]): PackageCup {
  return {
    id,
    name,
    kind: 'supercup',
    country,
    format: 'knockout',
    // Se o campeão da copa (ou o finalista) já está pela liga, entra o clube da liga logo atrás.
    entrants: [
      { source: position(leagueId, 1) },
      { source: position(leagueId, 2) },
      { source: { type: 'cup', cup: cupId, place: 'winner' }, fallback: position(leagueId, 3) },
      { source: { type: 'cup', cup: cupId, place: 'runner-up' }, fallback: position(leagueId, 4) },
    ],
    stages: [
      { name: 'Semifinais', legs: 1, date: dates[0], neutral: true },
      { name: 'Final', legs: 1, date: dates[1], neutral: true },
    ],
    seeding: 'random',
    homeOfSingleLeg: 'draw',
    awayGoals: false,
    extraTime: true,
    penalties: true,
    discipline: { yellowsPerSuspension: 3, redCardGames: 1 },
    prize: prize([500_000, 1_000_000], 3_000_000, 1_000_000),
  }
}

/** Supercopa de dois clubes: o campeão da liga contra o campeão da copa (o vice da liga no lugar, se for o mesmo). */
function twoClubSupercup(id: string, name: string, country: Nationality, leagueId: string, cupId: string, date: [number, number], options: { neutral: boolean; extraTime: boolean; home: PackageCup['homeOfSingleLeg'] }): PackageCup {
  return {
    id,
    name,
    kind: 'supercup',
    country,
    format: 'knockout',
    entrants: [{ source: position(leagueId, 1) }, { source: { type: 'cup', cup: cupId, place: 'winner' }, fallback: position(leagueId, 2) }],
    stages: [{ name: 'Final', legs: 1, date, ...(options.neutral ? { neutral: true } : {}) }],
    seeding: 'random',
    homeOfSingleLeg: options.home ?? 'draw',
    awayGoals: false,
    extraTime: options.extraTime,
    penalties: true,
    discipline: { yellowsPerSuspension: 3, redCardGames: 1 },
    prize: prize([0], 3_000_000, 1_000_000),
  }
}

/** Copa nacional em mata-mata: todos os clubes das divisões do país, folgas para os cabeças de chave e final em campo neutro. */
function nationalCup(options: {
  id: string
  name: string
  country: Nationality
  leagues: readonly CountryLeague[]
  stages: PackageCup['stages']
  home: PackageCup['homeOfSingleLeg']
  extraTime?: boolean
  yellows?: number
  prize: PackageCup['prize']
}): PackageCup {
  return {
    id: options.id,
    name: options.name,
    kind: 'cup',
    country: options.country,
    format: 'knockout',
    entrants: allLeagues(options.leagues),
    stages: options.stages,
    seeding: 'seeded',
    homeOfSingleLeg: options.home,
    awayGoals: false,
    extraTime: options.extraTime ?? true,
    penalties: true,
    discipline: { yellowsPerSuspension: options.yellows ?? 3, redCardGames: 1 },
    prize: options.prize,
  }
}

const BUILDERS: Partial<Record<Nationality, Builder>> = {
  // Brasil: todos os clubes das três divisões em seis fases; o mandante do jogo único é o de menor reputação; oitavas a final em ida e volta.
  Brazil: (leagues) => [
    {
      ...nationalCup({
        id: 'cup-br',
        name: 'Copa Nacional',
        country: 'Brazil',
        leagues,
        home: 'lower-reputation',
        stages: [
          { name: 'Primeira fase', legs: 1, date: [2, 4] },
          { name: 'Segunda fase', legs: 1, date: [2, 25] },
          { name: 'Oitavas de final', legs: 2, date: [3, 25] },
          { name: 'Quartas de final', legs: 2, date: [5, 6] },
          { name: 'Semifinais', legs: 2, date: [7, 22] },
          { name: 'Final', legs: 2, date: [10, 14], legGap: 14 },
        ],
        prize: prize([100_000, 150_000, 400_000, 800_000, 1_500_000, 2_500_000], 12_000_000, 5_000_000),
      }),
      discipline: { yellowsPerSuspension: 3, redCardGames: 1, clearYellowsAfterStage: 3 },
    },
    twoClubSupercup('supercup-br', 'Supercopa Nacional', 'Brazil', top(leagues), 'cup-br', [2, 1], { neutral: true, extraTime: true, home: 'draw' }),
  ],

  // Inglaterra: jogo único até a final, sem jogo de volta; semifinais e final em campo neutro. (A copa da liga e o Community Shield ficam por conta do pacote.)
  England: (leagues) => [
    nationalCup({
      id: 'cup-en',
      name: 'Copa da Inglaterra',
      country: 'England',
      leagues,
      home: 'lower-division',
      stages: [
        { name: 'Fase preliminar', legs: 1, date: [11, 4] },
        { name: 'Oitavas de final', legs: 1, date: [1, 11] },
        { name: 'Quartas de final', legs: 1, date: [3, 11] },
        { name: 'Semifinais', legs: 1, date: [4, 22], neutral: true },
        { name: 'Final', legs: 1, date: [5, 20], neutral: true },
      ],
      prize: prize([150_000, 300_000, 600_000, 1_200_000, 2_500_000], 8_000_000, 3_000_000),
    }),
  ],

  // Espanha: jogo único (o clube de divisão inferior joga em casa) até as quartas, semifinais em ida e volta e final neutra; supercopa de quatro clubes.
  Spain: (leagues) => [
    nationalCup({
      id: 'cup-es',
      name: 'Copa da Espanha',
      country: 'Spain',
      leagues,
      home: 'lower-division',
      stages: [
        { name: 'Primeira fase', legs: 1, date: [11, 4] },
        { name: 'Oitavas de final', legs: 1, date: [1, 13] },
        { name: 'Quartas de final', legs: 1, date: [2, 3] },
        { name: 'Semifinais', legs: 2, date: [2, 25] },
        { name: 'Final', legs: 1, date: [4, 25], neutral: true },
      ],
      prize: prize([100_000, 200_000, 400_000, 1_000_000, 2_000_000], 7_000_000, 3_000_000),
    }),
    fourClubSupercup('supercup-es', 'Supercopa da Espanha', 'Spain', top(leagues), 'cup-es', [[1, 8], [1, 12]]),
  ],

  // Itália: jogo único com mandante o clube de maior reputação (os cabeças de chave jogam em casa), semifinais em ida e volta, final neutra; supercopa de quatro clubes.
  Italy: (leagues) => [
    nationalCup({
      id: 'cup-it',
      name: 'Copa da Itália',
      country: 'Italy',
      leagues,
      home: 'higher-reputation',
      stages: [
        { name: 'Primeira fase', legs: 1, date: [11, 4] },
        { name: 'Oitavas de final', legs: 1, date: [1, 13] },
        { name: 'Quartas de final', legs: 1, date: [2, 3] },
        { name: 'Semifinais', legs: 2, date: [4, 22] },
        { name: 'Final', legs: 1, date: [5, 13], neutral: true },
      ],
      prize: prize([100_000, 200_000, 400_000, 1_000_000, 2_000_000], 6_000_000, 2_500_000),
    }),
    fourClubSupercup('supercup-it', 'Supercopa da Itália', 'Italy', top(leagues), 'cup-it', [[12, 20], [12, 23]]),
  ],

  // Alemanha: sempre jogo único, o clube de divisão inferior joga em casa; final neutra. Supercopa: o campeão da liga recebe o da copa.
  Germany: (leagues) => [
    nationalCup({
      id: 'cup-de',
      name: 'Copa da Alemanha',
      country: 'Germany',
      leagues,
      home: 'lower-division',
      stages: [
        { name: 'Primeira fase', legs: 1, date: [8, 12] },
        { name: 'Oitavas de final', legs: 1, date: [10, 28] },
        { name: 'Quartas de final', legs: 1, date: [2, 3] },
        { name: 'Semifinais', legs: 1, date: [4, 22] },
        { name: 'Final', legs: 1, date: [5, 20], neutral: true },
      ],
      prize: prize([150_000, 300_000, 600_000, 1_200_000, 2_000_000], 7_000_000, 3_000_000),
    }),
    twoClubSupercup('supercup-de', 'Supercopa da Alemanha', 'Germany', top(leagues), 'cup-de', [8, 2], { neutral: false, extraTime: true, home: 'first-listed' }),
  ],

  // França: jogo único, clube de divisão inferior em casa, final neutra.
  France: (leagues) => [
    nationalCup({
      id: 'cup-fr',
      name: 'Copa da França',
      country: 'France',
      leagues,
      home: 'lower-division',
      stages: [
        { name: 'Primeira fase', legs: 1, date: [11, 18] },
        { name: 'Oitavas de final', legs: 1, date: [1, 6] },
        { name: 'Quartas de final', legs: 1, date: [2, 10] },
        { name: 'Semifinais', legs: 1, date: [4, 7] },
        { name: 'Final', legs: 1, date: [5, 20], neutral: true },
      ],
      prize: prize([100_000, 200_000, 400_000, 800_000, 1_500_000], 5_000_000, 2_000_000),
    }),
  ],

  // Portugal: a copa (jogo único, semifinais em ida e volta, final neutra) e a copa da liga (fase de grupos com 16 clubes e fase final de semifinais e final em campo neutro).
  Portugal: (leagues) => [
    nationalCup({
      id: 'cup-pt',
      name: 'Copa de Portugal',
      country: 'Portugal',
      leagues,
      home: 'lower-division',
      stages: [
        { name: 'Primeira fase', legs: 1, date: [10, 7] },
        { name: 'Oitavas de final', legs: 1, date: [12, 2] },
        { name: 'Quartas de final', legs: 1, date: [2, 24] },
        { name: 'Semifinais', legs: 2, date: [4, 7] },
        { name: 'Final', legs: 1, date: [5, 27], neutral: true },
      ],
      prize: prize([60_000, 120_000, 250_000, 500_000, 900_000], 2_500_000, 1_000_000),
    }),
    {
      id: 'league-cup-pt',
      name: 'Copa da Liga de Portugal',
      kind: 'cup',
      country: 'Portugal',
      format: 'groups-knockout',
      entrants: [{ source: position(top(leagues), 1, 16) }],
      groups: { name: 'Fase de grupos', count: 4, advance: 1, legs: 1, date: [11, 5], gapDays: 14 },
      stages: [
        { name: 'Semifinais', legs: 1, date: [1, 14], neutral: true },
        { name: 'Final', legs: 1, date: [1, 28], neutral: true },
      ],
      seeding: 'seeded',
      homeOfSingleLeg: 'draw',
      awayGoals: false,
      extraTime: false,
      penalties: true,
      discipline: { yellowsPerSuspension: 3, redCardGames: 1 },
      prize: prize([40_000, 100_000, 200_000], 1_200_000, 500_000),
    },
  ],

  // Argentina: copa em jogos únicos em campo neutro, com os pênaltis direto depois do empate (sem prorrogação); supercopa do campeão da liga contra o da copa, em campo neutro.
  Argentina: (leagues) => [
    nationalCup({
      id: 'cup-ar',
      name: 'Copa da Argentina',
      country: 'Argentina',
      leagues,
      home: 'draw',
      extraTime: false,
      stages: [
        { name: 'Primeira fase', legs: 1, date: [2, 11], neutral: true },
        { name: 'Oitavas de final', legs: 1, date: [3, 25], neutral: true },
        { name: 'Quartas de final', legs: 1, date: [5, 13], neutral: true },
        { name: 'Semifinais', legs: 1, date: [7, 15], neutral: true },
        { name: 'Final', legs: 1, date: [9, 16], neutral: true },
      ],
      prize: prize([60_000, 120_000, 250_000, 500_000, 900_000], 2_500_000, 1_000_000),
    }),
    twoClubSupercup('supercup-ar', 'Supercopa da Argentina', 'Argentina', top(leagues), 'cup-ar', [2, 4], { neutral: true, extraTime: false, home: 'draw' }),
  ],
}

/** Países que têm copas padrão. */
export const COUNTRIES_WITH_CUPS: readonly Nationality[] = Object.keys(BUILDERS) as Nationality[]

/** As copas padrão de um país, a partir das divisões dele no pacote (vazio se o país não tem copas padrão ou nenhuma divisão). */
export function defaultCupsFor(country: Nationality, leagues: readonly CountryLeague[]): PackageCup[] {
  const build = BUILDERS[country]
  return build && leagues.length > 0 ? build(leagues) : []
}
