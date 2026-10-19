/**
 * Copas continentais padrão (Fase 3, parte 3C): América do Sul (copa principal com fases preliminares, grupos e mata-mata; copa
 * secundária com grupos, repescagem com os terceiros da principal e mata-mata) e Europa (três copas com fase de liga de tabela única,
 * repescagem e mata-mata, a final em jogo único). Os tamanhos são menores que os reais, proporcionais ao mundo que temos (6 ligas
 * europeias, 7 sul-americanas), e as vagas de cada país seguem a força da liga dele (raiz da receita), incluindo os campeões das copas
 * nacionais. Os nomes são genéricos: os nomes oficiais dos campeonatos são marcas e o nome vem do pacote.
 *
 * Só viram padrão num pacote que tem países suficientes na região (a conta das vagas precisa fechar); senão a região fica sem copa
 * continental, com um aviso.
 */
import type { CupEntrant, Nationality, Region } from '../../engine/types'
import { COUNTRY_DEFAULTS } from './leagueDefaults'
import type { PackageCup } from './types'

/** Uma liga da primeira divisão de um país, como o gerador de copas a enxerga. */
export interface ContinentalLeague {
  id: string
  country: Nationality
  region: Region
  teams: number
  /** Receita do país em relação ao Brasil (define o peso nas vagas). */
  revenue: number
  /** Copa nacional do país (o campeão dela ganha vaga). */
  nationalCup?: string
}

/** Países da região com o peso (raiz da receita) usado para repartir as vagas. */
const weightOf = (l: ContinentalLeague) => Math.sqrt(Math.max(0.05, l.revenue))

/** Reparte `total` vagas entre os países pelo peso (maiores restos), respeitando mínimo e máximo de cada um. `undefined` se não cabe. */
export function allocateSlots(leagues: readonly ContinentalLeague[], total: number, min: number, cap: (l: ContinentalLeague) => number): Map<string, number> | undefined {
  const out = new Map(leagues.map((l) => [l.id, Math.min(min, cap(l))]))
  let left = total - [...out.values()].reduce((a, b) => a + b, 0)
  if (left < 0) return undefined
  const weights = leagues.map(weightOf)
  const sum = weights.reduce((a, b) => a + b, 0)
  // Maiores restos sobre a cota ideal, uma vaga por vez, sem passar do teto de ninguém.
  while (left > 0) {
    let best = -1
    let bestGap = -Infinity
    leagues.forEach((l, i) => {
      const have = out.get(l.id) as number
      if (have >= cap(l)) return
      const gap = (total * (weights[i] as number)) / sum - have
      if (gap > bestGap) {
        bestGap = gap
        best = i
      }
    })
    if (best < 0) return undefined
    const league = leagues[best] as ContinentalLeague
    out.set(league.id, (out.get(league.id) as number) + 1)
    left--
  }
  return out
}

const league = (id: string, from: number, to = from): CupEntrant['source'] => ({ type: 'league', league: id, positions: [from, to] })

const DISCIPLINE = { yellowsPerSuspension: 3, redCardGames: 1 } as const

/** Vagas de um país numa copa: as colocações da liga e, se o país tem copa nacional, o campeão dela no lugar da última vaga. */
function countryEntrants(l: ContinentalLeague, from: number, count: number, stage = 0, withCupWinner = false): CupEntrant[] {
  if (count <= 0) return []
  if (withCupWinner && l.nationalCup) {
    const out: CupEntrant[] = []
    if (count > 1) out.push({ source: league(l.id, from, from + count - 2), ...(stage ? { stage } : {}) })
    // O campeão da copa nacional ocupa a última vaga; se ele já está na copa (ou em outra copa excluída), vale o próximo colocado da liga.
    out.push({ source: { type: 'cup', cup: l.nationalCup, place: 'winner' }, fallback: league(l.id, from + count - 1), ...(stage ? { stage } : {}) })
    return out
  }
  return [{ source: league(l.id, from, from + count - 1), ...(stage ? { stage } : {}) }]
}

/**
 * Premiação em unidades do Brasil (vezes o índice de receita da liga do clube). Medida em 10 temporadas do mundo de 282 clubes: com os valores
 * "cheios" (campeão da copa principal europeia = 35M) o dinheiro continental era 14,7% da receita em média (23,7% na Inglaterra, até 119% de um
 * clube pequeno); `SCALE` leva a média a ~5%, o que não cria clubes que ganham tudo sempre.
 */
const SCALE = 0.33
const prize = (perStage: number[], champion: number, runnerUp: number) => ({ perStage: perStage.map((v) => Math.round((v * SCALE) / 100_000) * 100_000), champion: Math.round((champion * SCALE) / 100_000) * 100_000, runnerUp: Math.round((runnerUp * SCALE) / 100_000) * 100_000 })

/** Europa: três copas (24, 16 e 12 clubes). `undefined` se os países da região não têm clubes para as vagas. */
function europe(leagues: readonly ContinentalLeague[]): PackageCup[] | undefined {
  const cap = (used: Map<string, number>) => (l: ContinentalLeague) => Math.max(0, Math.floor(l.teams * 0.5) - (used.get(l.id) ?? 0))
  const first = allocateSlots(leagues, 24, 2, cap(new Map()))
  if (!first) return undefined
  const second = allocateSlots(leagues, 16, 1, cap(first))
  if (!second) return undefined
  const used3 = new Map(leagues.map((l) => [l.id, (first.get(l.id) as number) + (second.get(l.id) as number)]))
  const third = allocateSlots(leagues, 12, 0, cap(used3))
  if (!third) return undefined
  const all = (n: Map<string, number>, from: (l: ContinentalLeague) => number, cupWinner: boolean) => leagues.flatMap((l) => countryEntrants(l, from(l) + 1, n.get(l.id) as number, 0, cupWinner))
  const common = { kind: 'cup' as const, region: 'EU' as const, awayGoals: false, extraTime: true, penalties: true, discipline: DISCIPLINE }
  const leagueKnockout = (name: string, pots: number, matches: number, direct: number, playoff: number, date: [number, number], gap: number) => ({ name, pots, matchesPerTeam: matches, direct, playoff, date, gapDays: gap })
  return [
    {
      ...common,
      id: 'cont-eu-1',
      name: 'Liga Continental dos Campeões',
      format: 'league-knockout',
      entrants: all(first, () => 0, false),
      leaguePhase: leagueKnockout('Fase de liga', 4, 8, 4, 8, [9, 16], 14),
      stages: [
        { name: 'Repescagem', legs: 2, date: [2, 17], legGap: 7 },
        { name: 'Quartas de final', legs: 2, date: [3, 17], legGap: 7 },
        { name: 'Semifinais', legs: 2, date: [4, 28], legGap: 7 },
        { name: 'Final', legs: 1, date: [5, 27], neutral: true },
      ],
      weekday: 3,
      seeding: 'ranked',
      homeOfSingleLeg: 'draw',
      prize: prize([15_000_000, 3_000_000, 6_000_000, 9_000_000, 14_000_000], 35_000_000, 14_000_000),
    },
    {
      ...common,
      id: 'cont-eu-2',
      name: 'Liga Continental Europeia',
      format: 'league-knockout',
      entrants: all(second, (l) => first.get(l.id) as number, true),
      leaguePhase: leagueKnockout('Fase de liga', 2, 8, 4, 8, [9, 17], 14),
      stages: [
        { name: 'Repescagem', legs: 2, date: [2, 18], legGap: 7 },
        { name: 'Quartas de final', legs: 2, date: [3, 18], legGap: 7 },
        { name: 'Semifinais', legs: 2, date: [4, 29], legGap: 7 },
        { name: 'Final', legs: 1, date: [5, 21], neutral: true },
      ],
      weekday: 4,
      excludeCups: ['cont-eu-1'],
      seeding: 'ranked',
      homeOfSingleLeg: 'draw',
      prize: prize([6_000_000, 1_500_000, 3_000_000, 4_500_000, 7_000_000], 15_000_000, 6_000_000),
    },
    {
      ...common,
      id: 'cont-eu-3',
      name: 'Copa Continental Europeia',
      format: 'league-knockout',
      entrants: all(third, (l) => (first.get(l.id) as number) + (second.get(l.id) as number), false),
      leaguePhase: leagueKnockout('Fase de liga', 2, 4, 2, 4, [9, 24], 14),
      stages: [
        { name: 'Repescagem', legs: 2, date: [2, 19], legGap: 7 },
        { name: 'Semifinais', legs: 2, date: [4, 16], legGap: 7 },
        { name: 'Final', legs: 1, date: [5, 20], neutral: true },
      ],
      weekday: 4,
      excludeCups: ['cont-eu-1', 'cont-eu-2'],
      seeding: 'ranked',
      homeOfSingleLeg: 'draw',
      prize: prize([3_000_000, 1_000_000, 2_000_000, 3_500_000], 7_000_000, 3_000_000),
    },
  ]
}

/**
 * América do Sul: copa principal (preliminares, 4 grupos de 4, mata-mata de 8) e secundária (4 grupos de 4 mais os 4 terceiros da principal). Os dois
 * têm o mesmo número de grupos para a conta fechar: 4 segundos e 4 terceiros jogam a repescagem e os 4 vencedores se juntam aos 4 líderes.
 */
function southAmerica(leagues: readonly ContinentalLeague[]): PackageCup[] | undefined {
  const cap = (used: Map<string, number>) => (l: ContinentalLeague) => Math.max(0, Math.floor(l.teams * 0.5) - (used.get(l.id) ?? 0))
  // 20 vagas na principal (4 na primeira preliminar, 2 na segunda e 14 direto nos grupos) e 16 na secundária.
  const first = allocateSlots(leagues, 20, 2, cap(new Map()))
  if (!first) return undefined
  const second = allocateSlots(leagues, 16, 1, cap(first))
  if (!second) return undefined
  // Os países mais fracos mandam o último colocado da cota para as preliminares: 4 na primeira, 2 na segunda.
  const weakest = [...leagues].sort((a, b) => weightOf(a) - weightOf(b) || a.id.localeCompare(b.id))
  const prelim1 = weakest.slice(0, 4)
  const prelim2 = weakest.slice(4, 6)
  const stageOf = (l: ContinentalLeague) => (prelim1.includes(l) ? 0 : prelim2.includes(l) ? 1 : 2)
  const principal = leagues.flatMap((l) => {
    const n = first.get(l.id) as number
    const stage = stageOf(l)
    // As preliminares ficam com o último da cota; o resto vai direto aos grupos (fase 2).
    if (stage === 2 || n < 2) return countryEntrants(l, 1, n, 2, true)
    return [...countryEntrants(l, 1, n - 1, 2, true), { source: league(l.id, n), stage } as CupEntrant]
  })
  const common = { kind: 'cup' as const, region: 'SA' as const, awayGoals: false, extraTime: true, penalties: true, discipline: DISCIPLINE }
  return [
    {
      ...common,
      id: 'cont-sa-1',
      name: 'Copa Continental dos Campeões da América do Sul',
      format: 'groups-knockout',
      entrants: principal,
      preliminary: [
        { name: 'Fase preliminar 1', legs: 2, date: [2, 10], legGap: 7 },
        { name: 'Fase preliminar 2', legs: 2, date: [2, 24], legGap: 7 },
      ],
      groups: { name: 'Fase de grupos', count: 4, advance: 2, legs: 2, date: [4, 7], gapDays: 14 },
      stages: [
        { name: 'Quartas de final', legs: 2, date: [9, 1], legGap: 7 },
        { name: 'Semifinais', legs: 2, date: [10, 6], legGap: 7 },
        { name: 'Final', legs: 1, date: [11, 17], neutral: true },
      ],
      weekday: 3,
      seeding: 'ranked',
      homeOfSingleLeg: 'draw',
      prize: prize([1_000_000, 1_500_000, 4_000_000, 4_000_000, 6_000_000, 10_000_000], 25_000_000, 10_000_000),
    },
    {
      ...common,
      id: 'cont-sa-2',
      name: 'Copa Continental da América do Sul',
      format: 'groups-knockout',
      entrants: [
        ...leagues.flatMap((l) => countryEntrants(l, (first.get(l.id) as number) + 1, second.get(l.id) as number, 0, true)),
        // Os terceiros colocados dos grupos da copa principal entram na repescagem.
        { source: { type: 'cup-group-place', cup: 'cont-sa-1', place: 3 }, stage: 1 },
      ],
      groups: { name: 'Fase de grupos', count: 4, advance: 2, direct: 1, legs: 2, date: [4, 14], gapDays: 14 },
      stages: [
        { name: 'Repescagem', legs: 2, date: [7, 22], legGap: 7 },
        { name: 'Quartas de final', legs: 2, date: [9, 16], legGap: 7 },
        { name: 'Semifinais', legs: 2, date: [10, 14], legGap: 7 },
        { name: 'Final', legs: 1, date: [11, 24], neutral: true },
      ],
      weekday: 4,
      excludeCups: ['cont-sa-1'],
      seeding: 'ranked',
      homeOfSingleLeg: 'draw',
      prize: prize([2_000_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000], 10_000_000, 4_000_000),
    },
  ]
}

/**
 * América do Norte (Fase 3, parte 3D): uma copa de 16 clubes em mata-mata (oitavas a final, ida e volta), com as vagas repartidas entre as
 * ligas da região pela raiz da receita. Calendário do ano civil, como as ligas dela (fevereiro a maio).
 */
function northAmerica(leagues: readonly ContinentalLeague[]): PackageCup[] | undefined {
  const cap = (l: ContinentalLeague) => Math.max(0, Math.floor(l.teams * 0.5))
  const slots = allocateSlots(leagues, 16, 2, cap)
  if (!slots) return undefined
  return [
    {
      kind: 'cup',
      region: 'NA',
      awayGoals: false,
      extraTime: true,
      penalties: true,
      discipline: DISCIPLINE,
      id: 'cont-na-1',
      name: 'Copa Continental da América do Norte',
      format: 'knockout',
      entrants: leagues.flatMap((l) => countryEntrants(l, 1, slots.get(l.id) as number, 0, true)),
      stages: [
        { name: 'Oitavas de final', legs: 2, date: [2, 18], legGap: 7 },
        { name: 'Quartas de final', legs: 2, date: [3, 18], legGap: 7 },
        { name: 'Semifinais', legs: 2, date: [4, 15], legGap: 7 },
        { name: 'Final', legs: 2, date: [5, 13], legGap: 7 },
      ],
      weekday: 3,
      seeding: 'seeded',
      homeOfSingleLeg: 'draw',
      prize: prize([2_000_000, 3_000_000, 4_000_000, 6_000_000], 14_000_000, 6_000_000),
    },
  ]
}

/** Quantos clubes de primeira divisão cada continente precisa ter para as copas mundiais (o Mundial leva 12, 6, 4, 4, 4 + 1 do país-sede e 1). */
const WORLD_SLOTS: Record<Exclude<Region, 'BR'>, number> = { EU: 12, SA: 6, NA: 5, AF: 4, AS: 4, OC: 1 }

/**
 * Copas mundiais padrão (3D): a Copa Intercontinental, todo ano em dezembro, com o campeão de cada continente (Europa, América do Sul e América
 * do Norte pelas copas continentais; África, Ásia e Oceania pelo campeão da liga de elite da região), e o Mundial de Clubes, de quatro em
 * quatro anos (2029, 2033...), de junho a meados de julho (depois das finais europeias e antes da abertura das ligas da Europa, da África, da Ásia e da Oceania), com 32 clubes em oito grupos e mata-mata: 12 da Europa, 6 da América do Sul, 4 da África, 4 da Ásia, 4 da América
 * do Norte, 1 da Oceania e 1 do país-sede (o campeão da primeira liga da América do Norte). Cada continente leva os campeões das últimas quatro
 * edições da copa continental e completa com os clubes mais fortes. `undefined` se faltam as copas continentais de Europa, América do Sul e
 * América do Norte, ou clubes em algum continente.
 */
export function defaultWorldCups(leagues: readonly ContinentalLeague[], cups: readonly Pick<PackageCup, 'id'>[]): PackageCup[] | undefined {
  const regionLeagues = (region: Region) => leagues.filter((l) => l.region === region).sort((a, b) => a.id.localeCompare(b.id))
  const has = (id: string) => cups.some((c) => c.id === id)
  if (!has('cont-eu-1') || !has('cont-sa-1') || !has('cont-na-1')) return undefined
  const clubs = (region: Region) => regionLeagues(region).reduce((n, l) => n + l.teams, 0)
  for (const region of Object.keys(WORLD_SLOTS) as (keyof typeof WORLD_SLOTS)[]) if (clubs(region) < WORLD_SLOTS[region]) return undefined
  const first = (region: Region) => regionLeagues(region)[0] as ContinentalLeague
  const common = { kind: 'cup' as const, awayGoals: false, extraTime: true, penalties: true, discipline: DISCIPLINE, weekday: 3 as const, homeOfSingleLeg: 'draw' as const }
  return [
    {
      ...common,
      id: 'world-1',
      name: 'Copa Intercontinental',
      world: { every: 1, offset: 0, from: [12, 1] },
      format: 'knockout',
      entrants: [
        { source: { type: 'cup', cup: 'cont-eu-1', place: 'winner', latest: true } },
        { source: { type: 'cup', cup: 'cont-sa-1', place: 'winner', latest: true } },
        { source: { type: 'cup', cup: 'cont-na-1', place: 'winner', latest: true } },
        { source: league(first('AF').id, 1) },
        { source: league(first('AS').id, 1) },
        { source: league(first('OC').id, 1) },
      ],
      stages: [
        { name: 'Primeira fase', legs: 1, date: [12, 3], neutral: true },
        { name: 'Semifinais', legs: 1, date: [12, 10], neutral: true },
        { name: 'Final', legs: 1, date: [12, 17], neutral: true },
      ],
      seeding: 'seeded',
      prize: prize([1_500_000, 3_000_000, 5_000_000], 12_000_000, 5_000_000),
    },
    {
      ...common,
      id: 'world-2',
      name: 'Mundial de Clubes',
      world: { every: 4, offset: 2025, from: [6, 1] },
      format: 'groups-knockout',
      entrants: [
        { source: { type: 'region', region: 'EU', count: 12, cup: 'cont-eu-1', last: 4 } },
        { source: { type: 'region', region: 'SA', count: 6, cup: 'cont-sa-1', last: 4 } },
        { source: { type: 'region', region: 'AF', count: 4 } },
        { source: { type: 'region', region: 'AS', count: 4 } },
        { source: { type: 'region', region: 'NA', count: 4, cup: 'cont-na-1', last: 4 } },
        { source: { type: 'region', region: 'OC', count: 1 } },
        // O país-sede: o campeão da primeira liga da América do Norte (se já está no Mundial, o melhor clube da região que sobrar).
        { source: league(first('NA').id, 1), fallback: { type: 'region', region: 'NA', count: 1 } },
      ],
      groups: { name: 'Fase de grupos', count: 8, advance: 2, legs: 1, date: [6, 6], gapDays: 6 },
      stages: [
        { name: 'Oitavas de final', legs: 1, date: [6, 27], neutral: true },
        { name: 'Quartas de final', legs: 1, date: [7, 4], neutral: true },
        { name: 'Semifinais', legs: 1, date: [7, 11], neutral: true },
        { name: 'Final', legs: 1, date: [7, 18], neutral: true },
      ],
      seeding: 'ranked',
      prize: prize([8_000_000, 3_000_000, 5_000_000, 7_000_000, 10_000_000], 30_000_000, 12_000_000),
    },
  ]
}

/**
 * As copas continentais padrão de uma região, pelas primeiras divisões dos países dela. `undefined` se a região não tem países
 * suficientes (Europa e América do Sul: 5; América do Norte: 2) ou se as vagas não cabem nas ligas.
 */
export function defaultContinentalCups(region: Region, leagues: readonly ContinentalLeague[]): PackageCup[] | undefined {
  const mine = leagues.filter((l) => l.region === region).sort((a, b) => a.id.localeCompare(b.id))
  if (region === 'EU') return mine.length >= 5 ? europe(mine) : undefined
  if (region === 'SA') return mine.length >= 5 ? southAmerica(mine) : undefined
  if (region === 'NA') return mine.length >= 2 ? northAmerica(mine) : undefined
  return undefined
}

/** O continente de um país (o Brasil, de janelas próprias, conta como América do Sul); `region` é o que o pacote diz, senão o padrão do país. */
export function countryRegion(country: string, region?: Region): Region | undefined {
  const r = region ?? COUNTRY_DEFAULTS[country as Nationality]?.region
  return r === 'BR' ? 'SA' : r
}
export function countryRevenue(country: string, revenue?: number): number {
  return revenue ?? COUNTRY_DEFAULTS[country as Nationality]?.economy?.revenue ?? 1
}
