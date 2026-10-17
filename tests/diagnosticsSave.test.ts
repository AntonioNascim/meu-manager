import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { REFERENCE_TARGETS, formatReport, measureWorld } from '../src/diagnostics/measure'
import type { DeviceInfo } from '../src/diagnostics/measure'
import { createGame } from '../src/store/game'
import { deleteSlot, listSlots, saveToSlot } from '../src/store/saves'

const device: DeviceInfo = { model: 'SM-A135M', platform: 'Android 13', browser: 'Chrome 124', userAgent: 'x', cores: 8, memoryGb: 4, screen: '412x915 @2.6x', gpu: 'Mali-G52', speedIndex: 5000 }

describe('diagnóstico: salvamento', () => {
  it('mede o tempo de salvar a cada avanço e o tamanho do save, sem tocar nos saves do jogador', async () => {
    const mine = createGame(3, 'team-imp')
    await saveToSlot(1, mine, new Date('2026-05-01T10:00:00Z'))
    const before = await listSlots()

    const m = await measureWorld({ world: 'brazil', maxAdvances: 4, readMemory: () => null })
    const s = m.save!
    expect(s).not.toBeNull()
    expect(s.compressed).toBe(true)
    expect(s.parts).toBeGreaterThan(100)
    expect(s.startKb).toBeGreaterThan(50)
    expect(s.endKb).toBeGreaterThan(50)
    expect(s.endKb).toBeLessThan(REFERENCE_TARGETS.saveGzipMb * 1024)
    expect(s.firstMs).toBeGreaterThan(0)
    expect(s.medianMs).toBeGreaterThan(0)
    expect(s.worstMs).toBeGreaterThanOrEqual(s.medianMs)
    expect(s.writtenPartsMedian).toBeGreaterThan(0)
    expect(s.writtenPartsMedian).toBeLessThanOrEqual(s.parts)

    const text = formatReport(device, m)
    expect(text).toContain('Save gravado (comprimido)')
    expect(text).toContain('Tempo de salvar a cada avanco')
    expect(text).toContain('Cada save grava (mediana)')

    // O jogo salvo continua igual e o banco do diagnóstico some.
    expect(await listSlots()).toEqual(before)
    expect(await Dexie.exists('meu-manager-diagnostico')).toBe(false)
    await deleteSlot(1)
  }, 120_000)

  it('sem IndexedDB o relatório diz que não deu para medir', async () => {
    const m = await measureWorld({ world: 'brazil', maxAdvances: 1, readMemory: () => null, saveStore: null })
    expect(m.save).toBeNull()
    expect(formatReport(device, m)).toContain('nao tem IndexedDB')
  }, 120_000)
})
