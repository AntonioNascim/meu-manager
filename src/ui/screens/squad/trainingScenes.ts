/**
 * Cenas do campinho do treino (só visual, dado puro). Cada exercício é uma cena: a zona do campo onde acontece, quem participa,
 * os cones e gols, e um roteiro de passos (cada passo move os jogadores a pontos e leva a bola de um ponto a outro). Os jogos reduzidos
 * (11x11, 8x8...) não têm roteiro: viram um mini-jogo simulado em `trainingMotion.ts`. Nada daqui entra em conta do jogo.
 * Coordenadas no campo de 105 × 68, o time `a` ataca para a direita.
 */
import type { DrillZone } from '../../labels'
import type { DrillId } from '../../../engine/types'

export interface P {
  x: number
  y: number
}
export interface Area {
  x: number
  y: number
  w: number
  h: number
}
/** `a` os titulares, `b` os reservas (ou os rivais do exercício), `n` os coringas. */
export type Side = 'a' | 'b' | 'n'
export type Ref = number | P

export interface ActorInit {
  side: Side
  at: P
  keeper?: boolean
}
export interface Step {
  ms: number
  move: Record<number, P>
  ball?: { from: Ref; to: Ref; delay: number; flight: number; arc: number }
}
export interface GameSpec {
  /** Jogadores por lado e coringas. */
  n: number
  jokers: number
  goals: 'big' | 'small' | 'none'
}
export interface Scene {
  zone: DrillZone
  area: Area
  actors: ActorInit[]
  cones: P[]
  goals: Area[]
  ladders: Area[]
  steps: Step[]
  game?: GameSpec
}

/** `rest` é a folga (jogadores descansando) e `idle` o dia sem treino montado (campo vazio). */
export type SceneId = DrillId | 'rest' | 'idle'

const FIELD = { w: 105, h: 68 } as const
export const FIELD_SIZE = FIELD

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
/** Número em [-1, 1] estável para a chave. */
const wobble = (key: string): number => ((hash(key) % 2001) - 1000) / 1000

const at = (x: number, y: number): P => ({ x, y })
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)
const pointOf = (actors: readonly ActorInit[], ref: Ref): P => (typeof ref === 'number' ? (actors[ref] as ActorInit).at : ref)
const clampTo = (p: P, area: Area): P => ({ x: Math.min(area.x + area.w, Math.max(area.x, p.x)), y: Math.min(area.y + area.h, Math.max(area.y, p.y)) })

const BIG_GOAL = (x: 'left' | 'right'): Area => ({ x: x === 'left' ? -1.8 : FIELD.w - 0.2, y: 29.5, w: 2, h: 9 })
const SMALL_GOAL = (x: number): Area => ({ x: x - 1, y: 31, w: 2, h: 6 })

/**
 * Roteiro de passes entre posições fixas: cada passo leva a bola de um jogador a outro; quem não tem a bola se mexe pouco em volta do
 * seu ponto, os que `chase` se aproximam da bola (pressão e bloco) e o que recebe dá um passo em direção à bola.
 */
function passScript(actors: readonly ActorInit[], passes: readonly number[], area: Area, opts: { chase?: readonly number[]; shift?: number; ms?: number; key: string }): Step[] {
  const steps: Step[] = []
  const ms = opts.ms ?? 1000
  for (let i = 0; i < passes.length; i++) {
    const from = passes[i] as number
    const to = passes[(i + 1) % passes.length] as number
    const ball = (actors[to] as ActorInit).at
    const move: Record<number, P> = {}
    actors.forEach((a, k) => {
      const w = at(wobble(`${opts.key}:${i}:${k}:x`) * 1.6, wobble(`${opts.key}:${i}:${k}:y`) * 1.6)
      let target = at(a.at.x + w.x, a.at.y + w.y)
      if (opts.chase?.includes(k)) target = at(a.at.x + (ball.x - a.at.x) * (opts.shift ?? 0.3) + w.x * 0.5, a.at.y + (ball.y - a.at.y) * (opts.shift ?? 0.3) + w.y * 0.5)
      if (k === to) target = at(a.at.x + (pointOf(actors, from).x - a.at.x) * 0.12, a.at.y + (pointOf(actors, from).y - a.at.y) * 0.12)
      move[k] = clampTo(target, area)
    })
    const far = dist(pointOf(actors, from), ball)
    // O passe dura o que a distância pede (200 ms mais 22 ms por metro): bola longa leva o passo a ficar mais longo, nunca mais rápida.
    const flight = Math.min(2400, 200 + far * 22)
    steps.push({ ms: Math.max(ms, ms * 0.2 + flight + 150), move, ball: { from, to, delay: ms * 0.2, flight, arc: far > 22 ? 0.9 : 0.15 } })
  }
  return steps
}

const base = (zone: DrillZone, area: Area, actors: ActorInit[], extra: Partial<Scene> = {}): Scene => ({ zone, area, actors, cones: [], goals: [], ladders: [], steps: [], ...extra })
const A = (x: number, y: number, keeper = false): ActorInit => ({ side: 'a', at: at(x, y), ...(keeper ? { keeper: true } : {}) })
const B = (x: number, y: number): ActorInit => ({ side: 'b', at: at(x, y) })

/** Exercício de passes (saída, passe final, ataque): `anchors` são os jogadores do time, `foes` os marcadores. */
function shape(zone: DrillZone, area: Area, mine: ActorInit[], foes: ActorInit[], passes: number[], key: string, opts: { chase?: 'foes' | 'mine'; shift?: number; goals?: Area[]; cones?: P[]; ms?: number } = {}): Scene {
  const actors = [...mine, ...foes]
  // Quem se aproxima da bola: os marcadores (saída de bola, passe) ou o nosso time (pressão e bloco, em que os rivais é que passam).
  const chase = opts.chase === 'foes' ? foes.map((_, i) => mine.length + i) : opts.chase === 'mine' ? mine.map((_, i) => i) : []
  return base(zone, area, actors, { goals: opts.goals ?? [], cones: opts.cones ?? [], steps: passScript(actors, passes, area, { chase, shift: opts.shift ?? 0.3, key, ...(opts.ms ? { ms: opts.ms } : {}) }) })
}

/** Fila de finalizações: cada um vem da fila, conduz até a área e bate; o goleiro cai num canto. */
function shooting(queue: P[], spots: P[], keeperAt: P, area: Area, extra: ActorInit[] = []): Scene {
  const actors: ActorInit[] = [...queue.map((p) => A(p.x, p.y)), B(keeperAt.x, keeperAt.y), ...extra]
  const keeper = queue.length
  const steps: Step[] = []
  for (let i = 0; i < queue.length * 2; i++) {
    const shooter = i % queue.length
    const spot = spots[i % spots.length] as P
    const corner = at(FIELD.w + 0.5, 34 + (i % 2 === 0 ? -3.2 : 3.2))
    const move: Record<number, P> = {}
    queue.forEach((p, k) => (move[k] = k === shooter ? spot : p))
    move[keeper] = at(keeperAt.x, 34 + (i % 2 === 0 ? -2.6 : 2.6))
    // O chutador conduz até o ponto de finalização (andando) e só então bate; o chute tem duração proporcional à distância.
    const run = dist(queue[shooter] as P, spot)
    const delay = Math.min(5000, (run / 3.6) * 1000 + 300)
    const shot = Math.max(450, dist(spot, corner) * 20)
    steps.push({ ms: delay + shot + 200, move, ball: { from: shooter, to: corner, delay, flight: shot, arc: 0.1 } })
    const back = queue[(shooter + 1) % queue.length] as P
    const flight = Math.max(700, dist(corner, back) * 28)
    steps.push({ ms: flight + 300, move: { ...Object.fromEntries(queue.map((p, k) => [k, p])), [keeper]: keeperAt }, ball: { from: corner, to: back, delay: 100, flight, arc: 0.1 } })
  }
  return base('opponent-box', area, actors, { goals: [BIG_GOAL('right')], steps })
}

/** Circuito de corrida: os jogadores seguem de cone em cone, cada um um passo atrás do outro. */
function circuit(key: string, cones: P[], runners: number, area: Area, ladders: Area[] = [], ms = 1100): Scene {
  const actors: ActorInit[] = Array.from({ length: runners }, (_, i) => A((cones[i % cones.length] as P).x, (cones[i % cones.length] as P).y))
  const steps: Step[] = []
  for (let s = 0; s < cones.length; s++) {
    const move: Record<number, P> = {}
    actors.forEach((_, i) => {
      const c = cones[(s + 1 + i * Math.floor(cones.length / runners)) % cones.length] as P
      move[i] = at(c.x + wobble(`${key}:${s}:${i}:x`) * 0.8, c.y + wobble(`${key}:${s}:${i}:y`) * 0.8)
    })
    steps.push({ ms, move })
  }
  return base('circuit', area, actors, { cones, ladders, steps })
}

const ring = (cx: number, cy: number, r: number, n: number, phase = 0): P[] => Array.from({ length: n }, (_, i) => at(cx + r * Math.cos(phase + (i / n) * Math.PI * 2), cy + r * Math.sin(phase + (i / n) * Math.PI * 2)))

function build(): Record<SceneId, Scene> {
  const wholeArea: Area = { x: 0, y: 0, w: FIELD.w, h: FIELD.h }
  const scenes = {} as Record<SceneId, Scene>
  const game = (zone: DrillZone, area: Area, n: number, jokers: number, goals: GameSpec['goals']): Scene => ({
    ...base(zone, area, []),
    goals: goals === 'big' ? [BIG_GOAL('left'), BIG_GOAL('right')] : goals === 'small' ? [SMALL_GOAL(area.x), SMALL_GOAL(area.x + area.w)] : [],
    game: { n, jokers, goals },
  })
  scenes['full-match'] = game('whole', wholeArea, 11, 0, 'big')
  scenes['eight-a-side'] = game('whole', { x: 14, y: 4, w: 77, h: 60 }, 8, 0, 'big')
  scenes['six-a-side'] = game('midfield', { x: 28, y: 10, w: 49, h: 48 }, 6, 0, 'small')
  scenes['five-a-side'] = game('midfield', { x: 34, y: 14, w: 37, h: 40 }, 5, 0, 'small')
  scenes['joker-possession'] = game('midfield', { x: 33, y: 12, w: 39, h: 44 }, 4, 2, 'none')
  scenes['three-a-side'] = game('midfield', { x: 40, y: 20, w: 25, h: 28 }, 3, 0, 'small')

  const rondoArea: Area = { x: 38, y: 20, w: 29, h: 28 }
  const outer = ring(52.5, 34, 9.5, 5, -Math.PI / 2)
  scenes.rondo = shape('midfield', rondoArea, outer.map((p) => A(p.x, p.y)), [B(50.5, 33), B(55, 36)], [0, 2, 4, 1, 3, 0], 'rondo', { chase: 'foes', shift: 0.55, ms: 850 })

  const own: Area = { x: 2, y: 6, w: 56, h: 56 }
  scenes['build-from-back'] = shape('own-half', own, [A(7, 34, true), A(17, 20), A(17, 48), A(30, 34), A(30, 10), A(30, 58)], [B(26, 26), B(26, 42)], [0, 1, 3, 2, 3, 4, 3, 5, 3], 'bfb', { chase: 'foes', shift: 0.35 })
  scenes['keeper-start'] = shape('own-box', { x: 2, y: 8, w: 40, h: 52 }, [A(7, 34, true), A(15, 22), A(15, 46), A(25, 12), A(25, 56), A(27, 34)], [B(21, 29), B(21, 39)], [0, 1, 5, 2, 0, 2, 4], 'ks', { chase: 'foes', shift: 0.45 })
  scenes['midfield-pivot'] = shape('own-half', own, [A(19, 24), A(19, 44), A(34, 34), A(43, 18), A(43, 50), A(28, 34)], [B(37, 24), B(37, 44), B(31, 34)], [0, 2, 3, 2, 4, 2, 1, 5], 'mp', { chase: 'foes', shift: 0.25 })
  scenes['wide-exit'] = shape('own-half', { x: 2, y: 2, w: 70, h: 64 }, [A(16, 24), A(28, 8), A(46, 9), A(35, 26), A(62, 28), A(26, 44)], [B(37, 14), B(50, 18)], [0, 3, 1, 2, 4, 3, 5], 'we', { chase: 'foes', shift: 0.4 })

  const press: Area = { x: 38, y: 6, w: 60, h: 56 }
  scenes['high-press-trigger'] = shape('final-third', press, [A(62, 14), A(62, 28), A(62, 40), A(62, 54), A(52, 24), A(52, 44)], [B(78, 12), B(80, 28), B(80, 44), B(78, 58)], [6, 7, 8, 9, 8, 7], 'hp', { chase: 'mine', shift: 0.55, ms: 900 })
  // No exercício de pressão, quem pressiona é o time `a`; a bola circula entre os rivais (índices 6 a 9).
  scenes['mid-block'] = shape('midfield', { x: 26, y: 6, w: 54, h: 56 }, [A(38, 12), A(38, 26), A(38, 42), A(38, 56), A(46, 22), A(46, 46)], [B(62, 14), B(64, 30), B(64, 44), B(62, 56)], [6, 7, 8, 9, 8, 7], 'mb', { chase: 'mine', shift: 0.3, ms: 1050 })
  scenes['low-block'] = shape('own-box', { x: 2, y: 6, w: 50, h: 56 }, [A(14, 14), A(14, 28), A(14, 40), A(14, 54), A(22, 24), A(22, 44)], [B(40, 14), B(42, 30), B(42, 44), B(40, 56)], [6, 7, 8, 9, 8, 7], 'lb', { chase: 'mine', shift: 0.22, ms: 1050 })
  scenes['counter-press'] = shape('midfield', { x: 30, y: 6, w: 56, h: 56 }, [A(56, 18), A(56, 34), A(56, 50), A(48, 26), A(48, 42)], [B(60, 30), B(70, 20), B(70, 46), B(78, 34)], [5, 6, 5, 7, 8, 7], 'cp', { chase: 'mine', shift: 0.6, ms: 800 })

  const right: Area = { x: 46, y: 2, w: 59, h: 64 }
  scenes['overlap-crosses'] = shape('final-third', right, [A(56, 60), A(70, 54), A(90, 34), A(84, 22), A(84, 46)], [B(80, 50), B(90, 28)], [0, 1, 0, 2, 4, 2], 'oc', { chase: 'foes', shift: 0.2, goals: [BIG_GOAL('right')] })
  scenes['one-two-wall'] = shape('final-third', right, [A(60, 40), A(70, 30), A(84, 24), A(92, 34)], [B(74, 38), B(86, 32)], [0, 1, 0, 2, 3, 2], 'ow', { chase: 'foes', shift: 0.2, goals: [BIG_GOAL('right')], ms: 850 })
  scenes['finishing-box'] = shooting([at(66, 14), at(64, 22), at(64, 46), at(66, 54)], [at(88, 28), at(90, 38), at(86, 34), at(88, 30)], at(103, 34), { x: 56, y: 6, w: 49, h: 56 })
  scenes['counter-run'] = shape('whole', wholeArea, [A(30, 34), A(52, 18), A(56, 34), A(52, 50), A(86, 34)], [B(36, 28), B(36, 42), B(66, 34)], [0, 2, 1, 4, 2, 3], 'cr', { chase: 'foes', shift: 0.15, goals: [BIG_GOAL('right')], ms: 800 })

  scenes['through-balls'] = shape('final-third', right, [A(58, 34), A(72, 18), A(74, 52), A(94, 30)], [B(80, 24), B(82, 38), B(88, 46)], [0, 3, 1, 2, 0], 'tb', { chase: 'foes', shift: 0.15, goals: [BIG_GOAL('right')] })
  scenes.cutback = shape('final-third', right, [A(62, 50), A(96, 62), A(90, 34), A(80, 28), A(80, 44)], [B(88, 44), B(86, 24)], [0, 1, 4, 2, 3, 2], 'cb', { chase: 'foes', shift: 0.15, goals: [BIG_GOAL('right')] })
  scenes['third-man'] = shape('midfield', { x: 30, y: 8, w: 66, h: 52 }, [A(40, 34), A(54, 22), A(68, 40), A(78, 28)], [B(50, 32), B(64, 30)], [0, 1, 2, 3, 2, 1], 'tm', { chase: 'foes', shift: 0.2, ms: 900 })
  scenes['long-diagonal'] = shape('whole', wholeArea, [A(30, 54), A(62, 22), A(86, 10), A(70, 50)], [B(60, 40), B(80, 20)], [0, 2, 3, 1, 0], 'ld', { chase: 'foes', shift: 0.1, ms: 1300 })

  scenes['corners-for'] = cornerScene('cf', true)
  scenes['corners-against'] = cornerScene('ca', false)
  scenes['free-kicks'] = freeKick()
  scenes['penalty-shootout'] = shooting([at(84, 34), at(84, 34), at(84, 34), at(84, 34), at(84, 34)].map((p, i) => at(p.x - 2 * i, 34 + (i - 2) * 6)), [at(94, 34)], at(103.5, 34), { x: 70, y: 14, w: 35, h: 40 })

  scenes['conditioning-circuit'] = circuit('cc', [at(20, 14), at(52, 10), at(84, 14), at(88, 54), at(52, 58), at(18, 54)], 6, wholeArea)
  scenes['speed-agility'] = circuit('sa', [at(20, 24), at(34, 44), at(48, 24), at(62, 44), at(76, 24), at(90, 44)], 5, wholeArea, [{ x: 18, y: 8, w: 36, h: 4 }, { x: 18, y: 56, w: 36, h: 4 }], 800)
  scenes['strength-circuit'] = circuit('sg', [at(30, 20), at(52, 20), at(74, 20), at(74, 48), at(52, 48), at(30, 48)], 6, { x: 20, y: 10, w: 65, h: 48 }, [], 1500)
  const jog = ring(52.5, 34, 18, 8)
  scenes['recovery-session'] = base('midfield', { x: 24, y: 8, w: 57, h: 52 }, jog.map((p) => A(p.x, p.y)), { steps: Array.from({ length: 8 }, (_, s) => ({ ms: 1800, move: Object.fromEntries(ring(52.5, 34, 18, 8, ((s + 1) / 8) * Math.PI * 2).map((p, i) => [i, p])) })) })
  const seats = Array.from({ length: 12 }, (_, i) => at(30 + (i % 6) * 9, 26 + Math.floor(i / 6) * 14))
  scenes['video-session'] = base('midfield', { x: 22, y: 12, w: 62, h: 44 }, seats.map((p) => A(p.x, p.y)), { steps: [{ ms: 4000, move: {} }], goals: [{ x: 44, y: 5, w: 17, h: 3 }] })
  const restAt = ring(52.5, 34, 9, 6)
  scenes.rest = base('midfield', { x: 30, y: 20, w: 45, h: 28 }, restAt.map((p) => A(p.x, p.y)), { steps: Array.from({ length: 6 }, (_, s) => ({ ms: 2600, move: Object.fromEntries(restAt.map((p, i) => [i, at(p.x + wobble(`rest:${s}:${i}:x`) * 1.2, p.y + wobble(`rest:${s}:${i}:y`) * 1.2)])) })) })
  scenes.idle = base('midfield', { x: 30, y: 20, w: 45, h: 28 }, [], { steps: [{ ms: 4000, move: {} }] })
  return scenes
}

/** Escanteio: o cobrador no canto, atacantes e marcadores na área; a bola cruza, alguém cabeceia, o goleiro defende. */
function cornerScene(key: string, attack: boolean): Scene {
  const mine = attack ? 'a' : 'b'
  const theirs = attack ? 'b' : 'a'
  const side = (s: Side, x: number, y: number): ActorInit => ({ side: s, at: at(x, y) })
  const actors: ActorInit[] = [
    side(mine, 103, 2), // 0 cobrador
    side(mine, 92, 24),
    side(mine, 94, 32),
    side(mine, 90, 40),
    side(mine, 97, 28),
    side(theirs, 94, 26),
    side(theirs, 94, 33),
    side(theirs, 91, 40),
    side(theirs, 98, 30),
    side(theirs, 103.5, 34), // 9 goleiro
  ]
  const area: Area = { x: 62, y: 2, w: 43, h: 64 }
  const steps: Step[] = []
  for (let i = 0; i < 4; i++) {
    const target = at(94 + wobble(`${key}:${i}:tx`) * 2, 30 + wobble(`${key}:${i}:ty`) * 3)
    const move: Record<number, P> = {}
    actors.forEach((a, k) => {
      move[k] = clampTo(at(a.at.x + wobble(`${key}:${i}:${k}:x`) * 1.5, a.at.y + wobble(`${key}:${i}:${k}:y`) * 1.5), area)
    })
    move[1 + (i % 3)] = target
    steps.push({ ms: 1300, move, ball: { from: 0, to: target, delay: 400, flight: 750, arc: 1 } })
    steps.push({ ms: 800, move: Object.fromEntries(actors.map((a, k) => [k, a.at])), ball: { from: target, to: at(103, 2), delay: 200, flight: 500, arc: 0.1 } })
  }
  return base('opponent-box', area, actors, { goals: [BIG_GOAL('right')], steps })
}

/** Falta perigosa: a barreira a 9 metros, o cobrador e o goleiro; a bola vai ao gol e volta. */
function freeKick(): Scene {
  const ball = at(76, 38)
  const wall = [at(68.5, 31), at(68.5, 34), at(68.5, 37), at(68.5, 40)]
  const actors: ActorInit[] = [A(ball.x - 3, ball.y + 2), A(ball.x - 3, ball.y - 4), ...wall.map((p) => B(p.x, p.y)), B(103.5, 34), A(90, 26), A(90, 42)]
  const area: Area = { x: 56, y: 12, w: 49, h: 44 }
  const steps: Step[] = []
  for (let i = 0; i < 4; i++) {
    const shot = at(FIELD.w + 0.5, 34 + (i % 2 === 0 ? -3 : 3.2))
    steps.push({ ms: 1500, move: { 0: at(ball.x - 1.2, ball.y + 0.5), 6: at(103.5, 34 + (i % 2 === 0 ? -2.4 : 2.6)) }, ball: { from: ball, to: shot, delay: 800, flight: 520, arc: 0.9 } })
    steps.push({ ms: 900, move: { 0: at(ball.x - 3, ball.y + 2), 6: at(103.5, 34) }, ball: { from: shot, to: ball, delay: 100, flight: 600, arc: 0.1 } })
  }
  return base('final-third', area, actors, { goals: [BIG_GOAL('right')], steps })
}

export const SCENES: Record<SceneId, Scene> = build()
