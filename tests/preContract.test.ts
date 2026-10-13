import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createYouth } from '../src/data/generateYouth'
import { MARKET } from '../src/engine/config'
import {
  OfferError,
  applyPreContracts,
  canPreContract,
  expectedSalary,
  interestContext,
  interestIn,
  nextMarketEvent,
  offerPreContract,
  preContractOf,
  preContractsOpen,
  runPreContractTick,
} from '../src/engine/market'
import { advanceSeason } from '../src/engine/offseason'
import { createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { addDays } from '../src/engine/season/dates'
import type { Player } from '../src/engine/types'
import { createGame, offerUserPreContract, userPreContractsOf } from '../src/store/game'
import type { Game } from '../src/store/game'
import { MIGRATIONS, SAVE_VERSION, makeEnvelope, migrateSave, validateGame } from '../src/store/saveFormat'
import { Market } from '../src/ui/screens/Market'

const USER = 'team-imp'
const base = createGame(7, USER)
const at = (state: SeasonState, date: string): SeasonState => ({ ...state, season: { ...state.season, currentDate: date } })
const august = at(base.season, '2026-08-03')
const lastYear = (p: Player) => Number(p.contract.endDate.slice(0, 4)) <= 2026
/** Jogador de outro clube no último ano de contrato, com a posição que o Imperial (que tem elenco cheio) mais aceitaria. */
const targets = august.players.filter((p) => p.teamId && p.teamId !== USER && lastYear(p) && !p.contract.loanedFrom)
/** O Imperial já começa com 30; abre vagas no ano que vem tirando jogadores. */
const roomy = (s: SeasonState): SeasonState => ({ ...s, players: s.players.filter((p) => !(p.teamId === USER && p.age > 30)) })

describe('regras do pré-contrato', () => {
  it('só abre a partir de 1º de julho e só vale para quem está no último ano de contrato', () => {
    expect(preContractsOpen(at(base.season, '2026-06-30'))).toBe(false)
    expect(preContractsOpen(at(base.season, '2026-07-01'))).toBe(true)
    expect(targets.length).toBeGreaterThan(20)
    const t = targets[0] as Player
    expect(canPreContract(august, t)).toBe(true)
    expect(canPreContract(at(base.season, '2026-05-01'), t)).toBe(false)
    const longer = august.players.find((p) => p.teamId && Number(p.contract.endDate.slice(0, 4)) > 2026) as Player
    expect(canPreContract(august, longer)).toBe(false)
    const free = august.players.find((p) => p.teamId === null)
    if (free) expect(canPreContract(august, free)).toBe(false)
  })

  it('o jogador aceita ou recusa pelas mesmas regras de interesse; o salário mínimo vem junto da recusa', () => {
    const state = roomy(august)
    const ctx = interestContext(state, USER)
    const high = targets.find((p) => interestIn(ctx, p).level === 'high') as Player
    const hit = offerPreContract(state, USER, high.id, { salary: expectedSalary(high), years: 3 })
    expect(hit.accepted).toBe(true)
    expect(preContractOf(hit.state, high.id)).toMatchObject({ fromTeamId: high.teamId, toTeamId: USER, years: 3 })
    expect(hit.state.players.find((p) => p.id === high.id)?.teamId).toBe(high.teamId) // só muda na virada
    const none = targets.find((p) => interestIn(ctx, p).level === 'none' && interestIn(ctx, p).minimumSalary === null)
    if (none) {
      const miss = offerPreContract(state, USER, none.id, { salary: expectedSalary(none) * 3, years: 3 })
      expect(miss.accepted).toBe(false)
    }
    const cheap = offerPreContract(state, USER, high.id, { salary: 500, years: 3 })
    expect(cheap.accepted).toBe(false)
    expect(cheap.reason).toBe('salary')
    expect(cheap.minimumSalary).toBeGreaterThan(500)
  })

  it('erros: fora do período, jogador do próprio time, repetido, dados inválidos e elenco do ano que vem cheio', () => {
    const t = targets[0] as Player
    expect(() => offerPreContract(at(base.season, '2026-05-01'), USER, t.id, { salary: 10_000, years: 3 })).toThrow(OfferError)
    const mine = august.players.find((p) => p.teamId === USER) as Player
    expect(() => offerPreContract(august, USER, mine.id, { salary: 10_000, years: 3 })).toThrow(OfferError)
    expect(() => offerPreContract(august, USER, t.id, { salary: 0, years: 3 })).toThrow(OfferError)
    expect(() => offerPreContract(august, USER, t.id, { salary: 10_000, years: 9 })).toThrow(OfferError)
    const state = roomy(august)
    const high = targets.find((p) => interestIn(interestContext(state, USER), p).level === 'high') as Player
    const signed = offerPreContract(state, USER, high.id, { salary: expectedSalary(high), years: 2 })
    expect(() => offerPreContract(signed.state, USER, high.id, { salary: expectedSalary(high), years: 2 })).toThrow(OfferError)
    const full = { ...august, players: august.players.map((p) => (p.teamId === USER ? { ...p, contract: { ...p.contract, endDate: '2030-12-31' } } : p)) }
    expect(offerPreContract(full, USER, high.id, { salary: expectedSalary(high), years: 2 }).reason).toBe('squad-full')
  })

  it('pela loja do jogo: o pré-contrato do jogador aparece em "chegam" e some quando não aceita', () => {
    const g: Game = { ...base, season: roomy(august) }
    const high = targets.find((p) => interestIn(interestContext(g.season, USER), p).level === 'high') as Player
    const { game: next, result } = offerUserPreContract(g, high.id, { salary: expectedSalary(high), years: 3 })
    expect(result.accepted).toBe(true)
    expect(userPreContractsOf(next).arriving.map((c) => c.playerId)).toEqual([high.id])
    expect(userPreContractsOf(g).arriving).toEqual([])
  })
})

describe('pré-contratos da IA', () => {
  const roundsAt = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']

  it('o mercado marca os dias de pré-contrato da IA (primeiro dia de julho a novembro)', () => {
    let state = { ...base.season, market: { ...base.season.market, handled: '2026-06-01' } }
    const dates: string[] = []
    for (let i = 0; i < 40; i++) {
      const e = nextMarketEvent(state)
      if (!e) break
      if (e.preContract) dates.push(e.date)
      state = { ...state, market: { ...state.market, handled: e.date } }
    }
    expect(dates).toEqual(roundsAt.map((d) => d))
  })

  it('com moderação: no máximo um por clube, ninguém perde mais de dois, e poucos na temporada inteira', () => {
    const totals: number[] = []
    for (let seed = 0; seed < 6; seed++) {
      let state: SeasonState = { ...base.season, market: { ...base.season.market, seed: `pc-${seed}` } }
      for (const d of roundsAt) state = runPreContractTick(at(state, d), d, USER).state
      const list = state.market.preContracts
      totals.push(list.length)
      const byBuyer = new Map<string, number>()
      const bySeller = new Map<string, number>()
      for (const c of list) {
        byBuyer.set(c.toTeamId, (byBuyer.get(c.toTeamId) ?? 0) + 1)
        bySeller.set(c.fromTeamId, (bySeller.get(c.fromTeamId) ?? 0) + 1)
        expect(c.toTeamId).not.toBe(USER)
        expect(c.years).toBeGreaterThanOrEqual(2)
      }
      expect(Math.max(0, ...byBuyer.values())).toBeLessThanOrEqual(MARKET.preContract.ai.maxPerClub)
      expect(Math.max(0, ...bySeller.values())).toBeLessThanOrEqual(MARKET.preContract.ai.maxLossPerClub)
    }
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length
    expect(mean).toBeGreaterThan(1)
    expect(mean).toBeLessThan(26)
  })

  it('avisa quando um jogador do seu time assina com outro clube', () => {
    const lost = []
    for (let seed = 0; seed < 40 && lost.length === 0; seed++) {
      let state: SeasonState = { ...base.season, market: { ...base.season.market, seed: `lost-${seed}` } }
      for (const d of roundsAt) {
        const tick = runPreContractTick(at(state, d), d, USER)
        state = tick.state
        lost.push(...tick.lost)
      }
    }
    if (lost.length > 0) {
      expect(lost[0]?.fromTeamId).toBe(USER)
      expect(lost[0]?.toTeamId).not.toBe(USER)
    }
    // Fora do período a IA não assina nada.
    expect(runPreContractTick(at(base.season, '2026-05-01'), '2026-05-01', USER).state.market.preContracts).toEqual([])
  })
})

describe('na virada de temporada', () => {
  const state: SeasonState = createSeason({ year: 2026, seed: 9, teams: base.season.teams, players: base.season.players, academy: base.season.academy })

  it('o jogador troca de clube de graça com o contrato combinado, e o pré-contrato some', () => {
    const player = state.players.find((p) => p.teamId && p.teamId !== USER && lastYear(p) && !p.contract.loanedFrom) as Player
    const buyer = state.teams.find((t) => t.id !== player.teamId && t.id !== USER) as (typeof state.teams)[number]
    const pre = { playerId: player.id, fromTeamId: player.teamId as string, toTeamId: buyer.id, salary: 77_000, years: 3, signedOn: '2026-08-01' }
    const out = applyPreContracts(state.players, [pre], 2026)
    const moved = out.players.find((p) => p.id === player.id) as Player
    expect(moved.teamId).toBe(buyer.id)
    expect(moved.contract.salary).toBe(77_000)
    expect(moved.contract.endDate).toBe('2029-12-31')
    expect(out.applied).toEqual([{ playerId: player.id, fromTeamId: player.teamId, toTeamId: buyer.id }])
    // Já foi vendido a outro clube: o pré-contrato cai.
    const sold = state.players.map((p) => (p.id === player.id ? { ...p, teamId: 'team-outro' } : p))
    expect(applyPreContracts(sold, [pre], 2026).applied).toEqual([])
    // Contrato renovado (já não vence): cai também.
    const renewed = state.players.map((p) => (p.id === player.id ? { ...p, contract: { ...p.contract, endDate: '2030-12-31' } } : p))
    expect(applyPreContracts(renewed, [pre], 2026).applied).toEqual([])
  })

  it('o comprador sem vaga no elenco perde o pré-contrato', () => {
    const player = state.players.find((p) => p.teamId && p.teamId !== USER && lastYear(p) && !p.contract.loanedFrom) as Player
    const pre = { playerId: player.id, fromTeamId: player.teamId as string, toTeamId: USER, salary: 50_000, years: 2, signedOn: '2026-08-01' }
    const crowded = state.players.map((p) => (p.teamId === USER ? { ...p, contract: { ...p.contract, endDate: '2031-12-31' } } : p))
    expect(applyPreContracts(crowded, [pre], 2026).applied).toEqual([])
  })

  it('advanceSeason aplica os pré-contratos: chega de graça, entra no histórico da temporada nova e no relatório', () => {
    const player = state.players.find((p) => p.teamId && p.teamId !== USER && lastYear(p) && !p.contract.loanedFrom && p.age < 28 && p.position !== 'GK') as Player
    const buyer = state.teams.find((t) => t.id !== player.teamId && t.id !== USER && t.tier === 1) as (typeof state.teams)[number]
    const withPre: SeasonState = {
      ...state,
      season: { ...state.season, phase: 'end-of-season' },
      market: { ...state.market, preContracts: [{ playerId: player.id, fromTeamId: player.teamId as string, toTeamId: buyer.id, salary: 120_000, years: 3, signedOn: '2026-08-01' }] },
    }
    const { state: next, report } = advanceSeason(withPre, { createYouth, userTeamId: USER })
    const after = next.players.find((p) => p.id === player.id) as Player
    expect(after.teamId).toBe(buyer.id)
    expect(after.contract.salary).toBe(120_000)
    expect(after.contract.endDate).toBe('2029-12-31')
    expect(report.preContracts).toEqual([{ playerId: player.id, fromTeamId: player.teamId, toTeamId: buyer.id }])
    expect(report.released.some((d) => d.playerId === player.id)).toBe(false)
    expect(next.market.history.some((r) => r.playerId === player.id && r.toTeamId === buyer.id && r.fee === 0)).toBe(true)
    expect(next.market.preContracts).toEqual([])
    expect(addDays(next.season.currentDate, 0).startsWith('2027')).toBe(true)
  })
})

describe('save versão 6 e telas', () => {
  it('a migração 5→6 cria a lista de pré-contratos', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(6)
    expect(MIGRATIONS[5]).toBeTypeOf('function')
    const old = JSON.parse(JSON.stringify(makeEnvelope(base, '2026-01-01T00:00:00Z')))
    delete old.game.season.market.preContracts
    old.version = 5
    expect(validateGame(old.game)).not.toEqual([])
    const migrated = migrateSave(old)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.game.season.market.preContracts).toEqual([])
  })

  it('a aba Pré-contrato explica que abre em julho e, depois, lista quem pode assinar de graça', () => {
    const before = renderToStaticMarkup(createElement(Market, { game: base, initialTab: 'precontract' }))
    expect(before).toContain('Pré-contrato')
    expect(before).toContain('abrem em 1º de julho')
    const game: Game = { ...base, season: roomy(august) }
    const html = renderToStaticMarkup(createElement(Market, { game, initialTab: 'precontract' }))
    for (const text of ['último ano de contrato', 'Grátis', 'pré-contrato ›', 'jogadores']) expect(html).toContain(text)
  })
})
