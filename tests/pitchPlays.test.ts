import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { formationOf } from '../src/engine/formations'
import { startMatch } from '../src/engine/match'
import type { MatchInput, MatchSnapshot } from '../src/engine/match'
import { MIN_BEAT_MS } from '../src/engine/match/timing'
import type { PlayStyle, Player, Team } from '../src/engine/types'
import { basePositions, beatsFor, fitBeats, layoutFrom, shifted } from '../src/ui/screens/match/pitchModel'
import type { Beat, Placed } from '../src/ui/screens/match/pitchModel'
import { depthShift, shapeOf } from '../src/ui/screens/match/pitchStyle'

const world = generateWorld({ seed: 11 })
const squad = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
const [a, b] = world.teams.filter((t) => t.tier === 1) as [Team, Team]
const withStyle = (t: Team, style: PlayStyle): Team => ({ ...t, tactic: { ...t.tactic, style } })
const played = (seed: number, home: Team, away: Team): MatchSnapshot => {
  const input: MatchInput = { home: { team: home, players: squad(home) }, away: { team: away, players: squad(away) }, seed, attendance: 30_000 }
  const m = startMatch(input)
  m.playUntil(90)
  return m.snapshot()
}
const wingers = (s: MatchSnapshot) => ({
  home: formationOf({ formationId: s.home.formationId, grid: s.home.grid }).slots.some((x) => (x.position === 'RW' || x.position === 'LW') && x.sector === 'attack'),
  away: formationOf({ formationId: s.away.formationId, grid: s.away.grid }).slots.some((x) => (x.position === 'RW' || x.position === 'LW') && x.sector === 'attack'),
})
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y)
const goalX = (side: 'home' | 'away') => (side === 'home' ? 1 : 0)

/** Várias partidas dos três estilos de hoje (a Parte 2 não mexe no motor: os estilos novos vêm depois). */
const matches = (['possession', 'counter-attack', 'high-press'] as PlayStyle[]).flatMap((style, i) => [21, 22, 23, 24].map((seed) => played(seed + i, withStyle(a, style), withStyle(b, i === 0 ? 'high-press' : 'possession'))))

describe('lances que fazem sentido no campo 2D (Fase 6D)', () => {
  it('chute de longe sai de perto da área (até ~31% do campo do gol), não do meio-campo; os outros chutes, de dentro ou da beira da área', () => {
    let longs = 0
    for (const s of matches) {
      const layout = layoutFrom(s, wingers(s))
      const active = new Set(layout.keys())
      for (const t of s.trace) {
        if (!t.shot || t.shot.type === 'penalty' || t.shot.type === 'freeKick' || !layout.has(t.shot.shooterId)) continue
        const shot = beatsFor(t, layout, s.events, active).find((x) => x.phase === 'shot')
        if (!shot?.arrow) continue
        const limit = t.shot.type === 'longShot' ? 0.31 : 0.23
        expect(Math.abs(goalX(t.side) - shot.arrow.from.x), `${t.shot.type} min ${t.minute}`).toBeLessThanOrEqual(limit)
        if (t.shot.type === 'longShot') longs++
      }
    }
    expect(longs).toBeGreaterThan(0)
  })

  it('o cruzamento sai da faixa lateral perto da linha de fundo e cai dentro da área', () => {
    let crosses = 0
    for (const s of matches) {
      const layout = layoutFrom(s, wingers(s))
      const active = new Set(layout.keys())
      for (const t of s.trace) {
        if (t.play !== 'cross' || t.outcome !== 'won' || !t.receiverId) continue
        const cross = beatsFor(t, layout, s.events, active).find((x) => x.phase === 'chance' && x.arrow?.curve)?.arrow
        if (!cross) continue
        crosses++
        const gx = goalX(t.side)
        expect(Math.abs(gx - cross.from.x)).toBeLessThanOrEqual(0.1)
        expect(cross.from.y < 0.15 || cross.from.y > 0.85).toBe(true)
        expect(Math.abs(gx - cross.to.x)).toBeLessThanOrEqual(0.14)
        expect(cross.to.y).toBeGreaterThanOrEqual(0.3)
        expect(cross.to.y).toBeLessThanOrEqual(0.7)
      }
    }
    expect(crosses).toBeGreaterThan(0)
  })

  it('os passes curtos vão para companheiros em campo e perto (poucos passam de 0,36) e quem saiu por troca nunca recebe a bola', () => {
    let passes = 0
    let far = 0
    for (const s of matches) {
      const layout = layoutFrom(s, wingers(s))
      const active = new Set(layout.keys())
      for (const t of s.trace) {
        for (const beat of beatsFor(t, layout, s.events, active)) {
          if (beat.phase !== 'midfield' || !beat.arrow || beat.arrow.curve) continue
          passes++
          if (dist(beat.arrow.from, beat.arrow.to) > 0.36) far++
          if (beat.holder) expect(active.has(beat.holder)).toBe(true)
        }
      }
    }
    expect(passes).toBeGreaterThan(50)
    expect(far / passes).toBeLessThan(0.15)
  })

  it('a posse troca mais passes antes da jogada do que o contra-ataque, que sai em bola longa', () => {
    const count = (style: PlayStyle) => {
      let n = 0
      let moments = 0
      for (let seed = 31; seed < 35; seed++) {
        const s = played(seed, withStyle(a, style), withStyle(b, 'possession'))
        const layout = layoutFrom(s, wingers(s))
        const active = new Set(layout.keys())
        for (const t of s.trace) {
          if (t.side !== 'home' || t.play === 'held') continue
          moments++
          n += beatsFor(t, layout, s.events, active).filter((x) => x.phase === 'midfield' && x.arrow).length
        }
      }
      return n / Math.max(1, moments)
    }
    expect(count('possession')).toBeGreaterThan(count('counter-attack') + 1)
    const s = played(41, withStyle(a, 'counter-attack'), withStyle(b, 'possession'))
    const layout = layoutFrom(s, wingers(s))
    const longBalls = s.trace.filter((t) => t.side === 'home' && t.transition && t.carrierId).flatMap((t) => beatsFor(t, layout, s.events, new Set(layout.keys())).filter((x) => x.phase === 'midfield' && x.arrow?.curve))
    for (const ball of longBalls) expect(dist(ball.arrow!.from, ball.arrow!.to)).toBeGreaterThan(0.3)
  })

  it('o jogo não usa sorteio: o mesmo lance produz sempre as mesmas batidas', () => {
    const s = matches[0] as MatchSnapshot
    const layout = layoutFrom(s, wingers(s))
    for (const t of s.trace.slice(0, 30)) expect(JSON.stringify(beatsFor(t, layout, s.events))).toBe(JSON.stringify(beatsFor(t, layout, s.events)))
  })
})

describe('forma da equipe por estilo (Fase 6D)', () => {
  const slots = (['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'CM', 'CM', 'RW', 'ST', 'LW'] as const).map((slot, i) => ({ playerId: `p${i}`, slot }))
  const depthOf = (style: PlayStyle, mentality = 0) => {
    const placed = basePositions('home', slots, true, shapeOf(style, mentality), style)
    const mean = (xs: Placed[]) => xs.reduce((n, p) => n + p.base.x, 0) / xs.length
    return { line: mean(placed.filter((p) => p.slot === 'CB')), mid: mean(placed.filter((p) => p.slot === 'CM')), width: Math.max(...placed.map((p) => p.base.y)) - Math.min(...placed.map((p) => p.base.y)) }
  }

  it('a pressão alta adianta as linhas, o contra-ataque recua o bloco e a posse fica no meio, mais compacta', () => {
    const press = depthOf('high-press')
    const poss = depthOf('possession')
    const counter = depthOf('counter-attack')
    expect(press.line).toBeGreaterThan(poss.line)
    expect(poss.line).toBeGreaterThan(counter.line)
    expect(press.mid).toBeGreaterThan(counter.mid + 0.15)
    expect(poss.width).toBeLessThan(depthOf('counter-attack').width)
  })

  it('a mentalidade ofensiva sobe as linhas e a defensiva as recua; o goleiro não sobe', () => {
    expect(depthOf('possession', 2).line).toBeGreaterThan(depthOf('possession', 0).line)
    expect(depthOf('possession', -2).line).toBeLessThan(depthOf('possession', 0).line)
    expect(depthShift('GK', shapeOf('high-press'))).toBe(0)
  })

  it('sem a bola o contra-ataque recua mais e a pressão alta quase não recua; sem estilo vale o recuo de antes', () => {
    const at = (style: PlayStyle | undefined): number => {
      const p: Placed = { playerId: 'x', side: 'away', slot: 'CB', base: { x: 0.8, y: 0.5 }, ...(style ? { style } : {}) }
      return shifted(p, 'home', 'chance', 0.5).x
    }
    expect(at('counter-attack')).toBeGreaterThan(at('possession'))
    expect(at('possession')).toBeGreaterThan(at('high-press'))
    const neutral: Placed = { playerId: 'x', side: 'away', slot: 'CB', base: { x: 0.8, y: 0.5 } }
    expect(shifted(neutral, 'home', 'chance', 0.5).x).toBeCloseTo(0.8 + 0.12 * 0.45 * 0.55, 6)
  })
})

describe('tempo dos passos (Fase 6D)', () => {
  const beat = (i: number): Beat => ({ phase: 'midfield', ball: { x: 0.5, y: 0.5 }, moves: {}, attSide: 'home', focusY: 0.5, marks: [], weight: i })

  it('cabendo todos os passos, tocam todos; faltando tempo, ficam o primeiro, o último e os do meio espaçados', () => {
    const beats = [0, 1, 2, 3, 4, 5, 6, 7].map(beat)
    expect(fitBeats(beats, MIN_BEAT_MS * 8, MIN_BEAT_MS)).toHaveLength(8)
    const some = fitBeats(beats, MIN_BEAT_MS * 4, MIN_BEAT_MS)
    expect(some).toHaveLength(4)
    expect(some[0]).toBe(beats[0])
    expect(some[some.length - 1]).toBe(beats[7])
    expect(fitBeats(beats, MIN_BEAT_MS * 1.5, MIN_BEAT_MS)).toEqual([beats[7]])
    expect(fitBeats([], 1000, MIN_BEAT_MS)).toEqual([])
  })
})
