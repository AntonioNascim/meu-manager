/**
 * Testes de balanceamento: comparam o motor com as metas do CLAUDE.md.
 *   - ~2,3 a 2,5 gols por jogo
 *   - mandante vence ~45–50%, empates ~25–30%
 *   - ~12 finalizações por time por jogo
 * As metas valem para a média de milhares de partidas; uma temporada só tem variação maior,
 * então ali as faixas são mais largas.
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import type { BalanceSummary } from './helpers/balance'
import { formatSummary, simulateRandomMatches, simulateSeason } from './helpers/balance'

const TARGETS = {
  goalsPerMatch: [2.3, 2.5],
  homeWinRate: [0.45, 0.5],
  drawRate: [0.25, 0.3],
  shotsPerTeam: [11, 13],
} as const

const worlds = [1, 2].map((seed) => generateWorld({ seed }))

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

const header =`${'amostra'.padEnd(26)} |   gols | mandante |  empate | visitante | final.`

describe('milhares de partidas', () => {
  const perWorld = worlds.map((w, i) => simulateRandomMatches(w, 3000, `balance-${i}`))
  const all = combine(perWorld)
  console.log(
    [
      header,
      ...perWorld.map((s, i) => formatSummary(`mundo ${i + 1}: ${s.matches} partidas`, s)),
      formatSummary(`total: ${all.matches} partidas`, all),
      `metas: gols ${TARGETS.goalsPerMatch.join('–')}, mandante 45–50%, empate 25–30%, finalizações ~12`,
    ].join('\n'),
  )

  it('gols por jogo entre 2,3 e 2,5', () => {
    expect(all.goalsPerMatch).toBeGreaterThanOrEqual(TARGETS.goalsPerMatch[0])
    expect(all.goalsPerMatch).toBeLessThanOrEqual(TARGETS.goalsPerMatch[1])
  })

  it('mandante vence entre 45% e 50%', () => {
    expect(all.homeWinRate).toBeGreaterThanOrEqual(TARGETS.homeWinRate[0])
    expect(all.homeWinRate).toBeLessThanOrEqual(TARGETS.homeWinRate[1])
  })

  it('empates entre 25% e 30%', () => {
    expect(all.drawRate).toBeGreaterThanOrEqual(TARGETS.drawRate[0])
    expect(all.drawRate).toBeLessThanOrEqual(TARGETS.drawRate[1])
  })

  it('cerca de 12 finalizações por time', () => {
    expect(all.shotsPerTeam).toBeGreaterThanOrEqual(TARGETS.shotsPerTeam[0])
    expect(all.shotsPerTeam).toBeLessThanOrEqual(TARGETS.shotsPerTeam[1])
  })

  it('demais números do jogo ficam realistas', () => {
    expect(all.shotsOnTargetPerTeam / all.shotsPerTeam).toBeGreaterThan(0.3)
    expect(all.shotsOnTargetPerTeam / all.shotsPerTeam).toBeLessThan(0.45)
    expect(all.cornersPerTeam).toBeGreaterThan(3.5)
    expect(all.cornersPerTeam).toBeLessThan(6.5)
    expect(all.foulsPerTeam).toBeGreaterThan(10)
    expect(all.foulsPerTeam).toBeLessThan(18)
    expect(all.yellowsPerMatch).toBeGreaterThan(2.5)
    expect(all.yellowsPerMatch).toBeLessThan(5.5)
    expect(all.redsPerMatch).toBeLessThan(0.4)
  })

  it('cada partida roda em poucos milissegundos', () => {
    expect(all.msPerMatch).toBeLessThan(10)
  })
})

describe('temporada inteira (turno e returno, 380 jogos)', () => {
  const seasons = worlds.flatMap((w, i) =>
    [1, 2].map((tier) => ({ label: `mundo ${i + 1}, Série ${tier === 1 ? 'A' : 'B'}`, season: simulateSeason(w, tier, `season-${i}-${tier}`) })),
  )
  console.log(
    [
      header,
      ...seasons.map(({ label, season }) => {
        const t = season.table
        const first = t[0]
        const last = t[t.length - 1]
        return `${formatSummary(label, season)} | campeão ${first?.team.abbreviation} ${first?.points} pts, lanterna ${last?.team.abbreviation} ${last?.points} pts`
      }),
    ].join('\n'),
  )

  it('cada temporada fica perto das metas (faixas mais largas: é uma amostra só)', () => {
    for (const { season } of seasons) {
      expect(season.matches).toBe(380)
      expect(season.goalsPerMatch).toBeGreaterThan(2.0)
      expect(season.goalsPerMatch).toBeLessThan(2.8)
      expect(season.homeWinRate).toBeGreaterThan(0.38)
      expect(season.homeWinRate).toBeLessThan(0.57)
      expect(season.drawRate).toBeGreaterThan(0.18)
      expect(season.drawRate).toBeLessThan(0.34)
      expect(season.shotsPerTeam).toBeGreaterThan(10.5)
      expect(season.shotsPerTeam).toBeLessThan(13.5)
    }
  })

  it('pontuação de campeão e lanterna parecida com a de um campeonato real', () => {
    for (const { season } of seasons) {
      const points = season.table.map((r) => r.points)
      expect(Math.max(...points)).toBeGreaterThanOrEqual(68)
      expect(Math.max(...points)).toBeLessThanOrEqual(98)
      expect(Math.min(...points)).toBeGreaterThanOrEqual(12)
      expect(Math.min(...points)).toBeLessThanOrEqual(40)
    }
  })

  it('os mais fortes terminam em cima e os mais fracos embaixo, mas não sempre na ordem', () => {
    for (const { season } of seasons) {
      const t = season.table
      const byStrength = [...t].sort((a, b) => b.strength - a.strength)
      const rank = (row: (typeof t)[number]) => t.indexOf(row) + 1
      // A força explica boa parte da pontuação...
      expect(correlation(t.map((r) => r.strength), t.map((r) => r.points))).toBeGreaterThan(0.6)
      expect(rank(byStrength[0]!)).toBeLessThanOrEqual(8)
      expect(rank(byStrength[byStrength.length - 1]!)).toBeGreaterThanOrEqual(13)
      // ...mas há surpresas: a classificação não é idêntica à ordem de força.
      expect(t.map((r) => r.team.id)).not.toEqual(byStrength.map((r) => r.team.id))
    }
  })
})
