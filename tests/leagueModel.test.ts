import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { inPreContractWindow, preContractOpensOn, preContractsOpen, transferWindows, windowAt } from '../src/engine/market'
import { settleDueContracts } from '../src/engine/offseason'
import { buildLeagueRounds, advanceToNextEvent, contractEndOn, createSeason, roundSlots, venueViolations } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { createRng } from '../src/engine/rng'
import type { Match, Player, Team } from '../src/engine/types'

const world = generateWorld({ seed: 13 })
const fresh = () => createSeason({ year: 2026, seed: 'liga', teams: world.teams, players: world.players, academy: world.academy })

describe('contratos com data', () => {
  it('o contrato padrão termina no fim do ano do calendário', () => {
    expect(contractEndOn(2027)).toBe('2027-12-31')
  })

  it('o pré-contrato abre seis meses antes do fim do contrato de cada jogador', () => {
    expect(preContractOpensOn('2026-12-31')).toBe('2026-07-01')
    expect(preContractOpensOn('2027-06-30')).toBe('2027-01-01')
    expect(preContractOpensOn('2026-03-15')).toBe('2025-10-01')
    const p = { contract: { salary: 1, endDate: '2027-06-30', releaseClause: 1 } }
    expect(inPreContractWindow(p, '2026-12-31')).toBe(false)
    expect(inPreContractWindow(p, '2027-01-01')).toBe(true)
    expect(inPreContractWindow(p, '2027-06-30')).toBe(true)
    expect(inPreContractWindow(p, '2027-07-01')).toBe(false)
  })

  it('no calendário padrão o pré-contrato continua abrindo em 1º de julho', () => {
    const s = fresh()
    expect(preContractsOpen({ season: { ...s.season, currentDate: '2026-06-30' } })).toBe(false)
    expect(preContractsOpen({ season: { ...s.season, currentDate: '2026-07-01' } })).toBe(true)
  })

  /** Estado em 1º de junho com um jogador do técnico e um da IA com contrato até 30/6. */
  function withJuneContracts() {
    const base = fresh()
    const userTeamId = world.teams[0]!.id
    const aiTeamId = world.teams[1]!.id
    const mine = base.players.find((p) => p.teamId === userTeamId && p.position !== 'GK')!
    const theirs = base.players.find((p) => p.teamId === aiTeamId && p.position !== 'GK')!
    const shorten = (p: Player): Player => ({ ...p, contract: { ...p.contract, endDate: '2026-06-30' } })
    const state: SeasonState = {
      ...base,
      season: { ...base.season, currentDate: '2026-06-01' },
      players: base.players.map((p) => (p.id === mine.id || p.id === theirs.id ? shorten(p) : p)),
    }
    return { state, userTeamId, aiTeamId, mine: mine.id, theirs: theirs.id }
  }

  it('o contrato acaba na data dele: o do técnico vira livre e avisa, o da IA é renovado ou liberado', () => {
    const { state, userTeamId, mine, theirs } = withJuneContracts()
    const before = settleDueContracts(state, '2026-06-01', '2026-06-29', userTeamId)
    expect(before.state).toBe(state)
    const done = settleDueContracts(state, '2026-06-29', '2026-06-30', userTeamId)
    const m = done.state.players.find((p) => p.id === mine)!
    expect(m.teamId).toBeNull()
    expect(done.notices).toEqual([{ type: 'contract-ended', playerId: mine }])
    expect(done.state.teams.find((t) => t.id === userTeamId)!.squad).not.toContain(mine)
    const t = done.state.players.find((p) => p.id === theirs)!
    expect(done.freed.includes(theirs) ? t.teamId === null : t.contract.endDate > '2026-06-30').toBe(true)
  })

  it('o avanço do técnico para no dia em que o contrato de um jogador dele acaba', () => {
    const { state: june, userTeamId, mine } = withJuneContracts()
    // Sem jogos em junho: o próximo evento depois de 30/6 é uma partida de julho.
    const state: SeasonState = { ...june, matches: june.matches.filter((m) => m.date >= '2026-07-04') }
    const step = advanceToNextEvent(state, { userTeamId })
    expect(step.event).toEqual({ type: 'market', date: '2026-06-30' })
    expect(step.state.season.currentDate).toBe('2026-06-30')
    expect(step.notices).toEqual([{ type: 'contract-ended', playerId: mine }])
    expect(step.state.players.find((p) => p.id === mine)!.teamId).toBeNull()
    // Sem partida nenhuma no meio: as da temporada ainda estão por jogar.
    expect(step.state.matches.every((m: Match) => m.status === 'scheduled')).toBe(true)
    // Sem o aviso de contrato, o avanço seguiria direto para a partida.
    expect(advanceToNextEvent({ ...state, players: state.players.map((p) => (p.id === mine ? { ...p, contract: { ...p.contract, endDate: '2026-12-31' } } : p)) }, { userTeamId }).event.type).toBe('matchday')
  })

  it('quem assinou pré-contrato muda de clube no dia em que o contrato acaba', () => {
    const { state, aiTeamId, theirs } = withJuneContracts()
    const squadSize = (id: string) => state.players.filter((p) => p.teamId === id).length
    const buyer = [...world.teams].filter((t) => t.id !== aiTeamId && t.id !== world.teams[0]!.id).sort((a, b) => squadSize(a.id) - squadSize(b.id))[0]!
    const withPre: SeasonState = {
      ...state,
      market: { ...state.market, preContracts: [{ playerId: theirs, fromTeamId: aiTeamId, toTeamId: buyer.id, salary: 40_000, years: 3, signedOn: '2026-02-01' }] },
    }
    const done = settleDueContracts(withPre, '2026-06-29', '2026-06-30')
    const p = done.state.players.find((x) => x.id === theirs)!
    expect(p.teamId).toBe(buyer.id)
    expect(p.contract).toMatchObject({ salary: 40_000, endDate: '2029-12-31' })
    expect(done.moved).toEqual([theirs])
    expect(done.state.market.preContracts).toHaveLength(0)
    expect(done.state.market.history.at(-1)).toMatchObject({ playerId: theirs, toTeamId: buyer.id, fee: 0 })
    expect(done.state.teams.find((t) => t.id === buyer.id)!.squad).toContain(theirs)
  })

  it('contratos que terminam no fim do ano continuam para a virada', () => {
    const s = fresh()
    const done = settleDueContracts(s, '2026-04-01', '2026-11-30', world.teams[0]!.id)
    expect(done.state).toBe(s)
  })
})

describe('janelas por região', () => {
  const s = fresh()
  const first = s.matches.map((m) => m.date).sort()[0]!

  it('Brasil é o padrão e não mudou', () => {
    const [pre, mid] = transferWindows(s.season, s.matches)
    expect(pre).toEqual({ name: 'pre-season', start: '2026-01-01', end: '2026-04-10' })
    expect(mid).toEqual({ name: 'mid-year', start: '2026-07-01', end: '2026-07-31' })
    expect(first).toBe('2026-04-11')
  })

  it('América do Sul fecha em 15 de março e a Europa abre em janeiro e de julho a agosto', () => {
    expect(transferWindows(s.season, s.matches, 'SA').map((w) => [w.start, w.end])).toEqual([['2026-01-01', '2026-03-15'], ['2026-07-01', '2026-07-31']])
    expect(transferWindows(s.season, s.matches, 'EU').map((w) => [w.name, w.start, w.end])).toEqual([
      ['mid-year', '2026-01-01', '2026-01-31'],
      ['pre-season', '2026-07-01', '2026-08-31'],
    ])
    expect(windowAt(s.season, s.matches, '2026-04-01', 'BR')?.name).toBe('pre-season')
    expect(windowAt(s.season, s.matches, '2026-04-01', 'SA')).toBeNull()
    expect(windowAt(s.season, s.matches, '2026-08-15', 'EU')?.name).toBe('pre-season')
    expect(windowAt(s.season, s.matches, '2026-08-15', 'BR')).toBeNull()
  })
})

describe('formato e calendário por liga', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`)

  it('turno único tem n − 1 rodadas e cada par se enfrenta uma vez', () => {
    for (const n of [12, 16, 20, 28]) {
      const rounds = buildLeagueRounds(ids(n), createRng(`single-${n}`), 1)
      expect(rounds).toHaveLength(n - 1)
      const pairs = new Set(rounds.flat().map((f) => [f.homeTeamId, f.awayTeamId].sort().join('|')))
      expect(pairs.size).toBe((n * (n - 1)) / 2)
      for (const r of rounds) expect(new Set(r.flatMap((f) => [f.homeTeamId, f.awayTeamId])).size).toBe(n)
      expect(venueViolations(rounds)).toBe(0)
    }
  })

  it('ida e volta continua com 2 × (n − 1) rodadas', () => {
    expect(buildLeagueRounds(ids(16), createRng(4))).toHaveLength(30)
    expect(buildLeagueRounds(ids(16), createRng(4), 2)).toHaveLength(30)
  })

  it('o início da primeira rodada vem da liga', () => {
    expect(roundSlots(2026, 10)[0]!.days[0]).toBe('2026-04-11')
    expect(roundSlots(2026, 10, [8, 10])[0]!.days[0]).toBe('2026-08-15')
    expect(roundSlots(2026, 10, [2, 1])[0]!.days[0]).toBe('2026-02-07')
  })

  it('createSeason usa região, início e turno único de cada liga', () => {
    const teams = world.teams.filter((t) => t.tier === 1) as Team[]
    const state = createSeason({
      year: 2026,
      seed: 'formato',
      teams,
      players: world.players.filter((p) => teams.some((t) => t.id === p.teamId)),
      competitions: [{ id: 'liga-x', name: 'Liga X', tier: 1, teams, rounds: 1, start: [8, 10], region: 'EU' }],
    })
    const c = state.season.competitions[0]!
    expect(c).toMatchObject({ roundCount: 19, region: 'EU', start: [8, 10], rounds: 1 })
    expect(state.matches).toHaveLength(190)
    expect(state.matches[0]!.date).toBe('2026-08-15')
  })
})
