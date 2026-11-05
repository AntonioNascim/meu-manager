import { describe, expect, it } from 'vitest'
import { ONLINE_GATE_KEY, onlineUnlocked } from '../src/online/gate'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('portão do online até o lançamento', () => {
  it('fica escondido para quem joga normalmente', () => {
    expect(onlineUnlocked({ search: '', storage: memory() })).toBe(false)
    expect(onlineUnlocked({ search: '?convite=ABCD2345', storage: memory() })).toBe(false)
  })
  it('?online=1 libera e o aparelho lembra; ?online=0 esconde de novo', () => {
    const storage = memory()
    expect(onlineUnlocked({ search: '?online=1', storage })).toBe(true)
    expect(storage.getItem(ONLINE_GATE_KEY)).toBe('1')
    expect(onlineUnlocked({ search: '', storage })).toBe(true)
    expect(onlineUnlocked({ search: '?online=0', storage })).toBe(false)
    expect(onlineUnlocked({ search: '', storage })).toBe(false)
  })
  it('sem armazenamento vale só o endereço; em desenvolvimento sempre libera', () => {
    expect(onlineUnlocked({ search: '?online=1' })).toBe(true)
    expect(onlineUnlocked({ search: '' })).toBe(false)
    expect(onlineUnlocked({ search: '', dev: true })).toBe(true)
  })
})
