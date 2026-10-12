import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { MATCH } from '../src/engine/config'
import { underdogShiftFor } from '../src/engine/match/simulateMatch'
import { buildSide, dayFactorFor, formFactor, homeFactor, moraleFactor } from '../src/engine/match/state'
import { createRng } from '../src/engine/rng'
import type { Player, Team } from '../src/engine/types'

const world = generateWorld({ seed: 2024 })
const team = (abbr: string) => world.teams.find((t) => t.abbreviation === abbr) as Team
const squad = (t: Team) => world.players.filter((p) => p.teamId === t.id)
const anyPlayer = squad(team('IMP'))[5] as Player

const withHidden = (p: Player, consistency: number, morale = 70, form = 0): Player => ({
  ...p,
  hidden: { ...p.hidden, consistency },
  condition: { ...p.condition, morale, form },
})

const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

describe('moral', () => {
  it('neutra não muda nada; alta ajuda e baixa atrapalha, com efeito pequeno', () => {
    expect(moraleFactor(MATCH.modifiers.morale.neutral)).toBe(1)
    expect(moraleFactor(100)).toBeGreaterThan(1)
    expect(moraleFactor(10)).toBeLessThan(1)
    expect(moraleFactor(100)).toBeLessThan(1.05)
    expect(moraleFactor(0)).toBeGreaterThan(0.94)
  })
})

describe('forma', () => {
  it('sem jogos não muda nada; boa forma ajuda, má forma atrapalha, com teto', () => {
    expect(formFactor(0)).toBe(1)
    expect(formFactor(MATCH.modifiers.form.neutral)).toBe(1)
    expect(formFactor(8)).toBeGreaterThan(1)
    expect(formFactor(5)).toBeLessThan(1)
    expect(formFactor(10)).toBeCloseTo(1 + MATCH.modifiers.form.maxEffect)
    expect(formFactor(1)).toBeCloseTo(1 - MATCH.modifiers.form.maxEffect)
  })
})

describe('consistência', () => {
  const draws = (p: Player) => {
    const rng = createRng('dia')
    return Array.from({ length: 3000 }, () => dayFactorFor(rng, p))
  }

  it('jogador inconsistente varia muito mais de um jogo para outro', () => {
    const erratic = draws(withHidden(anyPlayer, 5))
    const steady = draws(withHidden(anyPlayer, 95))
    expect(sd(erratic)).toBeGreaterThan(sd(steady) * 4)
    expect(sd(erratic)).toBeLessThan(MATCH.modifiers.consistency.maxSd)
  })

  it('na média não favorece nem prejudica', () => {
    const erratic = draws(withHidden(anyPlayer, 5))
    expect(erratic.reduce((a, b) => a + b, 0) / erratic.length).toBeCloseTo(1, 2)
  })

  it('consistência máxima: só moral e forma contam', () => {
    const p = withHidden(anyPlayer, 100, 100, 8)
    expect(dayFactorFor(createRng(1), p)).toBeCloseTo(moraleFactor(100) * formFactor(8))
  })
})

describe('postura do time bem mais fraco', () => {
  const sideOf = (t: Team, home: boolean) =>
    buildSide({ team: t, players: squad(t) }, home ? homeFactor(t) : 1, createRng(1))

  it('recua contra adversário muito superior; o favorito não muda', () => {
    const strong = sideOf(team('IMP'), true)
    const weak = sideOf(team('TAM'), false)
    expect(underdogShiftFor(weak, strong)).toBe(MATCH.tactics.underdog.maxShift)
    expect(underdogShiftFor(strong, weak)).toBe(0)
  })

  it('times parecidos não mudam de postura', () => {
    const a = sideOf(team('JAN'), false)
    const b = sideOf(team('MAR'), false)
    expect(underdogShiftFor(a, b)).toBe(0)
    expect(underdogShiftFor(b, a)).toBe(0)
  })
})
