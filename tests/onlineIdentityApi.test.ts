import { describe, expect, it } from 'vitest'
import { cloudflareTurnstile, MemoryIdentityStore, registerIdentity, requireIdentity, type ApiDeps, type ApiRequest } from '../src/online/identityApi'
import { createIdentity, type Identity } from '../src/online/identity'
import { RATE_LIMITS, RateLimiter } from '../src/online/rateLimit'
import { MemoryNonceStore, signRequest } from '../src/online/signedRequest'

function fakeRandom(start: number): (n: number) => Uint8Array {
  let x = start >>> 0
  return (n) => {
    const out = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0
      out[i] = x >>> 24
    }
    return out
  }
}

const T0 = 1_800_000_000_000

function setup(turnstileOk = true) {
  let now = T0
  const calls: { token: string; ip: string }[] = []
  const deps: ApiDeps = {
    store: new MemoryIdentityStore(),
    turnstile: { verify: async (token, ip) => (calls.push({ token, ip }), turnstileOk) },
    limiter: new RateLimiter(),
    nonces: new MemoryNonceStore(() => now),
    now: () => now,
  }
  return { deps, calls, advance: (ms: number) => (now += ms) }
}

let seed = 100
function request(identity: Identity, body: unknown, over: Partial<ApiRequest> = {}, at = T0): ApiRequest {
  // Conta nova exige a faixa de idade: por padrão, adulto (os casos de idade passam a sua em `onlineAge.test.ts`).
  const full = body && typeof body === 'object' && !Array.isArray(body) && !('ageBand' in body) ? { ...(body as object), ageBand: '18+' } : body
  const text = typeof full === 'string' ? full : JSON.stringify(full)
  const parts = { method: 'POST', path: '/api/identity', body: text }
  return { ...parts, ip: '203.0.113.5', authorization: signRequest(identity, parts, at, fakeRandom(seed++)), ...over }
}

describe('registerIdentity', () => {
  it('cria a identidade com Turnstile e apelido válidos', async () => {
    const { deps, calls } = setup()
    const { identity } = createIdentity(fakeRandom(1))
    const res = await registerIdentity(request(identity, { turnstileToken: 'tok', nickname: ' Mister  Pedro ' }), deps)
    expect(res).toEqual({ status: 201, body: { playerId: identity.playerId, created: true, nickname: 'Mister Pedro', ageBand: '18+' } })
    expect(calls).toEqual([{ token: 'tok', ip: '203.0.113.5' }])
    expect((await deps.store.get(identity.playerId))?.createdAt).toBe(T0)
  })

  it('o apelido é opcional', async () => {
    const { deps } = setup()
    const { identity } = createIdentity(fakeRandom(2))
    const res = await registerIdentity(request(identity, { turnstileToken: 'tok' }), deps)
    expect(res.status).toBe(201)
    expect((await deps.store.get(identity.playerId))?.nickname).toBeUndefined()
  })

  it('apelido recusado pelo filtro: 400 com o motivo, sem gastar o Turnstile nem criar', async () => {
    const { deps, calls } = setup()
    const { identity } = createIdentity(fakeRandom(3))
    const res = await registerIdentity(request(identity, { turnstileToken: 'tok', nickname: 'Admin' }), deps)
    expect(res).toEqual({ status: 400, body: { error: 'bad-nickname', issue: 'impersonal' } })
    expect(calls).toHaveLength(0)
    expect(await deps.store.get(identity.playerId)).toBeUndefined()
  })

  it('Turnstile reprovado: 403 e nada é criado', async () => {
    const { deps } = setup(false)
    const { identity } = createIdentity(fakeRandom(4))
    expect((await registerIdentity(request(identity, { turnstileToken: 'ruim' }), deps)).status).toBe(403)
    expect(await deps.store.get(identity.playerId)).toBeUndefined()
  })

  it('quem volta com o código (identidade existente) não resolve o desafio de novo', async () => {
    const { deps, calls, advance } = setup()
    const { identity } = createIdentity(fakeRandom(5))
    await registerIdentity(request(identity, { turnstileToken: 'a' }), deps)
    advance(60_000)
    const again = await registerIdentity(request(identity, { turnstileToken: 'b' }, {}, T0 + 60_000), deps)
    expect(again).toEqual({ status: 200, body: { playerId: identity.playerId, created: false, nickname: undefined, ageBand: '18+' } })
    expect(calls).toHaveLength(1)
    expect((await deps.store.get(identity.playerId))?.lastSeen).toBe(T0 + 60_000)
  })

  it('recusa corpo ruim: JSON quebrado, campo extra, grande demais, tipo errado', async () => {
    const { deps } = setup()
    const { identity } = createIdentity(fakeRandom(6))
    let n = 0
    for (const body of ['{não é json', { turnstileToken: 'a', admin: true }, { turnstileToken: 'a'.repeat(3000) }, { turnstileToken: 5 }, { turnstileToken: '' }, { turnstileToken: 'a', nickname: 7 }, [1], 'null', ' '.repeat(2000) + '{}']) {
      // Um IP diferente para cada tentativa: o limite de criações por IP não é o assunto deste teste.
      expect((await registerIdentity(request(identity, body, { ip: `192.0.2.${n++}` }), deps)).status).toBe(400)
    }
  })

  it('pedido sem assinatura, de outra chave ou repetido: 401', async () => {
    const { deps } = setup()
    const a = createIdentity(fakeRandom(7)).identity
    const b = createIdentity(fakeRandom(8)).identity
    expect((await registerIdentity({ ...request(a, { turnstileToken: 't' }), authorization: undefined }, deps)).status).toBe(401)
    const forged = request(a, { turnstileToken: 't' })
    expect((await registerIdentity({ ...forged, authorization: forged.authorization!.replace(a.playerId, b.playerId) }, deps)).status).toBe(401)
    const ok = request(a, { turnstileToken: 't' })
    expect((await registerIdentity(ok, deps)).status).toBe(201)
    const replay = await registerIdentity(ok, deps)
    expect(replay).toEqual({ status: 401, body: { error: 'unauthorized', reason: 'replay' } })
  })

  it('limita a 30 criações por IP por dia, com o tempo de espera, e libera depois', async () => {
    expect(RATE_LIMITS.createIdentity[0]).toEqual({ limit: 30, windowMs: 86_400_000 })
    const { deps, advance } = setup()
    for (let i = 0; i < RATE_LIMITS.createIdentity[0].limit; i++) expect((await registerIdentity(request(createIdentity(fakeRandom(200 + i)).identity, { turnstileToken: 't' }), deps)).status).toBe(201)
    const sixth = await registerIdentity(request(createIdentity(fakeRandom(300)).identity, { turnstileToken: 't' }), deps)
    expect(sixth.status).toBe(429)
    if (sixth.status === 429 && sixth.body.error === 'rate-limited') {
      advance(sixth.body.retryAfterMs)
      expect((await registerIdentity(request(createIdentity(fakeRandom(301)).identity, { turnstileToken: 't' }, {}, T0 + sixth.body.retryAfterMs), deps)).status).toBe(201)
    }
    // Outro IP não é afetado (relógio já avançado: a assinatura usa a hora de agora).
    const later = T0 + (sixth.status === 429 && sixth.body.error === 'rate-limited' ? sixth.body.retryAfterMs : 0)
    expect((await registerIdentity(request(createIdentity(fakeRandom(302)).identity, { turnstileToken: 't' }, { ip: '198.51.100.9' }, later), deps)).status).toBe(201)
  })
})

describe('requireIdentity', () => {
  const get = (identity: Identity, at = T0): ApiRequest => {
    const parts = { method: 'GET', path: '/api/me', body: '' }
    return { ...parts, ip: '203.0.113.5', authorization: signRequest(identity, parts, at, fakeRandom(seed++)) }
  }

  it('identidade desconhecida: 404; conhecida: passa e marca a visita', async () => {
    const { deps, advance } = setup()
    const { identity } = createIdentity(fakeRandom(9))
    expect((await requireIdentity(get(identity), 'read', deps)).ok).toBe(false)
    await registerIdentity(request(identity, { turnstileToken: 't' }), deps)
    advance(5000)
    expect((await requireIdentity(get(identity, T0 + 5000), 'read', deps)).ok).toBe(true)
    // Dentro de uma hora a última visita não é regravada; depois disso, sim.
    expect((await deps.store.get(identity.playerId))?.lastSeen).toBe(T0)
    advance(3_600_000)
    expect((await requireIdentity(get(identity, T0 + 3_605_000), 'read', deps)).ok).toBe(true)
    expect((await deps.store.get(identity.playerId))?.lastSeen).toBe(T0 + 3_605_000)
  })

  it('limita por identidade mesmo trocando de IP (120 leituras por minuto)', async () => {
    const { deps } = setup()
    const { identity } = createIdentity(fakeRandom(10))
    await registerIdentity(request(identity, { turnstileToken: 't' }), deps)
    let blocked = 0
    for (let i = 0; i < 130; i++) {
      const r = await requireIdentity({ ...get(identity), ip: `10.0.${i}.1` }, 'read', deps)
      if (!r.ok && r.result.status === 429) blocked++
    }
    expect(blocked).toBe(10)
  })
})

describe('cloudflareTurnstile', () => {
  const answer = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch
  it('aceita só success: true', async () => {
    expect(await cloudflareTurnstile('s', answer({ success: true })).verify('t', '1.1.1.1')).toBe(true)
    expect(await cloudflareTurnstile('s', answer({ success: false })).verify('t', '1.1.1.1')).toBe(false)
    expect(await cloudflareTurnstile('s', answer({})).verify('t', '1.1.1.1')).toBe(false)
  })
  it('falha fechada: erro de rede ou resposta ruim reprovam', async () => {
    expect(await cloudflareTurnstile('s', (async () => { throw new Error('rede') }) as unknown as typeof fetch).verify('t', 'ip')).toBe(false)
    expect(await cloudflareTurnstile('s', answer({ success: true }, false)).verify('t', 'ip')).toBe(false)
  })
  it('manda segredo, token e IP para o endereço do Cloudflare', async () => {
    let seen: { url: string; body: string } | undefined
    const f = (async (url: string, init: { body: URLSearchParams }) => ((seen = { url, body: init.body.toString() }), { ok: true, json: async () => ({ success: true }) })) as unknown as typeof fetch
    await cloudflareTurnstile('segredo-x', f).verify('tok-1', '9.9.9.9')
    expect(seen?.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(seen?.body).toBe('secret=segredo-x&response=tok-1&remoteip=9.9.9.9')
  })
})
