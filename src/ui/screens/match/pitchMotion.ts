/**
 * Movimento contínuo do campo 2D (só visual): em vez de "fotos" de cada lance, os 22 jogadores e a bola têm posição e velocidade que evoluem a cada
 * quadro. O motor da partida continua decidindo tudo; aqui só se anima o que ele já gerou (`beatsFor`), sem sorteio do motor (variações vêm de `hash`).
 *
 * - A bola nunca teleporta: ou está com um jogador (acompanha), ou em voo de um ponto a outro com tempo proporcional à distância, ou solta.
 *   Cada lance parte de onde a bola está; entre o fim do lance anterior e o começo do próximo o campo gera passes curtos do time com a posse.
 * - Os jogadores deslizam como um bloco atrás da bola (profundidade e lado), cada um na sua posição e no estilo do time, com um movimento
 *   individual pequeno; quem marca acompanha o adversário próximo e os mais perto da bola pressionam.
 * - Coordenadas normalizadas (x: 0 gol da esquerda a 1 gol da direita; y: 0 topo a 1 base), campo de 105 × 68 m.
 */
import type { PlayTrace } from '../../../engine/match'
import type { Position } from '../../../engine/types'
import { BASE_MINUTE_MS } from '../../../engine/match/timing'
import { fitBeats, hash, shifted, slowFor } from './pitchModel'
import type { Beat, Layout, Mark, Phase, Placed, Pt, Side } from './pitchModel'
import { shapeOf } from './pitchStyle'

export const FIELD_W = 105
export const FIELD_H = 68

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
/** Distância em metros entre dois pontos normalizados. */
export const meters = (a: Pt, b: Pt): number => Math.hypot((a.x - b.x) * FIELD_W, (a.y - b.y) * FIELD_H)
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** Distância (m) abaixo da qual a bola já está perto do destino do lance e a ligação não precisa de mais passes. */
const SHORT_PASS_M = 20

/** Quanto cada posição acompanha a bola em profundidade (o goleiro quase não sai do lugar). */
/** Quanto cada posição sobe (+) ou recua (−) por nível de mentalidade, com a bola (ataque) e sem ela (linha de marcação). */
const M_ATT: Record<Position, number> = { GK: 0, CB: 0.03, RB: 0.06, LB: 0.06, DM: 0.05, CM: 0.055, AM: 0.04, RW: 0.03, LW: 0.03, ST: 0.02 }
const M_DEF: Record<Position, number> = { GK: 0, CB: 0.03, RB: 0.03, LB: 0.03, DM: 0.035, CM: 0.035, AM: 0.035, RW: 0.04, LW: 0.04, ST: 0.04 }
const FOLLOW: Record<Position, number> = { GK: 0.05, CB: 0.5, RB: 0.7, LB: 0.7, DM: 0.85, CM: 1, AM: 1.05, RW: 1, LW: 1, ST: 0.95 }
/** Força da marcação por posição de quem defende (0 = ignora o atacante, 1 = cola nele). */
const MARK: Record<Position, number> = { GK: 0, CB: 0.62, RB: 0.55, LB: 0.55, DM: 0.5, CM: 0.4, AM: 0.3, RW: 0.3, LW: 0.3, ST: 0.2 }

/** Menor tempo de um trecho da bola para ser visto (passe curto). */
export const LEG_MIN_MS = 150

export interface PlanChoice {
  seq: Beat[]
  tick: number
  connectors: number
  relays: number
  quick: boolean
  setPiece: boolean
}

/**
 * Como tocar um lance: quais batidas, quanto tempo e quantos passes de ligação. Usado pela tela e pela medição, para os números valerem para o
 * que o jogador vê. `freshCount` é quantos momentos chegaram de uma vez (vários = o campo mostra só o último).
 */
export function choosePlan(beats: readonly Beat[], last: PlayTrace, freshCount: number, speed: number, forceFull = false): PlanChoice {
  const slow = freshCount <= 2 || forceFull ? slowFor(last) : 0
  const tick = slow || BASE_MINUTE_MS / speed
  const simplified = !forceFull && !slow && (speed >= 4 || freshCount > 2)
  const quick = simplified || (!slow && speed >= 4)
  let seq: Beat[]
  let connectors = 0
  let relays = 0
  if (quick) seq = [beats[beats.length - 1] as Beat]
  else {
    // Cada trecho precisa de LEG_MIN_MS para ser visto: uns 30% do tempo vão para os passes de ligação e outros 20% para apoios nos passes longos, o resto para as batidas do lance.
    const room = Math.max(1, Math.floor(tick / LEG_MIN_MS))
    connectors = Math.min(3, Math.floor(room * 0.3))
    relays = Math.min(3, Math.floor(room * 0.2))
    seq = fitBeats(beats, Math.max(1, room - connectors - relays) * LEG_MIN_MS, LEG_MIN_MS)
  }
  const setPiece = !!last.shot && (last.shot.type === 'penalty' || last.shot.type === 'freeKick') && beats[0]?.phase === 'chance'
  return { seq, tick, connectors, relays, quick, setPiece }
}

/** Batida de troca de passes do campo do meio (passe curto com seta, sem finalização). */
const isChainBeat = (b: Beat): boolean => b.phase === 'midfield' && !!b.arrow && !b.arrow.curve && !b.arrow.solid && !!b.holder

export type LegKind = 'pass' | 'long' | 'cross' | 'carry' | 'shot' | 'recover' | 'set' | 'restart'

export interface Leg {
  kind: LegKind
  /** Duração (ms), já proporcional à distância e ajustada ao tempo do lance. */
  ms: number
  /** Para onde a bola vai (ponto fixo; com `toId` o destino real é o jogador, que corre até aqui). */
  toPt: Pt
  fromId?: string
  /** Quem fica com a bola ao fim (sem ele a bola fica solta no destino: gol, para fora, bola parada). */
  toId?: string
  /** Bola parada: o destino é o ponto, mesmo que o cobrador ande até ele. */
  fixed?: boolean
  curve: boolean
  beat?: Beat
  attSide: Side
  text: string
  endText?: string
  marks: Mark[]
  /** Desenha a seta do passe durante o trecho. */
  arrow: boolean
  /** Ponto de onde a bola saiu (preenchido ao começar o trecho). */
  start?: Pt
  /** Passe acrescentado pelo campo (ligação antes do lance ou apoio no meio de um passe longo): é o primeiro a sair quando falta tempo. */
  extra?: 'link' | 'relay'
}

export interface MotionEvent {
  type: 'start' | 'end'
  leg: Leg
  /** No fim de um trecho, quem ficou com a bola (sem ele a bola está solta: gol, para fora, bola parada). */
  holder?: string
}

interface Body {
  placed: Placed
  pos: Pt
  /** Velocidade em m/s. */
  vel: Pt
  phase: [number, number]
}

export interface BallState {
  pos: Pt
  mode: 'held' | 'flight' | 'loose'
  holder?: string | undefined
  /** 0 a 1: altura da bola em bola alta (só visual, vira escala). */
  height: number
}

export interface PlanContext {
  trace: PlayTrace
  names: (id: string) => string
  /** Tempo total do lance (ms), contando os passes de ligação. */
  tickMs: number
  /** Quantos passes de ligação podem ser gerados (0 em velocidades altas). */
  connectors: number
  /** Passes de apoio que podem ser acrescentados no meio de passes longos demais para o estilo (padrão: o mesmo número de `connectors`). */
  relays?: number
  /** Desenha setas. */
  arrows: boolean
  /** Cena de bola parada (pênalti e falta): a bola fica no ponto até a cobrança. */
  setPiece: boolean
  /** Respeita a velocidade máxima da bola (desligado nas velocidades altas, em que o lance tem que caber no minuto). */
  floors: boolean
}

/** Velocidade máxima média da bola por tipo de trecho (m/s), já esticando o tempo real da partida: acima disso o passe parece teletransporte. */
const BALL_V: Record<LegKind, number> = { pass: 80, long: 60, cross: 58, shot: 115, recover: 80, carry: 0, set: 35, restart: 50 }

const WEIGHT: Record<LegKind, [number, number]> = { pass: [0.45, 2.2], long: [0.7, 2.6], cross: [0.9, 2.6], shot: [1, 1.8], recover: [0.4, 1.5], carry: [0.8, 3], set: [1, 1], restart: [0.9, 0.5] }

export class PitchMotion {
  readonly bodies = new Map<string, Body>()
  readonly ball: BallState = { pos: { x: 0.5, y: 0.5 }, mode: 'loose', height: 0 }
  private legs: Leg[] = []
  private current: Leg | null = null
  private legT = 0
  /** Posições forçadas do último trecho (cena de bola parada, corrida ao cruzamento): valem até o próximo plano. */
  private override: Record<string, Pt> = {}
  private phase: Phase = 'midfield'
  private att: Side = 'home'
  private clock = 0
  private frame = 0
  private flush: Leg[] = []
  private marking = new Map<string, string>()
  private pressers = new Set<string>()
  private speed = 1
  private style: Partial<Record<Side, ReturnType<typeof shapeOf>>> = {}
  private mentality: Record<Side, number> = { home: 0, away: 0 }

  /** Cria, atualiza e remove os corpos conforme o time em campo (substituição, expulsão, mudança de formação). */
  setLayout(layout: Layout, mentality?: Partial<Record<Side, number>>): void {
    if (mentality) this.mentality = { home: mentality.home ?? 0, away: mentality.away ?? 0 }
    for (const id of [...this.bodies.keys()]) if (!layout.has(id)) this.bodies.delete(id)
    for (const [id, placed] of layout) {
      const body = this.bodies.get(id)
      if (body) body.placed = placed
      else this.bodies.set(id, { placed, pos: { ...placed.base }, vel: { x: 0, y: 0 }, phase: [hash(`${id}:a`) * 6.28, hash(`${id}:b`) * 6.28] })
    }
    for (const side of ['home', 'away'] as const) {
      const any = [...layout.values()].find((p) => p.side === side)
      this.style[side] = any ? shapeOf(any.style, this.mentality[side]) : undefined
    }
    if (this.ball.holder && !this.bodies.has(this.ball.holder)) {
      this.ball.holder = undefined
      this.ball.mode = 'loose'
    }
  }

  /** Quem está com a bola agora. */
  get holder(): string | undefined {
    return this.ball.holder
  }

  get playing(): boolean {
    return this.current !== null || this.legs.length > 0
  }

  /** Trecho em andamento (para a interface). */
  get leg(): Leg | null {
    return this.current
  }

  // -------------------------------------------------------------------------
  // Plano: batidas do motor + passes de ligação → trechos da bola
  // -------------------------------------------------------------------------

  /**
   * Troca o que a bola vai fazer. O que estava em andamento é abandonado onde está (a bola fica solta ali e o novo plano parte desse ponto),
   * então nunca há salto. Devolve os trechos montados (para teste).
   */
  plan(beats: readonly Beat[], ctx: PlanContext): Leg[] {
    // O que ia acontecer e não deu tempo (gol, defesa) ainda aparece: os trechos abandonados com marcação são "terminados" no próximo quadro.
    for (const l of [this.current, ...this.legs]) if (l && l.marks.length > 0) this.flush.push(l)
    if (this.current && this.ball.mode === 'flight') this.ball.mode = 'loose'
    this.current = null
    this.legs = []
    this.override = {}
    const first = beats[0]
    if (!first) return []
    const att = first.attSide
    this.att = att
    const legs: Leg[] = []
    let holder = this.ball.holder
    let at: Pt = this.ball.pos

    // Reinício depois de gol: a bola volta ao centro (o único ponto em que ela é recolocada: o juiz reinicia o jogo).
    const goalLine = at.x < 0.02 || at.x > 0.98
    if (goalLine && this.ball.mode === 'loose' && Math.abs(at.y - 0.5) < 0.12 && !holder) {
      // A bola sai da rede e rola até o centro, onde o jogo recomeça (nunca aparece em outro lugar de repente).
      const centre = this.mkLeg('restart', { toPt: { x: 0.5, y: 0.5 }, att: this.att, ctx, text: 'A bola volta ao centro do campo' })
      centre.fixed = true
      legs.push(centre)
      at = { x: 0.5, y: 0.5 }
      holder = undefined
    } else if (this.ball.mode === 'loose' && !holder && (at.x < 0.04 || at.x > 0.96 || at.y < 0.03 || at.y > 0.97)) {
      // Bola fora: o goleiro do lado mais próximo repõe.
      const side: Side = at.x < 0.5 ? 'home' : 'away'
      const keeper = [...this.bodies.values()].find((b) => b.placed.side === side && b.placed.slot === 'GK')
      if (keeper) legs.push(this.mkLeg('recover', { toPt: keeper.pos, toId: keeper.placed.playerId, att: side, ctx, text: `${ctx.names(keeper.placed.playerId)} repõe a bola` }))
      holder = keeper?.placed.playerId
      at = keeper?.pos ?? at
    }

    const holderBody = holder ? this.bodies.get(holder) : undefined
    let cur: Body | undefined = holderBody
    // Virada de posse: o jogador do time que ataca mais perto da bola a recupera.
    if (!cur || cur.placed.side !== att) {
      const near = this.nearest(att, at, undefined, false)
      if (near && first.holder !== near.placed.playerId) {
        legs.push(this.mkLeg('recover', { fromId: cur?.placed.playerId, toPt: near.pos, toId: near.placed.playerId, att, ctx, text: `${ctx.names(near.placed.playerId)} recupera a bola` }))
        cur = near
      }
    }
    // Passes curtos até onde o lance do motor começa.
    // O estilo decide quantos (toque de bola: três curtos mesmo perto; lançamento e contra-ataque: nenhum ou um, em bola longa e vertical).
    const target = this.bodies.get(first.holder ?? '')?.pos ?? first.ball
    const shape = this.style[att] ?? shapeOf(undefined)
    const [lo, hi] = shape.link
    const want = clamp(Math.round(lo + hash(`${ctx.trace.minute}:${att}:lk`) * (hi - lo)), 0, ctx.connectors)
    if (cur && want > 0) {
      const used = new Set<string>([cur.placed.playerId])
      const targetId = first.holder
      for (let i = 0; i < want; i++) {
        const gap = meters(cur.pos, target)
        // Quem toca a bola troca passes mesmo perto do destino; quem joga vertical só liga o que está longe.
        if (i >= (shape.vertical < 0.4 ? lo : 0) && gap <= SHORT_PASS_M * 0.8) break
        const next = this.pickMate(att, cur, target, used, targetId, ctx.trace.minute * 7 + i, shape)
        if (!next) break
        used.add(next.placed.playerId)
        const far = meters(cur.pos, next.pos) > 30
        const link = this.mkLeg(far ? 'long' : 'pass', { fromId: cur.placed.playerId, toPt: next.pos, toId: next.placed.playerId, att, ctx, text: far ? `${ctx.names(cur.placed.playerId)} lança para ${ctx.names(next.placed.playerId)}` : `${ctx.names(cur.placed.playerId)} toca para ${ctx.names(next.placed.playerId)}` })
        link.extra = 'link'
        legs.push(link)
        cur = next
      }
    }

    // As batidas do motor viram trechos: cada uma parte de onde a anterior terminou.
    let relayLeft = ctx.relays ?? ctx.connectors
    let prev = cur?.placed.playerId ?? holder
    for (let bi = 0; bi < beats.length; bi++) {
      const beat = beats[bi] as Beat
      // Troca de passes do motor (meio-campo, sem finalização): as batidas dele usam posições de projeto, então a campo refaz a troca com as posições
      // reais, com a mesma quantidade de passes que o estilo pede e companheiros perto (e o último passe chega a quem o motor escolheu).
      if (isChainBeat(beat) && prev) {
        let last = bi
        while (last + 1 < beats.length && isChainBeat(beats[last + 1] as Beat)) last++
        const finalBeat = beats[last] as Beat
        const finalBody = finalBeat.holder ? this.bodies.get(finalBeat.holder) : undefined
        let from = this.bodies.get(prev)
        if (finalBody && from && from.placed.playerId !== finalBody.placed.playerId) {
          const shape = this.style[beat.attSide] ?? shapeOf(undefined)
          const used = new Set<string>([from.placed.playerId])
          const count = last - bi + 1
          for (let k = 0; k < count; k++) {
            const final = k === count - 1
            let next: Body | undefined = final ? undefined : this.pickMate(beat.attSide, from, finalBody.pos, used, finalBody.placed.playerId, ctx.trace.minute * 11 + k, shape)
            const reachesFinal = !next || final
            if (reachesFinal) next = finalBody
            const leg = this.mkLeg('pass', { fromId: from.placed.playerId, toPt: (next as Body).pos, toId: (next as Body).placed.playerId, att: beat.attSide, ctx, beat: beats[Math.min(last, bi + k)] as Beat, text: `${ctx.names(from.placed.playerId)} toca para ${ctx.names((next as Body).placed.playerId)}` })
            leg.arrow = ctx.arrows
            if (!reachesFinal || (final && k > 0)) leg.extra = 'relay'
            if (reachesFinal) leg.marks = finalBeat.marks
            legs.push(leg)
            used.add((next as Body).placed.playerId)
            from = next as Body
            if (reachesFinal) break
          }
          prev = finalBody.placed.playerId
          bi = last
          continue
        }
      }
      let to = beat.holder
      let body = to ? this.bodies.get(to) : undefined
      let toPt = beat.ball
      // Quem "ganha o meio" é uma escolha só visual do campo: se está longe de quem tem a bola para o estilo, a bola vai ao companheiro mais perto.
      if (bi === 0 && !beat.arrow && beat.phase === 'midfield' && !ctx.setPiece && prev && body) {
        const fromBody = this.bodies.get(prev)
        const shape = this.style[beat.attSide] ?? shapeOf(undefined)
        if (fromBody && fromBody.placed.side === beat.attSide && meters(fromBody.pos, body.pos) > shape.reach * 1.1) {
          const alt = this.nearest(beat.attSide, fromBody.pos, new Set([prev]), false)
          if (alt && meters(fromBody.pos, alt.pos) < meters(fromBody.pos, body.pos)) {
            to = alt.placed.playerId
            body = alt
            toPt = alt.pos
          }
        }
      }
      const sameSide = !!prev && !!to && this.bodies.get(prev)?.placed.side === body?.placed.side
      const arrow = beat.arrow
      let kind: LegKind
      if (ctx.setPiece && !arrow) kind = 'set'
      else if (beat.phase === 'shot') kind = 'shot'
      else if (arrow) kind = arrow.curve ? (beat.phase === 'chance' ? 'cross' : 'long') : 'pass'
      else if (to && prev === to) kind = 'carry'
      else kind = sameSide ? 'pass' : 'recover'
      // Passe longo demais para o estilo (o receptor está longe): a bola passa antes por companheiros no caminho, em passes do tamanho do estilo.
      if (kind === 'pass' && to && body && prev) {
        const used = new Set<string>([prev])
        let from = this.bodies.get(prev)
        const shape = this.style[beat.attSide] ?? shapeOf(undefined)
        while (relayLeft > 0 && from && meters(from.pos, body.pos) > shape.reach * 1.1) {
          const next = this.pickMate(beat.attSide, from, body.pos, used, to, ctx.trace.minute * 13 + relayLeft, shape)
          if (!next) break
          used.add(next.placed.playerId)
          relayLeft--
          const relay = this.mkLeg('pass', { fromId: from.placed.playerId, toPt: next.pos, toId: next.placed.playerId, att: beat.attSide, ctx, text: `${ctx.names(from.placed.playerId)} toca para ${ctx.names(next.placed.playerId)}` })
          relay.extra = 'relay'
          legs.push(relay)
          from = next
          prev = next.placed.playerId
        }
      }
      const leg = this.mkLeg(kind, {
        ...(prev ? { fromId: prev } : {}),
        toPt,
        ...(to && body && kind !== 'set' && !(kind === 'shot' && to === ctx.trace.shot?.shooterId) ? { toId: to } : {}),
        att: beat.attSide,
        ctx,
        beat,
        text: this.textFor(kind, prev, to, ctx),
        ...(kind === 'shot' ? { endText: this.shotEnd(ctx, to) } : {}),
      })
      leg.marks = beat.marks
      leg.arrow = ctx.arrows && !!arrow
      legs.push(leg)
      if (kind === 'set') {
        // A bola fica no ponto; o cobrador anda até ela.
        leg.fixed = true
        prev = to
      } else if (to) prev = to
    }
    // Depois do gol a bola rola da rede até o centro, ainda dentro do lance (os jogadores voltam ao meio enquanto o gol aparece).
    if (ctx.floors && ctx.trace.shot?.result === 'goal' && beats[beats.length - 1]?.phase === 'shot') {
      const centre = this.mkLeg('restart', { toPt: { x: 0.5, y: 0.5 }, att: this.att, ctx, text: 'A bola volta ao centro do campo' })
      centre.fixed = true
      legs.push(centre)
    }
    // Cada tipo de trecho tem uma velocidade máxima da bola: se o tempo do lance não comporta, os passes de ligação saem primeiro.
    this.assignTimes(legs, ctx.tickMs, at, ctx.floors)
    if (ctx.floors) return this.finishPlan(legs, ctx, at)
    this.legs = legs
    return legs
  }

  /** Repete o corte dos passes de ligação até o lance caber no tempo (ou não restar nenhum). */
  private finishPlan(legs: Leg[], ctx: PlanContext, at: Pt): Leg[] {
    const over = () => legs.reduce((sum, l) => sum + l.ms, 0) > ctx.tickMs * 1.02
    while (over() && legs.length > 1) {
      // Primeiro saem as ligações, depois os apoios; as batidas do motor ficam.
      let idx = legs.map((l) => l.extra).lastIndexOf('link')
      if (idx < 0) idx = legs.map((l) => l.extra).lastIndexOf('relay')
      if (idx < 0) break
      legs.splice(idx, 1)
      this.relink(legs, ctx)
      this.assignTimes(legs, ctx.tickMs, at, ctx.floors)
    }
    this.legs = legs
    return legs
  }

  /** Depois de tirar um passe, quem toca a bola a seguir é quem a recebeu no trecho anterior (e o texto acompanha). */
  private relink(legs: Leg[], ctx: PlanContext): void {
    for (let i = 1; i < legs.length; i++) {
      const before = legs[i - 1] as Leg
      const leg = legs[i] as Leg
      if ((leg.kind === 'pass' || leg.kind === 'long') && before.toId && leg.fromId !== before.toId) {
        leg.fromId = before.toId
        leg.text = this.textFor(leg.kind, leg.fromId, leg.toId, ctx)
      }
    }
  }

  private mkLeg(kind: LegKind, o: { fromId?: string | undefined; toPt: Pt; toId?: string | undefined; att: Side; ctx: PlanContext; beat?: Beat; text: string; endText?: string }): Leg {
    return {
      kind,
      ms: 0,
      toPt: o.toPt,
      ...(o.fromId ? { fromId: o.fromId } : {}),
      ...(o.toId ? { toId: o.toId } : {}),
      curve: kind === 'cross' || kind === 'long',
      ...(o.beat ? { beat: o.beat } : {}),
      attSide: o.att,
      text: o.text,
      ...(o.endText ? { endText: o.endText } : {}),
      marks: [],
      arrow: o.ctx.arrows && kind !== 'carry' && kind !== 'set' && kind !== 'recover' && kind !== 'restart',
    }
  }

  private nearest(side: Side, at: Pt, except: ReadonlySet<string> | undefined, includeKeeper: boolean): Body | undefined {
    let best: Body | undefined
    let bestD = Infinity
    for (const b of this.bodies.values()) {
      if (b.placed.side !== side || (!includeKeeper && b.placed.slot === 'GK') || except?.has(b.placed.playerId)) continue
      const d = meters(b.pos, at)
      if (d < bestD) {
        best = b
        bestD = d
      }
    }
    return best
  }

  /** Próximo passe curto: um companheiro perto, livre de marcador, que aproxima do destino (com um desempate sem sorteio). */
  private pickMate(att: Side, from: Body, target: Pt, used: ReadonlySet<string>, targetId: string | undefined, seed: number, shape: ReturnType<typeof shapeOf>): Body | undefined {
    const foes = [...this.bodies.values()].filter((b) => b.placed.side !== att && b.placed.slot !== 'GK')
    const mates = [...this.bodies.values()].filter((b) => b.placed.side === att && b.placed.slot !== 'GK' && !used.has(b.placed.playerId) && b.placed.playerId !== targetId)
    const here = meters(from.pos, target)
    const scored = mates
      .map((m) => ({ m, d: meters(from.pos, m.pos) }))
      .filter(({ d }) => d <= shape.reach && d >= 4)
      .map(({ m, d }) => {
        const progress = here - meters(m.pos, target)
        const free = foes.every((f) => meters(f.pos, m.pos) >= 5) ? 1 : 0
        const shortBonus = d <= shape.reach * 0.6 ? 1 : 0
        // Quem joga pelas pontas prefere o companheiro aberto; o lançamento direto e o contra-ataque, o que está mais à frente.
        const wide = Math.abs(m.pos.y - 0.5) * 2
        const lineBonus = shape.vertical >= 1.3 && (m.placed.slot === 'ST' || m.placed.slot === 'RW' || m.placed.slot === 'LW' || m.placed.slot === 'AM') ? 1.5 : 0
        return { m, progress, score: progress * 0.07 * shape.vertical + free * 1.2 + shortBonus * 0.8 + wide * shape.side * 1.7 + lineBonus + hash(`${seed}:${m.placed.playerId}`) * 0.35 }
      })
      // Toque de bola aceita passe de lado e para trás (mantém a posse); os outros só passes que aproximam.
      .filter(({ progress }) => progress > (shape.vertical < 0.4 ? -7 : shape.side > 1.2 ? -5 : 1))
    scored.sort((a, b) => b.score - a.score)
    return scored[0]?.m
  }

  private textFor(kind: LegKind, fromId: string | undefined, toId: string | undefined, ctx: PlanContext): string {
    const a = fromId ? ctx.names(fromId) : ''
    const b = toId ? ctx.names(toId) : ''
    const t = ctx.trace
    const fromSide = fromId ? this.bodies.get(fromId)?.placed.side : undefined
    const toSide = toId ? this.bodies.get(toId)?.placed.side : undefined
    const turned = !!fromSide && !!toSide && fromSide !== toSide
    switch (kind) {
      case 'pass':
        return turned ? `${b} intercepta o passe de ${a}` : a && b ? `${a} toca para ${b}` : `${b} fica com a bola`
      case 'long':
        return turned ? `${b} corta o lançamento` : `${a} lança a bola em profundidade para ${b}`
      case 'cross':
        return turned ? `${b} afasta o cruzamento` : b ? `${a} cruza para ${b}` : `${a} cruza na área`
      case 'carry':
        return t.play === 'dribble' ? `${a} parte para o drible` : `${a} conduz a bola`
      case 'recover':
        return turned && t.play === 'dribble' ? `${b} desarma ${a}` : b ? `${b} recupera a bola` : `${a} perde a bola`
      case 'shot':
        return a ? `${a} finaliza` : 'Finalização'
      case 'restart':
        return 'A bola volta ao centro do campo'
      case 'set':
        return t.shot?.type === 'penalty' ? `${b || a} se prepara para cobrar o pênalti` : `${b || a} se prepara para a cobrança de falta`
    }
  }

  private shotEnd(ctx: PlanContext, shooterId: string | undefined): string {
    const s = ctx.trace.shot
    const who = ctx.names(s?.shooterId ?? shooterId ?? '')
    if (!s) return ''
    if (s.result === 'goal') return `GOL! ${who} balança a rede`
    if (s.result === 'saved') return `${s.keeperId ? ctx.names(s.keeperId) : 'O goleiro'} defende`
    if (s.result === 'blocked') return `Bloqueado! A defesa trava o chute de ${who}`
    return `${who} chuta para fora`
  }

  /** Reparte o tempo do lance pelos trechos, na proporção da distância que a bola percorre (com um piso por tipo). */
  private assignTimes(legs: Leg[], tickMs: number, from: Pt, floors: boolean): void {
    let at = from
    const dists: number[] = []
    const weights = legs.map((l) => {
      const [base, perUnit] = WEIGHT[l.kind]
      let w: number
      if (l.kind === 'carry') {
        const mover = l.beat?.moves[l.toId ?? '']
        w = base + perUnit * (mover ? meters(this.bodies.get(l.toId ?? '')?.pos ?? mover, mover) / FIELD_W : 0.05)
      } else w = base + perUnit * (meters(at, l.toPt) / FIELD_W)
      dists.push(l.kind === 'carry' ? 0 : meters(at, l.toPt))
      at = l.toPt
      return w
    })
    const total = weights.reduce((a, b) => a + b, 0) || 1
    legs.forEach((l, i) => {
      const floor = floors && BALL_V[l.kind] > 0 ? ((dists[i] as number) / BALL_V[l.kind]) * 1000 : 0
      l.ms = Math.max(40, floor, (tickMs * (weights[i] as number)) / total)
    })
  }

  // -------------------------------------------------------------------------
  // Quadro a quadro
  // -------------------------------------------------------------------------

  /** Avança `dtMs`: trechos da bola, depois jogadores. Devolve os começos e fins de trecho ocorridos. */
  step(dtMs: number, o: { running: boolean; speed: number }): MotionEvent[] {
    const dt = clamp(dtMs, 0, 100) / 1000
    this.speed = o.speed
    this.clock += dt
    this.frame++
    const events: MotionEvent[] = this.flush.splice(0).map((leg) => ({ type: 'end' as const, leg }))

    // Trechos: começa o próximo quando o atual termina (vários por quadro se o quadro for longo).
    let guard = 0
    let remaining = dtMs > 100 ? 100 : dtMs
    while (guard++ < 8) {
      if (!this.current) {
        const next = this.legs.shift()
        if (!next) break
        this.begin(next)
        events.push({ type: 'start', leg: next })
      }
      const leg = this.current as Leg
      const left = leg.ms - this.legT
      if (remaining < left) {
        this.legT += remaining
        break
      }
      remaining -= left
      this.legT = leg.ms
      this.finish(leg)
      events.push({ type: 'end', leg, ...(this.ball.holder ? { holder: this.ball.holder } : {}) })
    }

    this.moveBall(dt)
    this.movePlayers(dt, o.running)
    return events
  }

  private begin(leg: Leg): void {
    this.current = leg
    this.legT = 0
    leg.start = { ...this.ball.pos }
    this.phase = leg.beat?.phase ?? 'midfield'
    this.att = leg.attSide
    if (leg.beat) this.override = { ...this.override, ...leg.beat.moves }
    // Condução: a bola acompanha o condutor. Se ela não está com ele (um passe de apoio foi cortado por falta de tempo), ela viaja até ele: nunca cola.
    const carrier = leg.kind === 'carry' && leg.toId ? this.bodies.get(leg.toId) : undefined
    if (leg.kind === 'carry' && (!carrier || this.ball.holder === leg.toId || meters(this.ball.pos, carrier.pos) <= 2.5)) {
      this.ball.mode = 'held'
      this.ball.holder = leg.toId ?? this.ball.holder
    } else {
      if (leg.kind === 'carry') leg.kind = 'recover'
      this.ball.mode = 'flight'
      this.ball.holder = undefined
    }
  }

  private finish(leg: Leg): void {
    const body = leg.toId ? this.bodies.get(leg.toId) : undefined
    this.ball.height = 0
    if (leg.kind !== 'carry') this.ball.pos = this.destOf(leg)
    if (body && !leg.fixed) {
      this.ball.mode = 'held'
      this.ball.holder = body.placed.playerId
    } else {
      this.ball.mode = 'loose'
      this.ball.holder = undefined
    }
    this.current = null
    this.legT = 0
  }

  /** Destino da bola agora: o jogador que a recebe (que corre até o ponto), ou o ponto. */
  private destOf(leg: Leg): Pt {
    const body = leg.toId && !leg.fixed ? this.bodies.get(leg.toId) : undefined
    if (!body) return leg.toPt
    const dir = body.placed.side === 'home' ? 1 : -1
    return { x: clamp(body.pos.x + dir * 0.012, 0.0, 1), y: body.pos.y }
  }

  private moveBall(dt: number): void {
    const b = this.ball
    const leg = this.current
    if (leg && leg.kind !== 'carry') {
      const u = clamp(this.legT / Math.max(1, leg.ms), 0, 1)
      // Passe rasteiro perde velocidade; chute sai forte; bola alta sobe e desce.
      const e = leg.kind === 'shot' ? u * (2 - u) * 0.6 + u * 0.4 : (leg.kind === 'set' || leg.kind === 'restart') ? u * u * (3 - 2 * u) : 1 - Math.pow(1 - u, 1.4)
      const start = leg.start as Pt
      const dest = this.destOf(leg)
      let p = lerp(start, dest, e)
      b.height = 0
      if (leg.curve) {
        const dx = dest.x - start.x
        const dy = dest.y - start.y
        const len = Math.hypot(dx, dy) || 1
        const side = start.y < 0.5 ? 1 : -1
        const arc = Math.sin(Math.PI * e) * 0.07 * Math.min(1, len / 0.3)
        p = { x: p.x + (dy / len) * arc * side * 0.6, y: p.y - (dx / len) * arc * side }
        b.height = Math.sin(Math.PI * e)
      }
      b.pos = p
      return
    }
    const holder = b.holder ? this.bodies.get(b.holder) : undefined
    if (b.mode === 'held' && holder) {
      const dir = holder.placed.side === 'home' ? 1 : -1
      const want = { x: holder.pos.x + dir * 0.013, y: holder.pos.y + Math.sin(this.clock * 9 + holder.phase[0]) * 0.004 }
      const k = 1 - Math.exp(-dt * 22)
      b.pos = lerp(b.pos, want, k)
      b.height = 0
    }
  }

  // -------------------------------------------------------------------------
  // Jogadores
  // -------------------------------------------------------------------------

  /** Posição de formação do jogador, deslocada pela bola: o bloco desliza junto com ela (profundidade e lado). */
  anchorOf(body: Body, ball: Pt): Pt {
    const p = body.placed
    const a = shifted(p, this.att, this.phase, ball.y)
    const dirS = p.side === 'home' ? 1 : -1
    const depthOfBall = p.side === 'home' ? ball.x : 1 - ball.x
    const shape = this.style[p.side]
    const attacking = p.side === this.att
    const k = (attacking ? (shape?.followAtt ?? 0.42) : (shape?.followDef ?? 0.3)) * FOLLOW[p.slot]
    // Mentalidade: mais ofensiva leva meias e laterais ao ataque e sobe a linha; mais defensiva segura todo mundo atrás.
    const m = this.mentality[p.side]
    let x = a.x + dirS * ((depthOfBall - 0.5) * k + m * (attacking ? M_ATT[p.slot] : M_DEF[p.slot]))
    let y = a.y + (ball.y - a.y) * (p.slot === 'GK' ? 0.28 : 0.1 * (shape?.tight ?? 1))
    // Jogar pelas pontas: laterais e pontas abertos colados na linha e subindo; os outros estilos mantêm a largura da formação.
    if (shape && attacking && shape.side > 1.2 && (p.slot === 'RB' || p.slot === 'LB' || p.slot === 'RW' || p.slot === 'LW')) {
      y = a.y + ((a.y < 0.5 ? 0.06 : 0.94) - a.y) * 0.6
      x += dirS * 0.07
    }
    return { x: clamp(x, 0.02, 0.98), y: clamp(y, 0.04, 0.96) }
  }

  private updateMarking(ball: Pt): void {
    this.marking.clear()
    this.pressers.clear()
    const defSide: Side = this.att === 'home' ? 'away' : 'home'
    const defenders = [...this.bodies.values()].filter((b) => b.placed.side === defSide && b.placed.slot !== 'GK')
    const attackers = [...this.bodies.values()].filter((b) => b.placed.side === this.att && b.placed.slot !== 'GK')
    // Pressão: quem está mais perto da bola vai nela (a pressão alta manda dois).
    const presserCount = this.style[defSide]?.pressers ?? 1
    const range = this.style[defSide]?.pressRange ?? 24
    defenders
      .map((d) => ({ d, m: meters(d.pos, ball) }))
      .filter(({ m }) => m < range)
      .sort((x, y) => x.m - y.m)
      .slice(0, presserCount)
      .forEach(({ d }) => this.pressers.add(d.placed.playerId))
    // Marcação: cada defensor pega o atacante livre mais perto da posição dele (um para cada).
    const taken = new Set<string>()
    const order = defenders.filter((d) => !this.pressers.has(d.placed.playerId)).sort((a, b) => MARK[b.placed.slot] - MARK[a.placed.slot])
    for (const d of order) {
      let best: Body | undefined
      let bestD = 22
      for (const a of attackers) {
        if (taken.has(a.placed.playerId)) continue
        const m = meters(a.pos, this.anchorOf(d, ball))
        if (m < bestD) {
          best = a
          bestD = m
        }
      }
      if (best) {
        taken.add(best.placed.playerId)
        this.marking.set(d.placed.playerId, best.placed.playerId)
      }
    }
  }

  private movePlayers(dt: number, running: boolean): void {
    const ball = this.ball.pos
    if (this.frame % 6 === 1) this.updateMarking(ball)
    const leg = this.current
    const sprint = 17 * Math.sqrt(Math.max(1, this.speed))
    const k = 1 - Math.exp(-dt * 7)
    const wander = running ? 1 : 0.3
    for (const body of this.bodies.values()) {
      const p = body.placed
      const id = p.playerId
      const run = this.style[p.side]?.runners ?? 0.5
      let target = this.anchorOf(body, ball)
      let boost = 1
      let wobble = wander

      if (p.slot !== 'GK') {
        if (p.side === this.att) {
          // Quem tem a bola a leva para a frente; quem está à frente da bola oferece a linha de passe; os meias se aproximam.
          const dir = p.side === 'home' ? 1 : -1
          if (this.ball.holder === id && this.ball.mode === 'held') target = { x: clamp(target.x + dir * 0.045, 0.03, 0.97), y: target.y }
          else if (p.slot === 'ST' || p.slot === 'RW' || p.slot === 'LW' || (p.slot === 'AM' && run >= 1.3)) {
            // Atacantes correm para a frente da bola; no contra-ataque vão direto ao terço final.
            let depth = Math.max(target.x * dir, ball.x * dir + 0.05 + 0.09 * run)
            if (run >= 1.3) depth = Math.max(depth, dir > 0 ? 0.74 : -0.26)
            target = { x: clamp(depth * dir, 0.03, 0.97), y: target.y }
            boost = 1 + 0.35 * run
          } else if (p.slot === 'CM' || p.slot === 'AM') target = lerp(target, ball, 0.08 + 0.05 * (this.style[p.side]?.tight ?? 1))
        } else if (this.pressers.has(id)) {
          const dir = p.side === 'home' ? -1 : 1
          target = lerp(target, { x: ball.x + dir * 0.025, y: ball.y }, 0.9)
          boost = 1.25
          wobble = 0.2
        } else {
          const markedId = this.marking.get(id)
          const marked = markedId ? this.bodies.get(markedId) : undefined
          if (marked) {
            const toGoal = p.side === 'home' ? -1 : 1
            target = lerp(target, { x: marked.pos.x + toGoal * 0.03, y: marked.pos.y }, MARK[p.slot])
            wobble = 0.4
          }
        }
      }
      // Quem recebe corre até o ponto do passe.
      if (leg && leg.toId === id && leg.kind !== 'carry') {
        target = leg.toPt
        boost = 1.8
        wobble = 0
      }
      // Lançamento direto: depois da bola longa, quem está perto de onde ela cai disputa a segunda bola (dos dois times).
      if (leg && leg.kind === 'long' && this.style[this.att]?.secondBall && p.slot !== 'GK' && leg.toId !== id && meters(body.pos, leg.toPt) < 16) {
        target = lerp(target, leg.toPt, 0.8)
        boost = Math.max(boost, 1.5)
        wobble = 0.1
      }
      // Posições combinadas do lance (corrida ao cruzamento, barreira, pênalti).
      const forced = this.override[id]
      if (forced) {
        target = forced
        boost = Math.max(boost, 1.6)
        wobble = 0.15
      }
      if (wobble > 0) {
        target = {
          x: target.x + Math.sin(this.clock * 0.9 + body.phase[0]) * 0.011 * wobble,
          y: target.y + Math.sin(this.clock * 0.7 + body.phase[1]) * 0.017 * wobble,
        }
      }

      // Aceleração e desaceleração suaves: a velocidade desejada cai perto do alvo e a real persegue a desejada.
      const dx = (target.x - body.pos.x) * FIELD_W
      const dy = (target.y - body.pos.y) * FIELD_H
      const d = Math.hypot(dx, dy)
      const vmax = sprint * boost * (p.slot === 'GK' ? 0.55 : 1)
      const want = d > 1e-4 ? Math.min(vmax, d * 4.2) / d : 0
      body.vel.x += (dx * want - body.vel.x) * k
      body.vel.y += (dy * want - body.vel.y) * k
      body.pos.x = clamp(body.pos.x + (body.vel.x * dt) / FIELD_W, 0.0, 1)
      body.pos.y = clamp(body.pos.y + (body.vel.y * dt) / FIELD_H, 0.0, 1)
    }
  }
}
