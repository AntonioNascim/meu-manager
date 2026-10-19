/** Os relatórios do longo prazo aceitam uma liga que falta em algum ano (o país dela ainda não virou a temporada na data final). */
import { describe, expect, it } from 'vitest'
import { dynastiesOf, formatDynasties, formatLeagueSummary, formatLeagueYears, formatTrend, leagueIds, seriesOf } from '../tools/leagueYears'
import type { LeagueRun, LeagueYear } from '../tools/leagueYears'

const year = (id: string, n: number): LeagueYear =>
  ({ id, name: `Liga ${id}`, clubs: 18, strength: 60 + n, reputation: 8, top40: 1, stars: 2, meanAge: 25, payrollShare: 0.4, dealsPerClub: 1, squadValueShare: 2, meanCeilingShare: 1, maxCeilingShare: 1.1, revenueVsExpected: 1, maxBalanceYears: 1.5, negativeEver: 0, championId: `c${n % 3}`, championPoints: 70, championGames: 34, meanRevenue: 5e7, meanSaleShare: 0.2, maxSaleShare: 0.5, meanPurchaseShare: 0.2, maxPurchaseShare: 0.5, signedFromOutside: 3, soldToOutside: 3 }) as unknown as LeagueYear

// A liga "b" não foi medida no último ano.
const runs: LeagueRun[] = Array.from({ length: 12 }, (_, i) => ({ year: 2026 + i, leagues: i === 11 ? [year('a', i)] : [year('a', i), year('b', i)] }))

describe('relatórios do longo prazo com uma liga ausente num ano', () => {
  it('listam as ligas de todos os anos e a série de cada uma', () => {
    expect(leagueIds(runs)).toEqual(['a', 'b'])
    expect(seriesOf(runs, 'a')).toHaveLength(12)
    expect(seriesOf(runs, 'b')).toHaveLength(11)
  })

  it('não quebram', () => {
    expect(() => formatTrend(runs)).not.toThrow()
    expect(() => formatDynasties(runs)).not.toThrow()
    expect(() => formatLeagueSummary(runs)).not.toThrow()
    expect(() => formatLeagueYears(runs)).not.toThrow()
    expect(dynastiesOf(runs).map((d) => d.id)).toEqual(['a', 'b'])
    expect(formatTrend(runs)).toContain('Liga b')
  })
})
