import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTE_NAMES,
  GOALKEEPER_ATTRIBUTES,
  MENTAL_ATTRIBUTES,
  PHYSICAL_ATTRIBUTES,
  POSITIONS,
  SQUAD_MAX,
  SQUAD_MIN,
  TECHNICAL_ATTRIBUTES,
} from '../src/engine/types'

describe('constantes do modelo de dados', () => {
  it('tem as 10 posições', () => {
    expect(POSITIONS).toHaveLength(10)
  })

  it('tem 16 atributos visíveis, sem repetição', () => {
    expect(TECHNICAL_ATTRIBUTES).toHaveLength(7)
    expect(PHYSICAL_ATTRIBUTES).toHaveLength(3)
    expect(MENTAL_ATTRIBUTES).toHaveLength(4)
    expect(GOALKEEPER_ATTRIBUTES).toHaveLength(2)
    expect(new Set(ATTRIBUTE_NAMES).size).toBe(16)
  })

  it('limites do elenco', () => {
    expect(SQUAD_MIN).toBe(18)
    expect(SQUAD_MAX).toBe(30)
  })
})
