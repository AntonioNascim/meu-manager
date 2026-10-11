import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_NAMES, POSITIONS } from '../src/engine/types'
import { ATTRIBUTE_LABELS, POSITION_LABELS, POSITION_SHORT_LABELS } from '../src/ui/labels'

describe('rótulos da interface', () => {
  it('cobrem todas as posições', () => {
    for (const p of POSITIONS) {
      expect(POSITION_LABELS[p]).toBeTruthy()
      expect(POSITION_SHORT_LABELS[p]).toBeTruthy()
    }
  })

  it('cobrem todos os atributos', () => {
    for (const a of ATTRIBUTE_NAMES) expect(ATTRIBUTE_LABELS[a]).toBeTruthy()
  })
})
