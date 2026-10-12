import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import {
  expectedSalary,
  isWindowOpen,
  makeOffer,
  nextMarketEvent,
  pendingIncoming,
  releasePlayer,
  respondToOffer,
  runMarketTick,
  transferWindows,
  windowAt,
} from '../src/engine/market'
import { advanceToNextEvent, createSeason } from '../src/engine/season'
import { SQUAD_MAX, SQUAD_MIN } from '../src/engine/types'

const world = generateWorld({ seed: 5 })
const season = () => createSeason({ year: 2026, seed: 5, teams: world.teams, players: world.players })
const imp = world.teams.find((t) => t.abbreviation === 'IMP')!
const buyer = [...world.teams].sort((a, b) => a.squad.length - b.squad.length)[0]!
const squadOf = (s: ReturnType<typeof season>, id: string) => s.players.filter((p) => p.teamId === id)

describe('janelas', () => {
  it('a pré-temporada termina na véspera da 1ª rodada e a janela do meio do ano vem depois', () => {
    const s = season()
    const [pre, mid] = transferWindows(s.season, s.matches)
    const first = s.matches.map((m) => m.date).sort()[0]!
    expect(pre!.end < first).toBe(true)
    expect(mid!.start > first).toBe(true)
    expect(windowAt(s.season, s.matches, pre!.start)?.name).toBe('pre-season')
    expect(windowAt(s.season, s.matches, first)).toBeNull()
  })
})

describe('propostas do jogador', () => {
  const pick = (s: ReturnType<typeof season>) => s.players.filter((p) => p.teamId && p.teamId !== buyer.id).sort((a, b) => expectedSalary(a) - expectedSalary(b))[0]!

  it('só com janela aberta', () => {
    const s = season()
    const closed = { ...s, season: { ...s.season, currentDate: s.matches.map((m) => m.date).sort()[0]! } }
    expect(isWindowOpen(closed)).toBe(false)
    expect(() => makeOffer(closed, buyer.id, { kind: 'purchase', playerId: pick(closed).id, fee: 1_000_000, salary: 50_000, contractEnd: '2030-12-31' })).toThrowError('window-closed')
  })

  it('rejeita proposta pelo próprio jogador e propostas duplicadas', () => {
    const s = season()
    const own = squadOf(s, buyer.id)[0]!
    expect(() => makeOffer(s, buyer.id, { kind: 'purchase', playerId: own.id, fee: 1, salary: 1, contractEnd: '2030-12-31' })).toThrowError('own-player')
    const target = pick(s)
    const req = { kind: 'purchase' as const, playerId: target.id, fee: Math.floor(buyer.finances.transferBudget / 2), salary: expectedSalary(target), contractEnd: '2030-12-31' }
    const once = makeOffer(s, buyer.id, req)
    expect(once.market.offers).toHaveLength(1)
    expect(() => makeOffer(once, buyer.id, req)).toThrowError('duplicate')
  })

  it('a resposta só vem no dia combinado; a proposta decidida sempre tem desfecho coerente', () => {
    let s = season()
    const target = pick(s)
    s = makeOffer(s, buyer.id, { kind: 'purchase', playerId: target.id, fee: Math.floor(buyer.finances.transferBudget / 2), salary: expectedSalary(target), contractEnd: '2030-12-31' })
    const offer = s.market.offers[0]!
    expect(offer.status).toBe('pending')
    for (let i = 0; i < 30 && s.market.offers[0]!.status === 'pending'; i++) {
      const before = s.season.currentDate
      s = advanceToNextEvent(s, { market: true, userTeamId: buyer.id }).state
      if (s.season.currentDate < offer.dueOn) expect(s.market.offers[0]!.status).toBe('pending')
      expect(s.season.currentDate > before).toBe(true)
    }
    const done = s.market.offers[0]!
    expect(done.status).not.toBe('pending')
    const moved = s.players.find((p) => p.id === target.id)!
    if (done.status === 'accepted') {
      expect(moved.teamId).toBe(buyer.id)
      expect(s.market.history.some((r) => r.playerId === target.id && r.toTeamId === buyer.id)).toBe(true)
    } else {
      expect(done.reason).toBeDefined()
    }
  })
})

describe('mercado da IA', () => {
  it('é determinístico e mantém elencos dentro dos limites', () => {
    const s = season()
    const date = transferWindows(s.season, s.matches)[0]!.start
    const a = runMarketTick({ ...s, season: { ...s.season, currentDate: date } }, date, imp.id)
    const b = runMarketTick({ ...s, season: { ...s.season, currentDate: date } }, date, imp.id)
    expect(a.state.market.history).toEqual(b.state.market.history)
    for (const t of a.state.teams) {
      const n = squadOf(a.state, t.id).length
      expect(n).toBeGreaterThanOrEqual(SQUAD_MIN - 1)
      expect(n).toBeLessThanOrEqual(SQUAD_MAX)
      expect(t.squad.length).toBe(n)
    }
  })

  it('o time do jogador nunca é mexido pela IA; propostas recebidas podem ser recusadas ou aceitas', () => {
    let st = season()
    st = { ...st, market: { ...st.market, seed: 11 } }
    const date = transferWindows(st.season, st.matches)[0]!.start
    const before = squadOf(st, imp.id).map((p) => p.id)
    let got = runMarketTick(st, date, imp.id)
    for (let i = 1; i < 20 && pendingIncoming(got.state).length === 0; i++) {
      const d = `2026-01-${String(1 + i).padStart(2, '0')}`
      got = runMarketTick({ ...got.state, market: { ...got.state.market, seed: 11 + i } }, d, imp.id)
    }
    expect(squadOf(got.state, imp.id).map((p) => p.id).sort()).toEqual([...before].sort())
    const offer = pendingIncoming(got.state)[0]
    if (!offer) return
    const rejected = respondToOffer(got.state, offer.id, false, '2026-01-15')
    expect(rejected.market.offers.find((o) => o.id === offer.id)!.status).toBe('rejected')
    const accepted = respondToOffer(got.state, offer.id, true, '2026-01-15')
    expect(squadOf(accepted, imp.id).some((p) => p.id === offer.playerId)).toBe(false)
  })

  it('liberar um jogador o deixa livre e fora do elenco do time', () => {
    const s = season()
    const p = squadOf(s, imp.id)[0]!
    const out = releasePlayer(s, p.id, '2026-01-02')
    expect(out.players.find((x) => x.id === p.id)!.teamId).toBeNull()
    expect(out.teams.find((t) => t.id === imp.id)!.squad).not.toContain(p.id)
  })

  it('o avanço com mercado para nos eventos e chega ao fim da janela', () => {
    let s = season()
    const ev = nextMarketEvent(s)
    expect(ev).toBeDefined()
    for (let i = 0; i < 10; i++) s = advanceToNextEvent(s, { market: true, userTeamId: imp.id }).state
    expect(s.market.handled >= '2026-01-01').toBe(true)
  })
})

describe('mercado no jogo', () => {
  it('avançar o jogo liga o mercado e a proposta do jogador passa pelo store', async () => {
    const { advanceGame, createGame, makeUserOffer, respondToUserOffer } = await import('../src/store/game')
    let g = createGame(5, buyer.id)
    const target = g.season.players.filter((p) => p.teamId && p.teamId !== buyer.id).sort((a, b) => expectedSalary(a) - expectedSalary(b))[0]!
    g = makeUserOffer(g, { kind: 'purchase', playerId: target.id, fee: 1, salary: expectedSalary(target), contractEnd: '2030-12-31' })
    expect(g.season.market.offers).toHaveLength(1)
    g = advanceGame(g)
    expect(g.season.market.offers[0]!.status === 'pending' || g.notices.some((n) => n.type === 'offer-answered')).toBe(true)
    expect(() => respondToUserOffer(g, 'nao-existe', true)).toThrowError('invalid')
  })
})
