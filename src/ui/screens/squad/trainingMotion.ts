/**
 * Movimento do campinho do treino (só visual, puro e testável). `TrainingMotion` guarda posição e velocidade de cada jogador e da bola e
 * avança a cada quadro (`step`), como o campo da partida:
 *  - exercícios com roteiro (`Scene.steps`): cada passo leva os jogadores a novos pontos e a bola de um ponto a outro;
 *  - jogos reduzidos (`Scene.game`): um mini-jogo simulado (posse, passes, desarmes e finalizações) entre os titulares e os reservas.
 * O placar e o relógio do mini-jogo são de enfeite: saem de um gerador local com semente (nunca do motor de partida, nada é guardado).
 */
import type { Area, ActorInit, P, Ref, Scene, Side, Step } from './trainingScenes'

export interface Body {
  id: number
  side: Side
  keeper: boolean
  x: number
  y: number
  vx: number
  vy: number
  /** Ponto de base: onde o jogador "mora" no exercício. */
  ax: number
  ay: number
  tx: number
  ty: number
}

export interface Ball {
  x: number
  y: number
  /** 0 a 1: quanto a bola está no alto (o desenho aumenta e sombreia). */
  height: number
}

export const MOTION = {
  /** Velocidade máxima de corrida (metros por segundo) e quanto a velocidade real persegue a desejada (ms). */
  maxSpeed: 6.2,
  jogSpeed: 2.6,
  responseMs: 130,
  /** Um passo de tempo maior que isto (aba em segundo plano) é cortado. */
  maxStepMs: 100,
  /** Mini-jogo: tempo entre ações e duração de uma partida de treino (minutos de enfeite). */
  action: [800, 1500] as readonly [number, number],
  gameMinutes: 20,
  /** Quanto do tempo real vira minutos de jogo (1 minuto de treino a cada tanto, na velocidade 1x). */
  minuteMs: 1800,
  /** Alcance (m) para finalizar, e chance de um passe ser cortado. */
  shootRange: 22,
  intercept: 0.16,
} as const

const hashOf = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
/** Gerador pequeno com semente (mulberry32): o mesmo texto de semente dá a mesma sequência. */
export function seeded(seed: string): () => number {
  let a = hashOf(seed) || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

interface Flight {
  from: P
  to: P
  t: number
  ms: number
  arc: number
  /** Quem recebe ao chegar (ou `null`). */
  receiver: number | null
}

export class TrainingMotion {
  readonly bodies: Body[] = []
  readonly ball: Ball = { x: 52.5, y: 34, height: 0 }
  readonly score = { a: 0, b: 0 }
  /** Minuto do mini-jogo (0 a `gameMinutes`). */
  minute = 0
  readonly scene: Scene
  private readonly rnd: () => number
  private flight: Flight | null = null
  private holder: number | null = null
  // roteiro
  private stepIndex = -1
  private stepClock = 0
  private ballStarted = false
  // mini-jogo
  private possession: Side = 'a'
  private nextAction = 0
  private gameClock = 0

  constructor(scene: Scene, seed: string) {
    this.scene = scene
    this.rnd = seeded(`${seed}:motion`)
    if (scene.game) this.initGame(scene)
    else this.initScript(scene)
  }

  private spawn(a: ActorInit, id: number, at: P = a.at): Body {
    return { id, side: a.side, keeper: a.keeper === true, x: at.x, y: at.y, vx: 0, vy: 0, ax: at.x, ay: at.y, tx: at.x, ty: at.y }
  }

  // ---------- roteiro ----------

  private initScript(scene: Scene): void {
    scene.actors.forEach((a, i) => this.bodies.push(this.spawn(a, i)))
    const first = scene.steps[0]?.ball
    if (first) {
      const p = this.pointOf(first.from)
      this.ball.x = p.x
      this.ball.y = p.y
      if (typeof first.from === 'number') this.holder = first.from
    }
    this.beginStep(0)
  }

  private pointOf(ref: Ref): P {
    if (typeof ref === 'number') {
      const b = this.bodies[ref]
      return b ? { x: b.x, y: b.y } : { x: 52.5, y: 34 }
    }
    return ref
  }

  private beginStep(index: number): void {
    const steps = this.scene.steps
    if (steps.length === 0) return
    this.stepIndex = index % steps.length
    this.stepClock = 0
    this.ballStarted = false
    const step = steps[this.stepIndex] as Step
    for (const b of this.bodies) {
      const t = step.move[b.id]
      if (t) {
        b.tx = t.x
        b.ty = t.y
      }
    }
  }

  private stepScript(dt: number): void {
    const steps = this.scene.steps
    if (steps.length === 0) return
    const step = steps[this.stepIndex] as Step
    this.stepClock += dt
    const move = step.ball
    // Antes de sair, a bola fica com quem vai tocar nela (e anda com ele): ela nunca aparece de repente no pé de alguém.
    if (move && !this.ballStarted && typeof move.from === 'number') this.holder = move.from
    if (move && !this.ballStarted && this.stepClock >= move.delay) {
      this.ballStarted = true
      // A bola sai de onde ela está (na mão de quem toca), nunca do centro do jogador: sem salto no primeiro quadro.
      const held = typeof move.from === 'number' && this.holder === move.from
      this.holder = null
      this.flight = { from: held ? { x: this.ball.x, y: this.ball.y } : this.pointOf(move.from), to: this.pointOf(move.to), t: 0, ms: Math.max(60, move.flight), arc: move.arc, receiver: typeof move.to === 'number' ? move.to : null }
    }
    if (this.stepClock >= step.ms) this.beginStep(this.stepIndex + 1)
  }

  // ---------- mini-jogo ----------

  private initGame(scene: Scene): void {
    const game = scene.game as NonNullable<Scene['game']>
    const area = scene.area
    const rows = game.n >= 9 ? [4, 4, 2] : game.n >= 6 ? [3, 2, 1] : game.n >= 4 ? [2, 1, 1] : [1, 1, 1]
    const place = (side: 'a' | 'b'): ActorInit[] => {
      const out: ActorInit[] = []
      // 11 jogadores: goleiro + 4-4-2 (ou a divisão proporcional); menos que isso: sem goleiro, em linhas.
      if (game.n >= 8) out.push({ side, at: { x: side === 'a' ? area.x + 3 : area.x + area.w - 3, y: area.y + area.h / 2 }, keeper: true })
      const field = game.n - out.length
      const lines = game.n >= 8 ? [Math.ceil(field * 0.4), Math.floor(field * 0.4), field - Math.ceil(field * 0.4) - Math.floor(field * 0.4)] : this.split(field, rows)
      lines.forEach((count, li) => {
        for (let k = 0; k < count; k++) {
          const depth = (li + 1) / (lines.length + 1.6)
          const x = side === 'a' ? area.x + area.w * (0.1 + depth * 0.45) : area.x + area.w * (0.9 - depth * 0.45)
          const y = area.y + (area.h * (k + 1)) / (count + 1)
          out.push({ side, at: { x, y } })
        }
      })
      return out
    }
    const actors = [...place('a'), ...place('b')]
    for (let j = 0; j < game.jokers; j++) actors.push({ side: 'n', at: { x: area.x + (area.w * (j + 1)) / (game.jokers + 1), y: j % 2 === 0 ? area.y + 1 : area.y + area.h - 1 } })
    actors.forEach((a, i) => this.bodies.push(this.spawn(a, i)))
    this.restart('a', true)
  }

  private split(total: number, weights: readonly number[]): number[] {
    const sum = weights.reduce((x, y) => x + y, 0)
    const out = weights.map((w) => Math.max(1, Math.round((total * w) / sum)))
    const sumOf = () => out.reduce((x, y) => x + y, 0)
    while (sumOf() > total) out[out.indexOf(Math.max(...out))] = (out[out.indexOf(Math.max(...out))] as number) - 1
    while (sumOf() < total) out[out.indexOf(Math.min(...out))] = (out[out.indexOf(Math.min(...out))] as number) + 1
    return out
  }

  /** Recomeço do mini-jogo: quem tem a vez e o jogador mais perto do centro recebe a bola, que rola até ele (a bola nunca teleporta). */
  private restart(side: Side, initial = false): void {
    const area = this.scene.area
    const center = { x: area.x + area.w / 2, y: area.y + area.h / 2 }
    this.possession = side
    this.flight = null
    const starter = this.bodies.filter((b) => b.side === side && !b.keeper).sort((x, y) => dist(x, center) - dist(y, center))[0]
    this.nextAction = this.rnd() * (MOTION.action[1] - MOTION.action[0]) + MOTION.action[0]
    if (!starter) {
      this.holder = null
      return
    }
    if (initial) {
      this.holder = starter.id
      this.ball.x = starter.x
      this.ball.y = starter.y
      return
    }
    this.holder = null
    this.flight = { from: { x: this.ball.x, y: this.ball.y }, to: { x: starter.x, y: starter.y }, t: 0, ms: Math.max(350, dist(this.ball, starter) * 28), arc: 0, receiver: starter.id }
  }

  private attackX(side: Side): number {
    const area = this.scene.area
    return side === 'a' ? area.x + area.w : area.x
  }

  private stepGame(dt: number): void {
    const game = this.scene.game as NonNullable<Scene['game']>
    this.gameClock += dt
    this.minute = (this.gameClock / MOTION.minuteMs) % MOTION.gameMinutes
    if (this.gameClock / MOTION.minuteMs >= MOTION.gameMinutes) {
      this.gameClock = 0
      this.score.a = 0
      this.score.b = 0
    }
    // Alvos: cada um perto do seu ponto, deslocado para o lado da bola; quem tem a bola avança; o rival mais perto aperta.
    const area = this.scene.area
    const ball = this.ball
    const holder = this.holder !== null ? this.bodies[this.holder] : undefined
    const dir = this.possession === 'a' ? 1 : -1
    let presser: Body | undefined
    if (holder) presser = this.bodies.filter((b) => b.side !== holder.side && b.side !== 'n' && !b.keeper).sort((x, y) => dist(x, holder) - dist(y, holder))[0]
    for (const b of this.bodies) {
      if (b.side === 'n') {
        const edge = b.ay < area.y + area.h / 2
        b.tx = clamp(ball.x, area.x, area.x + area.w)
        b.ty = edge ? area.y + 1 : area.y + area.h - 1
        continue
      }
      if (b.keeper) {
        b.tx = b.ax
        b.ty = clamp(ball.y, area.y + area.h * 0.35, area.y + area.h * 0.65)
        continue
      }
      if (holder && b.id === holder.id) {
        b.tx = clamp(b.x + dir * 4, area.x, area.x + area.w)
        b.ty = clamp(b.y + (this.rnd() - 0.5) * 3, area.y, area.y + area.h)
        continue
      }
      if (presser && b.id === presser.id) {
        b.tx = holder ? holder.x : b.ax
        b.ty = holder ? holder.y : b.ay
        continue
      }
      const shift = b.side === this.possession ? 0.32 : 0.24
      const push = b.side === this.possession ? dir * area.w * 0.14 : 0
      b.tx = clamp(b.ax + (ball.x - b.ax) * shift + push, area.x, area.x + area.w)
      b.ty = clamp(b.ay + (ball.y - b.ay) * shift, area.y, area.y + area.h)
    }
    if (this.flight) return
    // A bola com quem a tem.
    if (holder) {
      ball.x = holder.x + dir * 0.9
      ball.y = holder.y + 0.2
      ball.height = 0
    }
    this.nextAction -= dt
    if (this.nextAction > 0 || !holder) return
    this.nextAction = this.rnd() * (MOTION.action[1] - MOTION.action[0]) + MOTION.action[0]
    const goalX = this.attackX(holder.side)
    const goalsOn = game.goals !== 'none'
    if (goalsOn && Math.abs(goalX - holder.x) < Math.max(MOTION.shootRange, area.w * 0.45) && this.rnd() < 0.6) {
      const target = { x: goalX + dir * 0.5, y: area.y + area.h / 2 + (this.rnd() - 0.5) * 5 }
      this.flight = { from: { x: ball.x, y: ball.y }, to: target, t: 0, ms: Math.max(320, dist(ball, target) * 20), arc: 0.1, receiver: null }
      this.holder = null
      this.shotBy = holder.side
      return
    }
    // Passe: para um companheiro à frente (ou qualquer um, sem gols); pode ser cortado.
    const mates = this.bodies.filter((b) => (b.side === holder.side || b.side === 'n') && b.id !== holder.id && !b.keeper)
    const ahead = mates.filter((m) => (m.x - holder.x) * dir > -2)
    const pool = ahead.length > 0 ? ahead : mates
    if (pool.length === 0) return
    let receiver = pool[Math.floor(this.rnd() * pool.length)] as Body
    if (this.rnd() < MOTION.intercept) {
      const foes = this.bodies.filter((b) => b.side !== holder.side && b.side !== 'n' && !b.keeper).sort((x, y) => dist(x, receiver) - dist(y, receiver))
      if (foes[0]) receiver = foes[0]
    }
    this.flight = { from: { x: ball.x, y: ball.y }, to: { x: receiver.x, y: receiver.y }, t: 0, ms: 160 + dist(holder, receiver) * 24, arc: 0.12, receiver: receiver.id }
    this.holder = null
  }

  private shotBy: Side | null = null

  // ---------- passo de tempo ----------

  /** Avança `dtMs` (já multiplicado pela velocidade escolhida: 1x, 2x, 4x). */
  step(dtMs: number, speed = 1): void {
    const dt = Math.min(Math.max(0, dtMs), MOTION.maxStepMs) * speed
    if (dt === 0) return
    if (this.scene.game) this.stepGame(dt)
    else this.stepScript(dt)
    this.moveBodies(dt)
    this.moveBall(dt)
  }

  private moveBodies(dt: number): void {
    const area: Area = this.scene.area
    const k = 1 - Math.exp(-dt / MOTION.responseMs)
    const sec = dt / 1000
    for (const b of this.bodies) {
      const dx = b.tx - b.x
      const dy = b.ty - b.y
      const d = Math.hypot(dx, dy)
      const top = this.scene.game || this.scene.zone === 'circuit' ? MOTION.maxSpeed : MOTION.jogSpeed + 1.4
      const want = Math.min(top, d * 3.2)
      const wx = d > 1e-6 ? (dx / d) * want : 0
      const wy = d > 1e-6 ? (dy / d) * want : 0
      b.vx += (wx - b.vx) * k
      b.vy += (wy - b.vy) * k
      b.x = clamp(b.x + b.vx * sec, area.x - 1, area.x + area.w + 1)
      b.y = clamp(b.y + b.vy * sec, area.y - 1, area.y + area.h + 1)
    }
  }

  private moveBall(dt: number): void {
    const ball = this.ball
    const f = this.flight
    if (f) {
      f.t += dt
      const u = clamp(f.t / f.ms, 0, 1)
      // o destino se mexe com o receptor: a bola persegue o ponto atual dele
      const to = f.receiver !== null && this.bodies[f.receiver] ? { x: (this.bodies[f.receiver] as Body).x, y: (this.bodies[f.receiver] as Body).y } : f.to
      ball.x = f.from.x + (to.x - f.from.x) * u
      ball.y = f.from.y + (to.y - f.from.y) * u
      ball.height = f.arc * Math.sin(Math.PI * u)
      if (u >= 1) {
        this.flight = null
        ball.height = 0
        if (f.receiver !== null) {
          this.holder = f.receiver
          const r = this.bodies[f.receiver]
          if (this.scene.game && r && r.side !== 'n') this.possession = r.side
        } else if (this.scene.game && this.shotBy) {
          // Finalização: gol de enfeite (o placar sai do gerador local) e a bola volta ao jogo pelo outro time.
          if (this.rnd() < 0.4 && this.shotBy !== 'n') this.score[this.shotBy]++
          const other: Side = this.shotBy === 'a' ? 'b' : 'a'
          this.shotBy = null
          this.restart(other)
        }
      }
      return
    }
    if (this.holder !== null && !this.scene.game) {
      const h = this.bodies[this.holder]
      if (h) {
        ball.x = h.x + 0.6
        ball.y = h.y + 0.2
        ball.height = 0
      }
    }
  }
}
