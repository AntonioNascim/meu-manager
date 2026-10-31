/**
 * 30 temporadas no mundo real (370 clubes, `data/pacote-real.json`; Fase 5D). Só roda com `PACOTE_REAL=1` (o workflow `Medições pesadas` liga isso com
 * `pacote = real`); o `world282.test.ts` cobre o mundo fictício e fica de fora nessa rodada. Confere a saúde do mundo (caixa, força, idades, craques) e as
 * metas contra a vida real dos últimos 30 anos (`tools/realTargets.ts`): campeões das ligas e das copas, sem dinastias exageradas, e gigantes que
 * continuam grandes. Relatório completo em `node_modules/.cache/real-world.txt`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { FINANCE } from '../../src/engine/config'
import { leagueIds, seriesOf } from '../../tools/leagueYears'
import type { LeagueYear } from '../../tools/leagueYears'
import { simulateReal, summarizeReal } from '../../tools/realRun'
import type { RealSimulation } from '../../tools/realRun'
import { checkRealTargets } from '../../tools/realTargets'

const YEARS = 30
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

describe.skipIf(!process.env.PACOTE_REAL || process.env.PACOTE_REAL === '0')(`${YEARS} temporadas no mundo real`, () => {
  let sim: RealSimulation
  let ids: string[] = []
  beforeAll(() => {
    sim = simulateReal(YEARS, 7)
    ids = leagueIds(sim.runs)
    const results = summarizeReal(sim)
    mkdirSync('node_modules/.cache', { recursive: true })
    writeFileSync('node_modules/.cache/real-world.txt', `${JSON.stringify(results, null, 1)}\n${checkRealTargets(results).join('\n')}\n`)
  })
  const series = (id: string): LeagueYear[] => seriesOf(sim.runs, id)
  const decade = (id: string, d: number, pick: (l: LeagueYear) => number) => mean(series(id).slice(d * 10, d * 10 + 10).map(pick))

  it('ninguém vai à falência e o caixa não passa do teto', () => {
    for (const id of ids) {
      for (const l of series(id)) {
        expect.soft(l.negativeEver, `${id} no vermelho`).toBe(0)
        expect.soft(l.maxCeilingShare, `${id} saldo / teto`).toBeLessThan(1.5)
      }
      expect.soft(decade(id, 2, (l) => l.meanCeilingShare), `${id} saldo médio / teto`).toBeLessThan(1.2)
    }
  })

  it('a força média de cada liga fica estável e as idades e os craques se mantêm', () => {
    for (const id of ids) {
      const first = mean(series(id).slice(0, 3).map((l) => l.strength))
      const small = (series(id)[0]?.clubs ?? 20) <= 8
      for (const d of [1, 2]) expect.soft(Math.abs(decade(id, d, (l) => l.strength) - first), `${id} década ${d + 1}`).toBeLessThan(small ? 5 : id === 'br-3' ? 5 : 4)
      for (let d = 0; d < 3; d++) {
        expect.soft(decade(id, d, (l) => l.meanAge), `${id} idade média`).toBeGreaterThan(24)
        expect.soft(decade(id, d, (l) => l.meanAge), `${id} idade média`).toBeLessThan(28.5)
      }
    }
    const stars = (d: number) => mean(Array.from({ length: 10 }, (_, k) => ids.reduce((s, id) => s + (series(id)[d * 10 + k]?.stars ?? 0), 0)))
    expect.soft(stars(2)).toBeGreaterThan(stars(0) * 0.4)
    expect.soft(stars(2)).toBeLessThan(stars(0) * 2.5)
    expect.soft(FINANCE.ceilingYears).toBeGreaterThan(0)
  })

  it('campeões das ligas e das copas contra a vida real, sem dinastias exageradas, e gigantes que continuam grandes', () => {
    const problems = checkRealTargets(summarizeReal(sim))
    for (const p of problems) expect.soft(p, p).toBe('')
  })
})
