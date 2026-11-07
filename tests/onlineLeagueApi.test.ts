import { describe, expect, it } from 'vitest'
import { MemoryIdentityStore, type ApiRequest } from '../src/online/identityApi'
import { CODE_ALPHABET, LEAGUE_LIMITS, adminAction, changePace, controlLeague, createLeague, getLeague, clubDecision, clubState, cupsState, parseSearchFilters, tradeAct, tradeRead, leagueState, liveTicket, setReady, joinLeague, leaveAllLeagues, leaveLeague, listOpenLeagues, myLeagues, normalizeCode, resolveCode, type LeagueDeps, type RoomPort } from '../src/online/leagueApi'
import { MemoryLeagueStore } from '../src/online/leagueMemory'
import { createIdentity, type Identity } from '../src/online/identity'
import { RateLimiter } from '../src/online/rateLimit'
import { MemoryNonceStore, signRequest } from '../src/online/signedRequest'

let x = 11
const random = (n: number) =>
  Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x >>> 24
  })
const T0 = 1_800_000_000_000

/** Sala falsa: guarda as vagas e diz "unknown-team" para clubes que não começam com "team-". */
class FakeRoom implements RoomPort {
  seats = new Map<string, Map<string, string>>()
  started = new Set<string>()
  destroyed: string[] = []
  failInit = false
  async init(league: { id: string }) {
    if (this.failInit) return { ok: false as const, error: 'unavailable' as const }
    this.seats.set(league.id, new Map())
    return { ok: true as const }
  }
  async addSeat(id: string, playerId: string, teamId: string) {
    const room = this.seats.get(id)
    if (!room) return { ok: false as const, error: 'not-found' as const }
    if (!teamId.startsWith('team-')) return { ok: false as const, error: 'unknown-team' as const }
    if ([...room.values()].includes(teamId)) return { ok: false as const, error: 'team-taken' as const }
    room.set(playerId, teamId)
    return { ok: true as const }
  }
  async removeSeat(id: string, playerId: string) {
    this.seats.get(id)?.delete(playerId)
    return { ok: true as const }
  }
  async start(id: string) {
    this.started.add(id)
    return { ok: true as const }
  }
  calls: string[] = []
  running = new Set<string>()
  async cups(id: string, playerId: string) {
    this.tradeOps.push(`cups:${id}:${playerId}`)
    if (!this.started.has(id)) return { ok: false as const, error: 'bad-state' as const }
    return { ok: true as const, cups: { mine: [], others: [], history: [] } }
  }
  tradeOps: string[] = []
  async trade(id: string, playerId: string, op: { op: string; offerId?: string; playerId?: string }) {
    this.tradeOps.push(`${op.op}:${id}:${playerId}`)
    if (op.op === 'offer' && op.playerId === 'recusa') return { ok: false as const, refused: 'fee-too-low', minimumSalary: 7000 }
    return { ok: true as const, body: { windowOpen: true, offers: [], openAsBuyer: 0, reserved: 0, history: [], reports: [{ id: 'rp-1', at: 0, by: 'x', recordId: 'tr-1', reason: 'laranja' as const }] } }
  }
  clubCalls: string[] = []
  async club(id: string, playerId: string) {
    this.clubCalls.push(`club:${id}:${playerId}`)
    if (!this.started.has(id)) return { ok: false as const, error: 'bad-state' as const }
    return { ok: true as const, view: { teamId: 'team-1', seasonLabel: '2026', seasonEnd: '2026-12-31', objective: { targetPosition: 5, sackingPosition: 11 }, squadSize: 24, payroll: 1, salaryBudget: 2, expiring: [], academyPending: [], academySize: 8 } }
  }
  async clubAction(id: string, playerId: string, action: { type: string; playerId: string }) {
    this.clubCalls.push(`${action.type}:${id}:${playerId}:${action.playerId}`)
    if (action.playerId === 'recusa') return { ok: false as const, refused: 'salary' as const, minimumSalary: 5000 }
    return { ok: true as const, view: (await this.club(id, playerId)).view as never }
  }
  async ticket(id: string, playerId: string) {
    this.calls.push(`ticket:${id}:${playerId}`)
    if (!this.started.has(id)) return { ok: false as const, error: 'bad-state' as const }
    return { ok: true as const, ticket: 'a'.repeat(48), expiresInMs: 30000 }
  }
  async state(id: string) {
    if (!this.seats.has(id)) return { ok: false as const, error: 'not-found' as const }
    if (!this.started.has(id)) return { ok: true as const, phase: 'lobby' as const }
    return { ok: true as const, phase: 'running' as const, view: { now: 0, worldDate: '2026-01-01', pace: 'normal', band: 'classic', tzOffsetMin: -180, directResult: false, paused: false, events: [], seats: [], log: [], suggestions: [{ playerId: 'x', teamId: 'team-1', missed: 9, idleDays: 20 }] } as never }
  }
  async ready(id: string, playerId: string, ready: boolean) {
    this.calls.push(`ready:${id}:${playerId}:${ready}`)
    return { ok: true as const }
  }
  async control(id: string, action: string, by: string) {
    this.calls.push(`${action}:${id}:${by}`)
    return { ok: true as const }
  }
  async setPace(id: string, pace: string) {
    this.calls.push(`pace:${id}:${pace}`)
    return { ok: true as const }
  }
  async destroy(id: string) {
    this.destroyed.push(id)
    this.seats.delete(id)
  }
}

function setup() {
  let now = T0
  const room = new FakeRoom()
  const identities = new MemoryIdentityStore()
  const deps: LeagueDeps = {
    store: identities,
    identities,
    turnstile: { verify: async (t) => t !== 'ruim' },
    limiter: new RateLimiter(),
    nonces: new MemoryNonceStore(() => now),
    now: () => now,
    leagues: new MemoryLeagueStore(),
    rooms: room,
    randomBytes: random,
  }
  const people = new Map<string, Identity>()
  const person = async (name: string): Promise<Identity> => {
    const { identity } = createIdentity(random)
    await identities.create({ playerId: identity.playerId, createdAt: now, lastSeen: now, nickname: name, ageBand: '18+' })
    people.set(name, identity)
    return identity
  }
  let ip = 0
  const req = (who: Identity, method: string, path: string, body: unknown = {}, over: Partial<ApiRequest> = {}): ApiRequest => {
    const text = JSON.stringify(body)
    const parts = { method, path, body: text }
    return { ...parts, ip: `203.0.113.${(ip++ % 250) + 1}`, authorization: signRequest(who, parts, now, random), ...over }
  }
  return { deps, room, person, req, advance: (ms: number) => (now += ms) }
}

const create = { turnstileToken: 'ok', name: 'Liga dos Amigos', kind: 'friends', world: { source: 'ficticio' }, pace: 'fast', band: 'night', maxHumans: 4 }

describe('criar liga', () => {
  it('cria liga de amigos com código de 8 caracteres e o ADM escolhe o clube', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    const res = await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, teamId: 'team-1' }), s.deps)
    expect(res.status).toBe(201)
    if (res.status !== 201) return
    expect(res.body).toMatchObject({ name: 'Liga dos Amigos', kind: 'friends', pace: 'fast', status: 'lobby', humans: 1, isAdmin: true, myTeamId: 'team-1' })
    expect(res.body.code).toHaveLength(8)
    expect([...res.body.code!].every((c) => CODE_ALPHABET.includes(c))).toBe(true)
    expect(s.room.seats.get(res.body.id)?.get(ana.playerId)).toBe('team-1')
  })

  it('liga aberta só usa o ritmo Normal e não tem código', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    const res = await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, kind: 'open' }), s.deps)
    expect(res.status).toBe(201)
    if (res.status === 201) expect(res.body).toMatchObject({ pace: 'normal' }), expect(res.body.code).toBeUndefined()
  })

  it('recusa nome ofensivo, Turnstile reprovado, corpo ruim e campo extra', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    expect((await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, name: 'Moderador' }), s.deps)).body).toMatchObject({ error: 'bad-name', issue: 'impersonal' })
    expect((await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, turnstileToken: 'ruim' }), s.deps)).status).toBe(403)
    for (const bad of [{ ...create, maxHumans: 1 }, { ...create, maxHumans: 21 }, { ...create, pace: 'turbo' }, { ...create, band: 'custom' }, { ...create, world: { source: 'real', version: 'x' } }, { ...create, extra: 1 }, { ...create, tzOffsetMin: 7 }]) {
      // Uma identidade nova por tentativa: o limite de criar por dia não é o assunto aqui.
      expect((await createLeague(s.req(await s.person('Fulano'), 'POST', '/api/leagues', bad), s.deps)).status).toBe(400)
    }
  })

  it('limites: 3 ligas ativas por ADM e falha da sala não deixa liga pela metade', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    for (let i = 0; i < LEAGUE_LIMITS.activeCreated; i++) {
      expect((await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, name: `Liga ${i} Teste` }), s.deps)).status).toBe(201)
      s.advance(25 * 3_600_000) // o limite de criar por dia não é o assunto aqui
    }
    expect((await createLeague(s.req(ana, 'POST', '/api/leagues', create), s.deps)).body).toMatchObject({ error: 'too-many-created' })
    const bia = await s.person('Bia')
    s.room.failInit = true
    expect((await createLeague(s.req(bia, 'POST', '/api/leagues', create), s.deps)).status).toBe(502)
    expect(await s.deps.leagues.mine(bia.playerId)).toEqual([])
    expect(await s.deps.leagues.countCreated(bia.playerId)).toBe(0)
  })

  it('clube que não existe ao criar: a liga não fica', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    expect((await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, teamId: 'xx' }), s.deps)).status).toBe(400)
    expect(await s.deps.leagues.countCreated(ana.playerId)).toBe(0)
  })
})

describe('diretório, convite e entrada', () => {
  it('liga aberta aparece no diretório; de amigos não; entra com clube livre', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    const bia = await s.person('Bia')
    const open = await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, kind: 'open', name: 'Liga Aberta' }), s.deps)
    await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, name: 'Liga Fechada' }), s.deps)
    const dir = await listOpenLeagues(s.req(bia, 'GET', '/api/leagues/open', ''), s.deps)
    expect(dir.status === 200 && dir.body.leagues.map((l) => l.name)).toEqual(['Liga Aberta'])
    expect(dir.status === 200 && dir.body.leagues[0]!.adminNickname).toBe('Ana')
    if (open.status !== 201) throw new Error('x')
    const joined = await joinLeague(s.req(bia, 'POST', `/api/leagues/${open.body.id}/join`, { teamId: 'team-7' }), s.deps, open.body.id)
    expect(joined.status).toBe(200)
    expect(joined.status === 200 && joined.body.members.map((m) => [m.nickname, m.teamId])).toEqual([['Bia', 'team-7']])
    expect((await myLeagues(s.req(bia, 'GET', '/api/leagues/mine', ''), s.deps)).body).toMatchObject({ leagues: [{ id: open.body.id, humans: 1 }] })
  })

  it('liga de amigos: código certo entra, errado é recusado (e conta tentativas), sem código não se vê a liga', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    const bia = await s.person('Bia')
    const made = await createLeague(s.req(ana, 'POST', '/api/leagues', create), s.deps)
    if (made.status !== 201) throw new Error('x')
    const id = made.body.id
    const code = made.body.code!
    expect((await getLeague(s.req(bia, 'GET', `/api/leagues/${id}`, ''), s.deps, id)).status).toBe(404)
    expect((await resolveCode(s.req(bia, 'POST', '/api/leagues/code', {}), s.deps, 'ABCD2345')).body).toMatchObject({ error: 'wrong-code' })
    const seen = await resolveCode(s.req(bia, 'POST', '/api/leagues/code', {}), s.deps, code.toLowerCase().replace(/(.{4})/, '$1-'))
    expect(seen.status === 200 && seen.body.id).toBe(id)
    expect(seen.status === 200 && seen.body.code).toBeUndefined()
    expect((await joinLeague(s.req(bia, 'POST', `/api/leagues/${id}/join`, { teamId: 'team-2' }), s.deps, id)).body).toMatchObject({ error: 'wrong-code' })
    expect((await joinLeague(s.req(bia, 'POST', `/api/leagues/${id}/join`, { teamId: 'team-2', code }), s.deps, id)).status).toBe(200)
    expect(normalizeCode(' ab-cd 23 ')).toBe('ABCD23')
  })

  it('tentativas de código: 10 por hora, depois 429', async () => {
    const s = setup()
    const bia = await s.person('Bia')
    for (let i = 0; i < 10; i++) expect((await resolveCode(s.req(bia, 'POST', '/api/leagues/code', {}), s.deps, 'ABCD2345')).status).toBe(404)
    const eleventh = await resolveCode(s.req(bia, 'POST', '/api/leagues/code', {}), s.deps, 'ABCD2345')
    expect(eleventh.status).toBe(429)
  })

  it('recusa clube ocupado, liga cheia, entrada fechada, quem já é membro e o limite de 5 ligas', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    const bia = await s.person('Bia')
    const cai = await s.person('Cai')
    const made = await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, kind: 'open', maxHumans: 2, teamId: 'team-1' }), s.deps)
    if (made.status !== 201) throw new Error('x')
    const id = made.body.id
    expect((await joinLeague(s.req(bia, 'POST', `/api/leagues/${id}/join`, { teamId: 'team-1' }), s.deps, id)).body).toMatchObject({ error: 'team-taken' })
    expect((await joinLeague(s.req(ana, 'POST', `/api/leagues/${id}/join`, { teamId: 'team-3' }), s.deps, id)).body).toMatchObject({ error: 'already-member' })
    expect((await joinLeague(s.req(bia, 'POST', `/api/leagues/${id}/join`, { teamId: 'team-2' }), s.deps, id)).status).toBe(200)
    expect((await joinLeague(s.req(cai, 'POST', `/api/leagues/${id}/join`, { teamId: 'team-3' }), s.deps, id)).body).toMatchObject({ error: 'league-full' })
    // Liga cheia sai do diretório.
    expect((await listOpenLeagues(s.req(cai, 'GET', '/api/leagues/open', ''), s.deps)).body).toMatchObject({ leagues: [] })
    // Entrada fechada.
    const other = await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, kind: 'open', name: 'Outra Liga' }), s.deps)
    if (other.status !== 201) throw new Error('x')
    await adminAction(s.req(ana, 'POST', `/api/leagues/${other.body.id}/close-entry`, {}), s.deps, other.body.id, 'close-entry')
    expect((await joinLeague(s.req(cai, 'POST', `/api/leagues/${other.body.id}/join`, { teamId: 'team-5' }), s.deps, other.body.id)).body).toMatchObject({ error: 'entry-closed' })
    // 5 ligas no máximo.
    const dan = await s.person('Dan')
    for (let i = 0; i < LEAGUE_LIMITS.participating; i++) {
      const l = await createLeague(s.req(await s.person(`Adm${i}`), 'POST', '/api/leagues', { ...create, kind: 'open', name: `Aberta ${i} Teste`, maxHumans: 5 }), s.deps)
      if (l.status !== 201) throw new Error('x')
      expect((await joinLeague(s.req(dan, 'POST', `/api/leagues/${l.body.id}/join`, { teamId: `team-${10 + i}` }), s.deps, l.body.id)).status).toBe(200)
    }
    const last = await createLeague(s.req(await s.person('Admx'), 'POST', '/api/leagues', { ...create, kind: 'open', name: 'Sexta Liga' }), s.deps)
    if (last.status !== 201) throw new Error('x')
    expect((await joinLeague(s.req(dan, 'POST', `/api/leagues/${last.body.id}/join`, { teamId: 'team-30' }), s.deps, last.body.id)).body).toMatchObject({ error: 'too-many-joined' })
  })
})

describe('andamento da liga (B8.4)', () => {
  async function running() {
    const s = setup()
    const ana = await s.person('Ana')
    const bia = await s.person('Bia')
    const dudu = await s.person('Dudu')
    const made = await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, teamId: 'team-1' }), s.deps)
    if (made.status !== 201) throw new Error('x')
    const id = made.body.id
    await joinLeague(s.req(bia, 'POST', `/api/leagues/${id}/join`, { teamId: 'team-2', code: made.body.code }), s.deps, id)
    return { s, ana, bia, dudu, id }
  }

  it('antes de iniciar a liga está no saguão; depois mostra a visão, e só o ADM recebe as sugestões de ausência', async () => {
    const { s, ana, bia, id } = await running()
    const lobby = await leagueState(s.req(ana, 'GET', `/api/leagues/${id}/state`), s.deps, id)
    expect(lobby.body).toMatchObject({ phase: 'lobby', isAdmin: true })
    await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')
    const adm = await leagueState(s.req(ana, 'GET', `/api/leagues/${id}/state`), s.deps, id)
    const tec = await leagueState(s.req(bia, 'GET', `/api/leagues/${id}/state`), s.deps, id)
    expect(adm.status === 200 && adm.body.view?.suggestions).toHaveLength(1)
    expect(tec.status === 200 && tec.body.view?.suggestions).toHaveLength(0)
    expect(tec.status === 200 && tec.body.isAdmin).toBe(false)
  })

  it('quem não está na liga não vê o andamento', async () => {
    const { s, dudu, id } = await running()
    expect((await leagueState(s.req(dudu, 'GET', `/api/leagues/${id}/state`), s.deps, id)).status).toBe(404)
  })

  it('Pronto: só membro, só com a liga em andamento, corpo conferido', async () => {
    const { s, ana, bia, dudu, id } = await running()
    expect((await setReady(s.req(bia, 'POST', `/api/leagues/${id}/ready`, { ready: true }), s.deps, id)).status).toBe(409)
    await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')
    expect((await setReady(s.req(bia, 'POST', `/api/leagues/${id}/ready`, { ready: true }), s.deps, id)).body).toEqual({ ready: true })
    expect(s.room.calls).toContain(`ready:${id}:${bia.playerId}:true`)
    expect((await setReady(s.req(dudu, 'POST', `/api/leagues/${id}/ready`, { ready: true }), s.deps, id)).status).toBe(404)
    expect((await setReady(s.req(bia, 'POST', `/api/leagues/${id}/ready`, { ready: 'sim' }), s.deps, id)).status).toBe(400)
  })

  it('Meu clube: só membro, só com a liga em andamento; decisões com corpo conferido e recusa devolve o motivo', async () => {
    const { s, ana, bia, dudu, id } = await running()
    expect((await clubState(s.req(bia, 'GET', `/api/leagues/${id}/club`), s.deps, id)).status).toBe(409)
    await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')
    const ok = await clubState(s.req(bia, 'GET', `/api/leagues/${id}/club`), s.deps, id)
    expect(ok.status).toBe(200)
    expect((await clubState(s.req(dudu, 'GET', `/api/leagues/${id}/club`), s.deps, id)).status).toBe(404)
    const post = (who: Identity, body: unknown) => clubDecision(s.req(who, 'POST', `/api/leagues/${id}/club`, body), s.deps, id)
    expect((await post(bia, { type: 'renew', playerId: 'player-9', years: 2 })).status).toBe(200)
    expect(s.room.clubCalls).toContain(`renew:${id}:${bia.playerId}:player-9`)
    expect((await post(bia, { type: 'promote', playerId: 'player-9' })).status).toBe(200)
    expect((await post(bia, { type: 'release-youth', playerId: 'player-9' })).status).toBe(200)
    // corpo ruim: tipo desconhecido, anos fora de 1..5, salário negativo, campo a mais, id feio
    for (const bad of [{ type: 'x', playerId: 'p' }, { type: 'renew', playerId: 'p', years: 9 }, { type: 'renew', playerId: 'p', years: 2, salary: -1 }, { type: 'promote', playerId: 'p', years: 1 }, { type: 'promote', playerId: 'a b' }, { type: 'renew', playerId: 'p' }]) {
      expect((await post(bia, bad)).status).toBe(400)
    }
    const refused = await post(bia, { type: 'renew', playerId: 'recusa', years: 1 })
    expect(refused.status).toBe(409)
    expect(refused.body).toEqual({ error: 'club-refused', reason: 'salary', minimumSalary: 5000 })
    expect((await post(dudu, { type: 'promote', playerId: 'player-9' })).status).toBe(404)
  })

  it('Mercado: só membro e liga em andamento; as denúncias só o ADM vê; corpos conferidos; recusa devolve o motivo', async () => {
    const { s, ana, bia, dudu, id } = await running()
    const get = (who: Identity, op: Parameters<typeof tradeRead>[3]) => tradeRead(s.req(who, 'GET', `/api/leagues/${id}/trade`), s.deps, id, op)
    expect((await get(bia, { op: 'body' })).status).toBe(409)
    await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')
    expect((await get(dudu, { op: 'body' })).status).toBe(404)
    const adm = await get(ana, { op: 'body' })
    const other = await get(bia, { op: 'body' })
    expect(adm.status).toBe(200)
    expect('body' in adm.body && adm.body.body?.reports).toHaveLength(1)
    expect('body' in other.body && other.body.body?.reports).toEqual([])
    const act = (who: Identity, kind: Parameters<typeof tradeAct>[3], body: unknown) => tradeAct(s.req(who, 'POST', `/api/leagues/${id}/trade-${kind}`, body), s.deps, id, kind)
    const good = { kind: 'purchase', playerId: 'player-9', fee: 500000, salary: 20000, contractEnd: '2029-01-01' }
    expect((await act(bia, 'offer', good)).status).toBe(200)
    expect(s.room.tradeOps).toContain(`offer:${id}:${bia.playerId}`)
    expect((await act(bia, 'respond', { offerId: 'of-1', type: 'accept' })).status).toBe(200)
    expect((await act(bia, 'respond', { offerId: 'of-1', type: 'counter', fee: 400000 })).status).toBe(200)
    expect((await act(bia, 'withdraw', { offerId: 'of-1' })).status).toBe(200)
    expect((await act(bia, 'sign', { playerId: 'player-9', salary: 30000, contractEnd: '2029-01-01' })).status).toBe(200)
    expect((await act(bia, 'report', { recordId: 'tr-1', reason: 'laranja' })).status).toBe(200)
    const bad: [Parameters<typeof tradeAct>[3], unknown][] = [
      ['offer', { ...good, kind: 'free' }], ['offer', { ...good, fee: -1 }], ['offer', { ...good, fee: 'caro' }], ['offer', { ...good, contractEnd: '1/1/2029' }], ['offer', { ...good, extra: 1 }], ['offer', { ...good, playerId: 'a b' }],
      ['respond', { offerId: 'of-1', type: 'counter' }], ['respond', { offerId: 'of-1', type: 'accept', fee: 5 }], ['respond', { offerId: 'of-1', type: 'talvez' }],
      ['withdraw', {}], ['sign', { playerId: 'p', salary: 0, contractEnd: '2029-01-01' }], ['report', { recordId: 'tr-1', reason: 'xingamento' }],
    ]
    for (const [kind, body] of bad) expect((await act(bia, kind, body)).status).toBe(400)
    const refused = await act(bia, 'offer', { ...good, playerId: 'recusa' })
    expect(refused.status).toBe(409)
    expect(refused.body).toEqual({ error: 'trade-refused', reason: 'fee-too-low', minimumSalary: 7000 })
    expect((await act(dudu, 'offer', good)).status).toBe(404)
  })

  it('Mercado com a IA: filtros da busca com lista fechada e corpos das propostas à IA conferidos', async () => {
    const ok = parseSearchFilters(new URLSearchParams('q=silva&group=FWD&pos=ST&sit=club&tier=1&age=23&value=5000000&ovr=60&quick=budget,bargain&sort=value-asc'))
    expect(ok).toEqual({ query: 'silva', group: 'FWD', position: 'ST', situation: 'club', tier: 1, ageMax: 23, valueMax: 5_000_000, overallMin: 60, quick: ['budget', 'bargain'], sort: 'value-asc' })
    expect(parseSearchFilters(new URLSearchParams(''))).toEqual({})
    for (const bad of ['group=ZZ', 'pos=XX', 'sit=talvez', 'tier=9', 'age=3', 'age=abc', 'value=-1', 'ovr=500', 'quick=budget,tudo', 'sort=nome', `q=${'a'.repeat(41)}`]) {
      expect(parseSearchFilters(new URLSearchParams(bad))).toBeUndefined()
    }
    const { s, ana, bia, id } = await running()
    await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')
    const act = (kind: Parameters<typeof tradeAct>[3], body: unknown) => tradeAct(s.req(bia, 'POST', `/api/leagues/${id}/trade-${kind}`, body), s.deps, id, kind)
    const good = { kind: 'purchase', playerId: 'player-9', fee: 900000, salary: 30000, contractEnd: '2029-01-01' }
    expect((await act('ai-offer', good)).status).toBe(200)
    expect((await act('ai-offer', { ...good, kind: 'loan', fee: 5000 })).status).toBe(200)
    expect((await act('ai-offer', { ...good, kind: 'free', fee: 0 })).status).toBe(200)
    expect((await act('ai-respond', { offerId: 'offer-1', accept: true })).status).toBe(200)
    expect((await act('ai-withdraw', { offerId: 'offer-1' })).status).toBe(200)
    for (const [kind, body] of [['ai-offer', { ...good, kind: 'free', fee: 5 }], ['ai-offer', { ...good, kind: 'purchase', fee: 0 }], ['ai-offer', { ...good, kind: 'troca' }], ['ai-offer', { ...good, extra: 1 }], ['ai-respond', { offerId: 'offer-1', accept: 'sim' }], ['ai-respond', { offerId: 'offer-1' }], ['ai-withdraw', {}]] as [Parameters<typeof tradeAct>[3], unknown][]) {
      expect((await act(kind, body)).status).toBe(400)
    }
    for (const op of ['search', 'listings', 'ai'] as const) {
      const r = await tradeRead(s.req(bia, 'GET', `/api/leagues/${id}/trade`), s.deps, id, op === 'search' ? { op, filters: {} } : { op })
      expect(r.status).toBe(200)
    }
    // Vender, anunciar e pré-contrato
    expect((await act('list', { playerId: 'player-9', kind: 'transfer', price: 900000 })).status).toBe(200)
    expect((await act('list', { playerId: 'player-9', kind: 'loan', price: 5000 })).status).toBe(200)
    expect((await act('unlist', { playerId: 'player-9' })).status).toBe(200)
    expect((await act('sell', { playerId: 'player-9', buyerId: 'team-3', kind: 'purchase', fee: 0 })).status).toBe(200)
    expect((await act('pre-offer', { playerId: 'player-9', salary: 30000, years: 3 })).status).toBe(200)
    for (const [kind, body] of [['list', { playerId: 'player-9', kind: 'swap', price: 1 }], ['list', { playerId: 'player-9', kind: 'loan', price: 0 }], ['list', { playerId: 'player-9', kind: 'loan', price: 1, x: 1 }], ['unlist', {}], ['sell', { playerId: 'player-9', buyerId: 'team-3', kind: 'free', fee: 1 }], ['sell', { playerId: 'player-9', buyerId: 'team-3', kind: 'loan', fee: -1 }], ['pre-offer', { playerId: 'player-9', salary: 30000, years: 6 }], ['pre-offer', { playerId: 'player-9', salary: 30000, years: 2.5 }], ['pre-offer', { playerId: 'player-9', salary: 0, years: 2 }]] as [Parameters<typeof tradeAct>[3], unknown][]) {
      expect((await act(kind, body)).status).toBe(400)
    }
    for (const op of [{ op: 'mine' }, { op: 'buyers', playerId: 'player-9', kind: 'loan' }, { op: 'pre-targets' }] as const) {
      expect((await tradeRead(s.req(bia, 'GET', `/api/leagues/${id}/trade`), s.deps, id, op)).status).toBe(200)
    }
    expect(s.room.tradeOps).toEqual(expect.arrayContaining([`mine:${id}:${bia.playerId}`, `sell:${id}:${bia.playerId}`, `pre-offer:${id}:${bia.playerId}`]))
    expect(s.room.tradeOps).toEqual(expect.arrayContaining([`ai-offer:${id}:${bia.playerId}`, `search:${id}:${bia.playerId}`, `listings:${id}:${bia.playerId}`, `ai:${id}:${bia.playerId}`]))
  })

  it('Copas: só membro e liga em andamento', async () => {
    const { s, ana, bia, dudu, id } = await running()
    const get = (who: Identity) => cupsState(s.req(who, 'GET', `/api/leagues/${id}/cups`), s.deps, id)
    expect((await get(bia)).status).toBe(409)
    await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')
    const ok = await get(bia)
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ cups: { mine: [], others: [], history: [] } })
    expect((await get(dudu)).status).toBe(404)
  })

  it('ticket do WebSocket: só membro, só com a liga em andamento, e o ticket é de uso único na sala', async () => {
    const { s, ana, bia, dudu, id } = await running()
    expect((await liveTicket(s.req(bia, 'POST', `/api/leagues/${id}/live-ticket`, {}), s.deps, id)).status).toBe(409)
    await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')
    const ok = await liveTicket(s.req(bia, 'POST', `/api/leagues/${id}/live-ticket`, {}), s.deps, id)
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ ticket: 'a'.repeat(48), expiresInMs: 30000 })
    expect(s.room.calls).toContain(`ticket:${id}:${bia.playerId}`)
    expect((await liveTicket(s.req(dudu, 'POST', `/api/leagues/${id}/live-ticket`, {}), s.deps, id)).status).toBe(404)
  })

  it('Avançar, Pausar e Retomar são só do ADM e só com a liga em andamento', async () => {
    const { s, ana, bia, id } = await running()
    expect((await controlLeague(s.req(ana, 'POST', `/api/leagues/${id}/advance`, {}), s.deps, id, 'advance')).status).toBe(409)
    await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')
    expect((await controlLeague(s.req(bia, 'POST', `/api/leagues/${id}/pause`, {}), s.deps, id, 'pause')).status).toBe(403)
    for (const a of ['advance', 'pause', 'resume'] as const) expect((await controlLeague(s.req(ana, 'POST', `/api/leagues/${id}/${a}`, {}), s.deps, id, a)).status).toBe(200)
    expect(s.room.calls.filter((c) => c.endsWith(ana.playerId))).toHaveLength(3)
  })

  it('o ritmo muda só pelo ADM, só em liga de amigos, com ritmo que existe', async () => {
    const { s, ana, bia, id } = await running()
    expect((await changePace(s.req(bia, 'POST', `/api/leagues/${id}/pace`, { pace: 'calm' }), s.deps, id)).status).toBe(403)
    expect((await changePace(s.req(ana, 'POST', `/api/leagues/${id}/pace`, { pace: 'turbo' }), s.deps, id)).status).toBe(400)
    expect((await changePace(s.req(ana, 'POST', `/api/leagues/${id}/pace`, { pace: 'calm' }), s.deps, id)).body).toEqual({ pace: 'calm' })
    expect((await getLeague(s.req(ana, 'GET', `/api/leagues/${id}`), s.deps, id)).body).toMatchObject({ pace: 'calm' })
    const open = await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, kind: 'open' }), s.deps)
    if (open.status !== 201) throw new Error('x')
    expect((await changePace(s.req(ana, 'POST', `/api/leagues/${open.body.id}/pace`, { pace: 'fast' }), s.deps, open.body.id)).status).toBe(409)
  })
})

describe('ADM, sair e conta apagada', () => {
  it('só o ADM inicia, remove, fecha a entrada, troca o código e passa o cargo', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    const bia = await s.person('Bia')
    const made = await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, teamId: 'team-1' }), s.deps)
    if (made.status !== 201) throw new Error('x')
    const id = made.body.id
    await joinLeague(s.req(bia, 'POST', `/api/leagues/${id}/join`, { teamId: 'team-2', code: made.body.code }), s.deps, id)
    expect((await adminAction(s.req(bia, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')).status).toBe(403)
    expect((await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')).body).toMatchObject({ status: 'running' })
    expect(s.room.started.has(id)).toBe(true)
    expect((await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/start`, {}), s.deps, id, 'start')).status).toBe(409)
    const rotated = await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/rotate-code`, {}), s.deps, id, 'rotate-code')
    expect(rotated.status === 200 && rotated.body.code).not.toBe(made.body.code)
    expect((await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/kick`, { playerId: bia.playerId }), s.deps, id, 'kick')).body).toMatchObject({ humans: 1 })
    expect(s.room.seats.get(id)?.has(bia.playerId)).toBe(false)
    expect((await adminAction(s.req(ana, 'POST', `/api/leagues/${id}/kick`, { playerId: ana.playerId }), s.deps, id, 'kick')).status).toBe(400)
  })

  it('o ADM sai: o humano mais antigo assume; sem ninguém, a liga fecha e a sala é apagada', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    const bia = await s.person('Bia')
    const made = await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, teamId: 'team-1' }), s.deps)
    if (made.status !== 201) throw new Error('x')
    const id = made.body.id
    s.advance(1000)
    await joinLeague(s.req(bia, 'POST', `/api/leagues/${id}/join`, { teamId: 'team-2', code: made.body.code }), s.deps, id)
    expect((await leaveLeague(s.req(ana, 'POST', `/api/leagues/${id}/leave`, {}), s.deps, id)).status).toBe(200)
    expect((await s.deps.leagues.get(id))?.adminId).toBe(bia.playerId)
    await leaveLeague(s.req(bia, 'POST', `/api/leagues/${id}/leave`, {}), s.deps, id)
    expect((await s.deps.leagues.get(id))?.status).toBe('closed')
    expect(s.room.destroyed).toContain(id)
  })

  it('conta apagada: sai de todas as ligas', async () => {
    const s = setup()
    const ana = await s.person('Ana')
    const bia = await s.person('Bia')
    const a = await createLeague(s.req(ana, 'POST', '/api/leagues', { ...create, kind: 'open', teamId: 'team-1' }), s.deps)
    if (a.status !== 201) throw new Error('x')
    await joinLeague(s.req(bia, 'POST', `/api/leagues/${a.body.id}/join`, { teamId: 'team-2' }), s.deps, a.body.id)
    await leaveAllLeagues(s.deps, ana.playerId)
    expect(await s.deps.leagues.mine(ana.playerId)).toEqual([])
    expect((await s.deps.leagues.get(a.body.id))?.adminId).toBe(bia.playerId)
    expect(s.room.seats.get(a.body.id)?.has(ana.playerId)).toBe(false)
  })
})
