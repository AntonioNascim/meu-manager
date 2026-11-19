import { describe, expect, it } from 'vitest'
import { PRESEASON } from '../src/engine/config'
import { expectedAnnualRevenue } from '../src/engine/finance'
import { applyCommand, applyPayload, buildFull, emptyMirror, parseCommand, toSeasonState } from '../src/engine/league'
import { applyPreseason, friendlyCandidates, friendlyDates, friendlyFee, friendlyGate, placeCost, planPreseason, preseasonInjuryFactor, preseasonTotals, preseasonWindow } from '../src/engine/preseason'
import { addDays } from '../src/engine/season/dates'
import type { SeasonState } from '../src/engine/season/calendar'
import type { Team } from '../src/engine/types'
import { advanceToMatchday, createGame, finishPendingMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { createLeagueWorld } from '../src/store/leagueWorld'

const USER = 'team-imp'
const game = () => createGame(3, USER, { cups: false })
const teamOf = (s: SeasonState, id = USER) => s.teams.find((t) => t.id === id) as Team
const choose = (s: SeasonState, n = 3) => friendlyCandidates(s, USER).slice(0, n).map((t) => t.id)

describe('pré-temporada: janela e regras', () => {
  it('abre no começo do mundo: 22 dias possíveis (1º/1 até o dia antes do jogo de 24/1), mínimo de 10', () => {
    const w = preseasonWindow(game().season, USER)
    expect(w.open).toBe(true)
    expect(w.minDays).toBe(10)
    expect(w.maxDays).toBe(22)
    expect(w.start).toBe(game().season.season.currentDate)
  })

  it('só aceita local, dias, adversários e quantidade válidos', () => {
    const s = game().season
    const ok = { place: 'country' as const, days: 14, opponents: choose(s, 2) }
    expect(() => planPreseason(s, USER, ok)).not.toThrow()
    expect(() => planPreseason(s, USER, { ...ok, days: 9 })).toThrow(/inválida/)
    expect(() => planPreseason(s, USER, { ...ok, days: 23 })).toThrow(/inválida/)
    expect(() => planPreseason(s, USER, { ...ok, place: 'lua' as never })).toThrow()
    expect(() => planPreseason(s, USER, { ...ok, opponents: choose(s, 6) })).toThrow(/Adversários/)
    expect(() => planPreseason(s, USER, { ...ok, opponents: [USER] })).toThrow(/Adversários/)
    expect(() => planPreseason(s, USER, { ...ok, opponents: [choose(s, 1)[0] as string, choose(s, 1)[0] as string] })).toThrow(/Adversários/)
    expect(() => planPreseason(s, USER, { ...ok, opponents: ['team-que-nao-existe'] })).toThrow(/Adversários/)
    expect(() => planPreseason(s, 'team-que-nao-existe', ok)).toThrow()
  })

  it('só uma vez por temporada', () => {
    const s = game().season
    const first = planPreseason(s, USER, { place: 'camp', days: 12, opponents: choose(s, 1) })
    expect(preseasonWindow(first, USER)).toMatchObject({ open: false, reason: 'planned' })
    expect(() => planPreseason(first, USER, { place: 'camp', days: 12, opponents: [] })).toThrow()
    const applied = applyCommand(first, USER, { type: 'preseason', place: 'camp', days: 12, opponents: [] })
    expect(applied).toMatchObject({ ok: false, error: 'preseason-done' })
  })

  it('depois do primeiro jogo da temporada a janela fecha', () => {
    let g: Game = game()
    while (!g.pendingUserMatch) g = advanceToMatchday(g)
    const live = beginLive(g)
    live.match.playUntil(120)
    g = finishPendingMatch(g, live.match.result())
    clearLive()
    expect(preseasonWindow(g.season, USER)).toMatchObject({ open: false, reason: 'started' })
    expect(applyCommand(g.season, USER, { type: 'preseason', place: 'camp', days: 12, opponents: [] })).toMatchObject({ ok: false, error: 'too-late' })
  })

  it('perto demais do primeiro jogo já não dá', () => {
    const s = game().season
    const late: SeasonState = { ...s, season: { ...s.season, currentDate: '2026-01-20' } }
    expect(preseasonWindow(late, USER)).toMatchObject({ open: false, reason: 'too-late' })
  })
})

describe('pré-temporada: custo, torcida e amistosos', () => {
  it('o local custa 0, 6% e 15% da receita mensal esperada e a torcida sobe 0, 3% e 6%', () => {
    const s = game().season
    const team = teamOf(s)
    const monthly = expectedAnnualRevenue(team) / 12
    expect(placeCost(team, 'camp')).toBe(0)
    expect(Math.abs(placeCost(team, 'country') - monthly * 0.06)).toBeLessThanOrEqual(500)
    expect(Math.abs(placeCost(team, 'abroad') - monthly * 0.15)).toBeLessThanOrEqual(500)
    for (const [place, fan] of [['camp', 0], ['country', 0.03], ['abroad', 0.06]] as const) {
      const next = teamOf(planPreseason(s, USER, { place, days: 12, opponents: [] }))
      expect(next.finances.balance).toBe(team.finances.balance - placeCost(team, place))
      expect(next.fanBase).toBe(Math.round(team.fanBase * (1 + fan)))
    }
    expect(PRESEASON.maxFriendlies).toBe(5)
  })

  it('os amistosos ficam dentro do acampamento, em dias diferentes e em ordem, e o cachê cresce com a reputação', () => {
    const s = game().season
    const next = teamOf(planPreseason(s, USER, { place: 'country', days: 14, opponents: choose(s, 5) }))
    const dates = next.preseason!.friendlies.map((f) => f.date)
    expect(dates).toHaveLength(5)
    expect(new Set(dates).size).toBe(5)
    expect([...dates].sort()).toEqual(dates)
    const start = s.season.currentDate
    expect(dates.every((d) => d > start && d < addDays(start, 13))).toBe(true)
    expect(friendlyDates(start, 14, 3)).toHaveLength(3)
    const me = teamOf(s)
    const strong = s.teams.reduce((a, b) => (b.reputation > a.reputation ? b : a))
    const weak = s.teams.reduce((a, b) => (b.reputation < a.reputation ? b : a))
    expect(friendlyFee(me, strong)).toBeGreaterThan(friendlyFee(me, weak))
    expect(friendlyGate(me, strong, 'abroad').revenue).toBeGreaterThan(friendlyGate(me, strong, 'country').revenue)
  })

  it('quem passa os dias joga os amistosos: resultado, público, renda, cachê e moral (até +3), fora do calendário e da tabela', () => {
    const s = game().season
    const planned = planPreseason(s, USER, { place: 'country', days: 20, opponents: choose(s, 5) })
    const matchesBefore = planned.matches.length
    const before = planned.players.filter((p) => p.teamId === USER).map((p) => p.condition.morale)
    const end = addDays(s.season.currentDate, 22)
    const after = applyPreseason(planned, s.season.currentDate, end)
    const plan = teamOf(after).preseason!
    expect(plan.friendlies.every((f) => f.result)).toBe(true)
    for (const f of plan.friendlies) {
      expect(f.result!.attendance).toBeGreaterThan(0)
      expect(f.result!.revenue).toBeGreaterThan(0)
    }
    const ledger = teamOf(after).finances.ledger
    expect(ledger.filter((e) => e.description?.startsWith('Cachê do amistoso')).length).toBe(5)
    expect(ledger.filter((e) => e.description?.startsWith('Amistoso contra')).length).toBe(5)
    // o calendário e a tabela não mudam
    expect(after.matches).toBe(planned.matches)
    expect(after.matches.length).toBe(matchesBefore)
    expect(after.matches.every((m) => m.status === 'scheduled')).toBe(true)
    // moral: +1 por vitória, no máximo +3 no total
    const wins = plan.friendlies.filter((f) => f.result!.goalsFor > f.result!.goalsAgainst).length
    const given = Math.min(PRESEASON.moraleCap, wins)
    expect(plan.moraleGiven).toBe(given)
    const afterMorale = after.players.filter((p) => p.teamId === USER).map((p) => p.condition.morale)
    afterMorale.forEach((m, i) => expect(m - (before[i] as number)).toBeLessThanOrEqual(PRESEASON.moraleCap))
    expect(afterMorale[0]! - before[0]!).toBe(given)
    const totals = preseasonTotals(teamOf(after))!
    expect(totals.played).toBe(5)
    expect(totals.wins).toBe(wins)
    expect(totals.revenue).toBe(plan.friendlies.reduce((a, f) => a + f.result!.revenue, 0))
  })

  it('o resultado é o mesmo em duas execuções (semente do mundo) e cada amistoso só é jogado uma vez', () => {
    const s = game().season
    const planned = planPreseason(s, USER, { place: 'camp', days: 15, opponents: choose(s, 3) })
    const end = addDays(s.season.currentDate, 18)
    const a = applyPreseason(planned, s.season.currentDate, end)
    const b = applyPreseason(planned, s.season.currentDate, end)
    expect(teamOf(a).preseason).toEqual(teamOf(b).preseason)
    expect(applyPreseason(a, s.season.currentDate, end)).toBe(a)
  })

  it('sem pré-temporada montada nada muda (o estado volta a mesma referência)', () => {
    const s = game().season
    expect(applyPreseason(s, s.season.currentDate, addDays(s.season.currentDate, 30))).toBe(s)
  })

  it('no avanço do jogo os amistosos acontecem sozinhos até o primeiro jogo', () => {
    let g: Game = game()
    g = { ...g, season: planPreseason(g.season, USER, { place: 'country', days: 14, opponents: choose(g.season, 3) }) }
    while (!g.pendingUserMatch) g = advanceToMatchday(g)
    const plan = teamOf(g.season).preseason!
    expect(plan.friendlies.every((f) => f.result)).toBe(true)
    expect(teamOf(g.season).finances.ledger.some((e) => e.description?.startsWith('Amistoso contra'))).toBe(true)
  })
})

describe('pré-temporada: lesão no exterior, comando e espelho', () => {
  it('só o acampamento no exterior pesa no risco de lesão, e só nos dias em que acontece', () => {
    const s = game().season
    const start = s.season.currentDate
    const abroad = teamOf(planPreseason(s, USER, { place: 'abroad', days: 12, opponents: [] }))
    const country = teamOf(planPreseason(s, USER, { place: 'country', days: 12, opponents: [] }))
    expect(preseasonInjuryFactor(abroad, start, addDays(start, 12))).toBeCloseTo(1.15, 6)
    expect(preseasonInjuryFactor(abroad, start, addDays(start, 24))).toBeCloseTo(1.075, 6)
    expect(preseasonInjuryFactor(abroad, addDays(start, 12), addDays(start, 20))).toBe(1)
    expect(preseasonInjuryFactor(country, start, addDays(start, 12))).toBe(1)
    expect(preseasonInjuryFactor(teamOf(s), start, addDays(start, 12))).toBe(1)
  })

  it('o comando confere o corpo e vale no mundo da liga online', () => {
    const world = createLeagueWorld(11, undefined, { cups: false })
    const my = world.season.competitions[0]!.teamIds[0]!
    const opponents = friendlyCandidates(world, my).slice(0, 2).map((t) => t.id)
    expect(parseCommand({ type: 'preseason', place: 'abroad', days: 14, opponents })).toEqual({ type: 'preseason', place: 'abroad', days: 14, opponents })
    expect(parseCommand({ type: 'preseason', place: 'lua', days: 14, opponents })).toBeUndefined()
    expect(parseCommand({ type: 'preseason', place: 'camp', days: 0, opponents })).toBeUndefined()
    expect(parseCommand({ type: 'preseason', place: 'camp', days: 14, opponents: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBeUndefined()
    expect(parseCommand({ type: 'preseason', place: 'camp', days: 14, opponents, extra: 1 })).toBeUndefined()
    const out = applyCommand(world, my, { type: 'preseason', place: 'country', days: 14, opponents })
    expect(out.ok).toBe(true)
    if (out.ok) {
      const first = buildFull(out.world, my, 1, 0)
      let m = applyPayload(emptyMirror(), first)
      for (let page = 1; page < (first.pages ?? 1); page++) m = applyPayload(m, buildFull(out.world, my, 1, page))
      const seen = toSeasonState(m)!.teams.find((t) => t.id === my)!
      expect(seen.preseason?.friendlies).toHaveLength(2)
      expect(seen.preseason?.place).toBe('country')
    }
    expect(applyCommand(world, my, { type: 'preseason', place: 'country', days: 5, opponents })).toMatchObject({ ok: false, error: 'invalid' })
  })
})
