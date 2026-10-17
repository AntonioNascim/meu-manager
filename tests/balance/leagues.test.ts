/**
 * Economia por liga (B5), num mundo menor que o de 282 clubes (o Brasil com as três séries, a Inglaterra, a Argentina e o
 * Paraguai; 120 clubes): 8 temporadas seguidas com mercado e virada, só o Brasil lance a lance. O mundo grande é conferido por
 * `npm run analyze -- years --clubs 282` (docs/fase2-proposta.md, seção 13). Imprime o resumo por liga (npm run test:balance).
 */
import { describe, expect, it } from 'vitest'
import { FULL_WORLD, buildScaleWorld } from '../../src/diagnostics/scaleWorld'
import { FINANCE } from '../../src/engine/config'
import { formatLeagueSummary, simulateLeagueYears } from '../../tools/leagueYears'
import type { LeagueRun, LeagueYear } from '../../tools/leagueYears'

const YEARS = 8
const IDS = ['br-1', 'br-2', 'br-3', 'en-1', 'ar-1', 'py-1']
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe(`${YEARS} temporadas seguidas com várias ligas`, () => {
  const world = buildScaleWorld(FULL_WORLD.filter((l) => IDS.includes(l.id)), 11)
  const runs: LeagueRun[] = simulateLeagueYears({ year: 2026, seed: 'ligas', teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions, focus: 'br' }, YEARS)
  console.log(`\nVárias ligas (${world.teams.length} clubes, ${YEARS} anos)\n${formatLeagueSummary(runs)}`)
  const series = (id: string): LeagueYear[] => runs.map((r) => r.leagues.find((l) => l.id === id) as LeagueYear)
  const first3 = (id: string, pick: (l: LeagueYear) => number) => mean(series(id).slice(0, 3).map(pick))
  const last3 = (id: string, pick: (l: LeagueYear) => number) => mean(series(id).slice(-3).map(pick))

  it('nenhum clube vai à falência e o dinheiro não se acumula acima do teto em nenhuma liga', () => {
    for (const id of IDS) {
      for (const l of series(id)) {
        expect(l.negativeEver, `${id} no vermelho`).toBe(0)
        // Uma venda grande de um fenômeno da base pode passar um pouco do teto até o clube gastar o excesso.
        expect(l.maxBalanceYears, `${id} saldo / receita`).toBeLessThan(FINANCE.ceilingYears + 2.5)
      }
    }
  })

  it('a folha de cada liga cabe na receita dela, inclusive na Série C', () => {
    for (const id of IDS) for (const l of series(id)) expect(l.payrollShare, `${id} folha / receita`).toBeLessThan(0.95)
    expect(last3('br-3', (l) => l.payrollShare)).toBeLessThan(0.9)
  })

  it('a Série C não compra nem vende muito acima da receita dela (só um fenômeno da base, raro, vale mais que isso)', () => {
    for (const l of series('br-3')) {
      expect(l.maxPurchaseShare, 'maior compra / receita').toBeLessThan(1.5)
      expect(l.meanSaleShare, 'venda média / receita').toBeLessThan(0.5)
      expect(l.meanPurchaseShare, 'compra média / receita').toBeLessThan(0.3)
    }
    expect(series('br-3').filter((l) => l.maxSaleShare > 1.5).length, 'anos com uma venda acima de 1,5 vez a receita').toBeLessThanOrEqual(1)
  })

  it('a força média de cada liga fica estável ao longo dos anos', () => {
    for (const id of IDS) {
      const drift = last3(id, (l) => l.strength) - first3(id, (l) => l.strength)
      expect(Math.abs(drift), `${id} variação da força`).toBeLessThan(id === 'br-3' ? 4.5 : 3.5)
    }
  })

  it('as ligas mais ricas têm elencos mais fortes e atraem os melhores jogadores, sem esvaziar as outras', () => {
    const level = (id: string) => last3(id, (l) => l.strength)
    expect(level('en-1')).toBeGreaterThan(level('br-1') + 5)
    expect(level('br-1')).toBeGreaterThan(level('ar-1'))
    expect(level('ar-1')).toBeGreaterThan(level('py-1'))
    expect(level('py-1')).toBeGreaterThan(level('br-3') + 5)
    // Entre os 40 melhores do mundo, a Inglaterra tem mais que qualquer outra e não perde terreno.
    for (const id of IDS.filter((x) => x !== 'en-1')) expect(last3('en-1', (l) => l.top40)).toBeGreaterThan(last3(id, (l) => l.top40))
    expect(last3('en-1', (l) => l.top40)).toBeGreaterThanOrEqual(first3('en-1', (l) => l.top40) - 1)
    // As outras ligas não ficam sem jogadores bons: a força delas se mantém (teste acima) e a troca de jogadores é pequena perto do elenco.
    // (Nas séries do Brasil a conta inclui quem sobe e desce de série.)
    for (const id of IDS.filter((x) => !x.startsWith('br'))) {
      const clubs = series(id)[0]?.clubs as number
      for (const l of series(id)) expect(l.signedFromOutside + l.soldToOutside, `${id} jogadores trocados com outras ligas`).toBeLessThan(clubs * 3)
    }
  })

  it('o Brasil continua com as séries na ordem de força e a distância entre elas se mantém', () => {
    for (const r of runs) {
      const [a, b, c] = ['br-1', 'br-2', 'br-3'].map((id) => (r.leagues.find((l) => l.id === id) as LeagueYear).strength)
      expect((a as number) - (b as number)).toBeGreaterThan(6)
      expect((b as number) - (c as number)).toBeGreaterThan(6)
    }
  })
})
