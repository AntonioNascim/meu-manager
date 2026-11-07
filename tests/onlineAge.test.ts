import { describe, expect, it } from 'vitest'
import { accessOf, AGE_BANDS, FULL_ACCESS_AGE, ONLINE_MIN_AGE, PROTECTED_LEAGUE_NAMES, isProtectedLeagueName } from '../src/online/agePolicy'
import { checkName } from '../src/online/nameFilter'
import { autoNickname } from '../src/online/moderation'
import { createIdentity, type Identity } from '../src/online/identity'
import { changeNickname, MemoryIdentityStore, registerIdentity, type ApiRequest } from '../src/online/identityApi'
import { MemoryNonceStore, signRequest } from '../src/online/signedRequest'
import { RateLimiter } from '../src/online/rateLimit'
import { createLeague, joinLeague, listOpenLeagues, LEAGUE_LIMITS, type LeagueDeps } from '../src/online/leagueApi'
import { MemoryLeagueStore } from '../src/online/leagueMemory'
import { exportAccount, MemoryBlobStore } from '../src/online/cloudSave'

const T0 = 1_800_000_000_000
let n = 1
const rnd = (len: number) => Uint8Array.from({ length: len }, (_, i) => (i * 31 + n * 7 + len + i * i) & 255)

function world() {
  const now = () => T0
  const store = new MemoryIdentityStore()
  const leagues = new MemoryLeagueStore()
  const rooms = { init: async () => ({ ok: true }), addSeat: async () => ({ ok: true }), removeSeat: async () => undefined, destroy: async () => undefined }
  const deps = { store, turnstile: { verify: async () => true }, limiter: new RateLimiter(), nonces: new MemoryNonceStore(now), now, leagues, rooms, identities: store, randomBytes: (k: number) => rnd(k) } as unknown as LeagueDeps
  const sign = (id: Identity, method: string, path: string, body: unknown, ip = '203.0.113.7'): ApiRequest => {
    n++
    const parts = { method, path, body: JSON.stringify(body) }
    return { ...parts, ip, authorization: signRequest(id, parts, T0, rnd) }
  }
  const join = async (band: string | undefined, nickname?: string) => {
    n++
    const { identity } = createIdentity(rnd)
    const res = await registerIdentity(sign(identity, 'POST', '/api/identity', { turnstileToken: 't', ...(band ? { ageBand: band } : {}), ...(nickname ? { nickname } : {}) }, `198.51.100.${n}`), deps)
    return { identity, res }
  }
  return { deps, store, sign, join }
}

describe('faixa de idade e modo protegido', () => {
  it('a política tem limites nas faixas: 12 anos mínimo e a idade de liberação total é uma fronteira de faixa', () => {
    const edges = AGE_BANDS.map((b) => b.from)
    expect(edges).toContain(ONLINE_MIN_AGE)
    expect(edges).toContain(FULL_ACCESS_AGE)
    expect(accessOf('under12')).toBe('none')
    expect(accessOf('12-15')).toBe('protected')
    expect(accessOf('16-17')).toBe(FULL_ACCESS_AGE <= 16 ? 'full' : 'protected')
    expect(accessOf('18+')).toBe('full')
    expect(accessOf(undefined)).toBe('protected')
  })

  it('todos os nomes de liga do modo protegido passam no filtro de nomes', () => {
    for (const name of PROTECTED_LEAGUE_NAMES) expect(checkName(name, { min: LEAGUE_LIMITS.nameMin, max: LEAGUE_LIMITS.nameMax }).ok, name).toBe(true)
    expect(isProtectedLeagueName('Liga qualquer')).toBe(false)
  })

  it('conta nova exige a faixa; menos de 12 anos não cria conta', async () => {
    const w = world()
    expect((await w.join(undefined)).res).toMatchObject({ status: 400, body: { error: 'age-required' } })
    const young = await w.join('under12')
    expect(young.res).toMatchObject({ status: 403, body: { error: 'too-young' } })
    expect(await w.store.get(young.identity.playerId)).toBeUndefined()
    expect((await w.join('99')).res.status).toBe(400)
  })

  it('modo protegido: o apelido é o gerado pelo jogo, mesmo que o aparelho mande outro, e não troca', async () => {
    const w = world()
    const teen = await w.join('12-15', 'MeuApelido')
    expect(teen.res.status).toBe(201)
    const id = teen.identity.playerId
    expect((teen.res.body as { nickname?: string }).nickname).toBe(autoNickname(id))
    expect((await w.store.get(id))?.ageBand).toBe('12-15')
    expect(await changeNickname(w.sign(teen.identity, 'PUT', '/api/me', { nickname: 'Outro Nome' }), w.deps)).toMatchObject({ status: 403, body: { error: 'protected-account' } })
    const adult = await w.join('18+', 'Craque Ana')
    expect(await changeNickname(w.sign(adult.identity, 'PUT', '/api/me', { nickname: 'Craque Bia' }), w.deps)).toMatchObject({ status: 200 })
  })

  it('modo protegido: só liga de amigos, com nome da lista; sem listar nem entrar em ligas abertas', async () => {
    const w = world()
    const teen = (await w.join('12-15')).identity
    const adult = (await w.join('18+', 'Craque Ana')).identity
    const mk = (who: Identity, over: Record<string, unknown>) =>
      createLeague(w.sign(who, 'POST', '/api/leagues', { turnstileToken: 't', name: 'Liga dos Amigos', kind: 'friends', world: { source: 'ficticio' }, maxHumans: 4, ...over }), w.deps)
    expect(await mk(teen, { kind: 'open' })).toMatchObject({ status: 403, body: { error: 'protected-account' } })
    expect(await mk(teen, { name: 'Liga do Zé' })).toMatchObject({ status: 400, body: { error: 'protected-name' } })
    expect((await mk(teen, {})).status).toBe(201)
    const open = await mk(adult, { kind: 'open', name: 'Liga Aberta Nova' })
    expect(open.status).toBe(201)
    const openId = (open.body as { id: string }).id
    expect((await listOpenLeagues(w.sign(teen, 'GET', '/api/leagues/open', {}), w.deps)).status).toBe(403)
    expect((await listOpenLeagues(w.sign(adult, 'GET', '/api/leagues/open', {}), w.deps)).status).toBe(200)
    expect(await joinLeague(w.sign(teen, 'POST', `/api/leagues/${openId}/join`, { teamId: 't1' }), w.deps, openId)).toMatchObject({ status: 403, body: { error: 'protected-account' } })
  })

  it('conta antiga, sem faixa, vale como protegida; quem volta com o código recebe a faixa guardada', async () => {
    const w = world()
    const { identity } = createIdentity(rnd)
    await w.store.create({ playerId: identity.playerId, createdAt: T0, lastSeen: T0, nickname: 'Antigo' })
    const old = await createLeague(w.sign(identity, 'POST', '/api/leagues', { turnstileToken: 't', name: 'Liga Livre', kind: 'friends', world: { source: 'ficticio' }, maxHumans: 4 }), w.deps)
    expect(old).toMatchObject({ status: 400, body: { error: 'protected-name' } })
    const adult = await w.join('18+', 'Craque Ana')
    const again = await registerIdentity(w.sign(adult.identity, 'POST', '/api/identity', { turnstileToken: 'recuperar' }, '198.51.100.250'), w.deps)
    expect(again).toMatchObject({ status: 200, body: { created: false, ageBand: '18+' } })
  })

  it('a exportação dos dados inclui a faixa (e nunca uma data de nascimento)', async () => {
    const out = await exportAccount({ blobs: new MemoryBlobStore(), now: () => T0 } as never, { playerId: 'p', createdAt: 1, lastSeen: 2, nickname: 'x', ageBand: '12-15' })
    expect(out.ageBand).toBe('12-15')
    expect(JSON.stringify(out)).not.toMatch(/birth|nascimento/i)
  })
})
