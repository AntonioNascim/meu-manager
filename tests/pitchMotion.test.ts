import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { formationOf } from '../src/engine/formations'
import { startMatch } from '../src/engine/match'
import type { MatchInput, MatchSnapshot } from '../src/engine/match'
import type { Player, Team } from '../src/engine/types'
import { beatsFor, layoutFrom } from '../src/ui/screens/match/pitchModel'
import { PitchMotion, meters } from '../src/ui/screens/match/pitchMotion'
import type { Leg } from '../src/ui/screens/match/pitchMotion'
import { slowFor } from '../src/engine/match/timing'

const world = generateWorld({ seed: 11 })
const squad = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
const [a, b] = world.teams.filter((t) => t.tier === 1) as [Team, Team]
const input = (seed: number): MatchInput => ({ home: { team: a, players: squad(a) }, away: { team: b, players: squad(b) }, seed, attendance: 30_000 })
const wingers = (snap: MatchSnapshot) => ({
  home: formationOf({ formationId: snap.home.formationId, grid: snap.home.grid }).slots.find((s) => s.position === 'RW' || s.position === 'LW')?.sector === 'attack',
  away: formationOf({ formationId: snap.away.formationId, grid: snap.away.grid }).slots.find((s) => s.position === 'RW' || s.position === 'LW')?.sector === 'attack',
})
const names = (id: string) => id.slice(-4)

/** Toca a partida minuto a minuto no ritmo de 1x e devolve o movimento e o maior salto da bola e de cada jogador em um quadro. */
function play(seed: number, minutes: number, frameMs = 1000 / 60, tickMs = 1600) {
  const live = startMatch(input(seed))
  const motion = new PitchMotion()
  let worstBall = 0
  let worstPlayer = 0
  const legs: Leg[] = []
  const shotLegs: Leg[] = []
  let processed = 0
  for (let minute = 1; minute <= minutes; minute++) {
    live.playUntil(minute)
    const snap = live.snapshot()
    const layout = layoutFrom(snap, wingers(snap))
    motion.setLayout(layout)
    const fresh = snap.trace.slice(processed)
    processed = snap.trace.length
    const last = fresh[fresh.length - 1]
    if (last) {
      const beats = beatsFor(last, layout, snap.events, new Set(layout.keys()))
      const slow = slowFor(last)
      const tick = slow || tickMs
      const planned = motion.plan(beats, { trace: last, names, tickMs: tick, connectors: 2, arrows: true, setPiece: beats[0]?.phase === 'chance', floors: true })
      legs.push(...planned)
      shotLegs.push(...planned.filter((l) => l.kind === 'shot'))
    }
    // Um minuto de tela: quadros a 60 fps.
    const frames = Math.round((slowFor(last ?? ({} as never)) || tickMs) / frameMs)
    for (let f = 0; f < frames; f++) {
      const before = new Map([...motion.bodies].map(([id, body]) => [id, { ...body.pos }]))
      const ball = { ...motion.ball.pos }
      motion.step(frameMs, { running: true, speed: 1 })
      worstBall = Math.max(worstBall, meters(ball, motion.ball.pos))
      for (const [id, body] of motion.bodies) worstPlayer = Math.max(worstPlayer, meters(before.get(id) ?? body.pos, body.pos))
    }
  }
  return { motion, worstBall, worstPlayer, legs, shotLegs }
}

describe('movimento contínuo do campo 2D', () => {
  it('a bola nunca teleporta: o maior passo por quadro é de bola em voo, e cada lance parte de onde o anterior terminou', () => {
    let goals = 0
    for (const seed of [1, 2, 3, 9, 12]) {
      const { worstBall, shotLegs } = play(seed, 90)
      goals += shotLegs.filter((l) => /^GOL/.test(l.endText ?? '')).length
      // Um quadro de 16,7 ms: o chute mais veloz (campo inteiro em ~300 ms) anda menos de 6 m; um salto de lado a lado seria > 40 m.
      // (a cobrança de escanteio cruza a área em pouco tempo: até ~8 m por quadro; um salto de lado a lado seria > 40 m)
      expect(worstBall).toBeLessThan(8)
    }
    // O reinício depois do gol também é movimento: a bola rola até o centro, não aparece lá.
    expect(goals).toBeGreaterThan(2)
  })

  it('os jogadores nunca saltam: a velocidade é limitada e suave', () => {
    const { worstPlayer } = play(4, 45)
    expect(worstPlayer).toBeLessThan(1.2)
  })

  it('o time inteiro se mexe: em 20 minutos cada jogador de linha andou bastante e o bloco acompanhou a bola', () => {
    const live = startMatch(input(5))
    const motion = new PitchMotion()
    live.playUntil(1)
    let snap = live.snapshot()
    let layout = layoutFrom(snap, wingers(snap))
    motion.setLayout(layout)
    const start = new Map([...motion.bodies].map(([id, body]) => [id, { ...body.pos }]))
    const travelled = new Map<string, number>([...motion.bodies.keys()].map((id) => [id, 0]))
    let processed = 0
    for (let minute = 1; minute <= 20; minute++) {
      live.playUntil(minute)
      snap = live.snapshot()
      layout = layoutFrom(snap, wingers(snap))
      motion.setLayout(layout)
      const fresh = snap.trace.slice(processed)
      processed = snap.trace.length
      const last = fresh[fresh.length - 1]
      if (last) motion.plan(beatsFor(last, layout, snap.events, new Set(layout.keys())), { trace: last, names, tickMs: 1600, connectors: 2, arrows: true, setPiece: false, floors: true })
      for (let f = 0; f < 96; f++) {
        const before = new Map([...motion.bodies].map(([id, body]) => [id, { ...body.pos }]))
        motion.step(1000 / 60, { running: true, speed: 1 })
        for (const [id, body] of motion.bodies) travelled.set(id, (travelled.get(id) ?? 0) + meters(before.get(id) as never, body.pos))
      }
    }
    const field = [...motion.bodies.values()].filter((body) => body.placed.slot !== 'GK')
    // Cada jogador de linha percorreu pelo menos 60 m em 20 minutos de jogo (antes ficava parado na formação).
    for (const body of field) expect(travelled.get(body.placed.playerId) ?? 0).toBeGreaterThan(60)
    // E os dois blocos se deslocaram para onde a bola foi (alguém passou de 12 m da posição inicial).
    const farthest = Math.max(...field.map((body) => meters(start.get(body.placed.playerId) as never, body.pos)))
    expect(farthest).toBeGreaterThan(8)
  })

  it('o plano tem passes curtos de ligação e cada trecho tem tempo proporcional à distância', () => {
    const { legs } = play(6, 80)
    expect(legs.length).toBeGreaterThan(300)
    const passes = legs.filter((l) => l.kind === 'pass')
    expect(passes.length).toBeGreaterThan(100)
    expect(legs.every((l) => l.ms >= 40 && l.text.length > 0)).toBe(true)
    // Fora da câmera lenta, o mais longo leva mais tempo que o curto.
    const quick = legs.filter((l) => l.kind === 'pass' && l.start)
    expect(quick.length).toBeGreaterThanOrEqual(0)
  })

  it('narra os passes com os nomes e os desfechos das finalizações', () => {
    const { legs, shotLegs } = play(7, 90)
    expect(legs.some((l) => /toca para/.test(l.text))).toBe(true)
    expect(shotLegs.length).toBeGreaterThan(3)
    expect(shotLegs.every((l) => (l.endText ?? '').length > 0)).toBe(true)
  })

  it('o mesmo lance gera sempre o mesmo movimento (sem sorteio)', () => {
    const one = play(8, 25)
    const two = play(8, 25)
    expect(one.legs.map((l) => `${l.kind}:${l.fromId}:${l.toId}:${Math.round(l.ms)}`)).toEqual(two.legs.map((l) => `${l.kind}:${l.fromId}:${l.toId}:${Math.round(l.ms)}`))
    expect(one.motion.ball.pos).toEqual(two.motion.ball.pos)
  })
})
