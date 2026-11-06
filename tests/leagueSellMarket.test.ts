import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, buyersFor, createLeague, defaultLeagueConfig, listOwn, mineBody, preOffer, preTargets, sellToAi, unlistOwn, type LeagueState } from '../src/engine/league'
import { runMarketTick } from '../src/engine/market'
import { playersOf } from '../src/engine/market/transfer'
import type { SeasonState } from '../src/engine/season'
import { createGame } from '../src/store/game'

const T0 = Date.UTC(2026, 0, 3, 15, 0, 0)
const raw = createGame(6, 'team-imp', { cups: false }).season
const comp = raw.season.competitions[0]!
const A = comp.teamIds[0]!
const B = comp.teamIds[7]!
const world0: SeasonState = { ...raw, teams: raw.teams.map((t) => ({ ...t, finances: { ...t.finances, transferBudget: 900_000_000, balance: 900_000_000, salaryBudget: 900_000_000 } })) }
const league = (): LeagueState => createLeague(defaultLeagueConfig(DEFAULT_CONFIG('liga-ia'), true), world0, [{ teamId: A, playerId: 'ana' }, { teamId: B, playerId: 'bia' }], T0)

describe('vender, anunciar e pré-contrato numa liga online', () => {
  it('"meu elenco" traz só o meu clube, com preços sugeridos e a janela', () => {
    const body = mineBody(league(), world0, 'ana')!
    expect(body.players.length).toBe(playersOf(world0, A).length)
    expect(body.players.every((p) => p.suggestSale > 0 && p.suggestLoan > 0)).toBe(true)
    expect(body.windowOpen).toBe(true)
    expect(mineBody(league(), world0, 'intruso')).toBeUndefined()
  })

  it('anunciar e tirar o anúncio; jogador de outro clube não pode', () => {
    const mine = playersOf(world0, A)[3]!
    const other = playersOf(world0, B)[3]!
    const r = listOwn(league(), world0, 'ana', { playerId: mine.id, kind: 'transfer', price: 5_000_000 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.market.listings.find((l) => l.playerId === mine.id)).toMatchObject({ by: 'user', teamId: A, price: 5_000_000 })
    expect(mineBody(league(), r.world, 'ana')!.players.find((p) => p.playerId === mine.id)!.listing).toEqual({ kind: 'transfer', price: 5_000_000 })
    const gone = unlistOwn(league(), r.world, 'ana', mine.id)
    expect(gone.ok && gone.world.market.listings.some((l) => l.playerId === mine.id)).toBe(false)
    expect(listOwn(league(), world0, 'ana', { playerId: other.id, kind: 'transfer', price: 1_000_000 })).toEqual({ ok: false, error: 'not-found' })
    expect(listOwn(league(), world0, 'ana', { playerId: mine.id, kind: 'transfer', price: -3 })).toEqual({ ok: false, error: 'invalid' })
    expect(unlistOwn(league(), world0, 'ana', mine.id)).toEqual({ ok: false, error: 'not-found' })
  })

  it('a IA passa a fazer propostas pelo jogador anunciado, pelo preço anunciado', () => {
    const lg = league()
    let w = world0
    // Anuncia vários, a IA escolhe entre eles; em 60 rodadas de negociações tem de aparecer proposta por um deles.
    const listed = playersOf(w, A).filter((p) => p.position !== 'GK').slice(0, 8)
    for (const p of listed) {
      const r = listOwn(lg, w, 'ana', { playerId: p.id, kind: 'transfer', price: 1_000_000 })
      if (r.ok) w = r.world
    }
    const humans = new Set([A, B])
    let found: { playerId: string; fee: number } | undefined
    for (let i = 0; i < 80 && !found; i++) {
      const date = `2026-01-${String(4 + (i % 20)).padStart(2, '0')}`
      const tick = runMarketTick({ ...w, market: { ...w.market, seed: `${w.market.seed}:${i}` } }, date, humans)
      const o = tick.state.market.offers.find((x) => x.direction === 'incoming' && x.sellerId === A && listed.some((p) => p.id === x.playerId))
      if (o) found = { playerId: o.playerId, fee: o.fee }
    }
    expect(found).toBeDefined()
    expect(found!.fee).toBe(1_000_000)
  })

  it('vender direto a um clube da IA: ele responde na hora, a taxa entra no caixa e o jogador sai', () => {
    // O clube de menor reputação: o jogador só aceita ir para clube de reputação igual ou maior (regra do jogo solo).
    const low = comp.teamIds.map((id) => raw.teams.find((t) => t.id === id)!).sort((a, b) => a.reputation - b.reputation)[0]!.id
    const lg = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('liga-ia'), true), world0, [{ teamId: low, playerId: 'ana' }, { teamId: B === low ? A : B, playerId: 'bia' }], T0)
    let done: { playerId: string; buyerId: string; fee: number; world: SeasonState } | undefined
    for (const p of playersOf(world0, low).slice().reverse()) {
      const buyers = buyersFor(lg, world0, 'ana', p.id, 'purchase')!
      expect(buyers.every((b) => b.teamId !== low && b.teamId !== (B === low ? A : B))).toBe(true)
      for (const b of buyers) {
        const r = sellToAi(lg, world0, 'ana', { playerId: p.id, buyerId: b.teamId, kind: 'purchase', fee: b.maxFee })
        if (r.ok && r.accepted) {
          done = { playerId: p.id, buyerId: b.teamId, fee: b.maxFee, world: r.world }
          break
        }
      }
      if (done) break
    }
    expect(done).toBeDefined()
    expect(done!.world.players.find((p) => p.id === done!.playerId)!.teamId).toBe(done!.buyerId)
    expect(done!.world.teams.find((t) => t.id === low)!.finances.balance).toBeGreaterThan(world0.teams.find((t) => t.id === low)!.finances.balance)
  })

  it('recusas: preço acima do máximo mostra o máximo; comprador humano, jogador alheio e janela fechada são barrados', () => {
    const lg = league()
    const p = playersOf(world0, A).find((x) => buyersFor(lg, world0, 'ana', x.id, 'purchase')!.length > 0)!
    const top = buyersFor(lg, world0, 'ana', p.id, 'purchase')![0]!
    const high = sellToAi(lg, world0, 'ana', { playerId: p.id, buyerId: top.teamId, kind: 'purchase', fee: top.maxFee * 3 })
    expect(high).toMatchObject({ ok: true, accepted: false, reason: 'fee', counter: top.maxFee })
    expect(sellToAi(lg, world0, 'ana', { playerId: p.id, buyerId: B, kind: 'purchase', fee: 1_000_000 })).toEqual({ ok: false, error: 'human-club' })
    expect(sellToAi(lg, world0, 'ana', { playerId: playersOf(world0, B)[0]!.id, buyerId: top.teamId, kind: 'purchase', fee: 1_000_000 })).toEqual({ ok: false, error: 'not-found' })
    const closed: SeasonState = { ...world0, season: { ...world0.season, currentDate: '2026-03-20' } }
    const r = sellToAi(lg, closed, 'ana', { playerId: p.id, buyerId: top.teamId, kind: 'purchase', fee: top.maxFee })
    expect(r.ok).toBe(false)
  })

  it('pré-contrato: só no último ano de contrato, o jogador responde na hora e aparece como "chega na virada"', () => {
    const lg = league()
    // Põe a data no segundo semestre e faz alguns jogadores da IA terminarem o contrato no fim do ano.
    const date = '2026-10-01'
    const ids = new Set(world0.players.filter((p) => p.teamId && p.teamId !== A && p.teamId !== B && p.position !== 'GK').slice(0, 60).map((p) => p.id))
    const w: SeasonState = { ...world0, season: { ...world0.season, currentDate: date }, players: world0.players.map((p) => (ids.has(p.id) ? { ...p, contract: { ...p.contract, endDate: '2026-12-31' } } : p)) }
    expect(preTargets(lg, world0, 'ana', {})!.length).toBe(0)
    const targets = preTargets(lg, w, 'ana', {})!
    expect(targets.length).toBeGreaterThan(5)
    expect(targets.every((t) => t.clubId !== A && t.clubId !== B)).toBe(true)
    let signed: SeasonState | undefined
    let target = targets[0]!
    for (const t of targets) {
      const r = preOffer(lg, w, 'ana', { playerId: t.playerId, salary: t.salaryHint * 2, years: 3 })
      expect(r.ok).toBe(true)
      if (r.ok && r.accepted) {
        signed = r.world
        target = t
        break
      }
    }
    expect(signed).toBeDefined()
    const body = mineBody(lg, signed!, 'ana')!
    expect(body.arriving.map((a) => a.playerId)).toContain(target.playerId)
    expect(preTargets(lg, signed!, 'ana', {})!.some((t) => t.playerId === target.playerId)).toBe(false)
    // Salário baixíssimo: o jogador recusa e diz o mínimo.
    const low = preOffer(lg, w, 'ana', { playerId: targets.at(-1)!.playerId, salary: 1_000, years: 3 })
    expect(low).toMatchObject({ ok: true, accepted: false })
    // Fora da janela / jogador de técnico / anos inválidos.
    expect(preOffer(lg, world0, 'ana', { playerId: targets[0]!.playerId, salary: 100_000, years: 3 })).toEqual({ ok: false, error: 'not-eligible' })
    expect(preOffer(lg, w, 'ana', { playerId: targets[0]!.playerId, salary: 100_000, years: 9 })).toEqual({ ok: false, error: 'invalid' })
  })
})
