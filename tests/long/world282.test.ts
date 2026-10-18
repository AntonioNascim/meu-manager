/**
 * Longo prazo no mundo de 282 clubes (15 ligas): 30 temporadas seguidas com mercado e virada, só o Brasil lance a lance.
 * Leva ~15 minutos, então fica fora do `npm run test:all`: rode `npm run test:long`. Os números da última rodada estão na
 * seção 14 de docs/fase2-proposta.md; `node tools/run.mjs leagueRun --clubs 282 --years 30` imprime as tabelas.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { FULL_WORLD, buildScaleWorld } from '../../src/diagnostics/scaleWorld'
import { FINANCE } from '../../src/engine/config'
import { dynastiesOf, formatDynasties, formatTrend, simulateLeagueYears } from '../../tools/leagueYears'
import type { LeagueRun, LeagueYear } from '../../tools/leagueYears'

const YEARS = 30
/** Calendários reais: as ligas europeias atravessam o ano (agosto a maio) e as outras jogam no ano civil. */
const calendars = <T extends { region?: string }>(list: T[]): T[] => list.map((c) => (c.region === 'EU' ? { ...c, split: true, start: [8, 8] as [number, number] } : c))
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

describe(`${YEARS} temporadas no mundo de 282 clubes`, () => {
  let runs: LeagueRun[] = []
  let ids: string[] = []
  beforeAll(() => {
    const world = buildScaleWorld(FULL_WORLD, 7)
    runs = simulateLeagueYears({ year: 2026, seed: 'years-7', teams: world.teams, players: world.players, academy: world.academy, competitions: calendars(world.competitions), focus: 'br' }, YEARS)
    console.log(`\n${world.teams.length} clubes, ${YEARS} anos\n${formatTrend(runs)}\n\n${formatDynasties(runs)}`)
    // O vitest só mostra o console quando o teste falha: o relatório também vai para um arquivo.
    mkdirSync('node_modules/.cache', { recursive: true })
    writeFileSync('node_modules/.cache/world282.txt', `${world.teams.length} clubes, ${YEARS} anos
${formatTrend(runs)}

${formatDynasties(runs)}
`)
    ids = runs[0]?.leagues.map((l) => l.id) ?? []
  })
  const series = (id: string): LeagueYear[] => runs.map((r) => r.leagues.find((l) => l.id === id) as LeagueYear)
  const span = (id: string, from: number, to: number, pick: (l: LeagueYear) => number) => mean(series(id).slice(from, to).map(pick))
  const decade = (id: string, d: number, pick: (l: LeagueYear) => number) => span(id, d * 10, d * 10 + 10, pick)

  it('ninguém vai à falência e o caixa não passa do teto', () => {
    for (const id of ids) {
      for (const l of series(id)) {
        expect(l.negativeEver, `${id} no vermelho`).toBe(0)
        expect(l.maxCeilingShare, `${id} saldo / teto`).toBeLessThan(1.5)
      }
      expect(decade(id, 2, (l) => l.meanCeilingShare), `${id} saldo médio / teto`).toBeLessThan(1.2)
    }
  })

  it('a força média de cada liga fica estável', () => {
    for (const id of ids) {
      const first = span(id, 0, 3, (l) => l.strength)
      for (const d of [1, 2]) expect(Math.abs(decade(id, d, (l) => l.strength) - first), `${id} década ${d + 1}`).toBeLessThan(id === 'br-3' ? 4.5 : 3.5)
      // E não segue andando: a última década é parecida com a anterior.
      expect(Math.abs(decade(id, 2, (l) => l.strength) - decade(id, 1, (l) => l.strength)), `${id} última década`).toBeLessThan(2.5)
    }
  })

  it('as idades e os craques se mantêm', () => {
    for (const id of ids) for (let d = 0; d < 3; d++) {
      const age = decade(id, d, (l) => l.meanAge)
      expect(age, `${id} idade média`).toBeGreaterThan(24)
      expect(age, `${id} idade média`).toBeLessThan(28)
    }
    const stars = (d: number) => mean(Array.from({ length: 10 }, (_, k) => ids.reduce((s, id) => s + (series(id)[d * 10 + k] as LeagueYear).stars, 0)))
    expect(stars(0)).toBeGreaterThanOrEqual(10)
    expect(stars(2)).toBeLessThan(stars(0) * 2.5)
    expect(stars(2)).toBeGreaterThan(stars(0) * 0.4)
  })

  it('os melhores jogadores se concentram nas ligas ricas e a fatia da Inglaterra para de crescer', () => {
    const share = (d: number) => decade('en-1', d, (l) => l.top40) / 40
    expect(share(1)).toBeGreaterThan(share(0) - 0.05)
    expect(share(2)).toBeLessThan(share(1) + 0.08)
    expect(share(2)).toBeLessThan(0.7)
    // Espanha, Alemanha e Itália mantêm jogadores bons: a força dos titulares delas já está coberta pelo teste de estabilidade.
    for (const id of ['es-1', 'de-1', 'it-1']) expect(decade(id, 2, (l) => l.top40)).toBeGreaterThan(0)
  })

  it('campeões: pontos, raros acima de 92 e dinastias', () => {
    for (const d of dynastiesOf(runs)) {
      expect(d.championPoints, `${d.id} pontos do campeão`).toBeGreaterThan(68)
      expect(d.championPoints, `${d.id} pontos do campeão`).toBeLessThan(84)
      expect(d.highCount, `${d.id} campeões acima de 92 pontos`).toBeLessThanOrEqual(3)
    }
    // Divisões de acesso (Brasil B e C): o campeão sobe e sai da divisão, então quase todo ano é um campeão novo; só se exige que ninguém repita muito.
    const tops = dynastiesOf(runs).filter((d) => !['br-2', 'br-3'].includes(d.id)).flatMap((d) => d.blocks)
    expect(mean(tops.map((b) => b.distinct)), 'campeões diferentes por 10 temporadas').toBeGreaterThanOrEqual(4)
    expect(mean(tops.map((b) => b.distinct)), 'campeões diferentes por 10 temporadas').toBeLessThanOrEqual(6.5)
    expect(tops.filter((b) => b.maxTitles > 5).length / tops.length, 'blocos com um clube de mais de 5 títulos').toBeLessThan(0.2)
    for (const d of dynastiesOf(runs).filter((x) => ['br-2', 'br-3'].includes(x.id))) for (const b of d.blocks) expect(b.maxTitles, `${d.id} títulos de um clube`).toBeLessThanOrEqual(3)
    expect(FINANCE.ceilingYears).toBeGreaterThan(0)
  })
})
