import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, aiOffers, createLeague, defaultLeagueConfig, listingsAi, makeAiOffer, respondAiOffer, searchAi, withdrawAiOffer, type LeagueState } from '../src/engine/league'
import { isWindowOpen, refreshListings, resolveDueOffers, runMarketTick } from '../src/engine/market'
import { expectedSalary, marketValue } from '../src/engine/market/value'
import { releasePlayer, playersOf } from '../src/engine/market/transfer'
import type { SeasonState } from '../src/engine/season'
import { addDays } from '../src/engine/season/dates'
import { createGame } from '../src/store/game'

const T0 = Date.UTC(2026, 0, 3, 15, 0, 0)
const raw = createGame(6, 'team-imp', { cups: false }).season
const comp = raw.season.competitions[0]!
const A = comp.teamIds[0]!
const B = comp.teamIds[7]!
const AI = comp.teamIds[3]!

/** Elenco com folga para contratar (limite do jogo) e orçamentos folgados: o que se testa são as regras do mercado. */
const room = (w: SeasonState, teamId: string, keep: number): SeasonState => {
  let cur = w
  const squad = playersOf(w, teamId)
  const counts = new Map<string, number>()
  for (const p of squad) counts.set(p.position, (counts.get(p.position) ?? 0) + 1)
  let extra = squad.length - keep
  for (const p of [...squad].sort((a, b) => marketValue(a, w.season.currentDate) - marketValue(b, w.season.currentDate))) {
    if (extra <= 0) break
    if (p.position === 'GK' || (counts.get(p.position) ?? 0) <= 3) continue
    cur = releasePlayer(cur, p.id, w.season.currentDate)
    counts.set(p.position, (counts.get(p.position) ?? 0) - 1)
    extra--
  }
  return cur
}
const base0 = room(room(raw, A, 25), B, 25)
const world0: SeasonState = { ...base0, teams: base0.teams.map((t) => ({ ...t, finances: { ...t.finances, transferBudget: 900_000_000, balance: 900_000_000, salaryBudget: 900_000_000 } })) }
const league = (): LeagueState => createLeague(defaultLeagueConfig(DEFAULT_CONFIG('liga-ia'), true), world0, [{ teamId: A, playerId: 'ana' }, { teamId: B, playerId: 'bia' }], T0)
const cheapOf = (w: SeasonState, teamId: string, n = 0) => playersOf(w, teamId).filter((p) => p.position !== 'GK').sort((x, y) => marketValue(x, w.season.currentDate) - marketValue(y, w.season.currentDate))[n]!
const req = (w: SeasonState, p: ReturnType<typeof cheapOf>, over: Record<string, unknown> = {}) => ({
  kind: 'purchase' as const,
  playerId: p.id,
  fee: Math.round((marketValue(p, w.season.currentDate, w.teams.find((t) => t.id === p.teamId)) * 2) / 10_000) * 10_000,
  salary: Math.round(expectedSalary(p, w.teams.find((t) => t.id === A)!) * 1.6),
  contractEnd: '2029-01-01',
  ...over,
})

describe('mercado com clubes da IA numa liga online (B8.6b)', () => {
  it('a janela está aberta no começo do ano (condição dos testes)', () => {
    expect(isWindowOpen(world0, world0.season.currentDate, [A])).toBe(true)
  })

  it('a busca traz jogadores da IA e livres, nunca de outro técnico nem do próprio clube, com interesse e preços', () => {
    const rows = searchAi(league(), world0, 'ana', { sort: 'overall' })!
    expect(rows.length).toBeGreaterThan(20)
    for (const r of rows) {
      expect(r.clubId === null || (r.clubId !== A && r.clubId !== B)).toBe(true)
      expect(['none', 'low', 'medium', 'high']).toContain(r.interest)
    }
    expect(rows[0]!.overall).toBeGreaterThanOrEqual(rows.at(-1)!.overall)
    expect(rows.some((r) => r.asking > 0 && r.loanAsking > 0)).toBe(true)
    expect(searchAi(league(), world0, 'intruso', {})).toBeUndefined()
  })

  it('os filtros funcionam: grupo, idade máxima, valor máximo e texto', () => {
    const l = league()
    const fwd = searchAi(l, world0, 'ana', { group: 'FWD' })!
    expect(fwd.length).toBeGreaterThan(0)
    expect(fwd.every((r) => ['RW', 'LW', 'ST'].includes(r.position))).toBe(true)
    const young = searchAi(l, world0, 'ana', { ageMax: 21 })!
    expect(young.length).toBeGreaterThan(0)
    expect(young.every((r) => r.age <= 21)).toBe(true)
    const cheap = searchAi(l, world0, 'ana', { valueMax: 3_000_000, situation: 'club' })!
    expect(cheap.every((r) => r.value <= 3_000_000)).toBe(true)
    const one = searchAi(l, world0, 'ana', {})![5]!
    const byName = searchAi(l, world0, 'ana', { query: one.name.slice(0, 5) })!
    expect(byName.some((r) => r.playerId === one.playerId)).toBe(true)
  })

  it('os anúncios são só de clubes da IA e mostram o preço anunciado', () => {
    const w = refreshListings(world0, world0.season.currentDate, new Set([A, B]))
    const rows = listingsAi(league(), w, 'ana')!
    for (const r of rows) {
      expect(r.listing!.price).toBeGreaterThan(0)
      expect(r.clubId).not.toBe(A)
      expect(r.clubId).not.toBe(B)
    }
  })

  it('proposta a clube da IA: entra como aberta, responde quando passa a data; jogador de técnico e limite de 5 são barrados; retirar só o autor', () => {
    const l = league()
    const target = cheapOf(world0, AI)
    const made = makeAiOffer(l, world0, 'ana', req(world0, target))
    expect(made.ok).toBe(true)
    if (!made.ok) return
    const body = aiOffers(l, made.world, 'ana')!
    expect(body.outgoing).toHaveLength(1)
    expect(body.outgoing[0]).toMatchObject({ playerId: target.id, status: 'pending', kind: 'purchase' })
    expect(aiOffers(l, made.world, 'bia')!.outgoing).toEqual([])
    // jogador de outro técnico: pela aba Técnicos
    expect(makeAiOffer(l, world0, 'ana', req(world0, cheapOf(world0, B)))).toMatchObject({ ok: false, error: 'human-club' })
    // duplicada
    expect(makeAiOffer(l, made.world, 'bia', req(made.world, target))).toMatchObject({ ok: false, error: 'duplicate' })
    // retirar
    expect(withdrawAiOffer(l, made.world, 'bia', made.world.market.offers[0]!.id)).toMatchObject({ ok: false, error: 'invalid' })
    const back = withdrawAiOffer(l, made.world, 'ana', made.world.market.offers[0]!.id)
    expect(back.ok && aiOffers(l, back.world, 'ana')!.outgoing[0]!.status).toBe('withdrawn')
    // a resposta chega depois de responseDays
    const due = made.world.market.offers[0]!.dueOn
    const answered = resolveDueOffers(made.world, due)
    expect(answered.decided).toHaveLength(1)
    expect(['accepted', 'rejected']).toContain(answered.decided[0]!.status)
    // limite de 5 propostas abertas
    let w = world0
    for (let i = 0; i < 5; i++) {
      const r = makeAiOffer(l, w, 'ana', req(w, cheapOf(w, comp.teamIds[10 + i]!)))
      if (!r.ok) throw new Error(`${i}: ${r.error}`)
      w = r.world
    }
    expect(makeAiOffer(l, w, 'ana', req(w, cheapOf(w, comp.teamIds[16]!)))).toMatchObject({ ok: false, error: 'too-many-offers' })
  })

  it('janela fechada e contratação de livre: janela vale e livre só sem taxa', () => {
    const l = league()
    const closed: SeasonState = { ...world0, season: { ...world0.season, currentDate: '2026-05-15' } }
    expect(makeAiOffer(l, closed, 'ana', req(closed, cheapOf(closed, AI)))).toMatchObject({ ok: false, error: 'window-closed' })
    const free = releasePlayer(world0, cheapOf(world0, AI).id, world0.season.currentDate)
    const p = free.players.find((x) => x.teamId === null)!
    expect(makeAiOffer(l, free, 'ana', req(free, p, { fee: 1_000_000 }))).toMatchObject({ ok: false, error: 'invalid' })
    expect(makeAiOffer(l, free, 'ana', req(free, p, { fee: 0 })).ok).toBe(true)
  })

  it('a IA procura os jogadores dos dois técnicos humanos (alvo sorteado entre eles); só o dono responde', () => {
    const humans = new Set([A, B])
    let w = world0
    const seen = new Set<string>()
    for (let d = 0; d < 60 && seen.size < 2; d++) {
      const date = addDays('2026-01-03', d)
      const tick = runMarketTick(w, date, humans)
      w = tick.state
      for (const o of tick.incoming) seen.add(o.sellerId as string)
    }
    // As propostas só vão para clubes humanos (um deles pode não interessar à IA nesta janela).
    expect(seen.size).toBeGreaterThan(0)
    for (const id of seen) expect([A, B]).toContain(id)
    const l = league()
    const who = seen.has(B) ? 'bia' : 'ana'
    const mine = aiOffers(l, w, who)!.incoming
    expect(mine.length).toBeGreaterThan(0)
    for (const o of mine) expect(w.market.offers.find((x) => x.id === o.id)!.sellerId).toBe(who === 'bia' ? B : A)
    const id = mine[0]!.id
    const other = who === 'bia' ? 'ana' : 'bia'
    expect(respondAiOffer(l, w, other, id, true)).toMatchObject({ ok: false, error: 'not-found' })
    const declined = respondAiOffer(l, w, who, id, false)
    expect(declined.ok && aiOffers(l, declined.world, who)!.incoming.some((o) => o.id === id)).toBe(false)
    const accepted = respondAiOffer(l, w, who, id, true)
    if (accepted.ok) {
      const offer = w.market.offers.find((o) => o.id === id)!
      expect(accepted.world.players.find((p) => p.id === offer.playerId)!.teamId).toBe(offer.buyerId)
    } else expect(['window-closed', 'squad-size', 'budget', 'salary-budget', 'squad-full', 'foreign-limit', 'invalid', 'unavailable']).toContain(accepted.error)
  })
})
