import { describe, expect, it } from 'vitest'
import { createRng, hashSeed } from '../src/engine/rng'

const take = (seed: number | string, n: number) => {
  const r = createRng(seed)
  return Array.from({ length: n }, () => r.next())
}

describe('createRng', () => {
  it('mesma semente gera a mesma sequência', () => {
    expect(take(42, 50)).toEqual(take(42, 50))
    expect(take('abc', 50)).toEqual(take('abc', 50))
  })

  it('sementes diferentes geram sequências diferentes', () => {
    expect(take(1, 10)).not.toEqual(take(2, 10))
  })

  it('next fica em [0, 1)', () => {
    for (const v of take(7, 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('média de next fica perto de 0,5', () => {
    const v = take(123, 100_000)
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    expect(mean).toBeGreaterThan(0.49)
    expect(mean).toBeLessThan(0.51)
  })

  it('int respeita limites inclusivos e cobre todos os valores', () => {
    const r = createRng(5)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = r.int(3, 6)
      expect(Number.isInteger(v)).toBe(true)
      seen.add(v)
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6])
  })

  it('float respeita limites', () => {
    const r = createRng(9)
    for (let i = 0; i < 1000; i++) {
      const v = r.float(-2, 2)
      expect(v).toBeGreaterThanOrEqual(-2)
      expect(v).toBeLessThan(2)
    }
  })

  it('chance respeita os extremos e a frequência', () => {
    const r = createRng(11)
    expect(r.chance(0)).toBe(false)
    expect(r.chance(1)).toBe(true)
    let hits = 0
    for (let i = 0; i < 20_000; i++) if (r.chance(0.3)) hits++
    expect(hits / 20_000).toBeGreaterThan(0.28)
    expect(hits / 20_000).toBeLessThan(0.32)
  })

  it('pick devolve item da lista e falha em lista vazia', () => {
    const r = createRng(1)
    const items = ['a', 'b', 'c']
    for (let i = 0; i < 100; i++) expect(items).toContain(r.pick(items))
    expect(() => r.pick([])).toThrow()
  })

  it('weighted segue os pesos e ignora peso zero', () => {
    const r = createRng(3)
    const counts = { a: 0, b: 0, c: 0 }
    const w = { a: 1, b: 3, c: 0 }
    for (let i = 0; i < 20_000; i++) counts[r.weighted(['a', 'b', 'c'] as const, (k) => w[k])]++
    expect(counts.c).toBe(0)
    expect(counts.b / counts.a).toBeGreaterThan(2.7)
    expect(counts.b / counts.a).toBeLessThan(3.3)
  })

  it('weighted com todos os pesos zero cai em pick', () => {
    expect(['x', 'y']).toContain(createRng(1).weighted(['x', 'y'], () => 0))
  })

  it('normal tem média e desvio próximos dos pedidos', () => {
    const r = createRng(77)
    const v = Array.from({ length: 50_000 }, () => r.normal(10, 2))
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length)
    expect(mean).toBeGreaterThan(9.95)
    expect(mean).toBeLessThan(10.05)
    expect(sd).toBeGreaterThan(1.95)
    expect(sd).toBeLessThan(2.05)
  })

  it('shuffle é permutação, determinístico e não altera a original', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8]
    const a = createRng(8).shuffle(original)
    const b = createRng(8).shuffle(original)
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual(original)
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('fork é determinístico e independente do pai', () => {
    const f1 = createRng(1).fork('x')
    const f2 = createRng(1).fork('x')
    expect(f1.next()).toBe(f2.next())
    expect(createRng(1).fork('x').next()).not.toBe(createRng(1).fork('y').next())
  })
})

describe('hashSeed', () => {
  it('é estável e distingue textos', () => {
    expect(hashSeed('a')).toBe(hashSeed('a'))
    expect(hashSeed('a')).not.toBe(hashSeed('b'))
  })
})
