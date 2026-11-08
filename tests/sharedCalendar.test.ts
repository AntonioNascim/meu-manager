import { describe, expect, it } from 'vitest'
import { loadWorld } from '../src/data/package/defaultPackage'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { eventDaysOf, type Seat } from '../src/engine/league'
import { windowOfTeam } from '../src/engine/market'
import { snapToCupGrid } from '../src/engine/cups'
import { advanceUntil, pyramidOf, sharedCupSpecs, sharedSetups } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { turnRunner } from '../src/store/game'
import { createLeagueWorld } from '../src/store/leagueWorld'

const pkg = buildScalePackage(7)
const solo = createLeagueWorld(7, pkg)
const shared = createLeagueWorld(7, pkg, { shared: true })

/** Um técnico por país (o primeiro clube da primeira divisão). */
const humanTeams = (world: SeasonState): Seat[] => {
  const seen = new Set<string>()
  const seats: Seat[] = []
  for (const c of world.season.competitions.filter((x) => x.tier === 1)) {
    const key = pyramidOf(c)
    if (seen.has(key) || !c.teamIds[0]) continue
    seen.add(key)
    seats.push({ teamId: c.teamIds[0], playerId: `h-${key}`, status: 'active', ready: false })
  }
  return seats
}

describe('calendário comum da liga online (Fase 6D)', () => {
  it('o mundo é de ano civil único, sem pausas, e todas as ligas e janelas são marcadas como comuns', () => {
    expect(shared.season.competitions.length).toBeGreaterThan(10)
    expect(shared.season.competitions.every((c) => c.shared === true && c.split !== true && c.gapEvery === 0)).toBe(true)
    expect(Object.values(shared.cycles).every((c) => c.split === false && c.end === `${shared.season.year}-12-31`)).toBe(true)
    // O mundo de antes (e o jogo solo) segue o calendário de cada país: há temporada que atravessa o ano.
    expect(Object.values(solo.cycles).some((c) => c.split)).toBe(true)
    expect(solo.season.competitions.some((c) => c.shared)).toBe(false)
  })

  it('a rodada N de toda liga cai no mesmo dia (sábado, ou a mesma quarta), de qualquer país', () => {
    const rounds = new Map<number, Set<string>>()
    for (const m of shared.matches) {
      if (m.cup !== undefined) continue
      rounds.set(m.round, (rounds.get(m.round) ?? new Set()).add(m.date))
    }
    expect(rounds.size).toBeGreaterThanOrEqual(30)
    // Cada rodada é um dia só em todas as ligas (as ligas curtas só deixam de ter as rodadas finais).
    for (const [round, days] of rounds) expect([...days], `rodada ${round}`).toHaveLength(1)
    // Antes, a mesma rodada tinha datas diferentes (fins de semana de países diferentes).
    const before = new Map<number, Set<string>>()
    for (const m of solo.matches) if (m.cup === undefined) before.set(m.round, (before.get(m.round) ?? new Set()).add(m.date))
    expect([...before.values()].some((d) => d.size > 1)).toBe(true)
  })

  it('os eventos dos técnicos de países diferentes coincidem: nas rodadas de liga todos jogam juntos', () => {
    const seats = humanTeams(shared)
    expect(seats.length).toBeGreaterThanOrEqual(5)
    const human = new Set(seats.map((s) => s.teamId))
    const lastRound = new Map(shared.season.competitions.map((c) => [c.id, shared.matches.filter((m) => m.competitionId === c.id && m.cup === undefined).reduce((d, m) => (m.date > d ? m.date : d), '')]))
    const compOf = (id: string) => shared.season.competitions.find((c) => c.teamIds.includes(id))!
    const days = new Map<string, Set<string>>()
    for (const m of shared.matches) {
      if (m.cup !== undefined) continue
      for (const id of [m.homeTeamId, m.awayTeamId]) if (human.has(id)) days.set(m.date, (days.get(m.date) ?? new Set()).add(id))
    }
    for (const [date, playing] of days) {
      const active = seats.filter((s) => (lastRound.get(compOf(s.teamId).id) ?? '') >= date)
      expect(active.every((s) => playing.has(s.teamId)), date).toBe(true)
    }
    const eventsBefore = eventDaysOf(solo, humanTeams(solo)).length
    const eventsAfter = eventDaysOf(shared, seats).length
    expect(eventsAfter).toBeLessThan(eventsBefore * 0.7)
  })

  it('nenhuma partida passa do fim da temporada e as copas mundiais ficam de fora', () => {
    const end = `${shared.season.year}-12-31`
    expect(shared.matches.filter((m) => m.date > end)).toHaveLength(0)
    expect(shared.cups?.some((c) => c.spec.world !== undefined)).toBe(false)
    expect(shared.cups?.length).toBeGreaterThan(5)
  })

  it('as copas caem em quartas-feiras (a grade comum) e terminam dentro da temporada', () => {
    const grid = `${shared.season.year}-01-01`
    const cupDays = new Set(shared.matches.filter((m) => m.cup !== undefined).map((m) => m.date))
    expect(cupDays.size).toBeGreaterThan(5)
    // Quase todas as datas de copa estão na grade; as poucas fora dela são deslocamentos por conflito de calendário.
    const onGrid = [...cupDays].filter((d) => snapToCupGrid(d, grid) === d).length
    expect(onGrid / cupDays.size).toBeGreaterThan(0.8)
    expect(snapToCupGrid('2026-01-01', grid)).toBe('2026-01-07')
    expect(snapToCupGrid('2026-01-08', grid)).toBe('2026-01-14')
  })

  it('todos os clubes seguem as mesmas janelas de transferência (o mercado entre técnicos precisa das duas abertas)', () => {
    const [a, b] = humanTeams(shared) as [Seat, Seat]
    const euro = shared.season.competitions.find((c) => c.region === 'EU')!
    for (const date of ['2026-01-10', '2026-02-20', '2026-07-10', '2026-09-15']) {
      expect(windowOfTeam(shared, date, a.teamId)?.name).toBe(windowOfTeam(shared, date, b.teamId)?.name)
      expect(windowOfTeam(shared, date, euro.teamIds[0]!)?.name).toBe(windowOfTeam(shared, date, a.teamId)?.name)
    }
  })

  it('o ajuste dos calendários é puro e não mexe no que foi dado', () => {
    const world = loadWorld(7, pkg)
    const original = JSON.stringify(world.competitions)
    const setups = sharedSetups(world.competitions ?? [])
    expect(setups.every((s) => s.shared === true && s.split === false && s.start?.join('-') === '1-24')).toBe(true)
    expect(JSON.stringify(world.competitions)).toBe(original)
    const specs = sharedCupSpecs(world.cups ?? [], world.competitions ?? [])
    expect(specs.some((s) => s.world)).toBe(false)
  })

  it('a virada de temporada continua no calendário comum: o ano seguinte tem as mesmas datas para todos', () => {
    const turned = advanceUntil(shared, `${shared.season.year + 1}-01-02`, { turn: turnRunner, market: false })
    const state = turned.state
    expect(state.season.competitions.every((c) => c.shared === true)).toBe(true)
    expect(Object.values(state.cycles).every((c) => c.year === shared.season.year + 1 && c.split === false)).toBe(true)
    const next = new Map<number, Set<string>>()
    for (const m of state.matches) if (m.cup === undefined && m.status === 'scheduled') next.set(m.round, (next.get(m.round) ?? new Set()).add(m.date))
    expect(next.size).toBeGreaterThan(20)
    for (const [round, set] of next) expect([...set], `rodada ${round} do ano seguinte`).toHaveLength(1)
  }, 600_000)
})
