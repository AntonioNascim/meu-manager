/** Experimentos controlados (muitas partidas): o resultado depende dos jogadores e do estado deles. */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import { simulateMatch } from '../../src/engine/match'
import type { MatchInput } from '../../src/engine/match'
import type { MatchResult, Player, Team } from '../../src/engine/types'

const world = generateWorld({ seed: 2024 })
const squad = (team: Team) => world.players.filter((p) => p.teamId === team.id)
const team = (abbr: string) => world.teams.find((t) => t.abbreviation === abbr) as Team
const input = (home: Team, away: Team, seed: number): MatchInput => ({
  home: { team: home, players: squad(home) },
  away: { team: away, players: squad(away) },
  seed,
})

/** Mesmo time com jogadores alterados (para experimentos controlados). */
function changed(t: Team, change: (p: Player) => Player): { team: Team; players: Player[] } {
  return { team: t, players: squad(t).map(change) }
}

const withAttributes = (t: Team, change: (p: Player) => Partial<Player['attributes']>) =>
  changed(t, (p) => ({ ...p, attributes: { ...p.attributes, ...change(p) } }))

function runMany(n: number, make: (seed: number) => MatchInput): MatchResult[] {
  return Array.from({ length: n }, (_, i) => simulateMatch(make(i)))
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const homePoints = (rs: MatchResult[]) =>
  avg(rs.map((r) => (r.homeGoals > r.awayGoals ? 3 : r.homeGoals === r.awayGoals ? 1 : 0)))

describe('o resultado depende dos jogadores', () => {
  it('time muito mais forte vence quase sempre', () => {
    const results = runMany(300, (s) => input(team('IMP'), team('TAM'), s))
    const wins = results.filter((r) => r.homeGoals > r.awayGoals).length
    const losses = results.filter((r) => r.homeGoals < r.awayGoals).length
    expect(wins / results.length).toBeGreaterThan(0.7)
    expect(losses / results.length).toBeLessThan(0.1)
  })

  it('melhores finalizadores fazem mais gols', () => {
    const base = team('ARA')
    const rival = team('CER')
    const normal = runMany(400, (s) => input(base, rival, s))
    const sharp = runMany(400, (s) => ({
      home: withAttributes(base, (p) => ({ finishing: Math.min(100, p.attributes.finishing + 20) })),
      away: { team: rival, players: squad(rival) },
      seed: s,
    }))
    expect(avg(sharp.map((r) => r.homeGoals))).toBeGreaterThan(avg(normal.map((r) => r.homeGoals)) * 1.15)
  })

  it('goleiro melhor sofre menos gols', () => {
    const base = team('ARA')
    const rival = team('CER')
    const normal = runMany(400, (s) => input(rival, base, s))
    const walls = runMany(400, (s) => ({
      home: { team: rival, players: squad(rival) },
      away: withAttributes(base, (p) => (p.position === 'GK' ? { reflexes: 99, positioning: 99, rushingOut: 99 } : {})),
      seed: s,
    }))
    expect(avg(walls.map((r) => r.homeGoals))).toBeLessThan(avg(normal.map((r) => r.homeGoals)) * 0.85)
  })

  it('meio-campo melhor no passe fica mais com a bola', () => {
    const base = team('ARA')
    const rival = team('CER')
    const normal = runMany(200, (s) => input(base, rival, s))
    const passers = runMany(200, (s) => ({
      home: withAttributes(base, (p) => ({
        passing: Math.min(100, p.attributes.passing + 20),
        vision: Math.min(100, p.attributes.vision + 20),
        ballControl: Math.min(100, p.attributes.ballControl + 20),
      })),
      away: { team: rival, players: squad(rival) },
      seed: s,
    }))
    expect(avg(passers.map((r) => r.homeStats.possession))).toBeGreaterThan(avg(normal.map((r) => r.homeStats.possession)) + 4)
  })
})

describe('moral e forma pesam pouco, mas pesam', () => {
  const base = team('JAN')
  const rival = team('MAR')
  const N = 600

  it('elenco com moral alta rende mais que com moral baixa', () => {
    const high = runMany(N, (s) => ({
      home: changed(base, (p) => ({ ...p, condition: { ...p.condition, morale: 100 } })),
      away: { team: rival, players: squad(rival) },
      seed: s,
    }))
    const low = runMany(N, (s) => ({
      home: changed(base, (p) => ({ ...p, condition: { ...p.condition, morale: 10 } })),
      away: { team: rival, players: squad(rival) },
      seed: s,
    }))
    expect(homePoints(high)).toBeGreaterThan(homePoints(low) + 0.1)
  })

  it('elenco em boa forma rende mais que em má forma', () => {
    const good = runMany(N, (s) => ({
      home: changed(base, (p) => ({ ...p, condition: { ...p.condition, form: 8.5 } })),
      away: { team: rival, players: squad(rival) },
      seed: s,
    }))
    const bad = runMany(N, (s) => ({
      home: changed(base, (p) => ({ ...p, condition: { ...p.condition, form: 4.5 } })),
      away: { team: rival, players: squad(rival) },
      seed: s,
    }))
    expect(homePoints(good)).toBeGreaterThan(homePoints(bad) + 0.05)
  })
})
