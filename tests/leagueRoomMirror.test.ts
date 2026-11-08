import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { LeagueRoom, type RoomMeta } from '../server/leagueRoom'
import { DEFAULT_CONFIG, applyPayload, createLeague, defaultLeagueConfig, emptyMirror, processLeague, toSeasonState } from '../src/engine/league'
import type { MirrorPayload, MirrorState } from '../src/engine/league'
import { MS_HOUR } from '../src/engine/league/pace'
import type { SeasonState } from '../src/engine/season'
import { turnRunner } from '../src/store/game'
import { createLeagueWorld } from '../src/store/leagueWorld'

const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const base = createLeagueWorld(21, undefined, { cups: false })
const comp = base.season.competitions[0]!
const MY = comp.teamIds[0]!

/** Sala com SQLite de verdade (node:sqlite): a revisão, o registro de mudanças e as rotas internas do espelho. */
class TestRoom extends LeagueRoom {
  constructor() {
    const db = new DatabaseSync(':memory:')
    const sql = {
      exec(q: string, ...b: unknown[]) {
        const rows = db.prepare(q).all(...(b as never[])) as Record<string, unknown>[]
        return { toArray: () => rows }
      },
    }
    const ctx = { storage: { sql, transactionSync: <T>(fn: () => T) => fn(), setAlarm: async () => undefined, deleteAlarm: async () => undefined }, getWebSockets: () => [] }
    super(ctx as never, {})
  }
  setup(world: SeasonState): void {
    const league = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('sala-espelho'), true), world, [{ teamId: MY, playerId: 'ana' }], T0)
    const meta: RoomMeta = { leagueId: 'sala-espelho', kind: 'friends', createdAt: T0 }
    this.create(meta, league, world)
  }
  replaceWorld(world: SeasonState): void {
    this.world = world
    this.persist({ world: true })
  }
  get revision(): number {
    return (this as unknown as { rev: number }).rev
  }
  async post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.fetch(new Request(`https://room/internal/${path}`, { method: 'POST', body: JSON.stringify(body) }))
    const text = await res.text()
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error(text.slice(0, 600))
    }
  }
  async mirror(since: number | null, page = 0, playerId = 'ana'): Promise<MirrorPayload> {
    return ((await this.post('mirror', { playerId, since, page })) as { payload: MirrorPayload }).payload
  }
}

async function syncAll(room: TestRoom): Promise<MirrorState> {
  const first = await room.mirror(null)
  let m = applyPayload(emptyMirror(), first)
  for (let page = 1; page < (first.pages ?? 1); page++) m = applyPayload(m, await room.mirror(null, page))
  return m
}

function played(days: number): SeasonState[] {
  let league = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('espelho'), true), base, [{ teamId: MY, playerId: 'ana' }], T0)
  let world = base
  const out: SeasonState[] = []
  for (let t = T0; t < T0 + days * 24 * MS_HOUR; t += 6 * MS_HOUR) {
    const r = processLeague(league, world, t, { turn: turnRunner })
    league = r.league
    if (r.world !== world) out.push((world = r.world))
  }
  return out
}

describe('espelho na sala da liga (C2)', () => {
  it('sem revisão devolve a carga completa em páginas; só quem tem clube na liga recebe', async () => {
    const room = new TestRoom()
    room.setup(base)
    const first = await room.mirror(null)
    expect(first.full).toBe(true)
    expect(first.pages).toBeGreaterThanOrEqual(2)
    expect(first.own?.teamId).toBe(MY)
    expect(await room.post('mirror', { playerId: 'intruso', since: null, page: 0 })).toMatchObject({ ok: false, error: 'not-seated' })
    const seen = toSeasonState(await syncAll(room))!
    expect(seen.players).toHaveLength(base.players.length)
  })

  it('cada mudança do mundo sobe a revisão e a atualização leva o espelho ao mesmo estado de uma carga nova', async () => {
    const room = new TestRoom()
    room.setup(base)
    let m = await syncAll(room)
    const rev0 = room.revision
    const worlds = played(15)
    for (const w of worlds.slice(0, 4)) room.replaceWorld(w)
    expect(room.revision).toBeGreaterThan(rev0)
    // O aparelho pede a atualização desde a revisão que tinha.
    const delta = await room.mirror(m.rev)
    expect(delta.full).toBe(false)
    m = applyPayload(m, delta)
    expect(m.rev).toBe(room.revision)
    const fresh = toSeasonState(await syncAll(room))!
    const seen = toSeasonState(m)!
    const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id))
    expect(byId(seen.players)).toEqual(byId(fresh.players))
    expect(byId(seen.matches)).toEqual(byId(fresh.matches))
    expect(seen.season.currentDate).toBe(worlds[3]!.season.currentDate)
  })

  it('quem já está na revisão atual recebe só o clube; revisão antiga demais ou do futuro cai na carga completa', async () => {
    const room = new TestRoom()
    room.setup(base)
    const m = await syncAll(room)
    const same = await room.mirror(m.rev)
    expect(same.full).toBe(false)
    expect(same.players).toEqual([])
    expect(same.own).toBeUndefined()
    const future = await room.mirror(m.rev + 50)
    expect(future.full).toBe(true)
    // Mais revisões que o registro guarda: carga completa.
    const worlds = played(110)
    for (const w of worlds) room.replaceWorld(w)
    expect(room.revision).toBeGreaterThan(LeagueRoom.MIRROR_LOG)
    expect((await room.mirror(m.rev)).full).toBe(true)
  })

  it('o registro de mudanças não cresce sem fim (guarda as últimas revisões)', async () => {
    const room = new TestRoom()
    room.setup(base)
    for (const w of played(110)) room.replaceWorld(w)
    const rows = (room as unknown as { sql: { exec(q: string): { toArray(): unknown[] } } }).sql.exec("SELECT k FROM kv WHERE k LIKE 'ml:%'").toArray()
    expect(rows.length).toBeLessThanOrEqual(LeagueRoom.MIRROR_LOG)
  })

  it('comando do técnico: valida na sala, muda o mundo oficial e devolve a atualização; recusa devolve o motivo', async () => {
    const room = new TestRoom()
    room.setup(base)
    const m = await syncAll(room)
    const plan = { type: 'training-plan', plan: { intensity: 'intense', focus: 'physical' } }
    const ok = (await room.post('command', { playerId: 'ana', command: plan, since: m.rev })) as { ok: boolean; payload: MirrorPayload }
    expect(ok.ok).toBe(true)
    expect(ok.payload.own?.training.plans[MY]).toEqual({ intensity: 'intense', focus: 'physical' })
    // A tática do técnico mexe no time: sobe a revisão e o time vai na atualização.
    const team = base.teams.find((t) => t.id === MY)!
    const tactic = { ...team.tactic, style: team.tactic.style === 'possession' ? 'counter-attack' : 'possession' }
    const r0 = room.revision
    const t = (await room.post('command', { playerId: 'ana', command: { type: 'tactic', tactic }, since: m.rev })) as { ok: boolean; payload: MirrorPayload }
    expect(t.ok).toBe(true)
    expect(room.revision).toBeGreaterThan(r0)
    expect(t.payload.own?.team.tactic.style).toBe(tactic.style)
    // Escalação com gente de outro clube é recusada e nada muda.
    const stranger = base.players.find((p) => p.teamId !== MY && p.teamId !== null)!
    const before = room.revision
    const bad = await room.post('command', { playerId: 'ana', command: { type: 'tactic', tactic: { ...team.tactic, startingXI: [stranger.id, ...team.tactic.startingXI.slice(1)] } }, since: m.rev })
    expect(bad).toMatchObject({ ok: false, refused: 'invalid' })
    expect(room.revision).toBe(before)
    // Corpo fora da lista e quem não tem clube.
    expect(await room.post('command', { playerId: 'ana', command: { type: 'apagar-tudo' }, since: 0 })).toMatchObject({ ok: false })
    expect(await room.post('command', { playerId: 'intruso', command: plan, since: 0 })).toMatchObject({ ok: false, error: 'not-seated' })
  })

  it('depois de um reinício da sala (objeto novo, mesmo banco) a revisão continua e a atualização segue valendo', async () => {
    const db = new DatabaseSync(':memory:')
    const mk = () => {
      const sql = {
        exec(q: string, ...b: unknown[]) {
          const rows = db.prepare(q).all(...(b as never[])) as Record<string, unknown>[]
          return { toArray: () => rows }
        },
      }
      return new (class extends TestRoomBase {})({ storage: { sql, transactionSync: <T>(fn: () => T) => fn() }, getWebSockets: () => [] } as never)
    }
    class TestRoomBase extends LeagueRoom {
      setup(world: SeasonState): void {
        this.create({ leagueId: 'x', kind: 'friends', createdAt: T0 }, createLeague(defaultLeagueConfig(DEFAULT_CONFIG('x'), true), world, [{ teamId: MY, playerId: 'ana' }], T0), world)
      }
      replaceWorld(world: SeasonState): void {
        this.world = world
        this.persist({ world: true })
      }
      get revision(): number {
        return (this as unknown as { rev: number }).rev
      }
      async mirror(since: number | null, page = 0): Promise<MirrorPayload> {
        const res = await this.fetch(new Request('https://room/internal/mirror', { method: 'POST', body: JSON.stringify({ playerId: 'ana', since, page }) }))
        return ((await res.json()) as { payload: MirrorPayload }).payload
      }
    }
    const a = mk()
    a.setup(base)
    const worlds = played(8)
    a.replaceWorld(worlds[0]!)
    a.replaceWorld(worlds[1]!)
    const revBefore = a.revision
    expect(revBefore).toBeGreaterThan(0)
    const b = mk()
    // O objeto novo recarrega o mundo do banco e segue contando as revisões de onde parou.
    expect((await b.mirror(revBefore - 1)).full).toBe(false)
    b.replaceWorld(worlds[2]!)
    expect(b.revision).toBeGreaterThan(revBefore)
    const delta = await b.mirror(revBefore)
    expect(delta.full).toBe(false)
    expect(delta.since).toBe(revBefore)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// O espelho no aparelho ligado à sala de verdade (sem rede): sincroniza, aplica o comando na hora e confirma no servidor.
// ---------------------------------------------------------------------------------------------------------------------------
import { LeagueMirror, type MirrorTransport } from '../src/store/leagueMirror'

function transportOf(room: TestRoom, hooks: { offline?: boolean; refuse?: boolean; calls?: string[] } = {}): MirrorTransport {
  return {
    async fetch(since, page) {
      hooks.calls?.push(`fetch:${since}:${page}`)
      if (hooks.offline) return { ok: false, error: 'offline' }
      return { ok: true, payload: await room.mirror(since, page) }
    },
    async command(command, since) {
      hooks.calls?.push(`command:${command.type}`)
      if (hooks.offline) return { ok: false, error: 'offline' }
      if (hooks.refuse) return { ok: false, error: 'club-refused', reason: 'busy' }
      const r = (await room.post('command', { playerId: 'ana', command, since })) as { ok: boolean; payload?: MirrorPayload; refused?: string; minimumSalary?: number }
      return r.ok && r.payload ? { ok: true, payload: r.payload } : { ok: false, error: 'club-refused', ...(r.refused ? { reason: r.refused } : {}) }
    },
  }
}

describe('LeagueMirror no aparelho (C2)', () => {
  it('sincroniza a carga completa e monta o mundo que as telas leem', async () => {
    const room = new TestRoom()
    room.setup(base)
    const m = new LeagueMirror(transportOf(room))
    expect(m.season()).toBeUndefined()
    expect(await m.sync()).toBe(true)
    expect(m.fullLoads).toBe(1)
    const s = m.season()!
    expect(m.teamId).toBe(MY)
    expect(s.players).toHaveLength(base.players.length)
    expect(s.teams.find((t) => t.id === MY)!.finances.balance).toBe(base.teams.find((t) => t.id === MY)!.finances.balance)
  })

  it('o comando aparece na hora (antes da resposta) e continua valendo depois dela', async () => {
    const room = new TestRoom()
    room.setup(base)
    let seenDuring: unknown
    const calls: string[] = []
    let mirror!: LeagueMirror
    const t = transportOf(room, { calls })
    const wrapped: MirrorTransport = {
      fetch: t.fetch,
      async command(c, since) {
        seenDuring = mirror.season()!.training.plans[MY]
        return t.command(c, since)
      },
    }
    mirror = new LeagueMirror(wrapped)
    await mirror.sync()
    const out = await mirror.perform({ type: 'training-plan', plan: { intensity: 'intense', focus: 'physical' } })
    expect(out).toEqual({ ok: true })
    expect(seenDuring).toEqual({ intensity: 'intense', focus: 'physical' })
    expect(mirror.season()!.training.plans[MY]).toEqual({ intensity: 'intense', focus: 'physical' })
    expect(((await room.post('mirror', { playerId: 'ana', since: null, page: 0 })) as { payload: MirrorPayload }).payload.own?.training.plans[MY]).toEqual({ intensity: 'intense', focus: 'physical' })
  })

  it('o servidor vence: se ele recusa, o mundo volta ao que era e o motivo aparece', async () => {
    const room = new TestRoom()
    room.setup(base)
    const m = new LeagueMirror(transportOf(room, { refuse: true }))
    await m.sync()
    const before = m.season()!.training.plans[MY]
    const out = await m.perform({ type: 'training-plan', plan: { intensity: 'intense', focus: 'physical' } })
    expect(out).toEqual({ ok: false, error: 'busy' })
    expect(m.season()!.training.plans[MY]).toEqual(before)
  })

  it('regra recusada no aparelho nem chega ao servidor', async () => {
    const room = new TestRoom()
    room.setup(base)
    const calls: string[] = []
    const m = new LeagueMirror(transportOf(room, { calls }))
    await m.sync()
    const team = m.season()!.teams.find((t) => t.id === MY)!
    const stranger = m.season()!.players.find((p) => p.teamId !== MY && p.teamId !== null)!
    const out = await m.perform({ type: 'tactic', tactic: { ...team.tactic, startingXI: [stranger.id, ...team.tactic.startingXI.slice(1)] } })
    expect(out.ok).toBe(false)
    expect(calls.some((c) => c.startsWith('command'))).toBe(false)
  })

  it('sem conexão o espelho segue legível e as ações são bloqueadas', async () => {
    const room = new TestRoom()
    room.setup(base)
    const hooks = { offline: false }
    const m = new LeagueMirror(transportOf(room, hooks))
    await m.sync()
    hooks.offline = true
    expect(await m.sync()).toBe(false)
    expect(m.connection).toBe('offline')
    expect(m.season()!.players.length).toBe(base.players.length)
    expect(await m.perform({ type: 'cancel-individual-training' })).toEqual({ ok: false, error: 'offline' })
    hooks.offline = false
    expect(await m.sync()).toBe(true)
    expect(m.connection).toBe('online')
  })

  it('acompanha o mundo da liga por atualizações e só baixa tudo de novo quando a revisão ficou antiga', async () => {
    const room = new TestRoom()
    room.setup(base)
    const m = new LeagueMirror(transportOf(room))
    await m.sync()
    const worlds = played(10)
    for (const w of worlds) room.replaceWorld(w)
    await m.sync()
    expect(m.fullLoads).toBe(1)
    expect(m.season()!.season.currentDate).toBe(worlds.at(-1)!.season.currentDate)
    for (const w of played(110)) room.replaceWorld(w)
    await m.sync()
    expect(m.fullLoads).toBe(2)
  })
})

describe('mercado pelo espelho (C4)', () => {
  it('a proposta a um clube da IA chega à sala, volta no espelho e a venda devolve o resultado', async () => {
    const room = new TestRoom()
    room.setup(base)
    const m = new LeagueMirror(transportOf(room))
    await m.sync()
    const s = m.season()!
    const buyer = s.teams.find((t) => t.id === MY)!
    const target = s.players.find((p) => p.teamId !== MY && p.teamId !== null && p.position !== 'GK')!
    expect(m.humans).toEqual([MY])
    // O elenco começa cheio (30): libera o mais barato para abrir vaga.
    const cheap = s.players.filter((p) => p.teamId === MY).sort((a, b) => a.contract.salary - b.contract.salary)[0]!
    expect((await m.perform({ type: 'release-player', playerId: cheap.id })).ok).toBe(true)
    const before = m.season()!.market.offers.length
    const { expectedSalary } = await import('../src/engine/market')
    const { contractEndIn } = await import('../src/engine/season')
    const out = await m.perform({ type: 'offer', kind: 'purchase', playerId: target.id, fee: 1_000_000, salary: expectedSalary(target, buyer), contractEnd: contractEndIn(s, MY, 3) })
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true })
    expect(m.season()!.market.offers.length).toBe(before + 1)
    const sold = await m.perform({ type: 'sell', playerId: s.players.find((p) => p.teamId === MY)!.id, buyerId: s.teams.find((t) => t.id !== MY)!.id, kind: 'purchase', fee: 1, contractEnd: contractEndIn(s, MY, 3) })
    expect(sold.ok && typeof sold.info?.accepted).toBe('boolean')
  })
})

describe('sala: Pronto antes da partida e códigos de vaga', () => {
  type Reply = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

  it('Avançar só abre a sala: a partida espera o Pronto e começa quando todos dão Pronto', async () => {
    const room = new TestRoom()
    room.setup(base)
    expect(await room.post('advance', { by: 'ana' })).toMatchObject({ ok: true })
    const waiting = (await room.post('state', { playerId: 'ana' })) as Reply
    expect(waiting.view.next.waiting.deadlineAt).toBeGreaterThan(waiting.view.now)
    expect(waiting.view.current).toBeUndefined()
    expect(waiting.view.seats[0].lastActiveAt).toBeGreaterThan(0)
    expect(waiting.view.progress.played).toBe(0)
    // Avançar de novo com a sala esperando é recusado.
    expect(await room.post('advance', { by: 'ana' })).toMatchObject({ ok: false, error: 'bad-state' })
    // O Pronto de quem joga começa a partida (resultado direto: o evento termina na hora).
    expect(await room.post('ready', { playerId: 'ana', ready: true })).toMatchObject({ ok: true })
    const after = (await room.post('state', { playerId: 'ana' })) as Reply
    expect(after.view.log.some((l: { type: string }) => l.type === 'event-started')).toBe(true)
    expect(after.view.next?.waiting).toBeUndefined()
  }, 120_000)

  it('código de vaga: reserva o clube, barra quem não tem o código e é gasto ao entrar', async () => {
    const room = new TestRoom()
    room.setup(base)
    const club = comp.teamIds[5]!
    const made = (await room.post('query', { playerId: 'ana', op: 'vacancy-create', args: { teamId: club } })) as Reply
    const v = made.body.vacancies[0]
    expect(v.code).toHaveLength(4)
    expect(v.teamId).toBe(club)
    expect(v.expiresAt).toBeGreaterThan(Date.now() + 71 * 3_600_000)
    expect(await room.post('query', { playerId: 'ana', op: 'vacancy-create', args: { teamId: MY } })).toMatchObject({ ok: false, error: 'team-taken' })
    expect(await room.post('seat/add', { playerId: 'bia', teamId: club })).toMatchObject({ ok: false, error: 'team-reserved' })
    expect(await room.post('seat/add', { playerId: 'bia', teamId: club, vacancy: 'ZZZZ' })).toMatchObject({ ok: false, error: 'team-reserved' })
    expect(await room.post('seat/add', { playerId: 'bia', teamId: comp.teamIds[6]!, vacancy: v.code })).toMatchObject({ ok: false, error: 'bad-vacancy' })
    expect(await room.post('query', { playerId: 'bia', op: 'vacancy-check', args: { code: v.code } })).toMatchObject({ ok: true, body: { teamId: club } })
    expect(await room.post('seat/add', { playerId: 'bia', teamId: club, vacancy: v.code })).toMatchObject({ ok: true })
    expect(await room.post('query', { playerId: 'ana', op: 'vacancy-list', args: {} })).toMatchObject({ ok: true, body: { vacancies: [] } })
    expect(await room.post('query', { playerId: 'bia', op: 'vacancy-check', args: { code: v.code } })).toMatchObject({ ok: false })
  })
})
