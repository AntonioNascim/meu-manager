import { describe, expect, it } from 'vitest'
import { buildScaleWorld } from '../src/diagnostics/scaleWorld'
import type { LeagueSpec } from '../src/diagnostics/scaleWorld'
import { createYouth } from '../src/data/generateYouth'
import { OFFSEASON } from '../src/engine/config'
import { advanceSeason } from '../src/engine/offseason'
import { createSeason, simulateToSeasonEnd } from '../src/engine/season'

// Duas pirâmides: o Brasil (A e B, ligadas) e o Uruguai (uma divisão só).
const SPECS: LeagueSpec[] = [
  { id: 'br-1', name: 'Brasil A', region: 'BR', teams: 12, format: 'double', tier: 1, repTop: 19, repBottom: 7 },
  { id: 'br-2', name: 'Brasil B', region: 'BR', teams: 12, format: 'double', tier: 2, repTop: 8, repBottom: 3 },
  { id: 'uy-1', name: 'Uruguai', region: 'SA', teams: 12, format: 'single', tier: 1, repTop: 11, repBottom: 3 },
]

const built = buildScaleWorld(SPECS, 5)
const start = createSeason({ year: 2026, seed: 'ligas', teams: built.teams, players: built.players, academy: built.academy, competitions: built.competitions })
const ended = simulateToSeasonEnd(start)
const turn = advanceSeason(ended, { createYouth })

describe('virada com várias ligas', () => {
  it('só a divisão mais baixa de cada pirâmide deixa de rebaixar: o Uruguai, sozinho, não troca ninguém', () => {
    const [a, b, uy] = start.season.competitions
    expect([a?.promotionSlots, a?.relegationSlots]).toEqual([0, 4])
    expect([b?.promotionSlots, b?.relegationSlots]).toEqual([4, 0])
    expect([uy?.promotionSlots, uy?.relegationSlots]).toEqual([0, 0])
  })

  it('quem sobe e cai troca de divisão dentro do Brasil e o Uruguai continua com os mesmos clubes', () => {
    const idsOf = (id: string, s = turn.state) => new Set(s.season.competitions.find((c) => c.id === id)?.teamIds)
    expect(turn.report.promoted).toHaveLength(4)
    expect(turn.report.relegated).toHaveLength(4)
    for (const id of turn.report.promoted) expect(idsOf('br-1').has(id)).toBe(true)
    for (const id of turn.report.relegated) expect(idsOf('br-2').has(id)).toBe(true)
    expect(idsOf('uy-1')).toEqual(idsOf('uy-1', ended))
    for (const c of turn.state.season.competitions) expect(c.teamIds).toHaveLength(12)
    for (const t of turn.state.teams) expect(t.tier).toBe(turn.state.season.competitions.find((c) => c.teamIds.includes(t.id))?.tier)
  })

  it('o relatório traz o campeão de cada liga e os campeões por série são os da primeira pirâmide', () => {
    expect(Object.keys(turn.report.championsByCompetition ?? {}).sort()).toEqual(['br-1', 'br-2', 'uy-1'])
    expect(turn.report.champions).toEqual([turn.report.championsByCompetition?.['br-1'], turn.report.championsByCompetition?.['br-2']])
  })

  it('a temporada nova mantém as ligas (nome, região, turno único) e as partidas de todas', () => {
    const next = turn.state.season.competitions
    expect(next.map((c) => c.id)).toEqual(['br-1', 'br-2', 'uy-1'])
    expect(next[2]).toMatchObject({ region: 'SA', rounds: 1, pyramid: 'uy' })
    expect(turn.state.matches.filter((m) => m.competitionId === 'uy-1')).toHaveLength(12 * 11 * 0.5)
  })
})

describe('reputação dos clubes grandes', () => {
  it('quem fica na divisão e está acima da média dela perde reputação devagar (tierPullAbove), em vez da puxada inteira', () => {
    const marked = { ...ended, teams: ended.teams.map((t) => (t.id === ended.season.competitions[0]?.teamIds[0] ? { ...t, reputation: 19 } : t.tier === 1 ? { ...t, reputation: 12 } : t)) }
    const id = ended.season.competitions[0]?.teamIds[0] as string
    const { report } = advanceSeason(marked, { createYouth })
    const position = report.finalPositions[id]?.position as number
    const stayed = !report.relegated.includes(id)
    const delta = Math.max(-OFFSEASON.reputation.positionMax, Math.min(OFFSEASON.reputation.positionMax, Math.round((1 - position) / OFFSEASON.reputation.positionStep)))
    if (stayed) expect(report.reputationChanges[id]?.to).toBeGreaterThanOrEqual(Math.floor(19 + delta + OFFSEASON.reputation.tierPullAbove * (12 - 19)) + (report.champions.includes(id) ? OFFSEASON.reputation.champion : 0))
    expect(OFFSEASON.reputation.tierPullAbove).toBeLessThan(OFFSEASON.reputation.tierPull)
  })
})
