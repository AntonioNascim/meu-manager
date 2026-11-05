/**
 * Protocolo da partida ao vivo (Fase 6, B7): o que o cliente pode mandar pelo WebSocket, com validação estrita, e o que o servidor devolve.
 * Puro (sem DOM, sem Cloudflare). Mensagens são JSON de uma linha; o cliente nunca manda resultado, só decisões (proposta, seção 2.6).
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { replayResult, type CommandOutcome, type LiveEvent, type LiveView, type QueuedCommand, type ReplayRecord } from '../engine/league/live'
import type { MatchEvent, Mentality, PlayStyle } from '../engine/types'
import type { PlayTrace } from '../engine/match'
import type { MatchResult } from '../engine/types'

export const MAX_MESSAGE_BYTES = 4096
const STYLES: readonly PlayStyle[] = ['possession', 'counter-attack', 'high-press']
const ID = /^[A-Za-z0-9_.:-]{1,64}$/

export type ClientMessage =
  /** Abre ou retoma a conexão. `since` = último minuto que o cliente já viu (0 = tudo). */
  | { t: 'hello'; since: number }
  | { t: 'cmd'; id: string; command: QueuedCommand['command'] }
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
  /** Só o que o cliente ainda não tinha. */
  events: MatchEvent[]
  trace: PlayTrace[]
}

export type ServerMessage =
  | { t: 'full'; minute: number; paused: boolean; games: LiveView[] }
  | { t: 'frame'; minute: number; games: GameFrame[] }
  | { t: 'result'; outcomes: CommandOutcome[] }
  | { t: 'paused'; minute: number }
  | { t: 'resumed'; minute: number }
  | { t: 'end' }
  | { t: 'error'; problem: ParseProblem | 'rate-limited' | 'not-in-event' }
  | { t: 'pong' }

/** Quantos eventos e lances de cada partida o cliente já recebeu (para mandar só a diferença). */
export type Cursor = Record<string, { events: number; trace: number }>

/** O que mudou desde o cursor, e o cursor novo. */
export function frameSince(e: LiveEvent, views: readonly LiveView[], cursor: Cursor): { frame: ServerMessage; cursor: Cursor } {
  const next: Cursor = {}
  const games = views.map((v): GameFrame => {
    const seen = cursor[v.matchId] ?? { events: 0, trace: 0 }
    next[v.matchId] = { events: v.snapshot.events.length, trace: v.snapshot.trace.length }
    return {
      matchId: v.matchId,
      minute: v.snapshot.minute,
      homeGoals: v.snapshot.homeGoals,
      awayGoals: v.snapshot.awayGoals,
      finished: v.snapshot.finished,
      controlled: v.controlled,
      events: v.snapshot.events.slice(seen.events),
      trace: v.snapshot.trace.slice(seen.trace),
    }
  })
  return { frame: { t: 'frame', minute: e.clock, games }, cursor: next }
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
