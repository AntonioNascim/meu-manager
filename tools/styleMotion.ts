/**
 * Mede como o movimento do campo 2D muda com o estilo de jogo e a mentalidade (só a animação: o motor da partida não é alterado aqui).
 * Toca partidas inteiras pelo mesmo caminho da tela (`choosePlan` + `PitchMotion`, 1x, 60 quadros) com o time da casa no estilo e na mentalidade
 * pedidos (o visitante fica neutro) e mede, só para o time da casa:
 *   passes por posse, distância média do passe, % de bolas longas (> 30 m), altura do time com e sem a bola (m a partir do próprio gol),
 *   % do caminho da bola pelos lados (y < 25% ou > 75%), jogadores à frente da bola em ataque, jogadores a 12 m da bola sem a posse,
 *   cruzamentos por jogo.
 * Uso: node tools/run.mjs styleMotion [--seeds 6]   (grava .shots/fluidez/estilos.json)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateWorld } from '../src/data/generateWorld'
import { formationOf } from '../src/engine/formations'
import { startMatch } from '../src/engine/match'
import type { MatchInput } from '../src/engine/match'
import type { Mentality, PlayStyle, Player, Team } from '../src/engine/types'
import { beatsFor, layoutFrom } from '../src/ui/screens/match/pitchModel'
import { PitchMotion, choosePlan, meters } from '../src/ui/screens/match/pitchMotion'

const FRAME_MS = 1000 / 60

export interface StyleConfig {
  style: PlayStyle
  mentality: Mentality
}

export interface StyleMetrics {
  matches: number
  possessions: number
  passesPerPossession: number
  avgPassM: number
  longPct: number
  heightWith: number
  heightWithout: number
  flankPct: number
  aheadOfBall: number
  /** Profundidade média (m a partir do próprio gol) dos atacantes e pontas com a bola: a corrida para o ataque. */
  forwardDepth: number
  nearBallWithout: number
  crossesPerGame: number
  /** Por tipo de trecho completado pelo time da casa: quantos por jogo e distância média (m). */
  kinds: Record<string, { perGame: number; avgM: number }>
}

const world = generateWorld({ seed: 11 })
const squad = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
const [a, b] = world.teams.filter((t) => t.tier === 1) as [Team, Team]

const wingers = (snap: ReturnType<ReturnType<typeof startMatch>['snapshot']>) => ({
  home: formationOf({ formationId: snap.home.formationId, grid: snap.home.grid }).slots.find((s) => s.position === 'RW' || s.position === 'LW')?.sector === 'attack',
  away: formationOf({ formationId: snap.away.formationId, grid: snap.away.grid }).slots.find((s) => s.position === 'RW' || s.position === 'LW')?.sector === 'attack',
})

/** Mede um estilo e mentalidade do time da casa em várias partidas (uma por semente). */
export function measureStyle(cfg: StyleConfig, seeds: readonly number[]): StyleMetrics {
  const home: Team = { ...a, tactic: { ...a.tactic, style: cfg.style, mentality: cfg.mentality } }
  const away: Team = { ...b, tactic: { ...b.tactic, style: 'possession', mentality: 0 } }
  let seqCount = 0
  let passCount = 0
  let passMeters = 0
  let longCount = 0
  let crossCount = 0
  let withSum = 0
  let withN = 0
  let withoutSum = 0
  let withoutN = 0
  let flank = 0
  let total = 0
  let aheadSum = 0
  let aheadN = 0
  let fwdSum = 0
  let fwdN = 0
  let nearSum = 0
  let nearN = 0
  const kinds = new Map<string, { n: number; m: number }>()

  for (const seed of seeds) {
    const input: MatchInput = { home: { team: home, players: squad(a) }, away: { team: away, players: squad(b) }, seed, attendance: 30_000, userControlled: { home: true, away: true } }
    const live = startMatch(input)
    const motion = new PitchMotion()
    let processed = 0
    let lastSide: 'home' | 'away' | undefined
    let poss: 'home' | 'away' = 'home'
    for (let minute = 1; minute <= 90; minute++) {
      live.playUntil(minute)
      const snap = live.snapshot()
      const layout = layoutFrom(snap, wingers(snap))
      motion.setLayout(layout, { home: snap.home.activeMentality, away: snap.away.activeMentality })
      const fresh = snap.trace.slice(processed)
      processed = snap.trace.length
      const last = fresh[fresh.length - 1]
      let tick = 1600
      if (last) {
        const beats = beatsFor(last, layout, snap.events, new Set(layout.keys()))
        if (beats.length > 0) {
          const choice = choosePlan(beats, last, fresh.length, 1)
          tick = choice.tick
          motion.plan(choice.seq, { trace: last, names: (id) => id, tickMs: choice.tick, connectors: choice.connectors, relays: choice.relays, arrows: !choice.quick, setPiece: choice.setPiece, floors: !choice.quick })
        }
      }
      for (let f = 0; f < Math.round(tick / FRAME_MS); f++) {
        const before = { ...motion.ball.pos }
        for (const ev of motion.step(FRAME_MS, { running: true, speed: 1 })) {
          if (ev.type !== 'end') continue
          const leg = ev.leg
          const holderSide = ev.holder ? motion.bodies.get(ev.holder)?.placed.side : undefined
          if (holderSide && holderSide !== lastSide) {
            if (holderSide === 'home') seqCount++
            lastSide = holderSide
          }
          const fromSide = leg.fromId ? motion.bodies.get(leg.fromId)?.placed.side : undefined
          const isPass = leg.kind === 'pass' || leg.kind === 'long' || leg.kind === 'cross'
          if (isPass && fromSide === 'home' && holderSide === 'home' && leg.start) {
            const d = meters(leg.start, motion.ball.pos)
            passCount++
            passMeters += d
            if (d > 30) longCount++
            if (leg.kind === 'cross') crossCount++
            const k = kinds.get(leg.kind) ?? { n: 0, m: 0 }
            kinds.set(leg.kind, { n: k.n + 1, m: k.m + d })
          }
        }
        poss = motion.ball.holder ? (motion.bodies.get(motion.ball.holder)?.placed.side ?? poss) : (motion.leg?.attSide ?? poss)
        const ball = motion.ball.pos
        const mine = [...motion.bodies.values()].filter((body) => body.placed.side === 'home' && body.placed.slot !== 'GK')
        const depth = (x: number) => x * 105
        const avg = mine.reduce((s, body) => s + depth(body.pos.x), 0) / Math.max(1, mine.length)
        if (poss === 'home') {
          withSum += avg
          withN++
          const step = meters(before, ball)
          total += step
          if (ball.y < 0.25 || ball.y > 0.75) flank += step
          aheadSum += mine.filter((body) => depth(body.pos.x) > depth(ball.x) + 2).length
          aheadN++
          for (const body of mine) {
            if (body.placed.slot === 'ST' || body.placed.slot === 'RW' || body.placed.slot === 'LW') {
              fwdSum += depth(body.pos.x)
              fwdN++
            }
          }
        } else {
          withoutSum += avg
          withoutN++
          nearSum += mine.filter((body) => meters(body.pos, ball) < 12).length
          nearN++
        }
      }
    }
  }
  const games = seeds.length
  return {
    matches: games,
    possessions: Math.round(seqCount / games),
    passesPerPossession: round(passCount / Math.max(1, seqCount)),
    avgPassM: round(passMeters / Math.max(1, passCount)),
    longPct: round((100 * longCount) / Math.max(1, passCount)),
    heightWith: round(withSum / Math.max(1, withN)),
    heightWithout: round(withoutSum / Math.max(1, withoutN)),
    flankPct: round((100 * flank) / Math.max(1, total)),
    aheadOfBall: round(aheadSum / Math.max(1, aheadN)),
    forwardDepth: round(fwdSum / Math.max(1, fwdN)),
    nearBallWithout: round(nearSum / Math.max(1, nearN)),
    crossesPerGame: round(crossCount / games),
    kinds: Object.fromEntries([...kinds].map(([k, v]) => [k, { perGame: round(v.n / games), avgM: round(v.m / v.n) }])),
  }
}

const round = (v: number) => Math.round(v * 100) / 100

export const STYLES: readonly PlayStyle[] = ['possession', 'direct', 'counter-attack', 'wings', 'high-press']
export const MENTALITIES: readonly Mentality[] = [-2, -1, 0, 1, 2]

function main() {
  const flag = process.argv.indexOf('--seeds')
  const count = flag > 0 ? Number(process.argv[flag + 1]) : 6
  const seeds = Array.from({ length: count }, (_, i) => i + 1)
  const out: { styles: Record<string, StyleMetrics>; mentalities: Record<string, StyleMetrics> } = { styles: {}, mentalities: {} }
  console.log(`Estilos (mentalidade equilibrada), ${count} partidas cada:`)
  for (const style of STYLES) {
    out.styles[style] = measureStyle({ style, mentality: 0 }, seeds)
    console.log(style.padEnd(15), JSON.stringify(out.styles[style]))
  }
  console.log('\nMentalidades (toque de bola):')
  for (const mentality of MENTALITIES) {
    out.mentalities[String(mentality)] = mentality === 0 ? (out.styles['possession'] as StyleMetrics) : measureStyle({ style: 'possession', mentality }, seeds)
    console.log(String(mentality).padEnd(15), JSON.stringify(out.mentalities[String(mentality)]))
  }
  const dir = resolve('.shots/fluidez')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'estilos.json'), JSON.stringify(out, null, 2))
  console.log('\nGravado em .shots/fluidez/estilos.json')
}

if (process.argv[1] === 'styleMotion') main()
