/**
 * Copas do mundo padrão em 6 temporadas seguidas (mercado e virada ligados): as copas fecham todo ano, o título não é sempre dos
 * mesmos, a prorrogação e os pênaltis aparecem na medida certa, o dinheiro das copas é pequeno perto da receita e a saúde das
 * ligas continua a mesma. (npm run test:balance)
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import { createYouth } from '../../src/data/generateYouth'
import { defaultCupSpecs } from '../../src/data/package/cups'
import { cupMatches, tiesOfStage } from '../../src/engine/cups'
import { advanceSeason } from '../../src/engine/offseason'
import { createSeason, simulateToSeasonEnd } from '../../src/engine/season'
import type { SeasonState } from '../../src/engine/season'
import { lowestBalance } from '../../tools/longRun'

const YEARS = 6
const world = generateWorld({ seed: 17 })
const ended: SeasonState[] = []
let state = createSeason({ year: 2026, seed: 17, teams: world.teams, players: world.players, academy: world.academy, cupSpecs: defaultCupSpecs() })
for (let i = 0; i < YEARS; i++) {
  const e = simulateToSeasonEnd(state, { market: true })
  ended.push(e)
  if (i < YEARS - 1) state = advanceSeason(e, { createYouth }).state
}
const cupOf = (s: SeasonState, id: string) => s.cups!.find((c) => c.id === id)!
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe(`${YEARS} temporadas com copas`, () => {
  it('toda copa termina com campeão e vice, a cada ano, e o histórico guarda todos', () => {
    for (const s of ended) {
      for (const id of ['cup-br', 'supercup-br']) {
        expect(cupOf(s, id).winnerId, `${id} ${s.season.year}`).toBeDefined()
        expect(cupOf(s, id).runnerUpId).toBeDefined()
      }
      expect(s.season.phase).toBe('end-of-season')
    }
    expect(ended[YEARS - 1]!.cupHistory!['cup-br']).toHaveLength(YEARS)
    expect(ended[YEARS - 1]!.cupHistory!['supercup-br']).toHaveLength(YEARS)
  })

  it('o título da copa varia (não é sempre dos mesmos) e clubes de fora do topo chegam longe', () => {
    const winners = ended.map((s) => cupOf(s, 'cup-br').winnerId)
    expect(new Set(winners).size).toBeGreaterThanOrEqual(3)
    const finalists = ended.flatMap((s) => [cupOf(s, 'cup-br').winnerId, cupOf(s, 'cup-br').runnerUpId])
    const tierOf = (s: SeasonState, id: string | undefined) => s.teams.find((t) => t.id === id)?.tier ?? 1
    expect(finalists.some((id, i) => tierOf(ended[Math.floor(i / 2)]!, id) >= 1)).toBe(true)
  })

  it('a Supercopa é o campeão da liga contra o da copa (ou o vice da liga, se for o mesmo clube) a partir da segunda temporada', () => {
    for (let i = 1; i < YEARS; i++) {
      const previous = ended[i - 1]!
      const supercup = cupOf(ended[i]!, 'supercup-br')
      const ids = supercup.entrants.map((e) => e.teamId)
      expect(ids).toContain(cupOf(previous, 'cup-br').winnerId)
      expect(new Set(ids).size).toBe(2)
    }
  })

  it('prorrogação e pênaltis aparecem na medida de um mata-mata de verdade', () => {
    let games = 0
    let extra = 0
    let penalties = 0
    for (const s of ended) {
      for (const m of s.matches) {
        if (!m.cup || m.cup.kind !== 'knockout' || m.status !== 'finished') continue
        const twoLegged = s.matches.some((o) => o.competitionId === m.competitionId && o.cup?.stage === m.cup?.stage && o.cup?.leg === 2)
        if (twoLegged && m.cup.leg !== 2) continue
        games++
        if (m.result?.extraTime) extra++
        if (m.result?.penalties) penalties++
      }
    }
    expect(games).toBeGreaterThan(200)
    expect(extra / games).toBeGreaterThan(0.1)
    expect(extra / games).toBeLessThan(0.32)
    expect(penalties / games).toBeGreaterThan(0.03)
    expect(penalties / games).toBeLessThan(0.16)
    // Nunca fica confronto sem vencedor.
    for (const s of ended) for (const cup of s.cups!) cup.log.forEach((_, i) => tiesOfStage(cupMatches(s.matches, cup.id), cup.spec, i).forEach((t) => expect(t.winnerId).toBeDefined()))
  })

  it('o dinheiro das copas é pequeno perto da receita e ninguém vai à falência', () => {
    for (const s of ended) {
      const prize = (id: string) => s.teams.find((t) => t.id === id)!.finances.ledger.filter((e) => e.category === 'cup-prize').reduce((sum, e) => sum + e.amount, 0)
      const revenue = (id: string) => s.teams.find((t) => t.id === id)!.finances.ledger.filter((e) => e.amount > 0 && ['ticket-sales', 'sponsorship', 'tv-rights'].includes(e.category)).reduce((sum, e) => sum + e.amount, 0)
      const cup = cupOf(s, 'cup-br')
      const share = (id: string) => prize(id) / Math.max(1, revenue(id))
      // Quem é eliminado na primeira fase ganha migalhas; o campeão ganha mais, mas não vira a principal receita.
      expect(mean(s.teams.map((t) => share(t.id)))).toBeLessThan(0.06)
      expect(share(cup.winnerId!)).toBeLessThan(1.2)
      for (const t of s.teams) expect(lowestBalance(t), `${t.id} no vermelho`).toBeGreaterThanOrEqual(0)
    }
  })

  it('o campeão joga bem mais jogos que quem cai na primeira fase (a copa pesa no calendário de quem vai longe)', () => {
    for (const s of ended) {
      const cup = cupOf(s, 'cup-br')
      const games = (id: string) => s.matches.filter((m) => m.competitionId === cup.id && (m.homeTeamId === id || m.awayTeamId === id)).length
      expect(games(cup.winnerId!)).toBeGreaterThanOrEqual(8)
      const tie = tiesOfStage(cupMatches(s.matches, cup.id), cup.spec, 0)[0]!
      const firstOut = tie.winnerId === tie.teams[0] ? tie.teams[1] : tie.teams[0]
      expect(games(firstOut), `${s.season.year} ${JSON.stringify(tie.teams)} venceu ${tie.winnerId} por ${tie.decidedBy}`).toBe(1)
    }
  })
})
