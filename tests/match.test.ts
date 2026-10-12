import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { MATCH, RATING } from '../src/engine/config'
import { duelChance, simulateMatch } from '../src/engine/match'
import type { MatchInput } from '../src/engine/match'
import { playerRating } from '../src/engine/match/ratings'
import { createPitchPlayer } from '../src/engine/match/state'
import type { MatchResult, Player, Team } from '../src/engine/types'

const world = generateWorld({ seed: 2024 })
const squad = (team: Team) => world.players.filter((p) => p.teamId === team.id)
const team = (abbr: string) => world.teams.find((t) => t.abbreviation === abbr) as Team
const input = (home: Team, away: Team, seed: number): MatchInput => ({
  home: { team: home, players: squad(home) },
  away: { team: away, players: squad(away) },
  seed,
})

function runMany(n: number, make: (seed: number) => MatchInput): MatchResult[] {
  return Array.from({ length: n }, (_, i) => simulateMatch(make(i)))
}

describe('fórmula do duelo', () => {
  it('lados iguais têm 50%; vantagem aumenta a chance', () => {
    expect(duelChance(60, 60)).toBeCloseTo(0.5)
    expect(duelChance(70, 60)).toBeGreaterThan(0.5)
    expect(duelChance(50, 60)).toBeLessThan(0.5)
    expect(duelChance(70, 60)).toBeCloseTo(1 - duelChance(60, 70))
  })

  it('k está calibrado para a escala 1–100: 10 pontos ≈ 59%, 30 pontos ≈ 75%', () => {
    expect(duelChance(70, 60)).toBeGreaterThan(0.55)
    expect(duelChance(70, 60)).toBeLessThan(0.65)
    expect(duelChance(90, 60)).toBeGreaterThan(0.7)
    expect(duelChance(90, 60)).toBeLessThan(0.8)
  })

  it('o deslocamento torna a etapa mais difícil para o ataque', () => {
    expect(duelChance(60, 60, MATCH.offset.through)).toBeLessThan(0.5)
  })
})

describe('simulação de partida', () => {
  const home = team('IMP')
  const away = team('MON')

  it('mesma semente = mesmo resultado; sementes diferentes variam', () => {
    const a = simulateMatch(input(home, away, 99))
    const b = simulateMatch(input(home, away, 99))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const scores = new Set(runMany(20, (s) => input(home, away, s)).map((r) => `${r.homeGoals}-${r.awayGoals}`))
    expect(scores.size).toBeGreaterThan(3)
  })

  it('não altera os times e jogadores recebidos', () => {
    const before = JSON.stringify(world)
    runMany(5, (s) => input(home, away, s))
    expect(JSON.stringify(world)).toBe(before)
  })

  it('placar, eventos e estatísticas batem entre si', () => {
    for (const r of runMany(200, (s) => input(home, away, s))) {
      const count = (teamId: string, type: string) =>
        r.events.filter((e) => e.teamId === teamId && e.type === type).length
      for (const [t, goals, stats] of [
        [home, r.homeGoals, r.homeStats],
        [away, r.awayGoals, r.awayStats],
      ] as const) {
        expect(count(t.id, 'goal') + count(t.id, 'own-goal')).toBe(goals)
        expect(stats.shotsOnTarget).toBeLessThanOrEqual(stats.shots)
        expect(count(t.id, 'goal')).toBeLessThanOrEqual(stats.shotsOnTarget)
        expect(count(t.id, 'yellow-card')).toBe(stats.yellowCards)
        expect(count(t.id, 'red-card')).toBe(stats.redCards)
        expect(count(t.id, 'corner')).toBe(stats.corners)
        expect(count(t.id, 'foul')).toBe(stats.fouls)
        expect(count(t.id, 'substitution')).toBeLessThanOrEqual(MATCH.maxSubs)
        expect(stats.xg).toBeGreaterThanOrEqual(0)
      }
      expect(r.homeStats.possession + r.awayStats.possession).toBe(100)
      for (const e of r.events) {
        expect(e.minute).toBeGreaterThanOrEqual(1)
        expect(e.minute).toBeLessThanOrEqual(90)
        expect(e.text.length).toBeGreaterThan(0)
      }
      // eventos em ordem cronológica
      expect(r.events.map((e) => e.minute)).toEqual([...r.events.map((e) => e.minute)].sort((a, b) => a - b))
    }
  })

  it('notas, minutos e lesões são coerentes', () => {
    for (const r of runMany(200, (s) => input(home, away, s))) {
      for (const teamId of [home.id, away.id]) {
        const played = r.playerResults.filter((p) => p.teamId === teamId)
        const subs = r.events.filter((e) => e.teamId === teamId && e.type === 'substitution').length
        expect(played).toHaveLength(11 + subs)
      }
      for (const p of r.playerResults) {
        expect(p.rating).toBeGreaterThanOrEqual(RATING.min)
        expect(p.rating).toBeLessThanOrEqual(RATING.max)
        expect(p.minutesPlayed).toBeGreaterThanOrEqual(0)
        expect(p.minutesPlayed).toBeLessThanOrEqual(90)
      }
      for (const e of r.events.filter((ev) => ev.type === 'injury')) {
        const injured = r.playerResults.find((p) => p.playerId === e.playerId)
        expect(injured?.injuryDays).toBeGreaterThan(0)
      }
      for (const e of r.events.filter((ev) => ev.type === 'red-card')) {
        // Sai no minuto da expulsão (quem entrou depois do início joga menos que isso).
        const sentOff = r.playerResults.find((p) => p.playerId === e.playerId)
        expect(sentOff?.minutesPlayed).toBeLessThanOrEqual(e.minute)
        // Expulso não pode ser substituído depois.
        expect(r.events.some((ev) => ev.type === 'substitution' && ev.playerId === e.playerId && ev.minute > e.minute)).toBe(false)
      }
    }
  })

  it('roda em milissegundos', () => {
    const t0 = performance.now()
    runMany(100, (s) => input(home, away, s))
    expect((performance.now() - t0) / 100).toBeLessThan(15)
  })
})

describe('nota do jogador', () => {
  const someone = squad(team('IMP')).find((p) => p.position === 'ST') as Player
  const keeper = squad(team('IMP')).find((p) => p.position === 'GK') as Player

  it('parte de 6,0 e sobe com gols e assistências', () => {
    const quiet = createPitchPlayer(someone, 'ST', 'attack', 0)
    expect(playerRating(quiet, 90, 0, 0)).toBe(6)
    const scorer = createPitchPlayer(someone, 'ST', 'attack', 0)
    scorer.tally.goals = 2
    scorer.tally.assists = 1
    expect(playerRating(scorer, 90, 2, 0)).toBeGreaterThan(8)
  })

  it('cartão vermelho e gols sofridos derrubam a nota; defesas do goleiro sobem', () => {
    const sentOff = createPitchPlayer(someone, 'ST', 'attack', 0)
    sentOff.sentOff = true
    expect(playerRating(sentOff, 40, 0, 1)).toBeLessThan(5)

    const busy = createPitchPlayer(keeper, 'GK', 'defense', 0)
    busy.tally.saves = 6
    const beaten = createPitchPlayer(keeper, 'GK', 'defense', 0)
    beaten.tally.goalsConceded = 4
    expect(playerRating(busy, 90, 0, 0)).toBeGreaterThan(playerRating(beaten, 90, 0, 4) + 2)
  })

  it('quem entrou no fim fica perto de 6,0', () => {
    const late = createPitchPlayer(someone, 'ST', 'attack', 85)
    late.tally.goals = 1
    expect(playerRating(late, 5, 1, 0)).toBeLessThan(6.5)
  })
})
