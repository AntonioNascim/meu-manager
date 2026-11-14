/**
 * Dados dos cartões da partida ao vivo (só leitura, a partir do que o motor já gerou; nada muda resultado):
 * a linha de gols do topo, a linha do tempo, a nota de cada time e a evolução da partida.
 */
import type { MatchSnapshot } from '../../../engine/match'
import type { MatchEvent } from '../../../engine/types'

export type TimelineKind = 'goal' | 'own-goal' | 'yellow' | 'red' | 'sub' | 'penalty-missed'

export interface TimelineEntry {
  minute: number
  kind: TimelineKind
  playerId: string
  teamId: string
  /** Gol: quem deu a assistência. Troca: quem entrou (o `playerId` é quem saiu). */
  relatedId?: string
  /** Índice do evento (chave estável). */
  index: number
}

const KIND_OF: Partial<Record<MatchEvent['type'], TimelineKind>> = {
  goal: 'goal',
  'own-goal': 'own-goal',
  'yellow-card': 'yellow',
  'red-card': 'red',
  substitution: 'sub',
  'missed-penalty': 'penalty-missed',
}

/** Gols, cartões e substituições, do mais recente ao mais antigo (a "Linha do tempo"). */
export function timelineOf(snap: Pick<MatchSnapshot, 'events'>, limit = 40): TimelineEntry[] {
  const out: TimelineEntry[] = []
  snap.events.forEach((e, index) => {
    const kind = KIND_OF[e.type]
    if (!kind) return
    out.push({ minute: e.minute, kind, playerId: e.playerId, teamId: e.teamId, ...(e.relatedPlayerId ? { relatedId: e.relatedPlayerId } : {}), index })
  })
  return out.sort((a, b) => b.minute - a.minute || b.index - a.index).slice(0, limit)
}

export interface GoalLine {
  minute: number
  playerId: string
  teamId: string
  own: boolean
  index: number
}

/** Os gols da partida, na ordem em que saíram (a linha embaixo do placar). */
export function goalsOf(snap: Pick<MatchSnapshot, 'events'>): GoalLine[] {
  const out: GoalLine[] = []
  snap.events.forEach((e, index) => {
    if (e.type === 'goal' || e.type === 'own-goal') out.push({ minute: e.minute, playerId: e.playerId, teamId: e.teamId, own: e.type === 'own-goal', index })
  })
  return out
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Nota de cada time (0 a 10) a cada instante da partida: parte de 6,0 e sobe ou desce com o saldo de gols, a posse, a pontaria e os cartões.
 * É uma leitura do que aconteceu (não entra em nenhuma conta do jogo).
 */
export function teamRatings(snap: Pick<MatchSnapshot, 'homeGoals' | 'awayGoals' | 'homeStats' | 'awayStats'>): { home: number; away: number } {
  const rate = (goals: number, against: number, own: MatchSnapshot['homeStats'], other: MatchSnapshot['homeStats']): number => {
    const totalTarget = own.shotsOnTarget + other.shotsOnTarget
    const aim = totalTarget > 0 ? (own.shotsOnTarget / totalTarget - 0.5) * 2 : 0
    const value = 6 + clamp((goals - against) * 0.4, -2, 2) + ((own.possession - 50) / 50) * 0.8 + aim * 0.8 - own.yellowCards * 0.15 - own.redCards * 0.6
    return Math.round(clamp(value, 3, 10) * 10) / 10
  }
  return { home: rate(snap.homeGoals, snap.awayGoals, snap.homeStats, snap.awayStats), away: rate(snap.awayGoals, snap.homeGoals, snap.awayStats, snap.homeStats) }
}

/** Peso de cada momento de posse na "pressão" de um time (gráfico da evolução da partida). */
const THREAT = { held: 0.15, move: 0.6, shot: 2, onTarget: 3, goal: 5 } as const

export interface EvolutionPoint {
  minute: number
  home: number
  away: number
}

/**
 * Evolução da partida: para cada minuto, quanto cada time vinha pressionando (soma dos momentos de posse, com mais peso para chegada e finalização),
 * de 0 a 100 na escala do time que mais pressionou até agora. Sempre começa em 0 no minuto 0.
 */
export function evolutionOf(snap: Pick<MatchSnapshot, 'trace' | 'minute'>): EvolutionPoint[] {
  const last = Math.max(1, snap.minute)
  const perMinute = Array.from({ length: last + 1 }, () => ({ home: 0, away: 0 }))
  for (const t of snap.trace) {
    const m = Math.min(last, Math.max(0, Math.round(t.minute)))
    const w = t.shot ? (t.shot.result === 'goal' ? THREAT.goal : t.shot.result === 'saved' ? THREAT.onTarget : THREAT.shot) : t.play === 'held' ? THREAT.held : THREAT.move
    ;(perMinute[m] as { home: number; away: number })[t.side] += w
  }
  let h = 0
  let a = 0
  const raw = perMinute.map((p, minute) => {
    h += p.home
    a += p.away
    return { minute, home: h, away: a }
  })
  const top = Math.max(1, h, a)
  return raw.map((p) => ({ minute: p.minute, home: Math.round((p.home / top) * 1000) / 10, away: Math.round((p.away / top) * 1000) / 10 }))
}

/** Luminância relativa de uma cor `#rrggbb` (0 a 1). */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0.5
  const n = parseInt(m[1] as string, 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** A cor do time que aparece bem sobre o fundo escuro dos cartões: a da camisa, ou a da gola/detalhe quando a camisa é escura demais. */
export function visibleColor(shirt: string, trim: string): string {
  if (luminance(shirt) >= 0.12) return shirt
  if (luminance(trim) >= 0.12) return trim
  return '#e5e7eb'
}

/** Relógio da partida em texto: 32' (ou 90+, na prorrogação 105'). */
export const clockText = (minute: number): string => (minute <= 0 ? "0'" : `${minute}'`)

/** O tempo de jogo: 1º tempo, 2º tempo, prorrogação, intervalo ou fim. */
export function periodText(snap: Pick<MatchSnapshot, 'minute' | 'finished' | 'extraTime'>, halftime: boolean): string {
  if (snap.finished) return 'Fim de jogo'
  if (halftime) return 'Intervalo'
  if (snap.minute === 0) return 'Antes do apito'
  if (snap.minute > 90 || (snap.extraTime && snap.minute > 90)) return 'Prorrogação'
  return snap.minute <= 45 ? '1º tempo' : '2º tempo'
}
