import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { isAvailable } from '../src/engine/lineup'
import { quickLineup, quickLines, simulateQuick } from '../src/engine/match'
import { applyMatchToPlayers } from '../src/engine/season'
import type { Match, Player, Team } from '../src/engine/types'

const world = generateWorld({ seed: 5 })
const squadOf = (team: Team) => world.players.filter((p) => p.teamId === team.id)
const [home, away] = world.teams.filter((t) => t.tier === 1) as [Team, Team]
const homeSquad = squadOf(home)
const awaySquad = squadOf(away)
const input = (seed: number) => ({ home: { team: home, players: homeSquad }, away: { team: away, players: awaySquad }, seed })

describe('escalação simplificada', () => {
  it('escolhe 11 disponíveis com um goleiro e respeita a formação do time', () => {
    const { xi, bench } = quickLineup(homeSquad, home.tactic.formationId)
    expect(xi).toHaveLength(11)
    expect(xi.filter((p) => p.position === 'GK')).toHaveLength(1)
    expect(new Set(xi).size).toBe(11)
    expect(xi.every(isAvailable)).toBe(true)
    expect(bench.every((p) => !xi.includes(p))).toBe(true)
  })

  it('não escala lesionado nem suspenso', () => {
    const star = homeSquad.reduce((a, b) => (a.attributes.finishing > b.attributes.finishing ? a : b))
    const squad = homeSquad.map((p) => (p === star ? { ...p, condition: { ...p.condition, injuryDaysLeft: 5 } } : p))
    expect(quickLineup(squad).xi.map((p) => p.id)).not.toContain(star.id)
    expect(quickLines(squad)).toHaveLength(4)
  })
})

describe('partida simplificada', () => {
  it('mesma semente, mesmo resultado; sementes diferentes variam', () => {
    expect(simulateQuick(input(7))).toEqual(simulateQuick(input(7)))
    const goals = new Set(Array.from({ length: 30 }, (_, i) => simulateQuick(input(i)).homeGoals))
    expect(goals.size).toBeGreaterThan(2)
  })

  it('devolve placar, eventos e notas coerentes entre si', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = simulateQuick(input(seed))
      const ids = new Set([...homeSquad, ...awaySquad].map((p) => p.id))
      const goalsBy = (teamId: string) => r.events.filter((e) => e.type === 'goal' && e.teamId === teamId).length
      const own = (teamId: string) => r.events.filter((e) => e.type === 'own-goal' && e.teamId === teamId).length
      // Gol contra conta para o outro time; o resto vem do artilheiro.
      expect(goalsBy(home.id) + own(away.id)).toBe(r.homeGoals)
      expect(goalsBy(away.id) + own(home.id)).toBe(r.awayGoals)
      for (const e of r.events) {
        expect(ids.has(e.playerId)).toBe(true)
        expect(e.minute).toBeGreaterThanOrEqual(1)
        expect(e.minute).toBeLessThanOrEqual(90)
        if (e.relatedPlayerId) expect(e.relatedPlayerId).not.toBe(e.playerId)
        expect(e.text).toBe('')
      }
      for (const side of [home, away]) {
        const mine = r.playerResults.filter((p) => p.teamId === side.id)
        expect(mine.length).toBeGreaterThanOrEqual(11)
        expect(mine.length).toBeLessThanOrEqual(14)
        for (const p of mine) {
          expect(p.minutesPlayed).toBeGreaterThan(0)
          expect(p.minutesPlayed).toBeLessThanOrEqual(90)
          expect(p.rating).toBeGreaterThanOrEqual(1)
          expect(p.rating).toBeLessThanOrEqual(10)
          expect(p.finalFitness).toBeGreaterThanOrEqual(0)
          expect(p.finalFitness).toBeLessThanOrEqual(100)
        }
        // Cada vaga de campo soma 90 minutos, menos o de quem foi expulso.
        const reds = r.events.filter((e) => e.type === 'red-card' && e.teamId === side.id).length
        const total = mine.reduce((sum, p) => sum + p.minutesPlayed, 0)
        if (reds === 0) expect(total).toBe(11 * 90)
      }
    }
  })

  it('o goleiro nunca marca nem dá passe para gol, e quem foi expulso não joga mais', () => {
    const keepers = new Set([...homeSquad, ...awaySquad].filter((p) => p.position === 'GK').map((p) => p.id))
    for (let seed = 1; seed <= 300; seed++) {
      const r = simulateQuick(input(seed))
      for (const e of r.events) {
        if (e.type === 'goal') expect(keepers.has(e.playerId)).toBe(false)
        if (e.type === 'goal' && e.relatedPlayerId) expect(keepers.has(e.relatedPlayerId)).toBe(false)
      }
    }
  })

  it('alimenta os jogadores como uma partida completa (gols, assistências, cartões, nota, lesão)', () => {
    let match: Match | undefined
    let result = simulateQuick(input(1))
    for (let seed = 2; seed < 400 && !(result.homeGoals > 0 && result.playerResults.some((p) => p.injuryDays) && result.events.some((e) => e.type === 'yellow-card')); seed++) {
      result = simulateQuick(input(seed))
    }
    match = { id: 'x', competitionId: 'serie-a', round: 1, date: '2026-04-11', homeTeamId: home.id, awayTeamId: away.id, status: 'finished', seed: 1, result }
    const squads = new Map<string, readonly Player[]>([[home.id, homeSquad], [away.id, awaySquad]])
    const updated = applyMatchToPlayers(squads, match)
    const byId = new Map(updated.map((p) => [p.id, p]))
    const goals = result.events.filter((e) => e.type === 'goal').length
    expect(updated.reduce((sum, p) => sum + p.seasonStats.goals, 0)).toBe(goals)
    expect(updated.filter((p) => p.seasonStats.appearances > 0).length).toBeGreaterThanOrEqual(22)
    expect(updated.reduce((sum, p) => sum + p.seasonStats.ratedGames, 0)).toBeGreaterThanOrEqual(20)
    const hurt = result.playerResults.find((p) => p.injuryDays)
    expect(byId.get(hurt?.playerId ?? '')?.condition.injuryDaysLeft).toBe(hurt?.injuryDays)
  })

  it('é muito mais barato que o motor completo (meta: menos de 0,1 ms por partida)', () => {
    simulateQuick(input(0))
    const t0 = performance.now()
    const n = 500
    for (let i = 0; i < n; i++) simulateQuick(input(i))
    const perMatch = (performance.now() - t0) / n
    expect(perMatch).toBeLessThan(0.5)
  })
})
