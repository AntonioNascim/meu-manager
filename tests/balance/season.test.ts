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
import type { BalanceSummary } from './helpers'
import { formatSummary, simulateRandomMatches, simulateSeason } from './helpers'

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

describe('temporadas da Série A (turno e returno, 380 jogos)', () => {
  // 12 mundos diferentes: a meta vale para a temporada média; cada temporada isolada
  // varia por sorte (como num campeonato real), então ali as faixas são mais largas.
  const seasons = Array.from({ length: 12 }, (_, i) => i + 1).map((seed) => ({
    label: `mundo ${seed}, Série A`,
    season: simulateSeason(generateWorld({ seed }), 1, `season-${seed}`),
  }))
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const champions = seasons.map(({ season }) => season.table[0]?.points ?? 0)
  const draws = seasons.map(({ season }) => season.drawRate)
  console.log(
    [
      header,
      ...seasons.map(({ label, season }) => {
        const t = season.table
        return `${formatSummary(label, season)} | campeão ${t[0]?.team.abbreviation} ${t[0]?.points} pts, lanterna ${t[t.length - 1]?.team.abbreviation} ${t[t.length - 1]?.points} pts`
      }),
      `temporada média: campeão ${mean(champions).toFixed(1)} pts, empates ${(100 * mean(draws)).toFixed(1)}% | metas: campeão ~70–82 pts, empates 24–30%`,
    ].join('\n'),
  )

  it('temporada média: empates entre 24% e 30%', () => {
    between(mean(draws), TARGETS.seasonDrawRate)
  })

  it('temporada média: campeão com ~70 a 82 pontos', () => {
    between(mean(champions), TARGETS.championPoints)
  })

  it('cada temporada isolada fica dentro da variação natural em torno das metas', () => {
    for (const { season } of seasons) {
      between(season.drawRate, [0.19, 0.34])
      between(season.table[0]?.points ?? 0, [62, 95])
      between(season.table[season.table.length - 1]?.points ?? 0, [15, 40])
      between(season.goalsPerMatch, [2.0, 2.8])
      between(season.homeWinRate, [0.4, 0.6])
      between(season.shotsPerTeam, [10.5, 13.5])
      expect(season.matches).toBe(380)
    }
  })

  it('os mais fortes tendem a terminar em cima e os mais fracos embaixo, mas com surpresas', () => {
    const strongestRanks: number[] = []
    const weakestRanks: number[] = []
    for (const { season } of seasons) {
      const t = season.table
      const byStrength = [...t].sort((a, b) => b.strength - a.strength)
      strongestRanks.push(t.indexOf(byStrength[0]!) + 1)
      weakestRanks.push(t.indexOf(byStrength[byStrength.length - 1]!) + 1)
      // A força explica parte da pontuação...
      expect(correlation(t.map((r) => r.strength), t.map((r) => r.points))).toBeGreaterThan(0.3)
      // ...mas a classificação nunca é idêntica à ordem de força.
      expect(t.map((r) => r.team.id)).not.toEqual(byStrength.map((r) => r.team.id))
    }
    expect(mean(strongestRanks)).toBeLessThanOrEqual(6)
    expect(mean(weakestRanks)).toBeGreaterThanOrEqual(14)
  })
})
describe('temporadas da Série B', () => {
  const seasons = [1, 2].map((seed) => simulateSeason(generateWorld({ seed }), 2, `season-b-${seed}`))
  console.log(
    seasons
      .map((s, i) => `${formatSummary(`mundo ${i + 1}, Série B`, s)} | campeão ${s.table[0]?.points} pts, lanterna ${s.table[s.table.length - 1]?.points} pts`)
      .join('\n'),
  )

  it('ficam perto das metas (faixas mais largas)', () => {
    for (const season of seasons) {
      between(season.goalsPerMatch, [2.0, 2.8])
      between(season.drawRate, [0.2, 0.34])
      between(season.homeWinRate, [0.38, 0.58])
    }
  })
})
