import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import { MATCH } from '../../src/engine/config'
import { buildTactic } from '../../src/engine/lineup'
import { simulateMatch } from '../../src/engine/match'
import type { MatchInput, MatchSideInput } from '../../src/engine/match'
import { crowdFill, homeFactor } from '../../src/engine/match/state'
import type { MatchResult, Mentality, Player, PlayStyle, Team, Tactic } from '../../src/engine/types'

const world = generateWorld({ seed: 77 })
const team = (abbr: string) => world.teams.find((t) => t.abbreviation === abbr) as Team
const squad = (t: Team) => world.players.filter((p) => p.teamId === t.id)
const side = (t: Team, players: Player[] = squad(t)): MatchSideInput => ({ team: t, players })

/** Mesmo elenco com outra tática (escalação refeita para a formação pedida). */
function withTactic(
  t: Team,
  options: Partial<{ formationId: string; style: PlayStyle; mentality: Mentality }>,
): MatchSideInput {
  const players = squad(t)
  const tactic: Tactic = buildTactic(players, {
    formationId: options.formationId ?? t.tactic.formationId,
    style: options.style ?? t.tactic.style,
    mentality: options.mentality ?? t.tactic.mentality,
  })
  return { team: { ...t, tactic }, players }
}

const run = (n: number, make: (seed: number) => MatchInput): MatchResult[] =>
  Array.from({ length: n }, (_, i) => simulateMatch(make(i)))
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const points = (goalsFor: number, goalsAgainst: number) => (goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0)

// Dois times médios da Série A, parecidos entre si.
const A = team('JAN')
const B = team('MAR')
const N = 500

describe('fator casa', () => {
  it('mandante vence mais que visitante com os mesmos times', () => {
    const results = [
      ...run(N, (s) => ({ home: side(A), away: side(B), seed: s })),
      ...run(N, (s) => ({ home: side(B), away: side(A), seed: s + N })),
    ]
    const homeWins = results.filter((r) => r.homeGoals > r.awayGoals).length / results.length
    const awayWins = results.filter((r) => r.homeGoals < r.awayGoals).length / results.length
    expect(homeWins).toBeGreaterThan(awayWins + 0.08)
  })

  it('a vantagem vale o mesmo em pontos de atributo em elencos de níveis diferentes', () => {
    const level = MATCH.home.referenceLevel
    const gain = (l: number) => (homeFactor(A, 0, l) - 1) * l
    expect(gain(level * 0.8)).toBeCloseTo(gain(level))
    expect(homeFactor(A, 0, level * 0.8)).toBeGreaterThan(homeFactor(A, 0, level))
  })

  it('depende da ocupação (percentual), não do público absoluto', () => {
    const small = { ...A, stadium: { ...A.stadium, capacity: 10_000 } }
    const big = { ...A, stadium: { ...A.stadium, capacity: 80_000 } }
    expect(homeFactor(small, 5_000)).toBeCloseTo(homeFactor(big, 40_000))
    expect(homeFactor(small, 10_000)).toBeGreaterThan(homeFactor(small, 2_000))
    expect(homeFactor(big, 10_000)).toBeLessThan(homeFactor(small, 10_000))
  })

  it('estádio cheio ajuda mais que estádio vazio', () => {
    expect(homeFactor(A, A.stadium.capacity)).toBeGreaterThan(homeFactor(A, 0))
    expect(crowdFill(A, A.stadium.capacity / 2)).toBeCloseTo(0.5)
    const full = run(N, (s) => ({ home: side(A), away: side(B), seed: s, attendance: A.stadium.capacity }))
    const empty = run(N, (s) => ({ home: side(A), away: side(B), seed: s, attendance: 0 }))
    const ppg = (rs: MatchResult[]) => avg(rs.map((r) => points(r.homeGoals, r.awayGoals)))
    expect(ppg(full)).toBeGreaterThan(ppg(empty))
  })
})

describe('condição física', () => {
  it('cai durante o jogo, mais para quem tem menos resistência', () => {
    const results = run(100, (s) => ({ home: side(A), away: side(B), seed: s }))
    const byId = new Map(world.players.map((p) => [p.id, p]))
    const full = results.flatMap((r) => r.playerResults.filter((p) => p.minutesPlayed === 90))
    const outfield = full.filter((p) => byId.get(p.playerId)?.position !== 'GK')
    for (const p of outfield) expect(p.finalFitness).toBeLessThan(100)

    const stamina = (id: string) => byId.get(id)?.attributes.stamina ?? 0
    const sorted = [...outfield].sort((a, b) => stamina(a.playerId) - stamina(b.playerId))
    const third = Math.floor(sorted.length / 3)
    const weak = avg(sorted.slice(0, third).map((p) => p.finalFitness))
    const strong = avg(sorted.slice(-third).map((p) => p.finalFitness))
    expect(strong).toBeGreaterThan(weak + 3)
  })

  it('pressão alta cansa mais que jogo de posse', () => {
    const fitnessOf = (rs: MatchResult[], teamId: string) =>
      avg(rs.flatMap((r) => r.playerResults.filter((p) => p.teamId === teamId && p.minutesPlayed === 90).map((p) => p.finalFitness)))
    const press = run(150, (s) => ({ home: withTactic(A, { style: 'high-press' }), away: side(B), seed: s }))
    const possession = run(150, (s) => ({ home: withTactic(A, { style: 'possession' }), away: side(B), seed: s }))
    expect(fitnessOf(press, A.id)).toBeLessThan(fitnessOf(possession, A.id) - 3)
  })

  it('time cansado rende menos', () => {
    const tired = squad(A).map((p) => ({ ...p, condition: { ...p.condition, fitness: 55 } }))
    const fresh = run(N, (s) => ({ home: side(A), away: side(B), seed: s }))
    const exhausted = run(N, (s) => ({ home: side(A, tired), away: side(B), seed: s }))
    const ppg = (rs: MatchResult[]) => avg(rs.map((r) => points(r.homeGoals, r.awayGoals)))
    expect(ppg(exhausted)).toBeLessThan(ppg(fresh) - 0.15)
  })

  it('a IA troca jogadores cansados só a partir do minuto definido', () => {
    const results = run(200, (s) => ({ home: side(A), away: side(B), seed: s }))
    let tiredSubs = 0
    for (const r of results) {
      const injuredIds = new Set(r.events.filter((e) => e.type === 'injury').map((e) => e.playerId))
      const sentOff = r.events.filter((e) => e.type === 'red-card').map((e) => e.minute)
      for (const e of r.events.filter((ev) => ev.type === 'substitution' && !injuredIds.has(ev.playerId))) {
        // trocas antes do minuto só por lesão ou goleiro expulso
        if (!sentOff.includes(e.minute)) {
          expect(e.minute).toBeGreaterThanOrEqual(MATCH.fatigue.subFromMinute)
          tiredSubs++
        }
      }
    }
    expect(tiredSubs / results.length).toBeGreaterThan(1)
  })
})

describe('estilo de jogo', () => {
  const vs = (home: MatchSideInput, n = N) => run(n, (s) => ({ home, away: side(B), seed: s }))
  const possessionOf = (rs: MatchResult[]) => avg(rs.map((r) => r.homeStats.possession))
  const xgPerShot = (rs: MatchResult[], who: 'home' | 'away') => {
    const stats = rs.map((r) => (who === 'home' ? r.homeStats : r.awayStats))
    return avg(stats.map((s) => s.xg)) / avg(stats.map((s) => s.shots))
  }

  const possession = vs(withTactic(A, { style: 'possession' }))
  const counter = vs(withTactic(A, { style: 'counter-attack' }))
  const press = vs(withTactic(A, { style: 'high-press' }))

  it('posse fica mais com a bola; contra-ataque, menos', () => {
    expect(possessionOf(possession)).toBeGreaterThan(possessionOf(counter) + 4)
  })

  it('contra-ataque é mais eficiente com a bola que tem: mais xG por posse que a posse', () => {
    const xgPerPossession = (rs: MatchResult[]) => avg(rs.map((r) => r.homeStats.xg)) / possessionOf(rs)
    expect(xgPerPossession(counter)).toBeGreaterThan(xgPerPossession(possession) * 1.1)
  })

  it('pressão alta recupera mais a bola, mas cede chances melhores ao rival', () => {
    expect(possessionOf(press)).toBeGreaterThan(possessionOf(counter) + 3)
    expect(xgPerShot(press, 'away')).toBeGreaterThan(xgPerShot(possession, 'away') * 1.03)
  })
})

describe('mentalidade', () => {
  it('ofensiva finaliza mais, mas sofre mais gols que a defensiva', () => {
    const attacking = run(N, (s) => ({ home: withTactic(A, { mentality: 2 }), away: side(B), seed: s }))
    const defensive = run(N, (s) => ({ home: withTactic(A, { mentality: -2 }), away: side(B), seed: s }))
    expect(avg(attacking.map((r) => r.homeStats.shots))).toBeGreaterThan(avg(defensive.map((r) => r.homeStats.shots)) + 1.5)
    expect(avg(attacking.map((r) => r.awayGoals))).toBeGreaterThan(avg(defensive.map((r) => r.awayGoals)))
  })
})

describe('formação', () => {
  it('defesa com três zagueiros cede mais finalizações por posse do rival', () => {
    const shotsPerPossession = (rs: MatchResult[]) =>
      avg(rs.map((r) => r.awayStats.shots)) / avg(rs.map((r) => r.awayStats.possession))
    const threeBack = run(N, (s) => ({ home: withTactic(A, { formationId: '3-5-2' }), away: side(B), seed: s }))
    const fourBack = run(N, (s) => ({ home: withTactic(A, { formationId: '4-4-2' }), away: side(B), seed: s }))
    expect(shotsPerPossession(threeBack)).toBeGreaterThan(shotsPerPossession(fourBack))
  })

  it('jogadores improvisados fora de posição rendem menos', () => {
    // Mesma formação, mas os jogadores de linha trocados de vaga (goleiro mantido).
    const players = squad(A)
    const [gk, ...outfield] = A.tactic.startingXI
    const scrambled: Team = { ...A, tactic: { ...A.tactic, startingXI: [gk as string, ...[...outfield].reverse()] } }
    const normal = run(N, (s) => ({ home: side(A), away: side(B), seed: s }))
    const messy = run(N, (s) => ({ home: { team: scrambled, players }, away: side(B), seed: s }))
    const ppg = (rs: MatchResult[]) => avg(rs.map((r) => points(r.homeGoals, r.awayGoals)))
    expect(ppg(messy)).toBeLessThan(ppg(normal) - 0.2)
  })
})
