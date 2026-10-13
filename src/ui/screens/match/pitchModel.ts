/**
 * Modelo do campo 2D: onde cada jogador fica, para onde a bola vai a cada lance e quais marcações aparecem.
 * Tudo aqui é uma representação visual do que o motor já decidiu (`snapshot.trace` e `snapshot.events`):
 * nada altera o jogo e nenhum sorteio do motor é usado (variações vêm de um hash simples do minuto e dos ids).
 * Coordenadas normalizadas: x de 0 (gol da esquerda) a 1 (gol da direita), y de 0 (topo) a 1 (base).
 * O mandante ataca para a direita.
 */
import type { MatchSnapshot, PlayTrace } from '../../../engine/match'
import type { GridPoint, MatchEvent, Position } from '../../../engine/types'

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
}

/** Base de um time: cada vaga na profundidade da posição e espalhada na largura quando há mais de um na mesma posição. */
export function basePositions(side: Side, onPitch: readonly OnPitch[], wingersAttack: boolean): Placed[] {
  if (onPitch.length > 0 && onPitch.every((p) => p.point)) {
    return onPitch.map((p) => {
      const { row, lane } = p.point as GridPoint
      const depth = ROW_DEPTH[row] ?? 0.5
      const y = LANE_Y[lane] ?? 0.5
      return { playerId: p.playerId, side, slot: p.slot, base: { x: side === 'home' ? depth : 1 - depth, y: side === 'home' ? y : 1 - y } }
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
      const x = side === 'home' ? depth : 1 - depth
      // O time visto de cima atacando para a direita tem o lado direito embaixo; o visitante é o espelho.
      const y = side === 'home' ? lane : 1 - lane
      placed.push({ playerId: p.playerId, side, slot, base: { x, y } })
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

const NUMBERS: Record<Position, number[]> = {
  GK: [1, 12, 25],
  RB: [2, 22, 26],
  CB: [3, 4, 13, 14],
  LB: [6, 16, 27],
  DM: [5, 15, 23],
  CM: [8, 18, 20, 21],
  AM: [10, 17, 24],
  RW: [7, 19, 28],
  LW: [11, 17, 29],
  ST: [9, 19, 30],
}

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
  const push = PHASE_PUSH[phase] * ROLE_PUSH[p.slot]
  const dx = mine ? dir * push : dir * push * 0.55 * (p.slot === 'GK' ? 0 : 1)
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
}

export type Layout = Map<string, Placed>

const goalX = (side: Side) => (side === 'home' ? 1 : 0)

/** Eventos que o campo marca (do minuto do lance). */
const markFor = (e: MatchEvent): MarkKind | null =>
  e.type === 'goal' ? 'goal' : e.type === 'own-goal' ? 'own-goal' : e.type === 'corner' ? 'corner' : e.type === 'foul' ? 'foul' : e.type === 'yellow-card' ? 'yellow' : e.type === 'red-card' ? 'red' : null

/**
 * As batidas de um momento de posse. Não sorteia nada: onde há escolha (o meio-campista que "ganhou o meio", o
 * lado do escanteio) usa um hash do minuto e dos ids, o mesmo em qualquer máquina.
 */
export function beatsFor(trace: PlayTrace, layout: Layout, events: readonly MatchEvent[]): Beat[] {
  if (trace.shot && (trace.shot.type === 'penalty' || trace.shot.type === 'freeKick')) {
    const scene = setPieceBeats(trace, layout, events)
    if (scene.length > 0) return scene
  }
  const att = trace.side
  const def: Side = att === 'home' ? 'away' : 'home'
  const dir = att === 'home' ? 1 : -1
  const placed = [...layout.values()]
  const get = (id?: string) => (id ? layout.get(id) : undefined)
  const posAt = (id: string | undefined, phase: Phase, focusY: number): Pt | undefined => {
    const p = get(id)
    return p ? shifted(p, att, phase, focusY) : undefined
  }
  const carrier = get(trace.carrierId)
  const mids = placed.filter((p) => p.side === att && (p.slot === 'DM' || p.slot === 'CM' || p.slot === 'AM'))
  const pool = mids.length > 0 ? mids : placed.filter((p) => p.side === att && p.slot !== 'GK')
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

  const beats: Beat[] = []
  // 1) Disputa do meio: o time com a bola sobe um pouco; a bola vai para um meio-campista.
  const winnerPos = winner ? shifted(winner, att, 'midfield', focusMid) : { x: 0.5, y: 0.5 }
  beats.push({ phase: 'midfield', ...(winner ? { holder: winner.playerId } : {}), ball: nudge(winnerPos, dir), moves: {}, attSide: att, focusY: focusMid, marks: [] })
  if (trace.play === 'held' || !carrier) {
    // Só manteve a bola: eventos paralelos (falta no meio) aparecem aqui.
    const marks = marksFromEvents((e) => (isFoulOrCard(e) ? positionOf(layout, e.playerId, att, 'midfield', focusMid) : undefined))
    const last = beats[beats.length - 1] as Beat
    last.marks = marks
    return beats
  }

  const carrierPos = posAt(trace.carrierId, 'progress', focusY) as Pt
  const marker = get(trace.markerId)
  const moves: Record<string, Pt> = {}
  let carrierEnd = carrierPos
  if (trace.play === 'dribble') carrierEnd = { x: clamp(carrierPos.x + dir * 0.07, 0.05, 0.95), y: carrierPos.y }
  if (trace.play === 'cross') carrierEnd = { x: goalX(att) === 1 ? 0.86 : 0.14, y: carrierPos.y < 0.5 ? 0.07 : 0.93 }
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
  })
  if (trace.outcome === 'foul') return beats
  if (lostDribble) return beats

  // 3) Passe em profundidade ou cruzamento: seta tracejada até o alvo.
  const receiver = get(trace.receiverId)
  if ((trace.play === 'through' || trace.play === 'cross') && receiver) {
    const target: Pt =
      trace.play === 'cross'
        ? { x: clamp(goalX(att) === 1 ? 0.88 : 0.12, 0.05, 0.95), y: clamp(0.5 + (hash(`${trace.minute}:${receiver.playerId}`) - 0.5) * 0.28, 0.3, 0.7) }
        : { x: clamp(goalX(att) === 1 ? 0.82 : 0.18, 0.05, 0.95), y: clamp(receiver.base.y * 0.5 + 0.25, 0.25, 0.75) }
    if (trace.outcome === 'intercepted' && marker) {
      const m = shifted(marker, att, 'progress', focusY)
      beats.push({ phase: 'progress', holder: marker.playerId, ball: nudge(m, -dir), arrow: { from: carrierEnd, to: m, curve: false }, moves: { ...moves, [marker.playerId]: m }, attSide: att, focusY, marks: [] })
      return beats
    }
    if (trace.play === 'cross' && trace.outcome === 'lost' && marker) {
      const m = { x: target.x - dir * 0.03, y: target.y }
      beats.push({ phase: 'chance', holder: marker.playerId, ball: m, arrow: { from: carrierEnd, to: m, curve: true }, moves: { ...moves, [marker.playerId]: m }, attSide: att, focusY, marks: marksFromEvents((e) => (e.type === 'corner' ? cornerPoint(att, carrierEnd.y) : undefined)) })
      return beats
    }
    beats.push({ phase: 'chance', holder: receiver.playerId, ball: nudge(target, dir), arrow: { from: carrierEnd, to: target, curve: trace.play === 'cross' }, moves: { ...moves, [receiver.playerId]: target }, attSide: att, focusY, marks: [] })
    moves[receiver.playerId] = target
  }

  const shot = trace.shot
  if (!shot) return beats

  // 4) Finalização: chute ao gol; goleiro, bloqueio, para fora ou gol.
  const shooter = get(shot.shooterId)
  const from: Pt = (shooter && (moves[shooter.playerId] ?? shifted(shooter, att, 'chance', focusY))) || carrierEnd
  const keeper = get(shot.keeperId)
  const mouth: Pt = { x: goalX(att), y: 0.5 + (hash(`${trace.minute}:${shot.shooterId}:y`) - 0.5) * 0.18 }
  const keeperPos = keeper ? shifted(keeper, att, 'shot', 0.5) : { x: goalX(att), y: 0.5 }
  let end: Pt = mouth
  let holder: string | undefined = shot.shooterId
  if (shot.result === 'off-target') end = { x: goalX(att) === 1 ? 1.03 : -0.03, y: clamp(0.5 + (hash(`${trace.minute}:${shot.shooterId}:o`) < 0.5 ? -1 : 1) * 0.2, 0.15, 0.85) }
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
  })
  return beats
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
  return [setup, runUp, kick]
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
  if (simplified || speed >= 4) return { beats: [last], arrows: false }
  if (speed >= 2) return { beats: [...new Set([beats[Math.min(1, beats.length - 1)] as Beat, last])], arrows: true }
  return { beats: [...beats], arrows: true }
}

/** Qual dos momentos novos o campo desenha: o gol, senão o que terminou em finalização, senão o último. */
export function pickTrace(fresh: readonly PlayTrace[]): PlayTrace | undefined {
  return [...fresh].reverse().find((t) => t.shot?.result === 'goal') ?? [...fresh].reverse().find((t) => t.shot) ?? fresh[fresh.length - 1]
}

/** Monta o mapa de jogadores em campo dos dois times a partir do snapshot da partida. */
export function layoutFrom(snap: MatchSnapshot, wingers: { home: boolean; away: boolean }): Layout {
  const out: Layout = new Map()
  for (const p of basePositions('home', snap.home.onPitch, wingers.home)) out.set(p.playerId, p)
  for (const p of basePositions('away', snap.away.onPitch, wingers.away)) out.set(p.playerId, p)
  return out
}

// ---------------------------------------------------------------------------
// Câmera lenta: finalizações, gols e cartões ganham tempo para serem vistos, em qualquer velocidade
// ---------------------------------------------------------------------------

/** Duração (ms) da animação de cada tipo de lance; o relógio da partida espera esse tempo (`holdFor`). */
export const HOLD_MS = { goal: 3000, shot: 2000, card: 2000, setPiece: 1000 } as const

/** Quanto o campo demora num momento: o gol e a finalização passam devagar; o resto segue o ritmo da velocidade. */
export const slowFor = (trace: PlayTrace): number => {
  if (!trace.shot) return 0
  // Pênalti e falta perigosa têm a preparação (barreira, marca) antes da cobrança: um segundo a mais.
  const extra = trace.shot.type === 'penalty' || trace.shot.type === 'freeKick' ? HOLD_MS.setPiece : 0
  return (trace.shot.result === 'goal' ? HOLD_MS.goal : HOLD_MS.shot) + extra
}

/** Quanto o relógio espera depois de um passo, pelos lances e eventos novos (0 quando nada pede câmera lenta). */
export function holdFor(traces: readonly PlayTrace[], events: readonly MatchEvent[]): number {
  let hold = 0
  for (const t of traces) hold = Math.max(hold, slowFor(t))
  for (const e of events) {
    if (e.type === 'goal' || e.type === 'own-goal') hold = Math.max(hold, HOLD_MS.goal)
    else if (e.type === 'yellow-card' || e.type === 'red-card') hold = Math.max(hold, HOLD_MS.card)
  }
  return hold
}

/** Atalho de desenvolvimento da URL (só com `npm run dev`; fora do navegador ou em produção é sempre falso). */
export const devFlag = (name: string): boolean => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(name)

/** Valor de um parâmetro de desenvolvimento da URL (`null` fora do navegador ou em produção). */
export const devParam = (name: string): string | null => (import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get(name) : null)
