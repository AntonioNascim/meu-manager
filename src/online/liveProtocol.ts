/**
 * Protocolo da partida ao vivo (Fase 6, B7): o que o cliente pode mandar pelo WebSocket, com validação estrita, e o que o servidor devolve.
 * Puro (sem DOM, sem Cloudflare). Mensagens são JSON de uma linha; o cliente nunca manda resultado, só decisões (proposta, seção 2.6).
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { LIVE_SPEEDS, replayResult, type CommandOutcome, type LiveEvent, type LiveView, type QueuedCommand, type ReplayRecord } from '../engine/league/live'
import { PLAY_STYLES } from '../engine/types'
import type { MatchEvent, Mentality, PlayStyle, TeamMatchStats } from '../engine/types'
import type { MatchSnapshot, PlayTrace, SideSnapshot } from '../engine/match'
import type { MatchResult } from '../engine/types'

export const MAX_MESSAGE_BYTES = 4096
const STYLES: readonly PlayStyle[] = PLAY_STYLES
const ID = /^[A-Za-z0-9_.:-]{1,64}$/

export type ClientMessage =
  /** Abre ou retoma a conexão. `since` = último minuto que o cliente já viu (0 = tudo). */
  | { t: 'hello'; since: number }
  | { t: 'cmd'; id: string; command: QueuedCommand['command'] }
  /** A velocidade do jogo deste técnico (1, 2, 4 ou 8; a mesma do jogo solo). */
  | { t: 'speed'; value: number }
  /** "Voltar ao jogo" no intervalo. */
  | { t: 'half' }
  /** "Pular": a IA joga o time deste técnico até o fim; a partida só vai ao fim quando todos os técnicos dela pulam. */
  | { t: 'skip' }
  | { t: 'ping' }

export type ParseProblem = 'too-large' | 'not-json' | 'bad-shape' | 'bad-command'

const int = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

function parseCommand(c: unknown): QueuedCommand['command'] | undefined {
  if (!c || typeof c !== 'object') return undefined
  const o = c as Record<string, unknown>
  switch (o.type) {
    case 'style':
      return STYLES.includes(o.style as PlayStyle) ? { type: 'style', style: o.style as PlayStyle } : undefined
    case 'mentality':
      return int(o.mentality, -2, 2) ? { type: 'mentality', mentality: o.mentality as Mentality } : undefined
    case 'formation':
      return isId(o.formationId) ? { type: 'formation', formationId: o.formationId } : undefined
    case 'position': {
      const p = o.point as Record<string, unknown> | undefined
      return isId(o.playerId) && p && int(p.row, 0, 5) && int(p.lane, 0, 4) ? { type: 'position', playerId: o.playerId, point: { row: p.row as number, lane: p.lane as number } } : undefined
    }
    case 'substitute':
      return isId(o.outgoingId) && isId(o.incomingId) ? { type: 'substitute', outgoingId: o.outgoingId, incomingId: o.incomingId } : undefined
    case 'injury':
      return o.incomingId === undefined ? { type: 'injury' } : isId(o.incomingId) ? { type: 'injury', incomingId: o.incomingId } : undefined
    default:
      return undefined // inclusive 'control': só o servidor decide quem controla
  }
}

export function parseClientMessage(text: string): { ok: true; message: ClientMessage } | { ok: false; problem: ParseProblem } {
  if (utf8ToBytes(text).length > MAX_MESSAGE_BYTES) return { ok: false, problem: 'too-large' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, problem: 'not-json' }
  }
  if (!raw || typeof raw !== 'object') return { ok: false, problem: 'bad-shape' }
  const o = raw as Record<string, unknown>
  if (o.t === 'ping') return { ok: true, message: { t: 'ping' } }
  if (o.t === 'half') return { ok: true, message: { t: 'half' } }
  if (o.t === 'skip') return { ok: true, message: { t: 'skip' } }
  if (o.t === 'speed') return typeof o.value === 'number' && (LIVE_SPEEDS as readonly number[]).includes(o.value) ? { ok: true, message: { t: 'speed', value: o.value } } : { ok: false, problem: 'bad-shape' }
  if (o.t === 'hello') return int(o.since ?? 0, 0, 120) ? { ok: true, message: { t: 'hello', since: (o.since as number | undefined) ?? 0 } } : { ok: false, problem: 'bad-shape' }
  if (o.t === 'cmd') {
    if (!isId(o.id)) return { ok: false, problem: 'bad-shape' }
    const command = parseCommand(o.command)
    return command ? { ok: true, message: { t: 'cmd', id: o.id, command } } : { ok: false, problem: 'bad-command' }
  }
  return { ok: false, problem: 'bad-shape' }
}

export interface GameFrame {
  matchId: string
  minute: number
  homeGoals: number
  awayGoals: number
  finished: boolean
  controlled: { home: boolean; away: boolean }
  /** A velocidade que vale para a partida (a mais lenta entre as escolhas dos técnicos conectados) e a escolha de cada técnico. */
  speed: number
  speeds: Record<string, number>
  /** Intervalo em andamento: quanto falta (ms) e quem já tocou em "Voltar ao jogo". */
  halftime?: { leftMs: number; ready: string[] }
  skipped?: string[]
  /** Lesão à espera do técnico (o jogo dele está parado): quem se machucou e quanto falta para entrar o melhor reserva. */
  injury?: { side: 'home' | 'away'; playerId: string; leftMs: number }
  /** Só o que o cliente ainda não tinha. */
  events: MatchEvent[]
  trace: PlayTrace[]
  /** O resto do retrato da partida (quem está em campo, tática, banco, estatísticas): pequeno e sempre inteiro. */
  home: SideSnapshot
  away: SideSnapshot
  homeStats: TeamMatchStats
  awayStats: TeamMatchStats
  extraTime?: boolean
  /** Disputa de pênaltis (mata-mata empatado): o placar dela e as cobranças. */
  penalties?: { home: number; away: number }
  shootout?: MatchSnapshot['shootout']
}

/** Quem joga: o suficiente para desenhar o campo e montar as trocas sem baixar o mundo (a tela online não tem o mundo). */
export interface RosterTeam {
  id: string
  name: string
  abbreviation: string
  colors: [string, string]
  shortName?: string
}
export interface RosterPlayer {
  id: string
  teamId: string
  name: string
  nickname?: string
  position: string
  overall: number
}
export interface Roster {
  teams: RosterTeam[]
  players: RosterPlayer[]
}

export type ServerMessage =
  /** `resumeAt`: instante (ms) em que o jogo volta depois do aviso de retomada, se ainda não passou. */
  | { t: 'full'; minute: number; paused: boolean; games: LiveView[]; roster: Roster; me: { teamId: string }; resumeAt?: number; labels?: Record<string, { competition: string; detail: string; cup: boolean }> }
  | { t: 'frame'; minute: number; games: GameFrame[] }
  | { t: 'result'; outcomes: CommandOutcome[] }
  | { t: 'paused'; minute: number }
  | { t: 'resumed'; minute: number; resumeAt: number }
  | { t: 'end' }
  | { t: 'error'; problem: ParseProblem | 'rate-limited' | 'not-in-event' }
  | { t: 'pong' }

/** Quantos eventos e lances de cada partida o cliente já recebeu (para mandar só a diferença). */
export type Cursor = Record<string, { events: number; trace: number; minute: number; meta: string }>

/** O que mudou desde o cursor, e o cursor novo. */
export function frameSince(e: LiveEvent, views: readonly LiveView[], cursor: Cursor): { frame: ServerMessage | undefined; cursor: Cursor } {
  const next: Cursor = {}
  const games: GameFrame[] = []
  for (const v of views) {
    const seen = cursor[v.matchId] ?? { events: 0, trace: 0, minute: -1, meta: '' }
    // O que muda sem o jogo andar (velocidade, intervalo, lesão, quem controla, fim) também vale um quadro; o tempo que falta não (a tela conta sozinha).
    const meta = JSON.stringify([v.controlled, v.speed, v.speeds, v.halftime?.ready ?? null, v.snapshot.injuryPending ?? null, v.snapshot.finished, v.skipped ?? null])
    next[v.matchId] = { events: v.snapshot.events.length, trace: v.snapshot.trace.length, minute: v.snapshot.minute, meta }
    if (seen.minute === v.snapshot.minute && seen.meta === meta && seen.events === v.snapshot.events.length && seen.trace === v.snapshot.trace.length) continue
    games.push({
      matchId: v.matchId,
      minute: v.snapshot.minute,
      homeGoals: v.snapshot.homeGoals,
      awayGoals: v.snapshot.awayGoals,
      finished: v.snapshot.finished,
      controlled: v.controlled,
      speed: v.speed,
      speeds: v.speeds,
      ...(v.skipped?.length ? { skipped: v.skipped } : {}),
      ...(v.halftime ? { halftime: v.halftime } : {}),
      ...(v.snapshot.injuryPending ? { injury: { ...v.snapshot.injuryPending, leftMs: v.injuryLeftMs ?? 0 } } : {}),
      events: v.snapshot.events.slice(seen.events),
      trace: v.snapshot.trace.slice(seen.trace),
      home: v.snapshot.home,
      away: v.snapshot.away,
      homeStats: v.snapshot.homeStats,
      awayStats: v.snapshot.awayStats,
      ...(v.snapshot.extraTime ? { extraTime: true } : {}),
      ...(v.snapshot.penalties ? { penalties: v.snapshot.penalties } : {}),
      ...(v.snapshot.shootout ? { shootout: v.snapshot.shootout } : {}),
    })
  }
  return { frame: games.length > 0 ? { t: 'frame', minute: e.clock, games } : undefined, cursor: next }
}

/** Texto estável (chaves em ordem) para comparar resultados. */
export function stableJson(value: unknown): string {
  return JSON.stringify(JSON.parse(JSON.stringify(value)), (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  )
}

/** Impressão digital (SHA-256) de um resultado: o registro de reprodução guarda esta, e quem refaz a partida compara. */
export const fingerprintResult = (r: MatchResult): string => bytesToHex(sha256(utf8ToBytes(stableJson(r))))

/** Registro de reprodução guardado no R2: o registro e a impressão digital do resultado que o servidor entregou. */
export interface StoredReplay {
  record: ReplayRecord
  fingerprint: string
  /** Versão do motor que jogou (para quem verifica usar a mesma). */
  engine: string
}

/** Refaz a partida e confere o resultado com a impressão digital guardada. */
export function verifyReplay(stored: StoredReplay): { ok: boolean; fingerprint: string } {
  const fingerprint = fingerprintResult(replayResult(stored.record))
  return { ok: fingerprint === stored.fingerprint, fingerprint }
}

export const makeStoredReplay = (record: ReplayRecord, result: MatchResult, engine: string): StoredReplay => ({ record, fingerprint: fingerprintResult(result), engine })

/** Chave do registro no R2: por liga, data do evento e partida. */
export const replayKey = (leagueId: string, date: string, matchId: string): string => `replays/${leagueId}/${date}/${matchId}.json`
