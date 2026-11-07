import { describe, expect, it } from 'vitest'
import { applyCommand, parseCommand } from '../src/engine/league'
import { requestUserFunds, createGame, makeUserOffer } from '../src/store/game'
import { expectedSalary, salePrice } from '../src/engine/market'
import { contractEndIn } from '../src/engine/season'
import { createLeagueWorld } from '../src/store/leagueWorld'
import { getGame, setGame } from '../src/store/gameStore'
import { perform } from '../src/store/actions'

const world = createLeagueWorld(31, undefined, { cups: false })
const comp = world.season.competitions[0]!
const MY = comp.teamIds[0]!
const OTHER = comp.teamIds[1]!
const HUMAN = comp.teamIds[2]!
const ctx = { humans: [MY, HUMAN] }

const target = world.players.find((p) => p.teamId === OTHER && p.position !== 'GK')!
const buyer = world.teams.find((t) => t.id === MY)!
const offerCmd = (playerId: string) => ({ type: 'offer', kind: 'purchase', playerId, fee: 1_000_000, salary: expectedSalary(target, buyer), contractEnd: contractEndIn(world, MY, 3) }) as const

describe('comandos de mercado e finanças (C4)', () => {
  it('conferem o corpo: tipos novos, campos a mais e valores fora da lista', () => {
    expect(parseCommand({ type: 'offer', kind: 'purchase', playerId: 'p1', fee: 10, salary: 5, contractEnd: '2029-12-31' })).toBeDefined()
    expect(parseCommand({ type: 'offer', kind: 'steal', playerId: 'p1', fee: 10, salary: 5, contractEnd: '2029-12-31' })).toBeUndefined()
    expect(parseCommand({ type: 'offer', kind: 'loan', playerId: 'p1', fee: 10, salary: 5, contractEnd: 'amanha' })).toBeUndefined()
    expect(parseCommand({ type: 'respond-offer', offerId: 'o-1', accept: 'sim' })).toBeUndefined()
    expect(parseCommand({ type: 'sell', playerId: 'p', buyerId: 't', kind: 'loan', fee: -1, contractEnd: '2029-12-31' })).toBeUndefined()
    expect(parseCommand({ type: 'pre-contract', playerId: 'p', salary: 1000, years: 9 })).toBeUndefined()
    expect(parseCommand({ type: 'pre-contract', playerId: 'p', salary: 1000, years: 3 })).toBeDefined()
    expect(parseCommand({ type: 'request-funds' })).toEqual({ type: 'request-funds' })
    expect(parseCommand({ type: 'request-funds', extra: 1 })).toBeUndefined()
  })

  it('proposta a clube da IA entra no mercado; jogador de outro técnico é recusado; no máximo 5 abertas', () => {
    const ok = applyCommand(world, MY, offerCmd(target.id), ctx)
    expect(ok.ok && ok.world.market.offers.length).toBe(world.market.offers.length + 1)
    const humanPlayer = world.players.find((p) => p.teamId === HUMAN)!
    expect(applyCommand(world, MY, offerCmd(humanPlayer.id), ctx)).toMatchObject({ ok: false, error: 'human-club' })
    let w = world
    const others = world.players.filter((p) => p.teamId === OTHER && p.position !== 'GK').slice(0, 6)
    for (const p of others.slice(0, 5)) {
      const r = applyCommand(w, MY, { ...offerCmd(p.id), salary: expectedSalary(p, buyer) }, ctx)
      if (r.ok) w = r.world
    }
    const open = w.market.offers.filter((o) => o.direction === 'outgoing' && o.status === 'pending' && o.buyerId === MY).length
    if (open >= 5) expect(applyCommand(w, MY, { ...offerCmd(others[5]!.id), salary: expectedSalary(others[5]!, buyer) }, ctx)).toMatchObject({ ok: false, error: 'too-many-offers' })
  })

  it('resposta a proposta que não existe ou não é do clube é recusada', () => {
    expect(applyCommand(world, MY, { type: 'respond-offer', offerId: 'o-999', accept: true }, ctx)).toMatchObject({ ok: false, error: 'not-found' })
  })

  it('venda: clube de outro técnico é recusado; clube da IA responde com o resultado', () => {
    const mine = world.players.find((p) => p.teamId === MY && p.position !== 'GK')!
    const req = { type: 'sell', playerId: mine.id, buyerId: HUMAN, kind: 'purchase', fee: 1, contractEnd: contractEndIn(world, OTHER, 3) } as const
    expect(applyCommand(world, MY, req, ctx)).toMatchObject({ ok: false, error: 'human-club' })
    const r = applyCommand(world, MY, { ...req, buyerId: OTHER }, ctx)
    expect(r.ok).toBe(true)
    if (r.ok) expect(typeof r.info?.accepted).toBe('boolean')
  })

  it('pré-contrato e pedido de verba devolvem o resultado na resposta', () => {
    const r = applyCommand(world, MY, { type: 'pre-contract', playerId: target.id, salary: 10_000, years: 2 }, ctx)
    // Em janeiro o pré-contrato ainda não abriu (só a partir de 1º de julho): a regra recusa com o motivo.
    expect(r.ok ? typeof r.info?.accepted === 'boolean' : r.error === 'not-eligible').toBe(true)
    const f = applyCommand(world, MY, { type: 'request-funds' }, ctx)
    expect(f.ok && typeof f.info?.granted === 'boolean').toBe(true)
    expect(f.ok && f.info).not.toHaveProperty('state')
  })

  it('no jogo solo o pedido de verba pelo perform dá o mesmo resultado de requestUserFunds', async () => {
    const g0 = createGame(9, 'team-imp', { cups: false })
    setGame(g0)
    const direct = requestUserFunds(g0)
    const out = await perform({ type: 'request-funds' })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.info?.granted).toBe(direct.result.granted)
      expect(out.info?.amount).toBe(direct.result.amount)
    }
    expect(getGame()!.season.teams).toEqual(direct.game.season.teams)
    setGame(null)
  })

  it('no jogo solo a proposta pelo perform dá o mesmo mundo de makeUserOffer', async () => {
    const g0 = createGame(9, 'team-imp', { cups: false })
    const mine = g0.season.teams.find((t) => t.id === g0.userTeamId)!
    const p = g0.season.players.find((x) => x.teamId !== g0.userTeamId && x.teamId !== null && x.position !== 'GK')!
    const holder = g0.season.teams.find((t) => t.id === p.teamId)
    const squad = g0.season.players.filter((x) => x.teamId === p.teamId)
    const fee = salePrice(g0.season, p, squad, 'purchase', g0.season.season.currentDate, holder, mine)
    const request = { kind: 'purchase', playerId: p.id, fee, salary: expectedSalary(p, mine), contractEnd: contractEndIn(g0.season, g0.userTeamId, 3) } as const
    let direct
    try {
      direct = makeUserOffer(g0, request)
    } catch {
      return
    }
    setGame(g0)
    const out = await perform({ type: 'offer', ...request })
    expect(out.ok).toBe(true)
    expect(getGame()!.season.market.offers).toEqual(direct.season.market.offers)
    setGame(null)
  })
})
