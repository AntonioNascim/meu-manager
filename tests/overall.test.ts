import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { getFormation, FORMATIONS } from '../src/engine/formations'
import { pickBench, pickStartingXI } from '../src/engine/lineup'
import { overallAt, overallForPosition, positionFit } from '../src/engine/overall'
import { ATTRIBUTE_NAMES } from '../src/engine/types'
import type { Attributes, Player } from '../src/engine/types'

const flat = (value: number): Attributes =>
  Object.fromEntries(ATTRIBUTE_NAMES.map((n) => [n, value])) as Attributes

describe('força geral', () => {
  it('atributos todos iguais dão a mesma força em qualquer posição', () => {
    for (const pos of ['GK', 'CB', 'CM', 'ST'] as const) {
      expect(overallForPosition(flat(10), pos)).toBeCloseTo(10)
    }
  })

  it('atacante pesa finalização; zagueiro pesa desarme, cabeceio e posicionamento', () => {
    const base = flat(8)
    const striker = overallForPosition({ ...base, finishing: 18 }, 'ST')
    const defenderAsStriker = overallForPosition({ ...base, tackling: 18 }, 'ST')
    expect(striker).toBeGreaterThan(defenderAsStriker + 1)

    const centreBack = overallForPosition({ ...base, tackling: 18, heading: 18, positioning: 18 }, 'CB')
    const finisherAsCb = overallForPosition({ ...base, finishing: 18 }, 'CB')
    expect(centreBack).toBeGreaterThan(finisherAsCb + 3)
  })

  it('jogar fora da posição tem penalidade, e a secundária penaliza menos', () => {
    const player: Pick<Player, 'position' | 'secondaryPositions'> = { position: 'CB', secondaryPositions: ['DM'] }
    expect(positionFit(player, 'CB')).toBe(1)
    expect(positionFit(player, 'DM')).toBeLessThan(1)
    expect(positionFit(player, 'ST')).toBeLessThan(positionFit(player, 'DM'))
    expect(positionFit({ position: 'ST', secondaryPositions: [] }, 'GK')).toBeLessThan(positionFit(player, 'ST'))
  })
})

describe('formações', () => {
  it('todas têm 11 vagas, com um goleiro na primeira', () => {
    for (const f of Object.values(FORMATIONS)) {
      expect(f.slots).toHaveLength(11)
      expect(f.slots[0]?.position).toBe('GK')
      expect(f.slots.filter((s) => s.position === 'GK')).toHaveLength(1)
    }
  })

  it('formação desconhecida dá erro', () => {
    expect(() => getFormation('9-9-9')).toThrow()
  })
})

describe('escalação automática', () => {
  const world = generateWorld({ seed: 7 })
  const team = world.teams[0]!
  const squad = world.players.filter((p) => p.teamId === team.id)

  it('escolhe 11 jogadores diferentes, goleiro no gol', () => {
    const xi = pickStartingXI(squad, getFormation('4-3-3'))
    expect(new Set(xi).size).toBe(11)
    expect(squad.find((p) => p.id === xi[0])?.position).toBe('GK')
  })

  it('pula lesionados e suspensos', () => {
    const formation = getFormation('4-4-2')
    const best = pickStartingXI(squad, formation)
    const hurtId = best[9] as string // um dos atacantes
    const changed: Player[] = squad.map((p) =>
      p.id === hurtId ? { ...p, condition: { ...p.condition, injuryDaysLeft: 10 } } : p,
    )
    const xi = pickStartingXI(changed, formation)
    expect(xi).not.toContain(hurtId)
    expect(xi).toHaveLength(11)
  })

  it('não altera a lista original e é determinística', () => {
    const copy = JSON.stringify(squad)
    const a = pickStartingXI(squad, getFormation('4-2-3-1'))
    const b = pickStartingXI(squad, getFormation('4-2-3-1'))
    expect(a).toEqual(b)
    expect(JSON.stringify(squad)).toBe(copy)
  })

  it('jogador na posição natural rende mais que improvisado', () => {
    const striker = squad.find((p) => p.position === 'ST') as Player
    expect(overallAt(striker, 'ST')).toBeGreaterThan(overallAt(striker, 'CB'))
  })

  it('banco tem goleiro reserva e ninguém do time titular', () => {
    const xi = pickStartingXI(squad, getFormation('4-4-2'))
    const bench = pickBench(squad, xi)
    expect(bench).toHaveLength(7)
    expect(bench.filter((id) => xi.includes(id))).toHaveLength(0)
    expect(bench.some((id) => squad.find((p) => p.id === id)?.position === 'GK')).toBe(true)
  })
})
