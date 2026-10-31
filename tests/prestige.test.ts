/**
 * Prestígio histórico (Fase 5D): com `Team.prestige` (mundo real) a reputação volta ao prestígio do clube em vez de ao patamar da divisão, então os
 * gigantes continuam gigantes por décadas; sem ele (mundo fictício, saves antigos) a regra antiga segue igual.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { createYouth } from '../src/data/generateYouth'
import { OFFSEASON } from '../src/engine/config'
import { advanceSeason } from '../src/engine/offseason'
import { createSeason, simulateToSeasonEnd } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'

const world = generateWorld({ seed: 21 })
let ended: SeasonState

beforeAll(() => {
  ended = simulateToSeasonEnd(createSeason({ year: 2026, seed: 21, teams: world.teams, players: world.players }), { market: true })
}, 120_000)

const giants = (s: SeasonState) => s.teams.filter((t) => t.tier === 1).sort((a, b) => b.reputation - a.reputation).slice(0, 4)

describe('prestígio histórico', () => {
  it('sem prestígio, o mundo fictício não muda: nenhum time ganha o campo', () => {
    const next = advanceSeason(ended, { createYouth }).state
    expect(next.teams.every((t) => t.prestige === undefined)).toBe(true)
  })

  it('com prestígio, os gigantes perdem menos reputação do que com o puxão para a média da divisão', () => {
    const top = giants(ended).map((t) => t.id)
    const plain = advanceSeason(ended, { createYouth }).state
    const withPrestige = advanceSeason({ ...ended, teams: ended.teams.map((t) => ({ ...t, prestige: t.reputation })) }, { createYouth }).state
    const mean = (s: SeasonState) => top.reduce((sum, id) => sum + (s.teams.find((t) => t.id === id)?.reputation ?? 0), 0) / top.length
    expect(mean(withPrestige)).toBeGreaterThanOrEqual(mean(plain))
    // Quem fica na divisão volta ao prestígio: a reputação média dos gigantes não cai mais de 1,5 ponto em um ano.
    const before = top.reduce((sum, id) => sum + ended.teams.find((t) => t.id === id)!.reputation, 0) / top.length
    expect(before - mean(withPrestige)).toBeLessThanOrEqual(1.5)
  })

  it('o prestígio anda devagar na direção da reputação (e fica igual quando elas coincidem)', () => {
    const next = advanceSeason({ ...ended, teams: ended.teams.map((t) => ({ ...t, prestige: t.reputation + 3 })) }, { createYouth }).state
    for (const t of next.teams.filter((x) => x.tier === 1 || x.tier === 2)) {
      const old = ended.teams.find((x) => x.id === t.id)!
      const start = old.reputation + 3
      // A reputação nova (de 1 a 20) está entre o ponto de partida e o prestígio: o prestígio só dá um passo pequeno.
      expect(Math.abs((t.prestige as number) - start)).toBeLessThanOrEqual(OFFSEASON.reputation.prestigeDrift * 20 + 0.01)
    }
  })
})
