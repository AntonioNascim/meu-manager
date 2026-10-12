/**
 * Balanceamento de longo prazo: 10 temporadas seguidas, com mercado e virada de temporada entre elas,
 * sem time do jogador. Imprime a tabela ano a ano (npm run test:balance).
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import { FINANCE } from '../../src/engine/config'
import { SQUAD_MIN } from '../../src/engine/types'
import { formatYears, simulateYears } from '../../tools/longRun'
import type { YearRow } from '../../tools/longRun'

const YEARS = 10
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe(`${YEARS} temporadas seguidas`, () => {
  const rows: YearRow[] = simulateYears(generateWorld({ seed: 41 }), YEARS, 'long-run')
  console.log(`\nTemporadas seguidas (mundo 41)\n${formatYears(rows)}`)
  const first = rows[0] as YearRow

  it('nenhum clube da IA vai à falência em nenhum momento das temporadas', () => {
    for (const r of rows) {
      expect(r.negativeEver, `clubes no vermelho em ${r.year}`).toBe(0)
      expect(r.minBalanceEver).toBeGreaterThanOrEqual(0)
    }
  })

  it('o dinheiro não se acumula sem limite: perto do teto da IA e sem crescer ao longo dos anos', () => {
    for (const r of rows) expect(r.maxBalanceInRevenueYears).toBeLessThan(FINANCE.ceilingYears + 1)
    const early = mean(rows.slice(0, 3).map((r) => r.maxEndBalance))
    const late = mean(rows.slice(-3).map((r) => r.maxEndBalance))
    expect(late).toBeLessThan(early * 1.25)
  })

  it('a força média da Série A e da Série B fica estável', () => {
    for (const r of rows) {
      expect(Math.abs(r.strengthA - first.strengthA)).toBeLessThan(3)
      expect(Math.abs(r.strengthB - first.strengthB)).toBeLessThan(4.5)
    }
    const drift = (pick: (r: YearRow) => number) => mean(rows.slice(-3).map(pick)) - mean(rows.slice(0, 3).map(pick))
    expect(Math.abs(drift((r) => r.strengthA))).toBeLessThan(2.5)
    expect(Math.abs(drift((r) => r.strengthB))).toBeLessThan(3.5)
  })

  it('a distribuição de idades continua realista', () => {
    for (const r of rows) {
      expect(r.meanAge).toBeGreaterThan(24)
      expect(r.meanAge).toBeLessThan(28)
      expect(r.under22).toBeLessThan(0.4)
      expect(r.over30).toBeGreaterThan(0.12)
      expect(r.over30).toBeLessThan(0.32)
    }
  })

  it('continuam surgindo jovens promissores', () => {
    for (const r of rows) {
      expect(r.prospects).toBeGreaterThan(first.prospects * 0.5)
      expect(r.topPotential).toBeGreaterThanOrEqual(85)
    }
  })

  it('os elencos continuam válidos e há campeões diferentes ao longo dos anos', () => {
    for (const r of rows) {
      expect(r.minSquad).toBeGreaterThanOrEqual(SQUAD_MIN)
      expect(r.maxSquad).toBeLessThanOrEqual(30)
    }
    const champions = rows.flatMap((r) => (r.report ? [r.report.champions[0] as string] : []))
    expect(new Set(champions).size).toBeGreaterThanOrEqual(3)
  })
})
