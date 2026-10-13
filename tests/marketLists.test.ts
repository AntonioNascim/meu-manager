import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MARKET } from '../src/engine/config'
import {
  ListingError,
  executeTransfer,
  listUserPlayer,
  listingOf,
  listingPrice,
  makeOffer,
  marketValue,
  refreshListings,
  resolveDueOffers,
  runMarketTick,
  salePrice,
  unlistUserPlayer,
} from '../src/engine/market'
import { squadRole } from '../src/engine/market'
import { addDays } from '../src/engine/season/dates'
import { advanceToNextEvent } from '../src/engine/season'
import type { Player } from '../src/engine/types'
import { createGame, favoritesOf, listUserSquadPlayer, squadOf, toggleFavorite, unlistUserSquadPlayer } from '../src/store/game'
import type { Game } from '../src/store/game'
import { MIGRATIONS, SAVE_VERSION, makeEnvelope, migrateSave, validateGame } from '../src/store/saveFormat'
import { Market } from '../src/ui/screens/Market'

const USER = 'team-imp'
const game: Game = createGame(7, USER)
const state = game.season
const date = state.season.currentDate

describe('listas do mercado: anúncios da IA', () => {
  const ai = state.market.listings

  it('os clubes da IA já anunciam quem sobra no elenco, com preço menor que o valor de mercado', () => {
    expect(ai.length).toBeGreaterThan(10)
    for (const l of ai) {
      const p = state.players.find((q) => q.id === l.playerId) as Player
      expect(p.teamId).toBe(l.teamId)
      expect(l.by).toBe('ai')
      const squad = state.players.filter((q) => q.teamId === l.teamId)
      expect(squadRole(p, squad)).toBe('surplus')
      expect(squad.length).toBeGreaterThan(MARKET.listing.minSquad)
      if (l.kind === 'transfer') expect(l.price).toBeLessThan(marketValue(p, date))
      expect(l.price).toBeGreaterThan(0)
    }
    const perTeam = new Map<string, number>()
    for (const l of ai) perTeam.set(l.teamId, (perTeam.get(l.teamId) ?? 0) + 1)
    expect(Math.max(...perTeam.values())).toBeLessThanOrEqual(MARKET.listing.maxPerTeam)
    expect(ai.some((l) => l.kind === 'transfer')).toBe(true)
    expect(ai.some((l) => l.kind === 'loan')).toBe(true)
  })

  it('o clube do jogador não anuncia nada sozinho', () => {
    expect(ai.some((l) => l.teamId === USER)).toBe(false)
    expect(state.market.listings.every((l) => l.teamId !== USER)).toBe(true)
  })

  it('é determinístico e o anúncio sai quando o jogador sai do clube', () => {
    const again = createGame(7, USER).season.market.listings
    expect(again.map((l) => l.playerId)).toEqual(ai.map((l) => l.playerId))
    const first = ai.find((l) => l.kind === 'transfer') as (typeof ai)[number]
    const buyer = state.teams.find((t) => t.id !== first.teamId && t.id !== USER) as (typeof state.teams)[number]
    const moved = executeTransfer(state, { playerId: first.playerId, toTeamId: buyer.id, fee: 100_000, salary: 20_000, contractEnd: '2029-12-31', kind: 'purchase', date })
    expect(moved.market.listings.some((l) => l.playerId === first.playerId)).toBe(false)
    const stale = refreshListings({ ...state, market: { ...state.market, listings: [...ai, { ...first, playerId: 'nao-existe' }] } }, date, USER)
    expect(stale.market.listings.some((l) => l.playerId === 'nao-existe')).toBe(false)
  })

  it('o preço da lista vale na compra: o clube aceita o valor anunciado, abaixo do pedido normal', () => {
    const l = ai.find((x) => x.kind === 'transfer') as (typeof ai)[number]
    const p = state.players.find((q) => q.id === l.playerId) as Player
    const squad = state.players.filter((q) => q.teamId === p.teamId)
    expect(salePrice(state, p, squad, 'purchase', date)).toBe(Math.min(l.price, salePrice({ market: { ...state.market, listings: [] } }, p, squad, 'purchase', date)))
    expect(listingOf(state, p.id, 'purchase')?.price).toBe(l.price)
    expect(listingOf(state, p.id, 'loan')).toBeUndefined()
    const dropped = new Set(squadOf(game, USER).slice(-3).map((q) => q.id))
    const withFree: Game = { ...game, season: { ...state, players: state.players.filter((q) => !dropped.has(q.id)), teams: state.teams.map((t) => (t.id === USER ? { ...t, finances: { ...t.finances, transferBudget: 1e9, balance: 1e9, salaryBudget: 1e9 } } : t)) } }
    const offered = makeOffer(withFree.season, USER, { kind: 'purchase', playerId: p.id, fee: l.price, salary: p.contract.salary * 3, contractEnd: '2029-12-31' }, date)
    const due = addDays(date, MARKET.windows.responseDays)
    const result = resolveDueOffers(offered, due)
    const decided = result.decided[0]
    expect(decided?.reason === 'fee').toBe(false)
  })

  it('ao avançar, os clubes renovam os anúncios (sem passar do limite por clube)', () => {
    const next = advanceToNextEvent(state, { market: true, userTeamId: USER })
    const perTeam = new Map<string, number>()
    for (const l of next.state.market.listings) perTeam.set(l.teamId, (perTeam.get(l.teamId) ?? 0) + 1)
    expect(Math.max(0, ...perTeam.values())).toBeLessThanOrEqual(MARKET.listing.maxPerTeam)
    expect(next.state.market.listings.length).toBeGreaterThan(0)
  })
})

describe('listas do mercado: seus anúncios', () => {
  const mine = squadOf(game, USER).find((p) => !p.contract.loanedFrom) as Player

  it('anunciar, trocar o anúncio, remover e os erros', () => {
    const listed = listUserSquadPlayer(game, mine.id, 'transfer', 5_000_000)
    expect(listed.season.market.listings.find((l) => l.playerId === mine.id)).toMatchObject({ by: 'user', kind: 'transfer', price: 5_000_000, teamId: USER })
    const changed = listUserSquadPlayer(listed, mine.id, 'loan', 300_000)
    expect(changed.season.market.listings.filter((l) => l.playerId === mine.id)).toHaveLength(1)
    expect(changed.season.market.listings.find((l) => l.playerId === mine.id)?.kind).toBe('loan')
    expect(unlistUserSquadPlayer(changed, mine.id).season.market.listings.some((l) => l.playerId === mine.id)).toBe(false)
    expect(() => listUserPlayer(state, USER, 'nao-existe', 'transfer', 1)).toThrow(ListingError)
    expect(() => listUserPlayer(state, USER, mine.id, 'transfer', 0)).toThrow(ListingError)
    expect(() => unlistUserPlayer(state, USER, mine.id)).toThrow(ListingError)
    const other = state.players.find((p) => p.teamId && p.teamId !== USER) as Player
    expect(() => listUserPlayer(state, USER, other.id, 'transfer', 1000)).toThrow(ListingError)
    expect(listingPrice(mine, 'transfer', date)).toBeLessThan(marketValue(mine, date))
  })

  it('o anúncio do jogador sobrevive às atualizações e atrai propostas da IA pelo preço anunciado', () => {
    const star = squadOf(game, USER)
      .filter((p) => !p.contract.loanedFrom)
      .sort((a, b) => b.hidden.potential - a.hidden.potential)[0] as Player
    const price = 3_000_000
    const listed = listUserSquadPlayer(game, star.id, 'transfer', price)
    expect(refreshListings(listed.season, date, USER).market.listings.some((l) => l.by === 'user' && l.playerId === star.id)).toBe(true)
    let hits = 0
    let atPrice = 0
    for (let i = 0; i < 80; i++) {
      const s = { ...listed.season, market: { ...listed.season.market, seed: `seed-${i}` } }
      const tick = runMarketTick(s, '2026-01-08', USER)
      for (const o of tick.incoming) {
        if (o.playerId === star.id) {
          hits++
          if (o.fee === price) atPrice++
        }
      }
    }
    expect(hits).toBeGreaterThan(0)
    expect(atPrice).toBe(hits)
  })
})

describe('favoritos, histórico e telas', () => {
  it('a estrela marca e desmarca, e quem saiu do jogo some da lista', () => {
    const target = state.players.find((p) => p.teamId && p.teamId !== USER) as Player
    const on = toggleFavorite(game, target.id)
    expect(favoritesOf(on)).toEqual([target.id])
    expect(favoritesOf(toggleFavorite(on, target.id))).toEqual([])
    const gone = { ...on, favorites: [target.id, 'sumiu'] }
    expect(favoritesOf(gone)).toEqual([target.id])
  })

  it('as abas Favoritos, Listas e Histórico abrem com o que têm', () => {
    const target = state.players.find((p) => p.teamId && p.teamId !== USER) as Player
    const fav = toggleFavorite(game, target.id)
    const html = (g: Game, tab: Parameters<typeof Market>[0]['initialTab']) => renderToStaticMarkup(createElement(Market, { game: g, initialTab: tab }))
    for (const tab of ['Favoritos', 'Listas', 'Histórico']) expect(html(game, 'search')).toContain(`>${tab}`)
    expect(html(game, 'favorites')).toContain('Toque na estrela')
    expect(html(fav, 'favorites')).toContain(target.name.slice(0, 5))
    const lists = html(game, 'lists')
    for (const text of ['Transferência', 'Empréstimo', 'Meus', 'à venda', 'negociar']) expect(lists).toContain(text)
    expect(html(game, 'history')).toContain('ainda não negociou')
  })

  it('o histórico mostra jogador, origem, destino, valor e data, das suas ou de todas as transferências', () => {
    const l = state.market.listings.find((x) => x.kind === 'transfer') as (typeof state.market.listings)[number]
    const done = executeTransfer(state, { playerId: l.playerId, toTeamId: USER, fee: 4_000_000, salary: 30_000, contractEnd: '2029-12-31', kind: 'purchase', date })
    const g: Game = { ...game, season: done }
    const p = done.players.find((q) => q.id === l.playerId) as Player
    const html = renderToStaticMarkup(createElement(Market, { game: g, initialTab: 'history' }))
    expect(html).toContain(p.nickname ?? p.name)
    expect(html).toContain('4 mi')
    expect(html).toContain('→')
    expect(html).toContain('Do campeonato')
  })

  it('save versão 5: a migração 4→5 cria a lista de anúncios', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(5)
    expect(MIGRATIONS[4]).toBeTypeOf('function')
    const old = JSON.parse(JSON.stringify(makeEnvelope(game, '2026-01-01T00:00:00Z')))
    delete old.game.season.market.listings
    old.version = 4
    expect(validateGame(old.game)).not.toEqual([])
    const migrated = migrateSave(old)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.game.season.market.listings).toEqual([])
  })
})
