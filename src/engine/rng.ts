/**
 * Gerador aleatório com semente (mulberry32).
 * Mesma semente = mesma sequência. Nunca usar Math.random() no motor.
 */

export interface Rng {
  /** Float em [0, 1). */
  next(): number
  /** Inteiro em [min, max] (inclusive). */
  int(min: number, max: number): number
  /** Float em [min, max). */
  float(min: number, max: number): number
  /** Verdadeiro com probabilidade p (0 a 1). */
  chance(p: number): boolean
  /** Elemento aleatório de uma lista não vazia. */
  pick<T>(items: readonly T[]): T
  /** Elemento escolhido com probabilidade proporcional ao peso. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T
  /** Normal (média, desvio) via Box-Muller. */
  normal(mean?: number, sd?: number): number
  /** Nova lista embaralhada (Fisher-Yates); não altera a original. */
  shuffle<T>(items: readonly T[]): T[]
  /** Gerador independente derivado deste (para sub-simulações). */
  fork(label?: string | number): Rng
}

/** Converte texto em semente numérica de 32 bits (FNV-1a). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick: lista vazia')
      return items[Math.floor(next() * items.length)] as (typeof items)[number]
    },
    weighted: (items, weight) => {
      if (items.length === 0) throw new Error('weighted: lista vazia')
      const weights = items.map((it) => Math.max(0, weight(it)))
      const total = weights.reduce((a, b) => a + b, 0)
      if (total <= 0) return rng.pick(items)
      let r = next() * total
      for (let i = 0; i < items.length; i++) {
        r -= weights[i] as number
        if (r < 0) return items[i] as (typeof items)[number]
      }
      return items[items.length - 1] as (typeof items)[number]
    },
    normal: (mean = 0, sd = 1) => {
      const u = 1 - next() // evita log(0)
      const v = next()
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    shuffle: (items) => {
      const out = [...items]
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]]
      }
      return out
    },
    fork: (label = '') => createRng(hashSeed(`${next()}:${label}`)),
  }
  return rng
}
