/**
 * Modelo do campo 2D: onde cada jogador fica, para onde a bola vai a cada lance e quais marcações aparecem.
 * Tudo aqui é uma representação visual do que o motor já decidiu (`snapshot.trace` e `snapshot.events`):
 * nada altera o jogo e nenhum sorteio do motor é usado (variações vêm de um hash simples do minuto e dos ids).
 * Coordenadas normalizadas: x de 0 (gol da esquerda) a 1 (gol da direita), y de 0 (topo) a 1 (base).
 * O mandante ataca para a direita.
 */
import type { MatchSnapshot, PlayTrace } from '../../../engine/match'
import type { GridPoint, MatchEvent, PlayStyle, Position } from '../../../engine/types'
import { POSITION_NUMBERS } from '../../../engine/shirt'
import { depthShift, shapeOf, type StyleShape } from './pitchStyle'

export type Side = 'home' | 'away'
export interface Pt {
  x: number
  y: number
}

export type Phase = 'midfield' | 'progress' | 'chance' | 'shot'

/** Hash simples (FNV-1a) para variar posições e escolhas sem usar o gerador do motor. */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 4294967296
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

// ---------------------------------------------------------------------------
// Posições de base a partir das vagas da formação
// ---------------------------------------------------------------------------

/** Profundidade (0 = própria linha de fundo, 1 = linha de fundo do rival) por posição. */
const DEPTH: Record<Position, number> = { GK: 0.05, RB: 0.21, LB: 0.21, CB: 0.19, DM: 0.34, CM: 0.46, AM: 0.6, RW: 0.7, LW: 0.7, ST: 0.76 }
/** Faixa lateral (0 = esquerda do time, 1 = direita do time) por posição. */
const LANE: Record<Position, number> = { GK: 0.5, LB: 0.1, LW: 0.1, CB: 0.5, DM: 0.5, CM: 0.5, AM: 0.5, ST: 0.5, RB: 0.9, RW: 0.9 }

export interface OnPitch {
  playerId: string
  slot: Position
  /** Ponto da grade que ocupa (posicionamento livre): com ele de todos, a base é exatamente o ponto. */
  point?: GridPoint | undefined
}

/** Profundidade (0 = própria linha de fundo, 1 = a do rival) de cada linha da grade e posição de cada faixa (0 = esquerda do time). */
const ROW_DEPTH = [0.05, 0.2, 0.34, 0.46, 0.6, 0.76] as const
const LANE_Y = [0.1, 0.3, 0.5, 0.7, 0.9] as const

export interface Placed {
  playerId: string
  side: Side
  slot: Position
  /** Posição de base (sem o deslocamento da fase da jogada). */
  base: Pt
  /** Estilo do time: a forma e o avanço de fase seguem o estilo (sem ele vale o avanço neutro de antes). */
  style?: PlayStyle
}

/** Base de um time: cada vaga na profundidade da posição e espalhada na largura quando há mais de um na mesma posição. */
export function basePositions(side: Side, onPitch: readonly OnPitch[], wingersAttack: boolean, shape?: StyleShape, style?: PlayStyle): Placed[] {
  // A forma do estilo sobe ou recua as linhas e aperta ou abre o time; sem ela, a posição é a da formação.
  const deepen = (slot: Position, depth: number) => (shape ? clamp(depth + depthShift(slot, shape), 0.03, 0.92) : depth)
  const squeeze = (y: number) => (shape ? clamp(0.5 + (y - 0.5) * shape.compact, 0.04, 0.96) : y)
  const tag = style ? { style } : {}
  if (onPitch.length > 0 && onPitch.every((p) => p.point)) {
    return onPitch.map((p) => {
      const { row, lane } = p.point as GridPoint
      const depth = deepen(p.slot, ROW_DEPTH[row] ?? 0.5)
      const y = squeeze(LANE_Y[lane] ?? 0.5)
      return { playerId: p.playerId, side, slot: p.slot, base: { x: side === 'home' ? depth : 1 - depth, y: side === 'home' ? y : 1 - y }, ...tag }
    })
  }
  const groups = new Map<Position, OnPitch[]>()
  for (const p of onPitch) groups.set(p.slot, [...(groups.get(p.slot) ?? []), p])
  const placed: Placed[] = []
  for (const [slot, list] of groups) {
    const sorted = [...list].sort((a, b) => a.playerId.localeCompare(b.playerId, 'en', { numeric: true }))
    const n = sorted.length
    sorted.forEach((p, i) => {
      const wide = slot === 'RB' || slot === 'LB' || slot === 'RW' || slot === 'LW'
      const spread = wide ? 0.09 : 0.14
      const lane = n === 1 ? LANE[slot] : clamp(LANE[slot] + (i - (n - 1) / 2) * 2 * spread, 0.06, 0.94)
      let depth = DEPTH[slot]
      if ((slot === 'RW' || slot === 'LW') && !wingersAttack) depth = 0.52
      depth = deepen(slot, depth)
      const x = side === 'home' ? depth : 1 - depth
      // O time visto de cima atacando para a direita tem o lado direito embaixo; o visitante é o espelho.
      const y = squeeze(side === 'home' ? lane : 1 - lane)
      placed.push({ playerId: p.playerId, side, slot, base: { x, y }, ...tag })
    })
  }
  return placed
}

// ---------------------------------------------------------------------------
// Cores e números
// ---------------------------------------------------------------------------

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0]
}
export const colorDistance = (a: string, b: string): number => {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2)
}
/** Cor do número que contrasta com a camisa. */
export const inkFor = (hex: string): string => {
  const [r, g, b] = rgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0b0f1a' : '#ffffff'
}

const GK_PALETTE = ['#22c55e', '#f59e0b', '#06b6d4', '#e879f9', '#a3e635']

export interface Kits {
  home: { shirt: string; trim: string; keeper: string }
  away: { shirt: string; trim: string; keeper: string }
}

/** Camisas dos dois times: se as cores principais são parecidas, o visitante usa a cor secundária; o goleiro tem cor própria. */
export function kitsFor(homeColors: readonly [string, string], awayColors: readonly [string, string]): Kits {
  const [h1, h2] = homeColors
  let [a1, a2] = awayColors
  if (colorDistance(h1, a1) < 90) [a1, a2] = [a2, a1]
  if (colorDistance(h1, a1) < 90) a1 = colorDistance(h1, '#ffffff') > 120 ? '#f8fafc' : '#0f172a'
  const keeper = (own: string, other: string) => [...GK_PALETTE].sort((x, y) => Math.min(colorDistance(y, own), colorDistance(y, other), colorDistance(y, h1), colorDistance(y, a1)) - Math.min(colorDistance(x, own), colorDistance(x, other), colorDistance(x, h1), colorDistance(x, a1)))[0] as string
  const homeKeeper = keeper(h1, a1)
  const awayKeeper = [...GK_PALETTE].filter((c) => c !== homeKeeper).sort((x, y) => Math.min(colorDistance(y, h1), colorDistance(y, a1), colorDistance(y, homeKeeper)) - Math.min(colorDistance(x, h1), colorDistance(x, a1), colorDistance(x, homeKeeper)))[0] as string
  return { home: { shirt: h1, trim: h2, keeper: homeKeeper }, away: { shirt: a1, trim: a2, keeper: awayKeeper } }
}

const NUMBERS = POSITION_NUMBERS

/** Número de camisa pela vaga: quem ainda não tem escolhe o primeiro livre da posição (os números só valem dentro do time). */
export function assignNumber(taken: Map<string, number>, side: Side, playerId: string, slot: Position): number {
  const key = `${side}:${playerId}`
  const known = taken.get(key)
  if (known !== undefined) return known
  const used = new Set([...taken.entries()].filter(([k]) => k.startsWith(`${side}:`)).map(([, n]) => n))
  const pick = [...NUMBERS[slot], ...Array.from({ length: 40 }, (_, i) => 31 + i)].find((n) => !used.has(n)) ?? 99
  taken.set(key, pick)
  return pick
}

// ---------------------------------------------------------------------------
// Fases da jogada: o bloco do time com a bola sobe, o outro recua
// ---------------------------------------------------------------------------

const PHASE_PUSH: Record<Phase, number> = { midfield: 0.03, progress: 0.08, chance: 0.12, shot: 0.14 }
const ROLE_PUSH: Record<Position, number> = { GK: 0.05, CB: 0.45, RB: 0.7, LB: 0.7, DM: 0.8, CM: 1, AM: 1.1, RW: 1.1, LW: 1.1, ST: 1.15 }

/** Posição de um jogador numa fase: com a bola avança, sem a bola recua (e os dois lados se aproximam do lado da jogada). */
export function shifted(p: Placed, attSide: Side, phase: Phase, focusY: number): Pt {
  const dir = attSide === 'home' ? 1 : -1
  const mine = p.side === attSide
  const shape = p.style ? shapeOf(p.style) : undefined
  const push = PHASE_PUSH[phase] * ROLE_PUSH[p.slot] * (mine ? (shape?.attackPush ?? 1) : 1)
  // Sem a bola o time recua (posse e pressão alta pouco; contra-ataque, que espera atrás, bastante).
  const dx = mine ? dir * push : dir * push * (shape?.defendPush ?? 0.55) * (p.slot === 'GK' ? 0 : 1)
  const closeness = 1 - Math.abs(p.base.y - focusY)
  const dy = (focusY - p.base.y) * (phase === 'midfield' ? 0.08 : 0.28) * closeness
  return { x: clamp(p.base.x + dx, 0.02, 0.98), y: clamp(p.base.y + dy, 0.05, 0.95) }
}

// ---------------------------------------------------------------------------
// Lances: sequência de batidas (onde a bola está a cada passo)
// ---------------------------------------------------------------------------

export type MarkKind = 'goal' | 'own-goal' | 'save' | 'off' | 'corner' | 'foul' | 'yellow' | 'red'

export interface Mark {
  kind: MarkKind
  at: Pt
}

export interface Arrow {
  from: Pt
  to: Pt
  /** Cruzamento: a seta faz curva. */
  curve: boolean
  /** Chute: seta contínua em vez de tracejada. */
  solid?: boolean
}

export interface Beat {
  phase: Phase
  /** Quem está com a bola (o nome aparece em destaque). */
  holder?: string
  ball: Pt
  arrow?: Arrow
  /** Jogadores que saem da posição de fase (envolvidos no lance). */
  moves: Record<string, Pt>
  /** Lado que ataca neste lance (decide quem avança e quem recua). */
  attSide: Side
  focusY: number
  marks: Mark[]
  /** Peso do tempo do passo na animação do lance (padrão 1): passe curto menos, cruzamento e bola longa mais. */
  weight?: number
  /** Cena de bola parada: a bola vai ao ponto e fica lá enquanto os jogadores se posicionam (tiro de meta, escanteio, pênalti, saída de bola). */
  still?: boolean
  /** Narração do passo; `{who}` vira quem fica com a bola e `{from}` quem a tinha. */
  note?: string
  /** Passo de cena que vem depois do desfecho do lance (não conta como desfecho nas velocidades altas). */
  scene?: boolean
}

export type Layout = Map<string, Placed>

const goalX = (side: Side) => (side === 'home' ? 1 : 0)

/** Eventos que o campo marca (do minuto do lance). */
const markFor = (e: MatchEvent): MarkKind | null =>
  e.type === 'goal' ? 'goal' : e.type === 'own-goal' ? 'own-goal' : e.type === 'corner' ? 'corner' : e.type === 'foul' ? 'foul' : e.type === 'yellow-card' ? 'yellow' : e.type === 'red-card' ? 'red' : null

/** Alcance de um passe curto (≈ 19 m) e distância mínima de um marcador para o companheiro contar como livre. */
const SHORT_PASS = 0.19
const FREE_OF_MARKER = 0.05
/** Acima disto o passe é uma bola longa (≈ 35 m). */
const LONG_PASS = 0.3

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Passes curtos de `from` até `to`: cada passe vai para um companheiro perto (até `SHORT_PASS`) e livre (sem marcador a menos de
 * `FREE_OF_MARKER`), nunca para quem já tocou na bola neste lance. Posse e toque de bola trocam o jogo de lado e para trás; os outros
 * estilos procuram o que aproxima do destino. O último passe vai a `to`. Sem `to` (a bola só foi mantida) a troca termina onde parar.
 */
function passChain(placed: readonly Placed[], active: ReadonlySet<string> | undefined, att: Side, def: Side, from: Placed, to: Placed | undefined, legs: [number, number], minute: number, focusY: number, tempo: number): Beat[] {
  const dir = att === 'home' ? 1 : -1
  const where = (p: Placed) => shifted(p, att, 'midfield', focusY)
  const mates = placed.filter((p) => p.side === att && p.slot !== 'GK' && p.playerId !== to?.playerId && (!active || active.has(p.playerId)))
  const foes = placed.filter((p) => p.side === def && p.slot !== 'GK' && (!active || active.has(p.playerId))).map(where)
  const wanted = Math.round(legs[0] + hash(`${minute}:${att}:legs`) * (legs[1] - legs[0]))
  const out: Beat[] = []
  const used = new Set<string>([from.playerId])
  let holder = from
  const pass = (target: Placed, curve = false, weight = 0.7): void => {
    const a = where(holder)
    const b = where(target)
    out.push({ phase: 'midfield', holder: target.playerId, ball: nudge(b, dir), arrow: { from: a, to: b, curve }, moves: {}, attSide: att, focusY, marks: [], weight: weight * tempo })
    used.add(target.playerId)
    holder = target
  }
  // Faz os passes combinados e, se o destino ainda está longe, segue passando (até 7) em vez de um passe comprido no fim.
  for (let leg = 0; leg < 7; leg++) {
    const hp = where(holder)
    const toward = to ? where(to) : undefined
    if (leg >= wanted && (!toward || dist(hp, toward) <= SHORT_PASS)) break
    const near = mates.filter((p) => !used.has(p.playerId)).map((p) => ({ p, at: where(p) }))
    // Prefere quem está livre; sem ninguém livre perto, aceita um companheiro marcado (ou um pouco mais longe) em vez de um passe comprido.
    let options = near.filter(({ at }) => dist(hp, at) <= SHORT_PASS && foes.every((f) => dist(f, at) >= FREE_OF_MARKER))
    if (options.length === 0) options = near.filter(({ at }) => dist(hp, at) <= SHORT_PASS * 1.3)
    if (options.length === 0) options = near.filter(({ at }) => dist(hp, at) <= SHORT_PASS * 1.8)
    if (options.length === 0) break
    const scored = options
      .map(({ p, at }) => ({ p, at, progress: toward ? dist(hp, toward) - dist(at, toward) : (at.x - hp.x) * dir }))
      // Longe do destino só vale o que aproxima dele; perto dele, nos passes combinados, vale trocar de lado ou voltar.
      .filter(({ progress }) => progress > 0.01 || (leg < wanted && (!toward || dist(hp, toward) <= SHORT_PASS)))
      .map(({ p, progress }) => {
      const noise = hash(`${minute}:${p.playerId}:${leg}`)
      return { p, score: progress * (legs[1] > 2 ? 0.6 : 2) + noise * (legs[1] > 2 ? 0.1 : 0.05) }
    })
    if (scored.length === 0) break
    scored.sort((x, y) => y.score - x.score)
    pass((scored[0] as { p: Placed }).p)
  }
  if (to && holder.playerId !== to.playerId) pass(to)
  return out
}

/** Bola longa (contra-ataque e passes em profundidade de quem joga em bola longa): um passe só, em curva, do que recuperou até quem corre. */
function longBall(att: Side, from: Placed, to: Placed, focusY: number, tempo: number): Beat[] {
  const dir = att === 'home' ? 1 : -1
  const a = shifted(from, att, 'midfield', focusY)
  const b = shifted(to, att, 'progress', focusY)
  return [{ phase: 'midfield', holder: to.playerId, ball: nudge(b, dir), arrow: { from: a, to: b, curve: true }, moves: { [to.playerId]: b }, attSide: att, focusY, marks: [], weight: 1.3 * tempo }]
}

/**
 * As batidas de um momento de posse. Não sorteia nada: onde há escolha (o meio-campista que "ganhou o meio", o
 * lado do escanteio, o passe curto) usa um hash do minuto e dos ids, o mesmo em qualquer máquina. `active` são os jogadores
 * em campo agora (quem saiu por troca nunca recebe a bola).
 */
export function beatsFor(trace: PlayTrace, layout: Layout, events: readonly MatchEvent[], active?: ReadonlySet<string>): Beat[] {
  if (trace.shot && (trace.shot.type === 'penalty' || trace.shot.type === 'freeKick')) {
    const scene = setPieceBeats(trace, layout, events)
    if (scene.length > 0) return [...scene, ...afterShotBeats(trace, layout, active)]
  }
  const att = trace.side
  const def: Side = att === 'home' ? 'away' : 'home'
  const dir = att === 'home' ? 1 : -1
  const gx = goalX(att)
  const placed = [...layout.values()]
  const get = (id?: string) => (id ? layout.get(id) : undefined)
  const posAt = (id: string | undefined, phase: Phase, focusY: number): Pt | undefined => {
    const p = get(id)
    return p ? shifted(p, att, phase, focusY) : undefined
  }
  const attShape = shapeOf(placed.find((p) => p.side === att)?.style)
  const carrier = get(trace.carrierId)
  const onPitch = (p: Placed) => !active || active.has(p.playerId)
  // Contra-ataque: quem recupera a bola está atrás (defesa ou volante); nos outros lances, é um meio-campista.
  const mids = placed.filter((p) => p.side === att && onPitch(p) && (p.slot === 'DM' || p.slot === 'CM' || p.slot === 'AM'))
  const backs = placed.filter((p) => p.side === att && onPitch(p) && (p.slot === 'CB' || p.slot === 'RB' || p.slot === 'LB' || p.slot === 'DM'))
  // Quem joga na posse constrói de trás (zagueiros e volante), então a bola passa por mais gente até o condutor.
  const fromBack = trace.transition || attShape.passes[0] >= 3
  const preferred = fromBack && backs.length > 0 ? backs : mids
  const pool = preferred.length > 0 ? preferred : placed.filter((p) => p.side === att && p.slot !== 'GK')
  const winner = pool.length > 0 ? pool[Math.floor(hash(`${trace.minute}:${att}:${trace.carrierId ?? ''}`) * pool.length)] : undefined
  const wide = carrier && (carrier.slot === 'RB' || carrier.slot === 'LB' || carrier.slot === 'RW' || carrier.slot === 'LW')
  const focusY = carrier && (wide || trace.play === 'cross') ? carrier.base.y : 0.5
  const focusMid = winner ? winner.base.y * 0.6 + 0.2 : 0.5

  const marksFromEvents = (finalAt: (e: MatchEvent) => Pt | undefined): Mark[] => {
    const marks: Mark[] = []
    for (const e of events) {
      if (e.minute !== trace.minute) continue
      const kind = markFor(e)
      if (!kind) continue
      const who = layout.get(e.playerId)
      // O gol só vale no lance do finalizador; o escanteio, no lance do time que atacava.
      if (kind === 'goal' && e.playerId !== trace.shot?.shooterId) continue
      if (kind === 'own-goal' && e.playerId !== trace.markerId) continue
      if (kind === 'corner' && who && who.side !== att) continue
      const at = finalAt(e)
      if (at) marks.push({ kind, at })
    }
    return marks
  }

  /**
   * Escanteio (só visual, a partir do evento que o motor já gerou): a bola vai ao canto, quem cobra se posiciona e a cobrança é um cruzamento
   * para a área, onde atacantes e zagueiros disputam. Sem sorteio: as escolhas vêm de um hash.
   */
  const cornerBeats = (corner: Pt, moves: Record<string, Pt>): Beat[] => {
    const outfield = placed.filter((p) => p.slot !== 'GK' && onPitch(p))
    const mine = outfield.filter((p) => p.side === att)
    const takers = mine.filter((p) => p.slot === 'RW' || p.slot === 'LW' || p.slot === 'AM' || p.slot === 'CM')
    const takerPool = takers.length > 0 ? takers : mine
    const taker = takerPool.length > 0 ? takerPool[Math.floor(hash(`${trace.minute}:${att}:ck`) * takerPool.length)] : undefined
    if (!taker) return []
    const target: Pt = { x: gx - dir * (0.06 + 0.03 * hash(`${trace.minute}:${att}:ckx`)), y: clamp(0.5 + (hash(`${trace.minute}:${att}:cky`) - 0.5) * 0.14, 0.4, 0.6) }
    const heads = mine.filter((p) => p.playerId !== taker.playerId && (p.slot === 'ST' || p.slot === 'CB' || p.slot === 'AM' || p.slot === 'CM')).sort((a, b) => hash(`${trace.minute}:${a.playerId}:ckh`) - hash(`${trace.minute}:${b.playerId}:ckh`)).slice(0, 3)
    const guards = outfield.filter((p) => p.side !== att && (p.slot === 'CB' || p.slot === 'RB' || p.slot === 'LB' || p.slot === 'DM')).slice(0, 3)
    const inBox: Record<string, Pt> = { [taker.playerId]: corner }
    heads.forEach((p, i) => (inBox[p.playerId] = { x: clamp(target.x - dir * (i === 0 ? 0 : 0.02) + dir * 0.01 * i, 0.02, 0.98), y: clamp(target.y + (i - 1) * 0.07, 0.3, 0.7) }))
    guards.forEach((p, i) => (inBox[p.playerId] = { x: clamp(target.x + dir * 0.025, 0.02, 0.98), y: clamp(target.y + (i - 1) * 0.07 + 0.02, 0.3, 0.7) }))
    const receiver = heads[0]
    // O batedor caminha até o canto com a bola; os jogadores se posicionam dentro da área; e então vem o cruzamento.
    const gather: Record<string, Pt> = { ...inBox }
    delete gather[taker.playerId]
    return [
      { phase: 'chance', holder: taker.playerId, ball: corner, moves: { ...moves, [taker.playerId]: corner }, attSide: att, focusY: corner.y, marks: [{ kind: 'corner', at: corner }], weight: 1.4, still: true, scene: true, note: '{who} caminha até o canto para cobrar o escanteio' },
      { phase: 'chance', holder: taker.playerId, ball: corner, moves: { ...moves, ...inBox }, attSide: att, focusY: corner.y, marks: [], weight: 1, still: true, scene: true, note: 'Os jogadores se posicionam dentro da área' },
      { phase: 'chance', ...(receiver ? { holder: receiver.playerId } : { holder: taker.playerId }), ball: target, arrow: { from: corner, to: target, curve: true }, moves: { ...moves, ...inBox, ...gather }, attSide: att, focusY: 0.5, marks: [], weight: 1.5, scene: true },
    ]
  }

  const beats: Beat[] = []
  // 1) Disputa do meio: o time com a bola sobe um pouco; a bola vai para quem recuperou ou ganhou o meio.
  const winnerPos = winner ? shifted(winner, att, 'midfield', focusMid) : { x: 0.5, y: 0.5 }
  beats.push({ phase: 'midfield', ...(winner ? { holder: winner.playerId } : {}), ball: nudge(winnerPos, dir), moves: {}, attSide: att, focusY: focusMid, marks: [], weight: 0.9 })
  if (trace.play === 'held' || !carrier) {
    // Só manteve a bola: troca de passes (mais longa em quem joga na posse) e eventos paralelos (falta no meio).
    if (winner) beats.push(...passChain(placed, active, att, def, winner, undefined, attShape.passes, trace.minute, focusMid, attShape.tempo))
    const marks = marksFromEvents((e) => (isFoulOrCard(e) ? positionOf(layout, e.playerId, att, 'midfield', focusMid) : undefined))
    const last = beats[beats.length - 1] as Beat
    last.marks = marks
    return beats
  }

  // 1b) Construção: passes curtos para quem está perto e livre até o condutor; na saída do contra-ataque, uma bola longa.
  if (winner && winner.playerId !== carrier.playerId) {
    const farAway = dist(shifted(winner, att, 'midfield', focusMid), shifted(carrier, att, 'progress', focusY)) > LONG_PASS
    if (attShape.longBalls && (trace.transition || trace.play === 'through') && farAway) beats.push(...longBall(att, winner, carrier, focusY, attShape.tempo))
    else beats.push(...passChain(placed, active, att, def, winner, carrier, trace.transition ? [0, 0] : attShape.passes, trace.minute, focusMid, attShape.tempo))
  }

  const carrierPos = posAt(trace.carrierId, 'progress', focusY) as Pt
  const marker = get(trace.markerId)
  const moves: Record<string, Pt> = {}
  let carrierEnd = carrierPos
  // O cruzamento sai do fundo: o condutor vai pela faixa do lado dele até o terço final e à linha de fundo, e só então cruza.
  const lane = carrier.base.y < 0.5 ? 0.1 : 0.9
  const channel: Pt = { x: gx - dir * 0.22, y: lane }
  const byline: Pt = { x: gx - dir * 0.07, y: lane }
  if (trace.play === 'dribble') carrierEnd = { x: clamp(carrierPos.x + dir * 0.07, 0.05, 0.95), y: carrierPos.y }
  if (trace.play === 'cross') carrierEnd = channel
  if (marker && trace.play !== 'through') moves[marker.playerId] = { x: clamp(carrierEnd.x - dir * 0.04, 0.03, 0.97), y: clamp(carrierEnd.y + (marker.base.y < carrierEnd.y ? 0.03 : -0.03), 0.04, 0.96) }
  moves[carrier.playerId] = carrierEnd

  // 2) Progressão: o condutor com a bola (o marcador vai ao encontro).
  const lostDribble = trace.play === 'dribble' && trace.outcome !== 'won' && trace.outcome !== 'foul'
  beats.push({
    phase: 'progress',
    holder: lostDribble && marker ? marker.playerId : carrier.playerId,
    ball: nudge(lostDribble && marker ? (moves[marker.playerId] as Pt) : carrierEnd, dir),
    moves,
    attSide: att,
    focusY,
    marks: marksFromEvents((e) => (isFoulOrCard(e) ? (moves[e.playerId] ?? positionOf(layout, e.playerId, att, 'progress', focusY)) : undefined)),
    weight: 1.1 * attShape.tempo,
  })
  if (trace.outcome === 'foul') return beats
  if (lostDribble) return beats
  if (trace.play === 'cross') {
    carrierEnd = byline
    moves[carrier.playerId] = byline
    if (marker) moves[marker.playerId] = { x: clamp(byline.x - dir * 0.03, 0.03, 0.97), y: clamp(byline.y + (lane < 0.5 ? 0.04 : -0.04), 0.04, 0.96) }
    beats.push({ phase: 'progress', holder: carrier.playerId, ball: nudge(byline, dir), moves: { ...moves }, attSide: att, focusY, marks: [], weight: 0.9 * attShape.tempo })
  }

  // 3) Passe em profundidade ou cruzamento: seta tracejada até o alvo (o cruzamento sai do fundo para dentro da área).
  const receiver = get(trace.receiverId)
  if ((trace.play === 'through' || trace.play === 'cross') && receiver) {
    const target: Pt =
      trace.play === 'cross'
        ? { x: gx - dir * (0.07 + 0.06 * hash(`${trace.minute}:${receiver.playerId}:cx`)), y: clamp(0.5 + (hash(`${trace.minute}:${receiver.playerId}`) - 0.5) * 0.28, 0.36, 0.64) }
        : { x: clamp(gx === 1 ? 0.82 : 0.18, 0.05, 0.95), y: clamp(receiver.base.y * 0.5 + 0.25, 0.25, 0.75) }
    if (trace.outcome === 'intercepted' && marker) {
      const m = shifted(marker, att, 'progress', focusY)
      beats.push({ phase: 'progress', holder: marker.playerId, ball: nudge(m, -dir), arrow: { from: carrierEnd, to: m, curve: false }, moves: { ...moves, [marker.playerId]: m }, attSide: att, focusY, marks: [], weight: 0.8 })
      return beats
    }
    if (trace.play === 'cross' && trace.outcome === 'lost' && marker) {
      const m = { x: target.x - dir * 0.03, y: target.y }
      const lostMarks = marksFromEvents((e) => (e.type === 'corner' ? cornerPoint(att, carrierEnd.y) : undefined))
      beats.push({ phase: 'chance', holder: marker.playerId, ball: m, arrow: { from: carrierEnd, to: m, curve: true }, moves: { ...moves, [marker.playerId]: m }, attSide: att, focusY, marks: lostMarks, weight: 1.4 })
      const corner = lostMarks.find((mk) => mk.kind === 'corner')
      if (corner) beats.push(...cornerBeats(corner.at, { ...moves, [marker.playerId]: m }))
      return beats
    }
    // Quem fica na área esperando a bola: até dois companheiros de ataque entram nela.
    const inBox: Record<string, Pt> = {}
    if (trace.play === 'cross') {
      const others = placed.filter((p) => p.side === att && onPitch(p) && p.playerId !== receiver.playerId && p.playerId !== carrier.playerId && (p.slot === 'ST' || p.slot === 'AM' || p.slot === 'RW' || p.slot === 'LW')).sort((a, b) => hash(`${trace.minute}:${a.playerId}`) - hash(`${trace.minute}:${b.playerId}`))
      others.slice(0, 2).forEach((p, i) => {
        inBox[p.playerId] = { x: gx - dir * (0.1 + 0.05 * i), y: clamp(i === 0 ? target.y - 0.14 : target.y + 0.14, 0.3, 0.7) }
      })
    }
    beats.push({ phase: 'chance', holder: receiver.playerId, ball: nudge(target, dir), arrow: { from: carrierEnd, to: target, curve: trace.play === 'cross' }, moves: { ...moves, ...inBox, [receiver.playerId]: target }, attSide: att, focusY, marks: [], weight: trace.play === 'cross' ? 1.4 : 1.2 })
    moves[receiver.playerId] = target
    Object.assign(moves, inBox)
  }

  const shot = trace.shot
  if (!shot) return beats

  // 4) Finalização: o chutador chega perto da área (chute de longe a ~26 m, os outros dentro ou na beira da área) e chuta ao gol.
  const shooter = get(shot.shooterId)
  let from: Pt = (shooter && (moves[shooter.playerId] ?? shifted(shooter, att, 'chance', focusY))) || carrierEnd
  if (shooter) {
    const limit = shot.type === 'longShot' ? 0.31 : 0.22
    if (Math.abs(gx - from.x) > limit) {
      const goalDist = shot.type === 'longShot' ? 0.25 + 0.04 * hash(`${trace.minute}:${shot.shooterId}:ls`) : 0.12 + 0.06 * hash(`${trace.minute}:${shot.shooterId}:bx`)
      const spot: Pt = { x: gx - dir * goalDist, y: clamp(from.y + (0.5 - from.y) * 0.55, 0.24, 0.76) }
      beats.push({ phase: 'chance', holder: shooter.playerId, ball: nudge(spot, dir), moves: { ...moves, [shooter.playerId]: spot }, attSide: att, focusY, marks: [], weight: 1.3 })
      moves[shooter.playerId] = spot
      from = spot
    }
  }
  const keeper = get(shot.keeperId)
  const mouth: Pt = { x: gx, y: 0.5 + (hash(`${trace.minute}:${shot.shooterId}:y`) - 0.5) * 0.18 }
  const keeperPos = keeper ? shifted(keeper, att, 'shot', 0.5) : { x: gx, y: 0.5 }
  let end: Pt = mouth
  let holder: string | undefined = shot.shooterId
  if (shot.result === 'off-target') end = { x: gx === 1 ? 1.03 : -0.03, y: clamp(0.5 + (hash(`${trace.minute}:${shot.shooterId}:o`) < 0.5 ? -1 : 1) * 0.2, 0.15, 0.85) }
  if (shot.result === 'saved') {
    end = { x: keeperPos.x, y: keeperPos.y }
    holder = keeper?.playerId
  }
  if (shot.result === 'blocked') {
    const defenders = placed.filter((p) => p.side === def && p.slot !== 'GK')
    const blocker = defenders.length > 0 ? [...defenders].sort((a, b) => Math.hypot(a.base.x - from.x, a.base.y - from.y) - Math.hypot(b.base.x - from.x, b.base.y - from.y))[0] : undefined
    if (blocker) {
      end = { x: clamp(from.x + dir * 0.06, 0.03, 0.97), y: from.y + (blocker.base.y - from.y) * 0.4 }
      holder = blocker.playerId
      moves[blocker.playerId] = end
    }
  }
  const resultKind: MarkKind | null = shot.result === 'goal' ? 'goal' : shot.result === 'saved' ? 'save' : shot.result === 'off-target' ? 'off' : null
  const marks: Mark[] = []
  if (resultKind) marks.push({ kind: resultKind, at: shot.result === 'off-target' ? { x: clamp(end.x, 0.02, 0.98), y: end.y } : end })
  for (const m of marksFromEvents((e) => (e.type === 'corner' ? cornerPoint(att, from.y) : e.type === 'own-goal' ? mouth : undefined))) marks.push(m)
  beats.push({
    phase: 'shot',
    ...(holder ? { holder } : {}),
    ball: end,
    arrow: { from, to: end, curve: false, solid: true },
    moves: { ...moves, ...(shooter ? { [shooter.playerId]: from } : {}) },
    attSide: att,
    focusY,
    marks,
    weight: 1.6,
  })
  // Chute defendido ou desviado para escanteio: a bola vai ao canto e a cobrança é um cruzamento para a área.
  const cornerMark = marks.find((mk) => mk.kind === 'corner')
  if (cornerMark && shot.result !== 'goal') beats.push(...cornerBeats(cornerMark.at, { ...moves, ...(shooter ? { [shooter.playerId]: from } : {}) }))
  else beats.push(...afterShotBeats(trace, layout, active))
  return beats
}

/**
 * Quantos passos cabem no tempo do lance: cada um precisa de `minBeatMs` para ser visto. Se não cabem todos, ficam o primeiro, o último
 * (o desfecho) e os do meio mais espaçados. Em velocidades altas o lance se resume ao desfecho.
 */
export function fitBeats(beats: readonly Beat[], tickMs: number, minBeatMs: number): Beat[] {
  const room = Math.max(1, Math.floor(tickMs / minBeatMs))
  if (beats.length <= room) return [...beats]
  if (room === 1) return [beats[beats.length - 1] as Beat]
  const picked = new Set<number>([0, beats.length - 1])
  for (let i = 1; picked.size < room && i < room - 1; i++) picked.add(Math.round((i * (beats.length - 1)) / (room - 1)))
  for (let i = 1; picked.size < room && i < beats.length - 1; i++) picked.add(i)
  return [...picked].sort((a, b) => a - b).map((i) => beats[i] as Beat)
}

/** Pênalti: a área (16,5 m de fundo, 40,3 m de largura em 105 × 68) e a marca (11 m). */
export const BOX_DEPTH = 0.157
export const BOX_Y: [number, number] = [0.204, 0.796]
export const PENALTY_MARK = 0.114

/**
 * Cena de bola parada (só visual, a partir do lance que o motor já gerou):
 * - pênalti: todos fora da área, o cobrador na marca e o goleiro na linha; depois a corrida e a cobrança;
 * - falta perigosa: o time que defende forma a barreira (alguns jogadores a ~9 m da bola, na linha do gol), o cobrador
 *   se posiciona atrás da bola e bate.
 * Quem cobra pode ser de qualquer lado (a falta é a favor de quem sofreu). Sem sorteio: as escolhas vêm de um hash.
 */
export function setPieceBeats(trace: PlayTrace, layout: Layout, events: readonly MatchEvent[]): Beat[] {
  const shot = trace.shot
  const taker = shot ? layout.get(shot.shooterId) : undefined
  if (!shot || !taker) return []
  const S = taker.side
  const D: Side = S === 'home' ? 'away' : 'home'
  const dir = S === 'home' ? 1 : -1
  const gx = goalX(S)
  const placed = [...layout.values()]
  const keeper = (shot.keeperId ? layout.get(shot.keeperId) : undefined) ?? placed.find((p) => p.side === D && p.slot === 'GK')
  const penalty = shot.type === 'penalty'
  const ballY = penalty ? 0.5 : clamp(0.5 + (hash(`${trace.minute}:${shot.shooterId}:fk`) - 0.5) * 0.5, 0.26, 0.74)
  const ballX = penalty ? gx - dir * PENALTY_MARK : gx - dir * (0.2 + hash(`${trace.minute}:${shot.shooterId}:fkx`) * 0.06)
  const spot: Pt = { x: ballX, y: ballY }
  const line = (y: number): Pt => ({ x: gx - dir * 0.012, y })

  const moves: Record<string, Pt> = {}
  const others = placed.filter((p) => p.playerId !== taker.playerId && p.playerId !== keeper?.playerId)
  const goalkeepers = placed.filter((p) => p.slot === 'GK' && p.playerId !== keeper?.playerId)
  for (const g of goalkeepers) moves[g.playerId] = shifted(g, S, 'midfield', 0.5)

  if (penalty) {
    // Todos atrás da área: o time que cobra um pouco mais longe, o outro na meia-lua.
    for (const side of [S, D] as const) {
      const mates = others.filter((p) => p.side === side && p.slot !== 'GK').sort((a, b) => a.playerId.localeCompare(b.playerId, 'en', { numeric: true }))
      const depth = side === S ? 0.3 : 0.25
      mates.forEach((p, i) => {
        moves[p.playerId] = { x: gx - dir * depth - dir * (i % 2) * 0.05, y: clamp(0.1 + (0.8 * (i + 0.5)) / Math.max(1, mates.length), 0.08, 0.92) }
      })
    }
  } else {
    // Barreira: até 4 de quem defende (meio e defesa), a ~9 m da bola, no caminho do gol.
    const pool = others.filter((p) => p.side === D && p.slot !== 'GK').sort((a, b) => hash(`${trace.minute}:${a.playerId}`) - hash(`${trace.minute}:${b.playerId}`))
    const wall = pool.slice(0, Math.min(4, pool.length))
    const wallY = ballY + (0.5 - ballY) * 0.28
    wall.forEach((p, i) => {
      moves[p.playerId] = { x: ballX + dir * 0.09, y: clamp(wallY + (i - (wall.length - 1) / 2) * 0.052, 0.05, 0.95) }
    })
    // Os outros se espalham: atacantes na área esperando o chute, o resto perto da posição de jogo.
    const rest = others.filter((p) => p.slot !== 'GK' && !moves[p.playerId])
    const inBox = rest.filter((p) => p.side === S).sort((a, b) => Math.abs(b.base.x - gx) - Math.abs(a.base.x - gx)).slice(-3)
    inBox.forEach((p, i) => {
      // Esperando o chute na altura da barreira, mas longe dela (a bola pode sobrar).
      moves[p.playerId] = { x: ballX + dir * 0.07, y: clamp(wallY + [-0.22, 0.22, -0.34][i]!, 0.06, 0.94) }
    })
    for (const p of rest) if (!moves[p.playerId]) moves[p.playerId] = shifted(p, S, 'midfield', ballY)
  }
  // Goleiro na linha (na falta, um passo para o lado da bola).
  if (keeper) moves[keeper.playerId] = line(penalty ? 0.5 : 0.5 + (ballY - 0.5) * 0.12)

  const setupTaker: Pt = penalty ? { x: ballX - dir * 0.03, y: ballY + 0.015 } : { x: ballX - dir * 0.045, y: ballY + (ballY < 0.5 ? -0.035 : 0.035) }
  const fouled = events.some((e) => e.minute === trace.minute && e.type === 'foul')
  const setup: Beat = {
    phase: 'chance',
    holder: taker.playerId,
    ball: spot,
    moves: { ...moves, [taker.playerId]: setupTaker },
    attSide: S,
    focusY: ballY,
    marks: fouled ? [{ kind: 'foul', at: spot }] : [],
  }
  const runUp: Beat = { ...setup, moves: { ...setup.moves, [taker.playerId]: { x: ballX - dir * 0.012, y: ballY } }, marks: [] }

  // A cobrança: onde a bola termina e o goleiro se joga.
  const mouthY = clamp(0.5 + (hash(`${trace.minute}:${shot.shooterId}:y`) - 0.5) * 0.2, 0.4, 0.6)
  const mouth: Pt = { x: gx, y: mouthY }
  let end = mouth
  let holder: string | undefined = taker.playerId
  const keeperMoves: Record<string, Pt> = {}
  if (keeper) {
    const dive = mouthY < 0.5 ? 0.07 : -0.07
    keeperMoves[keeper.playerId] = shot.result === 'saved' ? { x: gx - dir * 0.012, y: mouthY } : shot.result === 'goal' ? { x: gx - dir * 0.012, y: 0.5 + dive } : line(0.5)
  }
  if (shot.result === 'saved' && keeper) {
    end = { x: gx - dir * 0.012, y: mouthY }
    holder = keeper.playerId
  }
  if (shot.result === 'off-target') end = { x: gx + dir * 0.03, y: clamp(0.5 + (hash(`${trace.minute}:${shot.shooterId}:o`) < 0.5 ? -1 : 1) * 0.16, 0.18, 0.82) }
  if (shot.result === 'blocked') {
    const wallPlayer = Object.entries(moves).find(([id]) => layout.get(id)?.side === D && layout.get(id)?.slot !== 'GK' && !penalty)
    if (wallPlayer) {
      end = wallPlayer[1]
      holder = wallPlayer[0]
    } else end = { x: gx - dir * 0.05, y: mouthY }
  }
  const kind: MarkKind | null = shot.result === 'goal' ? 'goal' : shot.result === 'saved' ? 'save' : shot.result === 'off-target' ? 'off' : null
  const kick: Beat = {
    phase: 'shot',
    ...(holder ? { holder } : {}),
    ball: end,
    arrow: { from: spot, to: end, curve: !penalty && shot.result !== 'blocked', solid: true },
    moves: { ...setup.moves, [taker.playerId]: { x: ballX + dir * 0.015, y: ballY }, ...keeperMoves },
    attSide: S,
    focusY: ballY,
    marks: kind ? [{ kind, at: end }] : [],
  }
  if (penalty) {
    // Pênalti em quatro tempos: os jogadores saem da área, o batedor põe a bola na marca, o goleiro se posiciona na linha e só então a corrida e a cobrança.
    const clear: Record<string, Pt> = { ...moves }
    if (keeper) delete clear[keeper.playerId]
    const ballFrom: Pt = { x: ballX - dir * 0.1, y: 0.5 + (hash(`${trace.minute}:${shot.shooterId}:pf`) < 0.5 ? -0.12 : 0.12) }
    const leave: Beat = { phase: 'chance', holder: taker.playerId, ball: ballFrom, moves: { ...clear, [taker.playerId]: { x: ballFrom.x - dir * 0.015, y: ballFrom.y } }, attSide: S, focusY: 0.5, marks: fouled ? [{ kind: 'foul', at: ballFrom }] : [], still: true, note: 'Pênalti! Os jogadores saem da área' }
    const place: Beat = { phase: 'chance', holder: taker.playerId, ball: spot, moves: { ...clear, [taker.playerId]: setupTaker }, attSide: S, focusY: ballY, marks: [], still: true, note: '{who} coloca a bola na marca do pênalti' }
    const stand: Beat = { ...place, holder: keeper?.playerId ?? taker.playerId, moves: { ...setup.moves }, still: true, note: '{who} se posiciona na linha do gol' }
    return [leave, place, stand, { ...runUp, note: '{who} parte para a cobrança' }, kick]
  }
  return [setup, runUp, kick]
}

/**
 * Cenas que vêm depois do chute (só visuais): o tiro de meta depois de um chute para fora e a saída de bola depois do gol.
 * Tiro de meta: a bola volta para a área, o goleiro a pega, ajeita e cobra; com toque de bola sai jogando curto perto da área, com lançamento direto
 * é bola longa e nos outros estilos um meio-termo. Saída: a bola volta ao meio, os dois times se reorganizam cada um no seu lado e quem sofreu o gol dá a saída.
 */
export function afterShotBeats(trace: PlayTrace, layout: Layout, active?: ReadonlySet<string>): Beat[] {
  const shot = trace.shot
  if (!shot) return []
  const placed = [...layout.values()].filter((p) => !active || active.has(p.playerId))
  const shooter = layout.get(shot.shooterId)
  const att: Side = shooter?.side ?? trace.side
  if (shot.result === 'goal') return kickoffBeats(att, placed, trace.minute)
  if (shot.result === 'off-target') return goalKickBeats(att, placed, trace.minute, shot.keeperId ? layout.get(shot.keeperId) : undefined)
  return []
}

function kickoffBeats(scorer: Side, placed: readonly Placed[], minute: number): Beat[] {
  const k: Side = scorer === 'home' ? 'away' : 'home'
  const kdir = k === 'home' ? 1 : -1
  const mates = placed.filter((p) => p.side === k && p.slot !== 'GK')
  const rank = (p: Placed) => (p.slot === 'ST' ? 0 : p.slot === 'AM' ? 1 : p.slot === 'CM' ? 2 : 3)
  const sorted = [...mates].sort((a, b) => rank(a) - rank(b) || hash(`${minute}:${a.playerId}:ko`) - hash(`${minute}:${b.playerId}:ko`))
  const kicker = sorted[0]
  const partner = sorted.find((p) => p.playerId !== kicker?.playerId && (p.slot === 'CM' || p.slot === 'AM' || p.slot === 'ST')) ?? sorted[1]
  if (!kicker || !partner) return []
  const moves: Record<string, Pt> = {}
  for (const p of placed) {
    // Cada time no seu lado; quem não dá a saída fica fora do círculo central.
    const own = p.side === 'home' ? Math.min(p.base.x, p.side === k ? 0.46 : 0.39) : Math.max(p.base.x, p.side === k ? 0.54 : 0.61)
    moves[p.playerId] = { x: p.slot === 'GK' ? p.base.x : own, y: p.base.y }
  }
  const kickerAt: Pt = { x: 0.5 - kdir * 0.012, y: 0.5 }
  const partnerAt: Pt = { x: 0.5 - kdir * 0.07, y: 0.57 }
  moves[kicker.playerId] = kickerAt
  moves[partner.playerId] = partnerAt
  const centre: Pt = { x: 0.5, y: 0.5 }
  return [
    { phase: 'midfield', holder: kicker.playerId, ball: centre, moves, attSide: k, focusY: 0.5, marks: [], weight: 1.4, still: true, scene: true, note: 'A bola volta ao meio do campo e os times se reorganizam' },
    { phase: 'progress', holder: partner.playerId, ball: partnerAt, arrow: { from: centre, to: partnerAt, curve: false }, moves, attSide: k, focusY: 0.5, marks: [], weight: 0.9, scene: true, note: '{from} dá a saída de bola para {who}' },
  ]
}

function goalKickBeats(att: Side, placed: readonly Placed[], minute: number, keeperHint: Placed | undefined): Beat[] {
  const D: Side = att === 'home' ? 'away' : 'home'
  const adir = att === 'home' ? 1 : -1 // o time que chutou ataca neste sentido; o goleiro defende o gol de lá
  const gx = goalX(att)
  const keeper = keeperHint && keeperHint.side === D ? keeperHint : placed.find((p) => p.side === D && p.slot === 'GK')
  if (!keeper) return []
  const mates = placed.filter((p) => p.side === D && p.slot !== 'GK')
  const spot: Pt = { x: gx - adir * 0.05, y: clamp(0.5 + (hash(`${minute}:${keeper.playerId}:gk`) - 0.5) * 0.3, 0.38, 0.62) }
  const behind: Pt = { x: spot.x - adir * 0.018, y: spot.y }
  const style = keeper.style ?? mates.find((p) => p.style)?.style
  const byHash = (list: readonly Placed[]) => [...list].sort((a, b) => hash(`${minute}:${a.playerId}:gkr`) - hash(`${minute}:${b.playerId}:gkr`))
  const pick = (slots: readonly Position[], toward: number): Placed | undefined => {
    const pool = mates.filter((p) => slots.includes(p.slot))
    return byHash(pool.length > 0 ? pool : mates).sort((a, b) => Math.abs(a.base.x - toward) - Math.abs(b.base.x - toward))[0]
  }
  // Companheiros abrem para a saída: zagueiros na beira da área.
  const spread: Record<string, Pt> = {}
  byHash(mates.filter((p) => p.slot === 'CB')).slice(0, 2).forEach((p, i) => (spread[p.playerId] = { x: gx - adir * 0.17, y: i === 0 ? 0.32 : 0.68 }))
  let receiver: Placed | undefined
  let target: Pt
  let curve = false
  if (style === 'direct') {
    // Lançamento direto: bola longa para o atacante, perto do meio do campo.
    receiver = pick(['ST', 'AM', 'RW', 'LW'], 0.5)
    target = { x: 0.5 - adir * 0.04, y: clamp(receiver ? receiver.base.y * 0.6 + 0.2 : 0.5, 0.25, 0.75) }
    curve = true
  } else if (style === 'possession') {
    // Toque de bola: sai jogando curto, para um zagueiro ou lateral perto da área.
    receiver = pick(['CB', 'RB', 'LB'], gx - adir * 0.15)
    target = { x: gx - adir * 0.16, y: clamp(receiver ? receiver.base.y : 0.5, 0.2, 0.8) }
  } else {
    // Meio-termo: bola até o volante ou meia, a uns 30 m do gol.
    receiver = pick(['DM', 'CM', 'RB', 'LB'], gx - adir * 0.3)
    target = { x: gx - adir * 0.3, y: clamp(receiver ? receiver.base.y : 0.5, 0.2, 0.8) }
  }
  if (!receiver) return []
  // O destinatário já vai ao ponto enquanto o goleiro ajeita a bola, então a bola não cruza o campo atrás dele.
  const moves = { ...spread, [receiver.playerId]: target }
  return [
    { phase: 'progress', holder: keeper.playerId, ball: spot, moves: { [keeper.playerId]: behind, ...moves }, attSide: D, focusY: spot.y, marks: [], weight: 1.2, still: true, scene: true, note: 'Bola para fora: tiro de meta. {who} vai buscar a bola' },
    { phase: 'progress', holder: keeper.playerId, ball: spot, moves: { [keeper.playerId]: behind, ...moves }, attSide: D, focusY: spot.y, marks: [], weight: 0.9, scene: true, note: '{who} pega a bola e ajeita para a cobrança' },
    { phase: 'progress', holder: receiver.playerId, ball: nudge(target, -adir), arrow: { from: spot, to: target, curve }, moves, attSide: D, focusY: target.y, marks: [], weight: curve ? 1.4 : 1, scene: true, note: curve ? '{from} cobra o tiro de meta com bola longa para {who}' : '{from} cobra o tiro de meta e toca para {who}' },
  ]
}

const isFoulOrCard = (e: MatchEvent) => e.type === 'foul' || e.type === 'yellow-card' || e.type === 'red-card'

function nudge(p: Pt, dir: number): Pt {
  return { x: clamp(p.x + dir * 0.018, 0.02, 0.98), y: p.y }
}

function cornerPoint(att: Side, y: number): Pt {
  return { x: att === 'home' ? 0.99 : 0.01, y: y < 0.5 ? 0.02 : 0.98 }
}

function positionOf(layout: Layout, id: string, att: Side, phase: Phase, focusY: number): Pt | undefined {
  const p = layout.get(id)
  return p ? shifted(p, att, phase, focusY) : undefined
}

/**
 * Quais batidas tocam em cada velocidade: em 1x todas; em 2x só a progressão e o desfecho; em 4x e 8x (ou quando vários
 * momentos chegam de uma vez) só o desfecho, sem setas.
 */
export function playbackFor(beats: readonly Beat[], speed: number, simplified: boolean): { beats: Beat[]; arrows: boolean } {
  const last = beats[beats.length - 1]
  if (!last) return { beats: [], arrows: false }
  // O desfecho é a finalização (o escanteio que vem depois é só a cena da cobrança, que não cabe nas velocidades altas).
  const outcome = [...beats].reverse().find((b) => b.phase === 'shot') ?? last
  if (simplified || speed >= 2) return { beats: [outcome], arrows: false }
  // Em 1x (800 ms por minuto) o lance vem resumido, com o escanteio (bola ao canto e cruzamento, que vêm depois da finalização).
  if (speed >= 1) return { beats: [...new Set([beats[Math.min(1, beats.length - 1)] as Beat, outcome, ...beats.slice(beats.indexOf(outcome) + 1)])], arrows: true }
  return { beats: [...beats], arrows: true }
}

/** Qual dos momentos novos o campo desenha: o gol, senão o que terminou em finalização, senão o último. */
export function pickTrace(fresh: readonly PlayTrace[]): PlayTrace | undefined {
  return [...fresh].reverse().find((t) => t.shot?.result === 'goal') ?? [...fresh].reverse().find((t) => t.shot) ?? fresh[fresh.length - 1]
}

/** Monta o mapa de jogadores em campo dos dois times a partir do snapshot da partida. */
export function layoutFrom(snap: MatchSnapshot, wingers: { home: boolean; away: boolean }): Layout {
  const out: Layout = new Map()
  const homeShape = shapeOf(snap.home.style, snap.home.activeMentality)
  const awayShape = shapeOf(snap.away.style, snap.away.activeMentality)
  for (const p of basePositions('home', snap.home.onPitch, wingers.home, homeShape, snap.home.style)) out.set(p.playerId, p)
  for (const p of basePositions('away', snap.away.onPitch, wingers.away, awayShape, snap.away.style)) out.set(p.playerId, p)
  return out
}

// ---------------------------------------------------------------------------
// Câmera lenta: finalizações, gols e cartões ganham tempo para serem vistos, em qualquer velocidade
// ---------------------------------------------------------------------------

// As regras de câmera lenta moram no motor (o servidor da liga online as usa no relógio de cada partida).
export { HOLD_MS, holdFor, slowFor } from '../../../engine/match/timing'

/** Atalho de desenvolvimento da URL (só com `npm run dev`; fora do navegador ou em produção é sempre falso). */
export const devFlag = (name: string): boolean => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(name)

/** Valor de um parâmetro de desenvolvimento da URL (`null` fora do navegador ou em produção). */
export const devParam = (name: string): string | null => (import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get(name) : null)
