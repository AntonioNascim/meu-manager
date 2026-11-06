import { describe, expect, it } from 'vitest'
import { MemoryIdentityStore, requireIdentity, type ApiDeps, type ApiRequest } from '../src/online/identityApi'
import { createIdentity, type Identity } from '../src/online/identity'
import { IP_ACTION, RATE_LIMITS, RateLimiter } from '../src/online/rateLimit'
import { MemoryNonceStore, signRequest } from '../src/online/signedRequest'

const T0 = 1_800_000_000_000

describe('limites finais (B9)', () => {
  it('o teto por IP das leituras e escritas é bem maior que o por identidade (casa ou CGNAT com várias pessoas)', () => {
    expect(IP_ACTION.read).toBe('readIp')
    expect(IP_ACTION.write).toBe('writeIp')
    expect(RATE_LIMITS.readIp[0].limit).toBeGreaterThanOrEqual(RATE_LIMITS.read[0].limit * 10)
    expect(RATE_LIMITS.writeIp[0].limit).toBeGreaterThanOrEqual(RATE_LIMITS.write[0].limit * 10)
  })

  it('5 pessoas no mesmo IP, cada uma consultando 100 vezes por minuto, não se bloqueiam; uma só passando de 120 é barrada', async () => {
    const store = new MemoryIdentityStore()
    const deps: ApiDeps = { store, turnstile: { verify: async () => true }, limiter: new RateLimiter(), nonces: new MemoryNonceStore(() => T0), now: () => T0 }
    let seed = 5
    const rnd = (n: number) => new Uint8Array(n).map((_, i) => (seed = (Math.imul(seed, 1664525) + 1013904223 + i) >>> 0) >>> 24)
    const people: Identity[] = []
    for (let i = 0; i < 5; i++) {
      const id = createIdentity(rnd).identity
      people.push(id)
      await store.create({ playerId: id.playerId, createdAt: T0, lastSeen: T0, nickname: `P${i}` })
    }
    let k = 0
    const askUnique = (who: Identity) => {
      const parts = { method: 'GET', path: '/api/me', body: '' }
      const n = ++k
      const req: ApiRequest = { ...parts, ip: '198.51.100.7', authorization: signRequest(who, parts, T0, (len) => new Uint8Array(len).map((_, i) => (n >> (8 * (i % 3))) & 255 || i + 1)) }
      return requireIdentity(req, 'read', deps)
    }
    let blocked = 0
    for (let round = 0; round < 100; round++) for (const who of people) if (!(await askUnique(who)).ok) blocked++
    expect(blocked).toBe(0)
    let over = 0
    for (let i = 0; i < 40; i++) if (!(await askUnique(people[0]!)).ok) over++
    expect(over).toBeGreaterThan(0)
  })
})
