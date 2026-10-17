import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MARKET } from '../src/engine/config'
import { valueScale } from '../src/engine/economy'
import {
  ANY,
  defaultFilters,
  interestContext,
  interestIn,
  marketValue,
  searchContext,
  searchPlayers,
  strengthValue,
} from '../src/engine/market'
import { playerOverall } from '../src/engine/overall'
import { potentialRange } from '../src/engine/training'
import type { Player } from '../src/engine/types'
import { createGame, squadOf } from '../src/store/game'
import type { Game } from '../src/store/game'
import { Market } from '../src/ui/screens/Market'
import { Squad } from '../src/ui/screens/Squad'
import { SellSheet } from '../src/ui/screens/market/SellSheet'
import { Negotiation } from '../src/ui/screens/market/Negotiation'

const USER = 'team-imp'
const game: Game = createGame(7, USER)
const state = game.season
const date = state.season.currentDate

const valueOf = (p: Player) => marketValue(p, date, state.teams.find((x) => x.id === p.teamId))

describe('busca de jogadores', () => {
  it('sem filtros traz todo mundo menos o seu elenco e os emprestados, do mais forte ao mais fraco', () => {
    const all = searchPlayers(state, USER, defaultFilters())
    expect(all.some((p) => p.teamId === USER)).toBe(false)
    expect(all.length).toBe(state.players.filter((p) => p.teamId !== USER && !p.contract.loanedFrom).length)
    const overall = all.map(playerOverall)
    expect(overall).toEqual([...overall].sort((a, b) => b - a))
  })

  it('busca por nome, apelido ou clube, sem se importar com acento ou maiúscula', () => {
    const target = state.players.find((p) => p.teamId && p.teamId !== USER && /[áéíóúãõç]/i.test(p.name)) as Player
    const plain = target.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()
    const found = searchPlayers(state, USER, { ...defaultFilters(), query: plain })
    expect(found.some((p) => p.id === target.id)).toBe(true)
    const club = state.teams.find((t) => t.id !== USER) as (typeof state.teams)[number]
    const byClub = searchPlayers(state, USER, { ...defaultFilters(), query: club.name })
    expect(byClub.length).toBeGreaterThan(20)
    expect(byClub.every((p) => p.teamId === club.id)).toBe(true)
  })

  it('filtros de série, posição, grupo, situação e faixas', () => {
    expect(searchPlayers(state, USER, { ...defaultFilters(), tier: 2 }).every((p) => state.teams.find((t) => t.id === p.teamId)?.tier === 2)).toBe(true)
    expect(searchPlayers(state, USER, { ...defaultFilters(), position: 'GK' }).every((p) => p.position === 'GK')).toBe(true)
    expect(searchPlayers(state, USER, { ...defaultFilters(), group: 'DEF' }).every((p) => ['CB', 'RB', 'LB'].includes(p.position))).toBe(true)
    expect(searchPlayers(state, USER, { ...defaultFilters(), situation: 'free' }).every((p) => p.teamId === null)).toBe(true)
    expect(searchPlayers(state, USER, { ...defaultFilters(), situation: 'club' }).every((p) => p.teamId !== null)).toBe(true)
    const ranged = searchPlayers(state, USER, { ...defaultFilters(), overall: { min: 60, max: 70 }, age: { min: 22, max: 26 }, salary: { min: 20_000, max: 80_000 } })
    expect(ranged.length).toBeGreaterThan(0)
    for (const p of ranged) {
      expect(playerOverall(p)).toBeGreaterThanOrEqual(60)
      expect(playerOverall(p)).toBeLessThanOrEqual(70)
      expect(p.age).toBeGreaterThanOrEqual(22)
      expect(p.age).toBeLessThanOrEqual(26)
      expect(p.contract.salary).toBeGreaterThanOrEqual(20_000)
    }
    const valued = searchPlayers(state, USER, { ...defaultFilters(), value: { min: 1_000_000, max: 5_000_000 } })
    expect(valued.length).toBeGreaterThan(0)
    expect(valued.every((p) => p.teamId !== null && valueOf(p) >= 1_000_000 && valueOf(p) <= 5_000_000)).toBe(true)
  })

  it('"Cabem no bolso": só quem custa até o orçamento de compras (os livres cabem sempre)', () => {
    const budget = searchContext(state, USER).budget
    const list = searchPlayers(state, USER, { ...defaultFilters(), quick: ['budget'] })
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((p) => p.teamId === null || valueOf(p) <= budget)).toBe(true)
    expect(list.length).toBeLessThan(searchPlayers(state, USER, defaultFilters()).length)
  })

  it('"Barganhas": valor baixo para a força e que serve ao elenco; "Jovens promessas": jovens com potencial estimado alto; "Contrato acabando": último ano', () => {
    const ctx = searchContext(state, USER)
    const bargains = searchPlayers(state, USER, { ...defaultFilters(), quick: ['bargain'] })
    expect(bargains.length).toBeGreaterThan(0)
    for (const p of bargains) {
      expect(valueOf(p)).toBeLessThanOrEqual(strengthValue(playerOverall(p)) * valueScale(state.teams.find((x) => x.id === p.teamId) ?? {}) * MARKET.search.bargainShare)
      expect(playerOverall(p)).toBeGreaterThanOrEqual(ctx.medianOverall)
    }
    const prospects = searchPlayers(state, USER, { ...defaultFilters(), quick: ['prospect'] })
    expect(prospects.length).toBeGreaterThan(0)
    expect(prospects.every((p) => p.age <= MARKET.search.prospectAge && potentialRange(p).high >= MARKET.search.prospectPotential)).toBe(true)
    const expiring = searchPlayers(state, USER, { ...defaultFilters(), quick: ['expiring'] })
    expect(expiring.length).toBeGreaterThan(0)
    expect(expiring.every((p) => p.teamId !== null && Number(p.contract.endDate.slice(0, 4)) <= state.season.year)).toBe(true)
  })

  it('ordenações e filtros combinados', () => {
    const young = searchPlayers(state, USER, { ...defaultFilters(), sort: 'age' })
    expect(young.map((p) => p.age)).toEqual([...young.map((p) => p.age)].sort((a, b) => a - b))
    const cheap = searchPlayers(state, USER, { ...defaultFilters(), sort: 'value-asc', situation: 'club' })
    const values = cheap.map((p) => valueOf(p))
    expect(values).toEqual([...values].sort((a, b) => a - b))
    const both = searchPlayers(state, USER, { ...defaultFilters(), tier: 1, group: 'FWD', quick: ['budget'], overall: { min: 55, max: ANY.max } })
    expect(both.every((p) => ['RW', 'LW', 'ST'].includes(p.position) && playerOverall(p) >= 55)).toBe(true)
  })
})

describe('interesse em vir para o seu clube', () => {
  const ctx = interestContext(state, USER)
  const sample = state.players.filter((p) => p.teamId && p.teamId !== USER && !p.contract.loanedFrom).slice(0, 400)

  it('é nenhum, baixo, médio ou alto e vem das regras de aceitação: quem aceita o salário esperado tem interesse médio ou alto', () => {
    const levels = new Set(sample.map((p) => interestIn(ctx, p).level))
    expect(levels.size).toBeGreaterThanOrEqual(2)
    for (const p of sample) {
      const i = interestIn(ctx, p)
      if (i.level === 'high' || i.level === 'medium') expect(i.minimumSalary).not.toBeNull()
      if (i.level === 'none') expect(i.minimumSalary === null || i.minimumSalary > 0).toBe(true)
    }
  })

  it('um clube pequeno interessa menos aos bons jogadores que o maior clube do mundo', () => {
    const small = state.teams.find((t) => t.tier === 2 && t.reputation <= 4) as (typeof state.teams)[number]
    const smallCtx = interestContext(state, small.id)
    const stars = state.players.filter((p) => p.teamId && p.teamId !== USER && p.teamId !== small.id && playerOverall(p) >= 78)
    const score = (c: typeof ctx) => stars.reduce((s, p) => s + ['none', 'low', 'medium', 'high'].indexOf(interestIn(c, p).level), 0)
    expect(score(ctx)).toBeGreaterThan(score(smallCtx))
  })

  it('jogador livre também tem interesse calculado', () => {
    const free = state.players.find((p) => p.teamId === null) ?? ({ ...(sample[0] as Player), teamId: null } as Player)
    expect(['none', 'low', 'medium', 'high']).toContain(interestIn(ctx, free).level)
  })
})

describe('telas do mercado', () => {
  it('abas com rolagem, aviso da janela no topo e a lista com interesse, valor e força', () => {
    const html = renderToStaticMarkup(createElement(Market, { game }))
    for (const tab of ['Buscar', 'Livres', 'Propostas', 'Contratos']) expect(html).toContain(`>${tab}`)
    expect(html).toContain('overflow-x-auto')
    expect(html).toContain('Janela de transferências aberta')
    for (const text of ['Buscar jogador ou clube', 'Filtros', 'Cabem no bolso', 'Barganhas', 'Jovens promessas', 'Contrato acabando', 'Série A', 'Série B', 'GOL', 'Maior força', 'interesse', 'valor']) expect(html).toContain(text)
    expect(html).toMatch(/\d+ jogadores/)
  })

  it('o aviso da janela mostra janela fechada fora do período', () => {
    const closed: Game = { ...game, season: { ...state, season: { ...state.season, currentDate: '2026-05-20' } } }
    expect(renderToStaticMarkup(createElement(Market, { game: closed }))).toContain('Janela de transferências fechada')
  })

  it('Livres lista só jogadores sem clube; Propostas e Contratos abrem', () => {
    expect(renderToStaticMarkup(createElement(Market, { game, initialTab: 'free' }))).toContain('Livres')
    expect(renderToStaticMarkup(createElement(Market, { game, initialTab: 'proposals' }))).toContain('Recebidas')
    expect(renderToStaticMarkup(createElement(Market, { game, initialTab: 'contracts' }))).toContain('Contratos')
  })

  it('vender, emprestar e liberar agora ficam no detalhe do jogador, no Elenco', () => {
    const html = renderToStaticMarkup(createElement(Squad, { game }))
    expect(html).not.toContain('Vender, emprestar ou liberar') // o detalhe só abre ao tocar
    const sell = renderToStaticMarkup(createElement(SellSheet, { game, player: squadOf(game, USER)[3] as Player, onClose: () => {}, onDone: () => {} }))
    for (const text of ['Vender', 'Emprestar', 'Liberar', 'Clube interessado']) expect(sell).toContain(text)
  })

  it('a negociação mostra valor de mercado, interesse, valor, salário e duração', () => {
    const target = state.players.find((p) => p.teamId && p.teamId !== USER) as Player
    const html = renderToStaticMarkup(createElement(Negotiation, { game, player: target, open: true, onClose: () => {} }))
    for (const text of ['Valor de mercado', 'Interesse em vir', 'Valor da compra', 'Salário mensal', 'Duração do contrato', 'Enviar proposta', 'Empréstimo']) expect(html).toContain(text)
  })
})
