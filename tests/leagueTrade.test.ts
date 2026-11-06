import { describe, expect, it } from 'vitest'
import { LEAGUE_TRADE, MARKET } from '../src/engine/config'
import {
  DEFAULT_CONFIG,
  awaitingFor,
  createLeague,
  defaultLeagueConfig,
  feeRange,
  makeTradeOffer,
  pauseLeague,
  reportTrade,
  reservedBy,
  resumeLeague,
  respondTrade,
  signFreeAgent,
  squadOfHuman,
  sweepTrades,
  tradeBody,
  tradeWakeup,
  withdrawTrade,
  type LeagueState,
} from '../src/engine/league'
import { MS_HOUR } from '../src/engine/league/pace'
import { isWindowOpen } from '../src/engine/market/offers'
import { expectedSalary, marketValue } from '../src/engine/market/value'
import { releasePlayer, playersOf } from '../src/engine/market/transfer'
import { playerOverall } from '../src/engine/overall'
import type { SeasonState } from '../src/engine/season'
import { createGame } from '../src/store/game'

const T0 = Date.UTC(2026, 0, 3, 15, 0, 0)
const raw = createGame(6, 'team-imp', { cups: false }).season
const comp = raw.season.competitions[0]!
const A = comp.teamIds[0]!
const B = comp.teamIds[7]!
const AI = comp.teamIds[3]!
// Orçamentos folgados: o que se testa aqui são as regras do mercado entre técnicos, não o caixa dos clubes.
/** Para comprar o elenco precisa ter folga (limite de contratação do jogo): libera os jogadores de maior excesso dos dois clubes humanos. */
const room = (w: SeasonState, teamId: string, keep: number): SeasonState => {
  let cur = w
  const extra = playersOf(w, teamId).length - keep
  const spare = playersOf(w, teamId).sort((a, b) => marketValue(a, w.season.currentDate) - marketValue(b, w.season.currentDate)).filter((p) => p.position !== 'GK')
  const counts = new Map<string, number>()
  for (const p of playersOf(w, teamId)) counts.set(p.position, (counts.get(p.position) ?? 0) + 1)
  let released = 0
  for (const p of spare) {
    if (released >= extra) break
    if ((counts.get(p.position) ?? 0) <= (MARKET.minByPosition[p.position] ?? 1) + 1) continue
    cur = releasePlayer(cur, p.id, w.season.currentDate)
    counts.set(p.position, (counts.get(p.position) ?? 0) - 1)
    released++
  }
  return cur
}
const base0: SeasonState = room(room(raw, A, 25), B, 25)
const world0: SeasonState = { ...base0, teams: base0.teams.map((t) => ({ ...t, finances: { ...t.finances, transferBudget: 900_000_000, balance: 900_000_000, salaryBudget: 900_000_000 } })) }
const make = (): LeagueState =>
  createLeague(defaultLeagueConfig(DEFAULT_CONFIG('liga-mercado'), true), world0, [{ teamId: A, playerId: 'ana' }, { teamId: B, playerId: 'bia' }], T0)

/** `n` jogadores de posições diferentes (a venda não pode deixar a posição sem cobertura). */
const distinct = (w: SeasonState, teamId: string, n: number) => {
  const seen = new Set<string>()
  const out: ReturnType<typeof playersOf> = []
  for (const p of playersOf(w, teamId).filter((x) => x.position !== 'GK')) {
    if (seen.has(p.position)) continue
    seen.add(p.position)
    out.push(p)
    if (out.length === n) break
  }
  return out
}
const cheap = (w: SeasonState, teamId: string, n = 0) => playersOf(w, teamId).filter((p) => p.position !== 'GK').sort((x, y) => marketValue(x, w.season.currentDate) - marketValue(y, w.season.currentDate))[n]!
const offerFor = (w: SeasonState, buyerTeam: string, p: ReturnType<typeof cheap>, over: Record<string, unknown> = {}) => {
  const range = feeRange(p, 'purchase', w.season.currentDate, w.teams.find((t) => t.id === p.teamId)!)
  const buyer = w.teams.find((t) => t.id === buyerTeam)!
  return { kind: 'purchase' as const, playerId: p.id, fee: Math.round((range.min + range.max) / 2 / 10_000) * 10_000, salary: Math.round(expectedSalary(p, buyer) * 1.3), contractEnd: '2029-01-01', ...over }
}

describe('mercado entre técnicos humanos (B8.6)', () => {
  it('a janela está aberta no começo do ano (condição dos testes seguintes)', () => {
    expect(isWindowOpen(world0, world0.season.currentDate, [A, B])).toBe(true)
  })

  it('a proposta reserva o dinheiro, aparece para os dois e sai com a retirada', () => {
    const p = cheap(world0, B)
    const r = makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(reservedBy(r.league, A)).toBe(r.offer!.fee)
    expect(tradeBody(r.league, world0, T0, 'ana')!.reserved).toBe(r.offer!.fee)
    expect(tradeBody(r.league, world0, T0, 'bia')!.offers[0]!.mine).toBe(true) // a vez é do vendedor
    expect(tradeBody(r.league, world0, T0, 'ana')!.offers[0]!.mine).toBe(false)
    expect(awaitingFor(r.league, T0, 'bia')).toBe(1)
    const back = withdrawTrade(r.league, world0, 'ana', r.offer!.id)
    expect(back.ok && reservedBy(back.league, A)).toBe(0)
    expect(withdrawTrade(r.league, world0, 'bia', r.offer!.id)).toMatchObject({ ok: false, error: 'not-your-turn' })
  })

  it('preço mínimo de 60% e teto de 250% do valor; empréstimo de 50% a 250% da taxa; clube da IA fica para a 8.6b', () => {
    const p = cheap(world0, B)
    const range = feeRange(p, 'purchase', world0.season.currentDate, world0.teams.find((t) => t.id === B)!)
    const value = marketValue(p, world0.season.currentDate, world0.teams.find((t) => t.id === B)!)
    expect(range.min).toBeCloseTo(value * LEAGUE_TRADE.floorShare, -5)
    expect(range.max).toBeCloseTo(value * LEAGUE_TRADE.ceilingShare, -5)
    expect(makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p, { fee: range.min - 10_000 }))).toMatchObject({ ok: false, error: 'fee-too-low' })
    expect(makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p, { fee: range.max + 10_000 }))).toMatchObject({ ok: false, error: 'fee-too-high' })
    expect(makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p, { fee: range.min })).ok).toBe(true)
    const loan = feeRange(p, 'loan', world0.season.currentDate, world0.teams.find((t) => t.id === B)!)
    expect(loan.min).toBeLessThan(loan.max)
    expect(makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p, { kind: 'loan', fee: 0 }))).toMatchObject({ ok: false, error: 'fee-too-low' })
    const ai = cheap(world0, AI)
    expect(makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, ai))).toMatchObject({ ok: false, error: 'not-human-club' })
    expect(makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, cheap(world0, A)))).toMatchObject({ ok: false, error: 'own-player' })
  })

  it('aceitar faz a transferência: jogador, dinheiro, histórico público e a reserva some', () => {
    const p = cheap(world0, B)
    const made = makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p))
    if (!made.ok) throw new Error(made.error)
    const done = respondTrade(made.league, world0, T0 + 1000, 'bia', made.offer!.id, { type: 'accept' })
    expect(done.ok).toBe(true)
    if (!done.ok) return
    expect(done.world.players.find((x) => x.id === p.id)!.teamId).toBe(A)
    expect(done.offer!.status).toBe('accepted')
    expect(reservedBy(done.league, A)).toBe(0)
    const before = world0.teams.find((t) => t.id === B)!.finances.balance
    expect(done.world.teams.find((t) => t.id === B)!.finances.balance).toBe(before + made.offer!.fee)
    for (const who of ['ana', 'bia']) {
      const h = tradeBody(done.league, done.world, T0 + 1000, who)!.history
      expect(h).toHaveLength(1)
      expect(h[0]).toMatchObject({ playerId: p.id, fromTeamId: B, toTeamId: A, fee: made.offer!.fee, kind: 'purchase' })
    }
  })

  it('contraproposta: a vez muda, só quem tem a vez responde, no máximo 3 rodadas e o prazo reinicia', () => {
    const p = cheap(world0, B)
    const made = makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p, { fee: feeRange(p, 'purchase', world0.season.currentDate, world0.teams.find((t) => t.id === B)!).min }))
    if (!made.ok) throw new Error(made.error)
    const id = made.offer!.id
    expect(respondTrade(made.league, world0, T0, 'ana', id, { type: 'accept' })).toMatchObject({ ok: false, error: 'not-your-turn' })
    const range = feeRange(p, 'purchase', world0.season.currentDate, world0.teams.find((t) => t.id === B)!)
    let l = made.league
    let who: 'bia' | 'ana' = 'bia'
    for (let round = 1; round <= LEAGUE_TRADE.maxRounds; round++) {
      const c = respondTrade(l, world0, T0 + round * 1000, who, id, { type: 'counter', fee: range.min + round * 10_000 })
      if (!c.ok) throw new Error(c.error)
      expect(c.offer!.round).toBe(round)
      l = c.league
      who = who === 'bia' ? 'ana' : 'bia'
    }
    expect(respondTrade(l, world0, T0 + 9000, who, id, { type: 'counter', fee: range.min + 10_000 })).toMatchObject({ ok: false, error: 'max-rounds' })
    expect(respondTrade(l, world0, T0 + 9000, who, id, { type: 'counter', fee: range.max + 10_000 }).ok).toBe(false)
    const accepted = respondTrade(l, world0, T0 + 9000, who, id, { type: 'accept' })
    expect(accepted.ok && accepted.offer!.status).toBe('accepted')
    expect(accepted.ok && accepted.offer!.fee).toBe(range.min + 3 * 10_000)
  })

  it('recusar encerra e devolve a reserva', () => {
    const p = cheap(world0, B)
    const made = makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p))
    if (!made.ok) throw new Error(made.error)
    const r = respondTrade(made.league, world0, T0, 'bia', made.offer!.id, { type: 'decline' })
    expect(r.ok && r.offer!.status).toBe('declined')
    expect(r.ok && reservedBy(r.league, A)).toBe(0)
  })

  it('dinheiro reservado: duas propostas que juntas passam do orçamento de compras, a segunda é barrada', () => {
    const tight: SeasonState = { ...world0, teams: world0.teams.map((t) => (t.id === A ? { ...t, finances: { ...t.finances, transferBudget: 0 } } : t)) }
    const p1 = cheap(tight, B, 0)
    const p2 = cheap(tight, B, 1)
    const fee1 = offerFor(tight, A, p1).fee
    const budget = fee1 + 1_000
    const w: SeasonState = { ...tight, teams: tight.teams.map((t) => (t.id === A ? { ...t, finances: { ...t.finances, transferBudget: budget } } : t)) }
    const first = makeTradeOffer(make(), w, T0, 'ana', offerFor(w, A, p1))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(makeTradeOffer(first.league, w, T0, 'ana', offerFor(w, A, p2))).toMatchObject({ ok: false, error: 'budget' })
  })

  it('janela fechada: nenhuma proposta nova e a aberta caduca', () => {
    const p = cheap(world0, B)
    const made = makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p))
    if (!made.ok) throw new Error(made.error)
    const closed: SeasonState = { ...world0, season: { ...world0.season, currentDate: '2026-05-15' } }
    expect(isWindowOpen(closed, '2026-05-15', [A, B])).toBe(false)
    expect(makeTradeOffer(make(), closed, T0, 'ana', offerFor(world0, A, p))).toMatchObject({ ok: false, error: 'window-closed' })
    const swept = sweepTrades(made.league, closed, T0)
    expect(tradeBody(swept, closed, T0, 'ana')!.offers[0]).toMatchObject({ status: 'expired', reason: 'window-closed' })
    expect(reservedBy(swept, A)).toBe(0)
  })

  it('prazo de 48 h: expira depois; a pausa congela; quem responde tarde recebe "closed"', () => {
    const p = cheap(world0, B)
    const made = makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p))
    if (!made.ok) throw new Error(made.error)
    const l = made.league
    expect(sweepTrades(l, world0, T0 + 47 * MS_HOUR)).toBe(l)
    expect(tradeWakeup(l, T0)! - T0).toBeGreaterThan(47 * MS_HOUR)
    const late = sweepTrades(l, world0, T0 + 49 * MS_HOUR)
    expect(tradeBody(late, world0, T0 + 49 * MS_HOUR, 'bia')!.offers[0]!.status).toBe('expired')
    expect(respondTrade(l, world0, T0 + 49 * MS_HOUR, 'bia', made.offer!.id, { type: 'accept' })).toMatchObject({ ok: false, error: 'closed' })
    // pausa: 10 h depois do começo, pausa por 100 h; ao retomar ainda restam ~38 h
    const paused = pauseLeague(l, T0 + 10 * MS_HOUR, 'adm')
    expect(tradeWakeup(paused, T0 + 50 * MS_HOUR)).toBeUndefined()
    expect(sweepTrades(paused, world0, T0 + 110 * MS_HOUR)).toBe(paused)
    const back = resumeLeague(paused, world0, T0 + 110 * MS_HOUR, 'adm')
    const left = tradeBody(back, world0, T0 + 110 * MS_HOUR, 'bia')!.offers[0]!.left
    expect(left).toBeGreaterThan(30 * MS_HOUR)
    expect(left).toBeLessThanOrEqual(38 * MS_HOUR)
  })

  it('anti-laranja: no máximo 2 negócios por par por janela e 3× o maior valor no total', () => {
    let l = make()
    let w = world0
    const date = w.season.currentDate
    const sellerClub = w.teams.find((t) => t.id === B)!
    const players = distinct(w, B, 3)
    const a = players[0]!
    const b = players[1]!
    // Dois negócios ao preço mínimo passam; o terceiro é barrado pelo limite do par.
    const deal = (p: typeof a) => {
      const made = makeTradeOffer(l, w, T0, 'ana', offerFor(w, A, p, { fee: feeRange(p, 'purchase', date, sellerClub).min }))
      if (!made.ok) return made
      const done = respondTrade(made.league, w, T0, 'bia', made.offer!.id, { type: 'accept' })
      if (!done.ok) return done
      l = done.league
      w = done.world
      return done
    }
    expect(deal(a).ok).toBe(true)
    const second = deal(b)
    expect(second).toMatchObject({ ok: true })
    expect(deal(players[2]!)).toMatchObject({ ok: false, error: 'pair-limit' })
    // Outra janela/par: mesmo par ao contrário também conta (A vendendo a B).
    const p = distinct(w, A, 1)[0]!
    expect(makeTradeOffer(l, w, T0, 'bia', offerFor(w, B, p))).toMatchObject({ ok: false, error: 'pair-limit' })
  })

  it('anti-laranja: dois negócios no teto passam de 3× o valor e o segundo é barrado', () => {
    let l = make()
    let w = world0
    const date = w.season.currentDate
    const club = w.teams.find((t) => t.id === B)!
    const [a, b] = distinct(w, B, 2) as [ReturnType<typeof cheap>, ReturnType<typeof cheap>]
    const top = (p: typeof a) => feeRange(p, 'purchase', date, club).max
    const m1 = makeTradeOffer(l, w, T0, 'ana', offerFor(w, A, a, { fee: top(a) }))
    if (!m1.ok) throw new Error(m1.error)
    const d1 = respondTrade(m1.league, w, T0, 'bia', m1.offer!.id, { type: 'accept' })
    if (!d1.ok) throw new Error(d1.error)
    l = d1.league
    w = d1.world
    expect(makeTradeOffer(l, w, T0, 'ana', offerFor(w, A, b, { fee: top(b) }))).toMatchObject({ ok: false, error: 'pair-money' })
  })

  it('anti-laranja: quem vendeu não recompra o mesmo jogador do mesmo técnico em 90 dias', () => {
    const p = cheap(world0, B)
    const made = makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p))
    if (!made.ok) throw new Error(made.error)
    const done = respondTrade(made.league, world0, T0, 'bia', made.offer!.id, { type: 'accept' })
    if (!done.ok) throw new Error(done.error)
    // Bia tenta recomprar o jogador que ela própria vendeu à Ana.
    expect(makeTradeOffer(done.league, done.world, T0, 'bia', offerFor(done.world, B, done.world.players.find((x) => x.id === p.id)!))).toMatchObject({ ok: false, error: 'return-blocked' })
  })

  it('no máximo 5 propostas abertas por técnico e uma por jogador', () => {
    let l = make()
    const club = world0.teams.find((t) => t.id === B)!
    const players = distinct(world0, B, 7)
    for (let i = 0; i < LEAGUE_TRADE.maxOpenOffers; i++) {
      const r = makeTradeOffer(l, world0, T0, 'ana', offerFor(world0, A, players[i]!, { fee: feeRange(players[i]!, 'purchase', world0.season.currentDate, club).min }))
      if (!r.ok) throw new Error(`${i}: ${r.error}`)
      l = r.league
    }
    expect(makeTradeOffer(l, world0, T0, 'ana', offerFor(world0, A, players[5]!))).toMatchObject({ ok: false, error: 'too-many-offers' })
    expect(makeTradeOffer(l, world0, T0, 'ana', offerFor(world0, A, players[0]!))).toMatchObject({ ok: false, error: 'duplicate' })
  })

  it('jogador livre: contratação na hora (janela e salário valem); aparece no histórico', () => {
    const p = cheap(world0, B)
    const free = releasePlayer(world0, p.id, world0.season.currentDate)
    const target = free.players.find((x) => x.id === p.id)!
    const buyer = free.teams.find((t) => t.id === A)!
    const ok = signFreeAgent(make(), free, T0, 'ana', { playerId: p.id, salary: Math.round(expectedSalary(target, buyer) * 1.5), contractEnd: '2029-01-01' })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.world.players.find((x) => x.id === p.id)!.teamId).toBe(A)
    expect(tradeBody(ok.league, ok.world, T0, 'bia')!.history[0]).toMatchObject({ kind: 'free', fromTeamId: null, toTeamId: A, fee: 0 })
    expect(signFreeAgent(make(), free, T0, 'ana', { playerId: p.id, salary: 1, contractEnd: '2029-01-01' }).ok).toBe(false)
    expect(signFreeAgent(make(), world0, T0, 'ana', { playerId: p.id, salary: 1_000_000, contractEnd: '2029-01-01' })).toMatchObject({ ok: false, error: 'unavailable' })
    const shut: SeasonState = { ...free, season: { ...free.season, currentDate: '2026-05-15' } }
    expect(signFreeAgent(make(), shut, T0, 'ana', { playerId: p.id, salary: 1_000_000, contractEnd: '2029-01-01' })).toMatchObject({ ok: false, error: 'window-closed' })
  })

  it('denúncia: só técnico da liga, só transferência que existe, uma por técnico; o ADM recebe a lista', () => {
    const p = cheap(world0, B)
    const made = makeTradeOffer(make(), world0, T0, 'ana', offerFor(world0, A, p))
    if (!made.ok) throw new Error(made.error)
    const done = respondTrade(made.league, world0, T0, 'bia', made.offer!.id, { type: 'accept' })
    if (!done.ok) throw new Error(done.error)
    const id = tradeBody(done.league, done.world, T0, 'ana')!.history[0]!.id
    expect(reportTrade(done.league, T0, 'intruso', id, 'laranja')).toMatchObject({ ok: false, error: 'not-seated' })
    expect(reportTrade(done.league, T0, 'bia', 'tr-99', 'laranja')).toMatchObject({ ok: false, error: 'not-found' })
    const r1 = reportTrade(done.league, T0, 'bia', id, 'laranja')
    if (!r1.ok) throw new Error(r1.error)
    const r2 = reportTrade(r1.league, T0, 'bia', id, 'laranja')
    expect(r2.ok && tradeBody(r2.league, done.world, T0, 'ana')!.reports).toHaveLength(1)
  })

  it('a visão do elenco de outro técnico traz as faixas de preço; clube da IA não aparece', () => {
    const rows = squadOfHuman(make(), world0, B, playerOverall)!
    expect(rows.length).toBeGreaterThan(17)
    expect(rows[0]!.overall).toBeGreaterThanOrEqual(rows.at(-1)!.overall)
    expect(rows[0]!.buy.min).toBeLessThan(rows[0]!.buy.max)
    expect(squadOfHuman(make(), world0, AI, playerOverall)).toBeUndefined()
  })
})
