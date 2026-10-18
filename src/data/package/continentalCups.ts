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

const prize = (perStage: number[], champion: number, runnerUp: number) => ({ perStage, champion, runnerUp })

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
 * As copas continentais padrão de uma região, pelas primeiras divisões dos países dela. `undefined` se a região não tem países
 * suficientes (Europa: 5; América do Sul: 5) ou se as vagas não cabem nas ligas.
 */
export function defaultContinentalCups(region: Region, leagues: readonly ContinentalLeague[]): PackageCup[] | undefined {
  const mine = leagues.filter((l) => l.region === region).sort((a, b) => a.id.localeCompare(b.id))
  if (region === 'EU') return mine.length >= 5 ? europe(mine) : undefined
  if (region === 'SA') return mine.length >= 5 ? southAmerica(mine) : undefined
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
