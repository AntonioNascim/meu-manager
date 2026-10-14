/**
 * O mercado da IA ficou rápido com atalhos (força e valor guardados, lista de candidatos por posição, papel no elenco por
 * lista ordenada). Estes testes garantem que os atalhos dão exatamente o que a conta direta daria.
 */
import { describe, expect, it } from 'vitest'
import { MARKET } from '../src/engine/config'
import { marketPoolOf, marketValue, salaryForOverall, squadRole, squadRoleIn } from '../src/engine/market'
import { needsOf } from '../src/engine/market/ai'
import { monthlyPayroll } from '../src/engine/finance'
import { overallAt, overallForPosition, playerOverall } from '../src/engine/overall'
import type { Player, Team } from '../src/engine/types'
import { createGame } from '../src/store/game'

const game = createGame(7, 'team-imp')
const { players, teams } = game.season
const squadOf = (id: string) => players.filter((p) => p.teamId === id)

describe('força guardada por objeto de atributos', () => {
  it('dá o mesmo valor da conta direta, na posição principal e fora dela', () => {
    for (const p of players.slice(0, 200)) {
      expect(playerOverall(p)).toBe(overallForPosition(p.attributes, p.position))
      expect(playerOverall(p)).toBe(playerOverall(p))
      expect(overallAt(p, p.position)).toBe(playerOverall(p))
    }
  })

  it('jogador com atributo mudado (objeto novo) não herda a força velha', () => {
    const p = players.find((q) => q.position === 'ST') as Player
    const before = playerOverall(p)
    const better = { ...p, attributes: { ...p.attributes, finishing: Math.min(100, p.attributes.finishing + 20) } }
    expect(playerOverall(better)).toBeGreaterThan(before)
    expect(playerOverall(p)).toBe(before)
  })
})

describe('valor de mercado guardado', () => {
  it('muda com a data (contrato mais curto vale menos) e com o jogador', () => {
    const p = players[10] as Player
    const early = marketValue(p, '2026-01-10')
    const late = marketValue(p, '2030-01-10')
    expect(marketValue(p, '2026-01-10')).toBe(early)
    expect(late).toBeLessThanOrEqual(early)
    const younger = { ...p, age: Math.max(16, p.age - 8) }
    expect(marketValue(younger, '2026-01-10')).not.toBe(marketValue({ ...p, age: 36 }, '2026-01-10'))
  })
})

describe('papel no elenco por lista ordenada', () => {
  it('squadRoleIn é igual a squadRole para todo jogador de vários clubes', () => {
    for (const team of teams.slice(0, 12)) {
      const squad = squadOf(team.id)
      const sorted = squad.map(playerOverall).sort((a, b) => b - a)
      for (const p of squad) expect(squadRoleIn(playerOverall(p), sorted)).toBe(squadRole(p, squad))
    }
  })
})

describe('lista de candidatos do mercado', () => {
  it('traz os mesmos jogadores, na mesma ordem, que olhar o mundo inteiro com os filtros da compra', () => {
    for (const team of teams.filter((t) => t.id !== 'team-imp').slice(0, 15)) {
      const squad = squadOf(team.id)
      const needs = needsOf(team, squad)
      const room = team.finances.salaryBudget - monthlyPayroll(squad)
      const passes = (p: Player) => {
        const need = needs.find((n) => n.position === p.position)
        return !!need && playerOverall(p) - need.weakest >= MARKET.ai.minUpgrade && salaryForOverall(playerOverall(p)) <= room
      }
      const everyone = players.filter((p) => p.teamId !== team.id && p.teamId !== 'team-imp' && !p.contract.loanedFrom && p.condition.injuryDaysLeft === 0)
      const expected = everyone.filter(passes).map((p) => p.id)
      const fast = marketPoolOf(players, team as Team, squad, 'team-imp')
      expect(fast.filter(passes).map((p) => p.id)).toEqual(expected)
      // Nada fora do que a compra aceitaria: os extras, se houver, são só quem a lista curta ainda deixa passar pelo corte de salário.
      expect(fast.length).toBeLessThanOrEqual(everyone.length)
    }
  })

  it('não oferece o próprio elenco, o do técnico, emprestados nem lesionados', () => {
    const hurt = players.map((p, i) => (i % 7 === 0 ? { ...p, condition: { ...p.condition, injuryDaysLeft: 5 } } : p))
    const team = teams.find((t) => t.id === 'team-rca') as Team
    const squad = hurt.filter((p) => p.teamId === team.id)
    const pool = marketPoolOf(hurt, team, squad, 'team-imp')
    for (const p of pool) {
      expect(p.teamId).not.toBe(team.id)
      expect(p.teamId).not.toBe('team-imp')
      expect(p.condition.injuryDaysLeft).toBe(0)
      expect(p.contract.loanedFrom).toBeUndefined()
    }
  })
})
