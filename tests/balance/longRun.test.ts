/**
 * Balanceamento de longo prazo: 10 temporadas seguidas, com mercado e virada de temporada entre elas,
 * sem time do jogador. Imprime a tabela ano a ano (npm run test:balance).
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import { ACADEMY, FINANCE } from '../../src/engine/config'
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
    for (const r of rows) expect(r.maxBalanceInRevenueYears).toBeLessThan(FINANCE.ceilingYears + 1.5)
    // A Série C segue a mesma regra das outras: preços e salários acompanham a receita da divisão, então nenhuma venda pesa muito mais que a receita dela.
    for (const r of rows) expect(r.maxBalanceInRevenueYearsC).toBeLessThan(FINANCE.ceilingYears + 1.5)
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

  it('a distância de força entre as séries se mantém (a cota de TV e a reputação seguram a Série A em cima)', () => {
    const gaps = rows.map((r) => r.strengthA - r.strengthB)
    for (const g of gaps) expect(g).toBeGreaterThan(6)
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(5.5)
    expect(Math.abs(mean(gaps.slice(-5)) - mean(gaps.slice(1, 6)))).toBeLessThan(1.5)
    // A reputação média de cada divisão também não anda.
    expect(Math.abs((rows[YEARS - 1] as YearRow).reputationA - first.reputationA)).toBeLessThan(1.5)
    expect(Math.abs((rows[YEARS - 1] as YearRow).reputationB - first.reputationB)).toBeLessThan(1)
  })

  it('sempre existem alguns craques (em média de 4 a 8 jogadores com força geral de 85 ou mais, nunca menos de 3 nem mais de 10) e eles nascem da base', () => {
    for (const r of rows) {
      expect(r.stars, `craques em ${r.year}`).toBeGreaterThanOrEqual(3)
      expect(r.stars, `craques em ${r.year}`).toBeLessThanOrEqual(10)
      expect(r.topOverall).toBeGreaterThanOrEqual(85)
      expect(r.topOverall).toBeLessThan(96)
    }
    // O número de craques varia de ano para ano por sorte: a média é que precisa ficar na faixa.
    expect(mean(rows.map((r) => r.stars))).toBeGreaterThanOrEqual(4)
    expect(mean(rows.map((r) => r.stars))).toBeLessThanOrEqual(8)
    // Craques que existem no fim já não são os do início: a base repõe (alguns jogadores novos de força >= 85).
    const youngStars = rows.slice(-5).map((r) => r.youngStars)
    expect(Math.max(...youngStars)).toBeGreaterThanOrEqual(1)
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

  it('as categorias de base se mantêm: de 7 a 15 jovens por clube, ninguém com 20 anos esquecido e a IA promove todo ano', () => {
    for (const r of rows) {
      expect(r.academySize, `base média em ${r.year}`).toBeGreaterThan(7)
      expect(r.academyMax, `maior base em ${r.year}`).toBeLessThanOrEqual(ACADEMY.maxSize)
      expect(r.academyOverdue, `jovens de 20 anos na base em ${r.year}`).toBe(0)
    }
    for (const r of rows.slice(0, -1)) {
      const promoted = Object.values(r.report?.academyPromoted ?? {}).reduce((a, b) => a + b, 0)
      expect(promoted, `promoções em ${r.year}`).toBeGreaterThan(20)
    }
  })

  it('continuam surgindo jovens promissores', () => {
    for (const r of rows) {
      expect(r.prospects).toBeGreaterThan(first.prospects * 0.5)
      expect(r.prospects).toBeLessThan(first.prospects * 2.5)
      expect(r.topPotential).toBeGreaterThanOrEqual(85)
    }
  })

  it('os elencos continuam válidos e há campeões diferentes ao longo dos anos', () => {
    for (const r of rows) {
      expect(r.minSquad).toBeGreaterThanOrEqual(SQUAD_MIN)
      expect(r.maxSquad).toBeLessThanOrEqual(30)
    }
    const champions = rows.flatMap((r) => (r.report ? [r.report.champions[0] as string] : []))
    // Um clube não ganha todos os anos; e os melhores jogadores não ficam em poucos clubes (ver a concentração abaixo).
    expect(new Set(champions).size).toBeGreaterThanOrEqual(2)
    for (const id of new Set(champions)) expect(champions.filter((c) => c === id).length).toBeLessThan(champions.length)
  })

  it('os jogadores bons não se concentram em poucos clubes: os 40 melhores ficam espalhados e nenhum clube junta muitos', () => {
    for (const r of rows.slice(1)) {
      expect(r.topMaxInClub, `maior grupo de craques em um clube em ${r.year}`).toBeLessThanOrEqual(8)
      expect(r.topClubs, `clubes com algum dos 40 melhores em ${r.year}`).toBeGreaterThanOrEqual(11)
    }
    const first = rows[0] as YearRow
    const last = rows[rows.length - 1] as YearRow
    expect(last.topClubs).toBeGreaterThanOrEqual(first.topClubs - 2)
    expect(last.topMaxInClub).toBeLessThanOrEqual(first.topMaxInClub + 2)
  })
})
