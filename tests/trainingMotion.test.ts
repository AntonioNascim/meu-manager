import { describe, expect, it } from 'vitest'
import { DRILL_IDS } from '../src/engine/types'
import { MOTION, TrainingMotion, seeded } from '../src/ui/screens/squad/trainingMotion'
import { FIELD_SIZE, SCENES } from '../src/ui/screens/squad/trainingScenes'
import type { SceneId } from '../src/ui/screens/squad/trainingScenes'

const IDS: SceneId[] = [...DRILL_IDS, 'rest', 'idle']
const FRAME = 1000 / 60

function run(id: SceneId, seconds: number, speed = 1, seed = 'x') {
  const m = new TrainingMotion(SCENES[id], seed)
  let travelled = 0
  let ballTravelled = 0
  let maxBodyJump = 0
  let maxBallJump = 0
  let prev = m.bodies.map((b) => ({ x: b.x, y: b.y }))
  let prevBall = { x: m.ball.x, y: m.ball.y }
  for (let t = 0; t < seconds * 1000; t += FRAME) {
    m.step(FRAME, speed)
    m.bodies.forEach((b, i) => {
      const d = Math.hypot(b.x - (prev[i] as { x: number }).x, b.y - (prev[i] as { y: number }).y)
      travelled += d
      maxBodyJump = Math.max(maxBodyJump, d)
    })
    const db = Math.hypot(m.ball.x - prevBall.x, m.ball.y - prevBall.y)
    ballTravelled += db
    maxBallJump = Math.max(maxBallJump, db)
    prev = m.bodies.map((b) => ({ x: b.x, y: b.y }))
    prevBall = { x: m.ball.x, y: m.ball.y }
  }
  return { m, travelled, ballTravelled, maxBodyJump, maxBallJump }
}

describe('cenas do campinho de treino', () => {
  it('todo exercício (e a folga) tem cena, dentro do campo', () => {
    for (const id of IDS) {
      const s = SCENES[id]
      expect(s, id).toBeDefined()
      expect(s.area.x).toBeGreaterThanOrEqual(0)
      expect(s.area.y).toBeGreaterThanOrEqual(0)
      expect(s.area.x + s.area.w).toBeLessThanOrEqual(FIELD_SIZE.w)
      expect(s.area.y + s.area.h).toBeLessThanOrEqual(FIELD_SIZE.h)
      for (const a of s.actors) {
        expect(a.at.x, id).toBeGreaterThanOrEqual(s.area.x - 1)
        expect(a.at.x, id).toBeLessThanOrEqual(s.area.x + s.area.w + 1)
        expect(a.at.y, id).toBeGreaterThanOrEqual(s.area.y - 1)
        expect(a.at.y, id).toBeLessThanOrEqual(s.area.y + s.area.h + 1)
      }
    }
  })

  it('jogos reduzidos têm 2 × n jogadores mais os coringas; os demais têm roteiro', () => {
    expect(SCENES['full-match'].game).toMatchObject({ n: 11, jokers: 0 })
    const joker = new TrainingMotion(SCENES['joker-possession'], 'x')
    expect(joker.bodies.filter((b) => b.side === 'n')).toHaveLength(2)
    expect(joker.bodies.filter((b) => b.side === 'a')).toHaveLength(4)
    expect(new TrainingMotion(SCENES['eight-a-side'], 'x').bodies).toHaveLength(16)
    for (const id of IDS) if (!SCENES[id].game) expect(SCENES[id].steps.length, id).toBeGreaterThan(0)
  })

  it('o campinho não tem goleiro nem bola fora do campo, nem NaN, em 40 s de qualquer exercício', () => {
    for (const id of IDS) {
      const { m } = run(id, 40)
      const area = SCENES[id].area
      for (const b of m.bodies) {
        expect(Number.isFinite(b.x) && Number.isFinite(b.y), id).toBe(true)
        expect(b.x, id).toBeGreaterThanOrEqual(area.x - 1.01)
        expect(b.x, id).toBeLessThanOrEqual(area.x + area.w + 1.01)
        expect(b.y, id).toBeGreaterThanOrEqual(area.y - 1.01)
        expect(b.y, id).toBeLessThanOrEqual(area.y + area.h + 1.01)
      }
      expect(Number.isFinite(m.ball.x) && Number.isFinite(m.ball.y) && Number.isFinite(m.ball.height), id).toBe(true)
      expect(m.ball.x, id).toBeGreaterThan(-4)
      expect(m.ball.x, id).toBeLessThan(FIELD_SIZE.w + 4)
      expect(m.ball.height, id).toBeGreaterThanOrEqual(0)
    }
  })

  it('nada teleporta: nenhum jogador nem a bola dá salto num quadro (60 fps)', () => {
    for (const id of IDS) {
      const { maxBodyJump, maxBallJump } = run(id, 30)
      expect(maxBodyJump, id).toBeLessThan(0.25) // ~ 6 m/s * 16,7 ms = 0,1
      expect(maxBallJump, id).toBeLessThan(1.2)
    }
  })

  it('os exercícios com bola passam a bola (ela anda); a folga e o vídeo não', () => {
    for (const id of IDS) {
      const { ballTravelled } = run(id, 25)
      if (id === 'rest' || id === 'idle' || id === 'video-session' || id === 'conditioning-circuit' || id === 'speed-agility' || id === 'strength-circuit' || id === 'recovery-session') continue
      expect(ballTravelled, id).toBeGreaterThan(8)
    }
  })

  it('o mesmo texto de semente dá a mesma cena; outra semente muda o mini-jogo', () => {
    const a = run('full-match', 12, 1, 'dia-1')
    const b = run('full-match', 12, 1, 'dia-1')
    const c = run('full-match', 12, 1, 'dia-2')
    expect(a.m.bodies.map((x) => [x.x, x.y])).toEqual(b.m.bodies.map((x) => [x.x, x.y]))
    expect(a.m.ball).toEqual(b.m.ball)
    expect(a.m.bodies.map((x) => x.x)).not.toEqual(c.m.bodies.map((x) => x.x))
    const r1 = seeded('abc')
    const r2 = seeded('abc')
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()])
  })

  it('a velocidade escolhida escala o movimento (4x anda bem mais que 1x)', () => {
    const slow = run('six-a-side', 10, 1)
    const fast = run('six-a-side', 10, 4)
    expect(fast.travelled).toBeGreaterThan(slow.travelled * 1.8)
    expect(run('rondo', 10, 4).ballTravelled).toBeGreaterThan(run('rondo', 10, 1).ballTravelled * 1.8)
  })

  it('um passo de tempo enorme (aba em segundo plano) é cortado, sem estourar', () => {
    const m = new TrainingMotion(SCENES['full-match'], 'x')
    const before = m.bodies.map((b) => b.x)
    m.step(60_000, 1)
    m.bodies.forEach((b, i) => expect(Math.abs(b.x - (before[i] as number))).toBeLessThan(MOTION.maxSpeed * (MOTION.maxStepMs / 1000) * 1.2))
    m.step(-5, 1)
    m.step(0, 1)
    expect(Number.isFinite(m.ball.x)).toBe(true)
  })

  it('o mini-jogo tem relógio que volta a zero e placar de enfeite que cresce', () => {
    const m = new TrainingMotion(SCENES['eight-a-side'], 'gols')
    let maxMinute = 0
    let maxScore = 0
    for (let t = 0; t < 400_000; t += 50) {
      m.step(50, 4)
      maxMinute = Math.max(maxMinute, m.minute)
      maxScore = Math.max(maxScore, m.score.a + m.score.b)
    }
    expect(maxMinute).toBeLessThanOrEqual(MOTION.gameMinutes)
    expect(maxMinute).toBeGreaterThan(5)
    expect(maxScore).toBeGreaterThan(0)
    // sem gols (posse com coringas) o placar fica em 0 a 0
    const p = new TrainingMotion(SCENES['joker-possession'], 'x')
    for (let t = 0; t < 120_000; t += 50) p.step(50, 4)
    expect(p.score).toEqual({ a: 0, b: 0 })
  })
})
