import { describe, expect, it } from 'vitest'
import { changeNickname as changeServer, MemoryIdentityStore, registerIdentity as registerServer, type ApiDeps } from '../src/online/identityApi'
import { changeNickname, registerIdentity } from '../src/online/identityClient'
import { createIdentity } from '../src/online/identity'
import { RateLimiter } from '../src/online/rateLimit'
import { MemoryNonceStore } from '../src/online/signedRequest'

let x = 7
const random = (n: number) =>
  Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x >>> 24
  })
const T0 = 1_800_000_000_000

/** O "servidor" é o próprio código do servidor na memória, ligado ao cliente por um fetch falso. */
function world(turnstileOk = true) {
  const deps: ApiDeps = { store: new MemoryIdentityStore(), turnstile: { verify: async () => turnstileOk }, limiter: new RateLimiter(), nonces: new MemoryNonceStore(() => T0), now: () => T0 }
  const fetchFn = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    const req = { method: String(init.method), path, body: String(init.body), ip: '203.0.113.9', authorization: (init.headers as Record<string, string>).Authorization }
    const out = path === '/api/identity' ? await registerServer(req, deps) : await changeServer(req, deps)
    return new Response(JSON.stringify(out.body), { status: out.status })
  }) as unknown as typeof fetch
  return { deps, client: { base: 'http://x', fetchFn, now: () => T0, randomBytes: random } }
}

describe('cliente da identidade (B8.1)', () => {
  it('cria a conta com apelido, volta com o mesmo código sem desafio e troca o apelido', async () => {
    const { deps, client } = world()
    const { identity } = createIdentity(random)
    expect(await registerIdentity(client, identity, 'tok', 'Craque Ana')).toEqual({ ok: true, created: true, nickname: 'Craque Ana' })
    // Outro aparelho: a mesma identidade. O servidor não confere o desafio de contas que já existem.
    expect(await registerIdentity(client, identity, 'recuperar')).toMatchObject({ ok: true, created: false, nickname: 'Craque Ana' })
    expect(await changeNickname(client, identity, ' Mister  Pedro ')).toEqual({ ok: true, nickname: 'Mister Pedro' })
    expect((await deps.store.get(identity.playerId))?.nickname).toBe('Mister Pedro')
  })

  it('conta que não existe, ao entrar com o código, vira "desafio recusado" (código errado)', async () => {
    const { client } = world(false)
    const { identity } = createIdentity(random)
    expect(await registerIdentity(client, identity, 'recuperar')).toEqual({ ok: false, reason: 'turnstile-failed' })
  })

  it('apelido recusado pelo filtro aparece com o motivo, no cadastro e na troca', async () => {
    const { client } = world()
    const { identity } = createIdentity(random)
    expect(await registerIdentity(client, identity, 'tok', 'Admin')).toEqual({ ok: false, reason: 'bad-nickname', issue: 'impersonal' })
    await registerIdentity(client, identity, 'tok', 'Craque Ana')
    expect(await changeNickname(client, identity, 'Admin')).toEqual({ ok: false, reason: 'bad-nickname', issue: 'impersonal' })
    expect(await changeNickname(client, identity, 'ab')).toEqual({ ok: false, reason: 'bad-nickname', issue: 'too-short' })
  })

  it('troca de apelido sem cadastro: 404; sem rede: offline', async () => {
    const { client } = world()
    const { identity } = createIdentity(random)
    expect(await changeNickname(client, identity, 'Craque Ana')).toEqual({ ok: false, reason: 'unknown-identity' })
    const off = {
      ...client,
      fetchFn: (async () => {
        throw new TypeError('x')
      }) as unknown as typeof fetch,
    }
    expect(await changeNickname(off, identity, 'Craque Ana')).toEqual({ ok: false, reason: 'offline' })
    expect(await registerIdentity(off, identity, 't')).toEqual({ ok: false, reason: 'offline' })
  })
})
