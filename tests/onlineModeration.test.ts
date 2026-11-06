import { describe, expect, it } from 'vitest'
import { MemoryIdentityStore, requireIdentity, registerIdentity, type ApiDeps, type ApiRequest, type IdentityRecord } from '../src/online/identityApi'
import { createIdentity, type Identity } from '../src/online/identity'
import { MemoryLeagueStore } from '../src/online/leagueMemory'
import { MemoryModerationStore, REPORTS_TO_ACT, adminAuthorized, autoNickname, fileReport, parseAdminAction, parseReport, runAdminAction, type ModerationDeps } from '../src/online/moderation'
import { checkName } from '../src/online/nameFilter'
import { RateLimiter } from '../src/online/rateLimit'
import { MemoryNonceStore, signRequest } from '../src/online/signedRequest'

const T0 = 1_800_000_000_000

/** Identidades guardam o banimento como o D1 faz: pela tabela de bans. */
class IdentitiesWithBans extends MemoryIdentityStore {
  constructor(private mod: MemoryModerationStore) {
    super()
  }
  override async get(playerId: string): Promise<IdentityRecord | undefined> {
    const r = await super.get(playerId)
    const ban = this.mod.bans.get(playerId)
    return r ? { ...r, ...(ban ? { bannedAt: ban.bannedAt } : {}) } : undefined
  }
}

async function world() {
  const mod = new MemoryModerationStore()
  const identities = new IdentitiesWithBans(mod)
  const leagues = new MemoryLeagueStore()
  const left: string[] = []
  let n = 0
  const deps: ModerationDeps = { identities, leagues, mod, now: () => T0, randomId: () => `r${++n}`, leaveAll: async (id) => void left.push(id) }
  for (const name of ['ana', 'bia', 'cris', 'dani', 'edu']) await identities.create({ playerId: `p-${name}`, createdAt: T0, lastSeen: T0, nickname: `Nick ${name}` })
  await leagues.create({ id: 'liga1', name: 'Liga Ruim', kind: 'open', adminId: 'p-ana', pace: 'normal', band: 'evening', tzOffsetMin: -180, world: { source: 'ficticio' }, seed: 1, maxHumans: 8, status: 'lobby', entryClosed: false, hidden: false, directResult: false, createdAt: T0 } as never)
  for (const [i, who] of ['ana', 'bia', 'cris', 'dani'].entries()) await leagues.addMember({ leagueId: 'liga1', playerId: `p-${who}`, teamId: `team-${i}`, joinedAt: T0 })
  return { deps, mod, identities, leagues, left }
}

describe('moderação (B9)', () => {
  it('3 pessoas diferentes tiram o apelido; uma pessoa só denuncia uma vez e ninguém denuncia a si mesma', async () => {
    const { deps, identities, mod } = await world()
    const body = { kind: 'nickname' as const, target: 'p-edu', reason: 'offensive' as const }
    expect(await fileReport(deps, 'p-ana', body)).toEqual({ ok: true, body: { acted: false } })
    expect(await fileReport(deps, 'p-ana', body)).toEqual({ ok: false, error: 'duplicate' })
    expect(await fileReport(deps, 'p-edu', body)).toEqual({ ok: false, error: 'self-report' })
    expect(await fileReport(deps, 'p-bia', body)).toEqual({ ok: true, body: { acted: false } })
    expect(REPORTS_TO_ACT).toBe(3)
    expect(await fileReport(deps, 'p-cris', body)).toEqual({ ok: true, body: { acted: true } })
    expect((await identities.get('p-edu'))?.nickname).toBe(autoNickname('p-edu'))
    expect(autoNickname('p-edu')).toMatch(/^Técnico \d{4}$/)
    expect((await mod.counts()).openReports).toBe(0)
    expect(await fileReport(deps, 'p-ana', { kind: 'nickname', target: 'p-fantasma', reason: 'other' })).toEqual({ ok: false, error: 'not-found' })
  })

  it('3 membros escondem a liga do diretório; quem não é membro não denuncia; o painel devolve', async () => {
    const { deps, leagues } = await world()
    const body = { kind: 'league' as const, target: 'liga1', reason: 'spam' as const }
    expect(await fileReport(deps, 'p-edu', body)).toEqual({ ok: false, error: 'not-member' })
    for (const who of ['p-ana', 'p-bia']) expect((await fileReport(deps, who, body)).ok).toBe(true)
    expect((await leagues.get('liga1'))?.hidden).toBe(false)
    expect(await fileReport(deps, 'p-cris', body)).toEqual({ ok: true, body: { acted: true } })
    expect((await leagues.get('liga1'))?.hidden).toBe(true)
    await runAdminAction(deps, { type: 'dismiss', kind: 'league', target: 'liga1' })
    expect((await leagues.get('liga1'))?.hidden).toBe(false)
  })

  it('banir bloqueia a identidade, tira das ligas e desbanir devolve', async () => {
    const { deps, identities, left } = await world()
    expect(await runAdminAction(deps, { type: 'ban', playerId: 'p-bia', reason: 'apelido ofensivo' })).toEqual({ ok: true, body: {} })
    expect(left).toEqual(['p-bia'])
    expect((await identities.get('p-bia'))?.bannedAt).toBe(T0)
    expect((await identities.get('p-bia'))?.nickname).toBe(autoNickname('p-bia'))
    expect(await runAdminAction(deps, { type: 'ban', playerId: 'p-fantasma', reason: '' })).toEqual({ ok: false, error: 'not-found' })
    expect(await runAdminAction(deps, { type: 'unban', playerId: 'p-bia' })).toEqual({ ok: true, body: {} })
    expect((await identities.get('p-bia'))?.bannedAt).toBeUndefined()
    expect(await runAdminAction(deps, { type: 'unban', playerId: 'p-bia' })).toEqual({ ok: false, error: 'not-found' })
  })

  it('identidade banida leva 403 em pedido comum e ao tentar entrar de novo com o codigo', async () => {
    const mod = new MemoryModerationStore()
    const now = T0
    const store = new IdentitiesWithBans(mod)
    const deps: ApiDeps = { store, turnstile: { verify: async () => true }, limiter: new RateLimiter(), nonces: new MemoryNonceStore(() => now), now: () => now }
    let seed = 7
    const rnd = (n: number) => new Uint8Array(n).map((_, i) => (seed = (Math.imul(seed, 1664525) + 1013904223 + i) >>> 0) >>> 24)
    const who: Identity = createIdentity(rnd).identity
    let k = 0
    const req = (method: string, path: string, body: string): ApiRequest => {
      const parts = { method, path, body }
      return { ...parts, ip: '203.0.113.9', authorization: signRequest(who, parts, now, (n) => new Uint8Array(n).fill(++k)) }
    }
    expect((await registerIdentity(req('POST', '/api/identity', JSON.stringify({ turnstileToken: 't', nickname: 'Fulano' })), deps)).status).toBe(201)
    expect((await requireIdentity(req('GET', '/api/me', ''), 'read', deps)).ok).toBe(true)
    await mod.ban({ playerId: who.playerId, reason: 'x', bannedAt: now })
    const blocked = await requireIdentity(req('GET', '/api/me', ''), 'read', deps)
    expect(blocked.ok).toBe(false)
    expect(!blocked.ok && blocked.result).toMatchObject({ status: 403, body: { error: 'banned' } })
    expect((await registerIdentity(req('POST', '/api/identity', JSON.stringify({ turnstileToken: 't' })), deps)).status).toBe(403)
  })

  it('o segredo do painel: vazio ou curto desliga; comparação exata; corpos fechados', () => {
    expect(adminAuthorized('Bearer abcdefghijklmnop', undefined)).toBe(false)
    expect(adminAuthorized('Bearer curto', 'curto')).toBe(false)
    expect(adminAuthorized('Bearer abcdefghijklmnop', 'abcdefghijklmnop')).toBe(true)
    expect(adminAuthorized('Bearer abcdefghijklmnoq', 'abcdefghijklmnop')).toBe(false)
    expect(adminAuthorized(null, 'abcdefghijklmnop')).toBe(false)
    expect(parseAdminAction({ type: 'ban', playerId: 'p-1', reason: 'x' })).toEqual({ type: 'ban', playerId: 'p-1', reason: 'x' })
    for (const bad of [{ type: 'ban', playerId: 'p-1' }, { type: 'ban', playerId: 'p 1', reason: '' }, { type: 'apagar-tudo' }, { type: 'unban', playerId: 'p-1', extra: 1 }, { type: 'close-league', leagueId: '' }]) {
      expect(parseAdminAction(bad)).toBeUndefined()
    }
    expect(parseReport({ kind: 'nickname', target: 'p-1', reason: 'offensive' })).toEqual({ kind: 'nickname', target: 'p-1', reason: 'offensive' })
    expect(parseReport({ target: 'liga1', reason: 'spam' }, 'league')).toEqual({ kind: 'league', target: 'liga1', reason: 'spam' })
    for (const bad of [{ kind: 'nickname', target: 'p-1', reason: 'chato' }, { kind: 'chat', target: 'p-1', reason: 'spam' }, { kind: 'nickname', target: 'p-1', reason: 'spam', x: 1 }, undefined]) {
      expect(parseReport(bad as never)).toBeUndefined()
    }
  })

  it('o filtro de apelidos pega os acrescimos de moderacao', () => {
    for (const bad of ['Bundão', 'bundao', 'Escroto FC']) expect(checkName(bad).ok).toBe(false)
    expect(checkName('Bundesliga Fã').ok).toBe(true)
  })
})
