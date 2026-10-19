import { describe, expect, it } from 'vitest'
import { buildScaleWorld } from '../src/diagnostics/scaleWorld'
import type { LeagueSpec } from '../src/diagnostics/scaleWorld'
import { MARKET } from '../src/engine/config'
import { runMarketTick } from '../src/engine/market'
import {
  actsThisRound,
  advanceToNextEvent,
  computeStandings,
  createSeason,
  nextEvent,
  pyramidOfTeam,
  quickCompetitionIds,
  quickTeamIds,
  refocus,
  simulateToSeasonEnd,
  warmUp,
} from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import type { Match } from '../src/engine/types'

// Um mundo pequeno com duas pirâmides: o Brasil (A e B, ligadas) e o Uruguai (uma divisão só, em turno único).
const SPECS: LeagueSpec[] = [
  { id: 'br-1', name: 'Brasil A', region: 'BR', teams: 12, format: 'double', tier: 1, repTop: 19, repBottom: 7 },
  { id: 'br-2', name: 'Brasil B', region: 'BR', teams: 12, format: 'double', tier: 2, repTop: 8, repBottom: 3 },
  { id: 'uy-1', name: 'Uruguai', region: 'SA', teams: 12, format: 'single', tier: 1, repTop: 11, repBottom: 3 },
]

const built = buildScaleWorld(SPECS, 5)
const brazilTeam = built.competitions[0]?.teams[3]?.id as string
const uruguayTeam = built.competitions[2]?.teams[3]?.id as string

const fresh = (focus?: string): SeasonState =>
  createSeason({ year: 2026, seed: 'fidelidade', teams: built.teams, players: built.players, academy: built.academy, competitions: built.competitions, ...(focus !== undefined ? { focus } : {}) })

const finished = (s: SeasonState, competitionId: string) => s.matches.filter((m) => m.competitionId === competitionId && m.status === 'finished')

describe('foco do técnico', () => {
  it('sem foco todas as competições são lance a lance', () => {
    const s = fresh()
    expect(quickCompetitionIds(s).size).toBe(0)
    expect(quickTeamIds(s).size).toBe(0)
  })

  it('com foco só a pirâmide do técnico é lance a lance', () => {
    const s = fresh('br')
    expect([...quickCompetitionIds(s)]).toEqual(['uy-1'])
    expect(quickTeamIds(s).size).toBe(7)
    expect(pyramidOfTeam(s, brazilTeam)).toBe('br')
    expect(pyramidOfTeam(s, uruguayTeam)).toBe('uy')
  })

  it('o foco de uma pirâmide só (o jogo de hoje) não simplifica nada', () => {
    expect(quickCompetitionIds({ focus: 'default', season: { competitions: [{ id: 'serie-a' }, { id: 'serie-b' }] } } as unknown as SeasonState).size).toBe(0)
  })
})

describe('temporada com ligas simplificadas', () => {
  const end = simulateToSeasonEnd(fresh('br'))

  it('todas as ligas terminam, com a tabela completa', () => {
    for (const c of end.season.competitions) {
      const rounds = c.id === 'uy-1' ? 1 : 2
      const matches = finished(end, c.id)
      expect(matches).toHaveLength(c.teamIds.length * (c.teamIds.length - 1) * (rounds / 2))
      const table = computeStandings(c.teamIds, matches)
      for (const row of table) expect(row.played).toBe((c.teamIds.length - 1) * rounds)
    }
  })

  it('a liga simplificada também gera artilharia, assistências, cartões, notas e lesões', () => {
    const ids = new Set(built.competitions[2]?.teams.map((t) => t.id))
    const players = end.players.filter((p) => p.teamId && ids.has(p.teamId))
    const goals = players.reduce((n, p) => n + p.seasonStats.goals, 0)
    const matches = finished(end, 'uy-1')
    const teamGoals = matches.reduce((n, m) => n + (m.result?.homeGoals ?? 0) + (m.result?.awayGoals ?? 0), 0)
    expect(goals).toBeGreaterThan(teamGoals * 0.9)
    expect(players.reduce((n, p) => n + p.seasonStats.assists, 0)).toBeGreaterThan(goals * 0.3)
    expect(players.reduce((n, p) => n + p.seasonStats.yellowCards, 0)).toBeGreaterThan(100)
    expect(players.filter((p) => p.seasonStats.ratedGames > 0).length).toBeGreaterThan(players.length * 0.6)
    const top = Math.max(...players.map((p) => p.seasonStats.goals))
    expect(top).toBeGreaterThanOrEqual(7)
    expect(top).toBeLessThanOrEqual(35)
    // O elenco teve baixas por lesão em algum momento (nota guardada na forma e na moral, que se mexem).
    expect(players.some((p) => p.condition.form > 0)).toBe(true)
  })

  it('os resultados enxutos ficam na temporada, sem narração nem notas', () => {
    for (const m of finished(end, 'uy-1')) {
      expect(m.result?.playerResults).toEqual([])
      expect(m.result?.events.every((e) => e.text === '')).toBe(true)
    }
  })

  it('a mesma semente dá a mesma temporada', () => {
    const again = simulateToSeasonEnd(fresh('br'))
    expect(again.matches.map((m) => m.result?.homeGoals)).toEqual(end.matches.map((m) => m.result?.homeGoals))
  })
})

describe('mudar de liga', () => {
  it('a liga do clube novo passa a ser lance a lance e a antiga vira simplificada', () => {
    const s = refocus(fresh('br'), uruguayTeam)
    expect(s.focus).toBe('uy')
    expect(new Set(quickCompetitionIds(s))).toEqual(new Set(['br-1', 'br-2']))
    // Clube desconhecido ou da mesma pirâmide não muda nada.
    expect(refocus(s, 'nao-existe')).toBe(s)
    expect(refocus(s, uruguayTeam)).toBe(s)
  })

  it('as rodadas já jogadas ficam como estão e as seguintes mudam de fidelidade', () => {
    let s = fresh('br')
    // Joga algumas rodadas com o Uruguai simplificado.
    for (let i = 0; i < 4; i++) s = advanceToNextEvent(s).state
    const before = finished(s, 'uy-1')
    expect(before.length).toBeGreaterThan(0)
    s = refocus(s, uruguayTeam)
    let fullGame: Match | undefined
    let quickGame: Match | undefined
    for (let i = 0; i < 6; i++) {
      const step = advanceToNextEvent(s)
      s = step.state
      fullGame ??= step.played.find((m) => m.competitionId === 'uy-1')
      quickGame ??= step.played.find((m) => m.competitionId === 'br-1')
    }
    // Lance a lance tem narração; simplificado, não.
    expect(fullGame?.result?.events.some((e) => e.text !== '')).toBe(true)
    expect(quickGame?.result?.events.every((e) => e.text === '')).toBe(true)
    // Os jogos que já tinham sido decididos não mudam.
    expect(finished(s, 'uy-1').slice(0, before.length).map((m) => m.result?.homeGoals)).toEqual(before.map((m) => m.result?.homeGoals))
  })
})

describe('pré-aquecimento', () => {
  const start = fresh('br')

  it('joga pelo simplificado tudo o que veio antes da data e deixa o resto', () => {
    const date = '2026-06-01'
    const warm = warmUp(start, date)
    expect(warm.season.currentDate).toBe(date)
    const before = warm.matches.filter((m) => m.date < date)
    expect(before.length).toBeGreaterThan(10)
    expect(before.every((m) => m.status === 'finished')).toBe(true)
    expect(warm.matches.filter((m) => m.date >= date).every((m) => m.status === 'scheduled')).toBe(true)
    expect(nextEvent(warm)).toEqual({ type: 'matchday', date: warm.matches.find((m) => m.date >= date)?.date })
    // Tabela e artilharia já têm o que mostrar.
    const table = computeStandings(warm.season.competitions[2]?.teamIds ?? [], finished(warm, 'uy-1'))
    expect(table.some((r) => r.played > 0)).toBe(true)
    expect(warm.players.some((p) => p.seasonStats.goals > 0)).toBe(true)
  })

  it('é determinístico, barato e não faz nada para uma data que já passou', () => {
    const t0 = performance.now()
    const a = warmUp(start, '2026-09-01')
    const ms = performance.now() - t0
    const b = warmUp(start, '2026-09-01')
    expect(a.matches.map((m) => m.result?.homeGoals)).toEqual(b.matches.map((m) => m.result?.homeGoals))
    expect(ms).toBeLessThan(2000)
    expect(warmUp(a, '2026-03-01')).toBe(a)
  })
})

describe('rodízio das negociações fora do foco', () => {
  it('os clubes do foco agem sempre e os de fora um em cada rodada de K', () => {
    const quick = quickTeamIds(fresh('br'))
    const K = MARKET.rotation.outOfFocusEvery
    expect(actsThisRound(quick, brazilTeam, '2026-01-12')).toBe(true)
    const outside = [...quick]
    let acting = 0
    for (const id of outside) if (actsThisRound(quick, id, '2026-01-12')) acting++
    expect(acting).toBeGreaterThan(0)
    expect(acting).toBeLessThan(outside.length)
    // Em K semanas seguidas, todo clube de fora age pelo menos uma vez e nenhuma vez a mais que o razoável.
    for (const id of outside) {
      const turns = Array.from({ length: K }, (_, w) => actsThisRound(quick, id, new Date(Date.UTC(2026, 0, 12 + 7 * w)).toISOString().slice(0, 10)))
      expect(turns.filter(Boolean)).toHaveLength(1)
    }
  })

  it('numa rodada de negociações só uma parte dos clubes de fora compra', () => {
    const base = fresh('br')
    const count = (state: SeasonState) => {
      const before = new Map(state.players.map((p) => [p.id, p.teamId]))
      const tick = runMarketTick(state, '2026-01-12')
      const buyers = new Set<string>()
      for (const p of tick.state.players) {
        const was = before.get(p.id)
        if (p.teamId && was !== p.teamId) buyers.add(p.teamId)
      }
      return { buyers, quick: quickTeamIds(state) }
    }
    const withFocus = count(base)
    const outsideBuyers = [...withFocus.buyers].filter((id) => withFocus.quick.has(id))
    const allowed = [...withFocus.quick].filter((id) => actsThisRound(withFocus.quick, id, '2026-01-12'))
    for (const id of outsideBuyers) expect(allowed).toContain(id)
  })
})
