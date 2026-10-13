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

describe('venda, empréstimo e liberação pelo jogador', () => {
  const loaded = async () => import('../src/engine/market')
  const surplusOf = (s: ReturnType<typeof season>, teamId: string) => {
    const squad = squadOf(s, teamId)
    // jogador de posição com sobra de cobertura, para passar nas travas de elenco
    return squad.find((p) => squad.filter((q) => q.position === p.position).length > 3)!
  }
  const rich = [...world.teams].sort((a, b) => b.squad.length - a.squad.length)[0]!

  it('liberar deixa o jogador livre e cobra rescisão; respeita elenco mínimo e posição', async () => {
    const { releaseUserPlayer, releaseCost } = await loaded()
    const s = season()
    const p = surplusOf(s, rich.id)
    const out = releaseUserPlayer(s, rich.id, p.id)
    expect(out.players.find((x) => x.id === p.id)!.teamId).toBeNull()
    const before = s.teams.find((t) => t.id === rich.id)!.finances.balance
    expect(out.teams.find((t) => t.id === rich.id)!.finances.balance).toBe(before - releaseCost(p, s.season.currentDate))
    const gk = squadOf(s, rich.id).filter((x) => x.position === 'GK')
    expect(() => releaseUserPlayer(s, rich.id, gk[0]!.id)).not.toThrow() // 3+ goleiros
    const tight = squadOf(s, rich.id).filter((x) => x.position === 'GK').slice(0, gk.length - 2)
    let t = s
    for (const g of tight) t = releaseUserPlayer(t, rich.id, g.id)
    expect(() => releaseUserPlayer(t, rich.id, squadOf(t, rich.id).find((x) => x.position === 'GK')!.id)).toThrowError('position-cover')
  })

  it('a venda é respondida na hora: acima do teto o clube recusa com o máximo; dentro do teto a venda acontece', async () => {
    const { buyerInterest, sellPlayer } = await loaded()
    const s = season()
    const p = surplusOf(s, rich.id)
    const interested = world.teams.filter((t) => t.id !== rich.id).map((t) => buyerInterest(s, t.id, p, 'purchase')).filter((i) => i.maxFee !== null && i.maxFee > 0)
    expect(interested.length).toBeGreaterThan(0)
    const target = interested[0]!
    const base = { playerId: p.id, buyerId: target.teamId, kind: 'purchase' as const, contractEnd: '2030-12-31' }
    const refused = sellPlayer(s, rich.id, { ...base, fee: target.maxFee! + 10_000_000 })
    expect(refused.accepted).toBe(false)
    expect(refused.reason).toBe('fee')
    expect(refused.counter).toBe(target.maxFee)
    const sold = sellPlayer(s, rich.id, { ...base, fee: target.maxFee! })
    expect(sold.accepted).toBe(true)
    {
      expect(sold.state.players.find((x) => x.id === p.id)!.teamId).toBe(target.teamId)
      expect(sold.state.teams.find((t) => t.id === rich.id)!.squad).not.toContain(p.id)
    }
  })

  it('não vende jogador emprestado nem de outro time, nem com a janela fechada', async () => {
    const { sellPlayer } = await loaded()
    const s = season()
    const other = world.teams.find((t) => t.id !== rich.id)!
    const foreign = squadOf(s, other.id)[0]!
    expect(() => sellPlayer(s, rich.id, { playerId: foreign.id, buyerId: other.id, kind: 'purchase', fee: 1, contractEnd: '2030-12-31' })).toThrowError('unavailable')
    const closed = { ...s, season: { ...s.season, currentDate: s.matches.map((m) => m.date).sort()[0]! } }
    expect(() => sellPlayer(closed, rich.id, { playerId: surplusOf(s, rich.id).id, buyerId: other.id, kind: 'purchase', fee: 1, contractEnd: '2030-12-31' })).toThrowError('window-closed')
  })
})

describe('rescisão na tela de finanças', () => {
  it('liberar um jogador lança a rescisão numa categoria própria e a tela de finanças mostra', async () => {
    const { createGame, releaseUserSquadPlayer, squadOf: squad } = await import('../src/store/game')
    const { Finance } = await import('../src/ui/screens/Finance')
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { releaseCost } = await import('../src/engine/market')
    const big = [...world.teams].sort((a, b) => b.squad.length - a.squad.length)[0]!
    let g = createGame(5, big.id)
    const p = squad(g, big.id).find((x) => squad(g, big.id).filter((q) => q.position === x.position).length > 3)!
    const cost = releaseCost(p, g.season.season.currentDate)
    g = releaseUserSquadPlayer(g, p.id)
    const entry = g.season.teams.find((t) => t.id === big.id)!.finances.ledger.find((e) => e.category === 'severance')!
    expect(entry.amount).toBe(-cost)
    const html = renderToStaticMarkup(createElement(Finance, { game: g }))
    expect(html).toContain('Rescisões de contrato')
    const { Statement } = await import('../src/ui/screens/finance/Sheets')
    expect(renderToStaticMarkup(createElement(Statement, { game: g, onClose: () => {} }))).toContain('Rescisão:')
  })
})
