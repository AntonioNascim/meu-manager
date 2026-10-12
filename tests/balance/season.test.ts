/**
 * Testes de balanceamento: comparam o motor com as metas do CLAUDE.md.
 *   Média de milhares de partidas:
 *     - ~2,3 a 2,5 gols por jogo
 *     - mandante vence ~45–50%, empates ~25–30%
 *     - ~12 finalizações por time por jogo
 *   Temporada da Série A (turno e returno):
 *     - campeão com ~70 a 82 pontos
 *     - empates entre 24% e 30%
 * Rodar com `npm run test:balance` (não entra no `npm test`).
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import type { BalanceSummary, SeasonSummary } from './helpers'
import { formatSummary, simulateRandomMatches, simulateSeasons } from './helpers'

const TARGETS = {
  goalsPerMatch: [2.3, 2.5],
  homeWinRate: [0.45, 0.5],
  drawRate: [0.25, 0.3],
  shotsPerTeam: [11, 13],
  championPoints: [70, 82],
  seasonDrawRate: [0.24, 0.3],
} as const

const between = (value: number, [min, max]: readonly [number, number]) => {
  expect(value).toBeGreaterThanOrEqual(min)
  expect(value).toBeLessThanOrEqual(max)
}

/** Junta resumos ponderando pelo número de partidas. */
function combine(summaries: BalanceSummary[]): BalanceSummary {
  const total = summaries.reduce((n, s) => n + s.matches, 0)
  const weighted = (key: keyof BalanceSummary) => summaries.reduce((acc, s) => acc + s[key] * s.matches, 0) / total
  return {
    matches: total,
    goalsPerMatch: weighted('goalsPerMatch'),
    homeWinRate: weighted('homeWinRate'),
    drawRate: weighted('drawRate'),
    awayWinRate: weighted('awayWinRate'),
    shotsPerTeam: weighted('shotsPerTeam'),
    shotsOnTargetPerTeam: weighted('shotsOnTargetPerTeam'),
    cornersPerTeam: weighted('cornersPerTeam'),
    foulsPerTeam: weighted('foulsPerTeam'),
    yellowsPerMatch: weighted('yellowsPerMatch'),
    redsPerMatch: weighted('redsPerMatch'),
    msPerMatch: weighted('msPerMatch'),
  }
}

function correlation(xs: number[], ys: number[]): number {
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0
  let dx = 0
  let dy = 0
  xs.forEach((x, i) => {
    const y = ys[i] as number
    num += (x - mx) * (y - my)
    dx += (x - mx) ** 2
    dy += (y - my) ** 2
  })
  return num / Math.sqrt(dx * dy)
}

const header = `${'amostra'.padEnd(26)} |   gols | mandante |  empate | visitante | final.`

describe('milhares de partidas', () => {
  const perWorld = [1, 2].map((seed, i) => simulateRandomMatches(generateWorld({ seed }), 3000, `balance-${i}`))
  const all = combine(perWorld)
  console.log(
    [
      header,
      ...perWorld.map((s, i) => formatSummary(`mundo ${i + 1}: ${s.matches} partidas`, s)),
      formatSummary(`total: ${all.matches} partidas`, all),
      'metas: gols 2,3–2,5 | mandante 45–50% | empate 25–30% | finalizações ~12',
    ].join('\n'),
  )

  it('gols por jogo entre 2,3 e 2,5', () => between(all.goalsPerMatch, TARGETS.goalsPerMatch))
  it('mandante vence entre 45% e 50%', () => between(all.homeWinRate, TARGETS.homeWinRate))
  it('empates entre 25% e 30%', () => between(all.drawRate, TARGETS.drawRate))
  it('cerca de 12 finalizações por time', () => between(all.shotsPerTeam, TARGETS.shotsPerTeam))

  it('demais números do jogo ficam realistas', () => {
    between(all.shotsOnTargetPerTeam / all.shotsPerTeam, [0.3, 0.45])
    between(all.cornersPerTeam, [3.5, 6.5])
    between(all.foulsPerTeam, [10, 18])
    between(all.yellowsPerMatch, [2.5, 5.5])
    expect(all.redsPerMatch).toBeLessThan(0.4)
  })

  it('cada partida roda em poucos milissegundos', () => {
    expect(all.msPerMatch).toBeLessThan(10)
  })
})

describe('temporadas pelo calendário (Série A e Série B, 380 jogos cada)', () => {
  // 20 mundos diferentes: a meta vale para a temporada média; cada temporada isolada
  // varia por sorte (como num campeonato real), então ali as faixas são mais largas.
  const SEASONS = 20
  const runs = Array.from({ length: SEASONS }, (_, i) => i + 1).map((seed) => simulateSeasons(generateWorld({ seed }), `season-${seed}`))
  const seasonsA = runs.map((r) => r[1])
  const seasonsB = runs.map((r) => r[2])
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const champions = seasonsA.map((s) => s.table[0]?.points ?? 0)
  const draws = seasonsA.map((s) => s.drawRate)
  console.log(
    [
      header,
      ...seasonsA.slice(0, 12).map((season, i) => {
        const t = season.table
        return `${formatSummary(`mundo ${i + 1}, Série A`, season)} | campeão ${t[0]?.team.abbreviation} ${t[0]?.points} pts, lanterna ${t[t.length - 1]?.team.abbreviation} ${t[t.length - 1]?.points} pts`
      }),
      `temporada média (${SEASONS} mundos): campeão ${mean(champions).toFixed(1)} pts, empates ${(100 * mean(draws)).toFixed(1)}% | metas: campeão ~70–82 pts, empates 24–30%`,
    ].join('\n'),
  )

  it('temporada média: empates entre 24% e 30%', () => {
    between(mean(draws), TARGETS.seasonDrawRate)
  })

  it('temporada média: campeão com ~70 a 82 pontos', () => {
    between(mean(champions), TARGETS.championPoints)
  })

  it('cada temporada isolada fica dentro da variação natural em torno das metas', () => {
    for (const season of seasonsA) {
      between(season.drawRate, [0.19, 0.34])
      between(season.table[0]?.points ?? 0, [62, 97])
      between(season.table[season.table.length - 1]?.points ?? 0, [15, 40])
      between(season.goalsPerMatch, [2.0, 2.8])
      between(season.homeWinRate, [0.4, 0.6])
      between(season.shotsPerTeam, [10.5, 14])
      expect(season.matches).toBe(380)
    }
  })

  /** Posição final média por faixa de força dos titulares (1º–4º, 5º–12º, 13º–20º da série). */
  function bands(seasons: SeasonSummary[]) {
    const rows = seasons.flatMap((season) => {
      const byStrength = [...season.table].sort((a, b) => b.strength - a.strength)
      return season.table.map((row, i) => ({ pos: i + 1, points: row.points, strengthRank: byStrength.indexOf(row) + 1 }))
    })
    const band = (from: number, to: number) => rows.filter((r) => r.strengthRank >= from && r.strengthRank <= to)
    const strongest = rows.filter((r) => r.strengthRank === 1)
    return {
      top: band(1, 4),
      middle: band(5, 12),
      weak: band(13, 20),
      strongest,
      avgPos: (g: typeof rows) => mean(g.map((r) => r.pos)),
      avgPoints: (g: typeof rows) => mean(g.map((r) => r.points)),
      titlesFrom: (g: typeof rows) => g.filter((r) => r.pos === 1).length / seasons.length,
    }
  }

  for (const [label, seasons, wider] of [['Série A', seasonsA, 0], ['Série B', seasonsB, 0.4]] as const) {
    it(`${label}: os elencos mais fortes terminam em cima, os mais fracos embaixo, com espaço para zebras`, () => {
      const b = bands(seasons)
      console.log(
        `${label} por faixa de força (${SEASONS} temporadas): top 4 → ${b.avgPos(b.top).toFixed(1)}º, ${b.avgPoints(b.top).toFixed(1)} pts | médios → ${b.avgPos(b.middle).toFixed(1)}º, ${b.avgPoints(b.middle).toFixed(1)} pts | fracos → ${b.avgPos(b.weak).toFixed(1)}º, ${b.avgPoints(b.weak).toFixed(1)} pts | o mais forte → ${b.avgPos(b.strongest).toFixed(1)}º`,
      )
      // Ordem clara entre as faixas...
      expect(b.avgPos(b.top)).toBeLessThanOrEqual(5.6 + wider)
      expect(b.avgPos(b.weak)).toBeGreaterThanOrEqual(13.4)
      expect(b.avgPoints(b.top)).toBeGreaterThan(b.avgPoints(b.middle) + 6)
      expect(b.avgPoints(b.middle)).toBeGreaterThan(b.avgPoints(b.weak) + 6)
      // ...o elenco mais forte termina entre os primeiros e nunca na metade de baixo...
      expect(b.avgPos(b.strongest)).toBeLessThanOrEqual(3.8 + wider)
      expect(Math.max(...b.strongest.map((r) => r.pos))).toBeLessThanOrEqual(14)
      // ...mas há zebras: elencos fora do top 4 de força entram no G4 e levam títulos.
      const g4 = seasons.flatMap((s) => s.table.slice(0, 4))
      const g4Outsiders = g4.filter((row) => {
        const season = seasons.find((s) => s.table.includes(row)) as SeasonSummary
        return [...season.table].sort((x, y) => y.strength - x.strength).indexOf(row) >= 4
      })
      expect(g4Outsiders.length / g4.length).toBeGreaterThan(0.25)
      expect(g4Outsiders.length / g4.length).toBeLessThan(0.65)
      // (Na Série A, mais embolada no topo, ao menos um título sai de fora dos 4 mais fortes.)
      if (label === 'Série A') expect(1 - b.titlesFrom(b.top)).toBeGreaterThan(0)
    })
  }

  it('o elenco mais fraco raramente escapa do fundo da tabela', () => {
    const lastTwo = seasonsA.filter((season) => {
      const weakest = [...season.table].sort((a, b) => a.strength - b.strength)[0]
      return season.table.indexOf(weakest as (typeof season.table)[number]) >= 14
    })
    expect(lastTwo.length / SEASONS).toBeGreaterThan(0.55)
  })

  it('a força explica boa parte dos pontos (correlação), sem decidir tudo', () => {
    for (const season of seasonsA) {
      const strength = season.table.map((r) => r.strength)
      const points = season.table.map((r) => r.points)
      expect(correlation(strength, points)).toBeGreaterThan(0.25)
      const byStrength = [...season.table].sort((a, b) => b.strength - a.strength)
      expect(season.table.map((r) => r.team.id)).not.toEqual(byStrength.map((r) => r.team.id))
    }
    const all = seasonsA.map((s) => correlation(s.table.map((r) => r.strength), s.table.map((r) => r.points)))
    between(mean(all), [0.55, 0.88])
  })

  it('Série B: perto das metas (faixas mais largas)', () => {
    console.log(
      seasonsB
        .slice(0, 2)
        .map((s, i) => `${formatSummary(`mundo ${i + 1}, Série B`, s)} | campeão ${s.table[0]?.points} pts, lanterna ${s.table[s.table.length - 1]?.points} pts`)
        .join('\n'),
    )
    for (const season of seasonsB) {
      between(season.goalsPerMatch, [1.9, 2.8])
      between(season.drawRate, [0.2, 0.36])
      between(season.homeWinRate, [0.38, 0.58])
    }
    // A vantagem de jogar em casa não some na Série B (elencos mais fracos, estádios mais vazios).
    between(mean(seasonsB.map((s) => s.homeWinRate)), [0.42, 0.58])
    expect(mean(seasonsA.map((s) => s.homeWinRate)) - mean(seasonsB.map((s) => s.homeWinRate))).toBeLessThan(0.05)
  })
})
