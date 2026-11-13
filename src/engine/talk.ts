/**
 * Conversar com o jogador (Elogiar, Cobrar, Garantir vaga, Ameaçar com o banco). Mexe só na moral, que o motor de partida já usa.
 * Dá certo ou errado por sorteio com semente (ano + jogador + data + tipo: o intervalo mínimo impede repetir), então o aparelho e o servidor chegam ao mesmo resultado.
 * Contra trapaça: intervalo mínimo por jogador, teto semanal no elenco, trava depois de uma conversa errada e limite de moral.
 */
import { addDays } from './season/dates'
import type { IsoDate, Player, PlayerId, TeamId } from './types'
import type { SeasonState } from './season'
import { createRng } from './rng'

export const TALK_KINDS = ['praise', 'demand', 'promise', 'threaten'] as const
export type TalkKind = (typeof TALK_KINDS)[number]

export const TALK = {
  /** Dias mínimos entre duas conversas com o mesmo jogador. */
  intervalDays: 14,
  /** No máximo isto de conversas por semana no elenco todo. */
  weeklyMax: 3,
  weekDays: 7,
  /** Conversa que deu errado trava o jogador por este tempo. */
  failLockDays: 21,
  moraleMin: 20,
  moraleMax: 100,
  baseChance: 0.5,
  minChance: 0.15,
  maxChance: 0.9,
  /** Efeito na moral quando dá certo e quando dá errado. */
  effect: {
    praise: { ok: 6, fail: -2 },
    demand: { ok: 4, fail: -7 },
    promise: { ok: 8, fail: -3 },
    threaten: { ok: 3, fail: -9 },
  } satisfies Record<TalkKind, { ok: number; fail: number }>,
  /** Forma (nota média) considerada boa e ruim. */
  goodForm: 7,
  badForm: 5.8,
  promise: { games: 3, missPenalty: 10, maxPenalty: 20, fulfilledBonus: 4 },
} as const

export interface SquadPromise {
  playerId: PlayerId
  teamId: TeamId
  madeOn: IsoDate
  gamesLeft: number
  missed: number
}

export interface TalkState {
  /** Última conversa com cada jogador. */
  last: Record<PlayerId, IsoDate>
  /** Jogador travado até esta data (conversa errada). */
  lockedUntil: Record<PlayerId, IsoDate>
  /** Datas das conversas recentes de cada clube (para o teto semanal). */
  recent: Record<TeamId, IsoDate[]>
  /** Promessas de vaga em andamento. */
  promises: SquadPromise[]
}

export const emptyTalks = (): TalkState => ({ last: {}, lockedUntil: {}, recent: {}, promises: [] })

export type TalkError = 'not-found' | 'invalid' | 'talk-too-soon' | 'talk-weekly' | 'talk-locked' | 'has-promise'

export interface TalkOutcome {
  success: boolean
  /** Variação real da moral (depois do limite). */
  delta: number
  morale: number
  promised: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const formOf = (p: Player): number => (p.condition.recentRatings.length > 0 ? p.condition.form : 6.5)

/** A chance de dar certo (0 a 1) conforme a situação do jogador. Fica oculta ao jogador; a tela só mostra uma dica. */
export function talkChance(kind: TalkKind, player: Player, starter: boolean): number {
  const form = formOf(player)
  const morale = player.condition.morale
  let c: number = TALK.baseChance
  switch (kind) {
    case 'praise':
      if (form >= TALK.goodForm) c += 0.2
      if (form <= TALK.badForm) c -= 0.25
      if (morale >= 85) c -= 0.1
      break
    case 'demand':
      if (form <= TALK.badForm || morale >= 80) c += 0.25
      if (morale <= 45) c -= 0.25
      break
    case 'promise':
      if (!starter && morale <= 60) c += 0.25
      if (starter) c -= 0.2
      break
    case 'threaten':
      if (starter && morale >= 75) c += 0.2
      if (morale <= 55 || !starter) c -= 0.3
      break
  }
  return clamp(c, TALK.minChance, TALK.maxChance)
}

export type TalkHint = 'good' | 'neutral' | 'bad'
/** Dica para a tela: boa hora, hora neutra ou má hora (sem mostrar a chance). */
export const talkHint = (kind: TalkKind, player: Player, starter: boolean): TalkHint => {
  const c = talkChance(kind, player, starter)
  return c >= 0.6 ? 'good' : c <= 0.35 ? 'bad' : 'neutral'
}

export const isStarter = (world: Pick<SeasonState, 'teams'>, player: Player): boolean => world.teams.find((t) => t.id === player.teamId)?.tactic.startingXI.includes(player.id) ?? false

/** Quando (e por que não) o técnico pode conversar com o jogador agora. */
export function talkBlock(world: SeasonState, teamId: TeamId, player: Player): { error: TalkError; until?: IsoDate } | undefined {
  const date = world.season.currentDate
  const talks = world.talks ?? emptyTalks()
  const lock = talks.lockedUntil[player.id]
  if (lock && lock > date) return { error: 'talk-locked', until: lock }
  const last = talks.last[player.id]
  if (last && addDays(last, TALK.intervalDays) > date) return { error: 'talk-too-soon', until: addDays(last, TALK.intervalDays) }
  const week = (talks.recent[teamId] ?? []).filter((d) => addDays(d, TALK.weekDays) > date)
  if (week.length >= TALK.weeklyMax) return { error: 'talk-weekly', until: addDays(week[0] as IsoDate, TALK.weekDays) }
  return undefined
}

export function talkToPlayer(
  world: SeasonState,
  teamId: TeamId,
  playerId: PlayerId,
  kind: TalkKind,
): { ok: true; world: SeasonState; outcome: TalkOutcome } | { ok: false; error: TalkError; until?: IsoDate } {
  const player = world.players.find((p) => p.id === playerId)
  if (!player || player.teamId !== teamId) return { ok: false, error: 'not-found' }
  if (!TALK_KINDS.includes(kind)) return { ok: false, error: 'invalid' }
  const block = talkBlock(world, teamId, player)
  if (block) return { ok: false, ...block }
  const talks = world.talks ?? emptyTalks()
  // Só uma promessa de vaga por jogador.
  if (kind === 'promise' && talks.promises.some((p) => p.playerId === playerId)) return { ok: false, error: 'has-promise' }
  const date = world.season.currentDate
  const chance = talkChance(kind, player, isStarter(world, player))
  const success = createRng(`talk:${world.season.year}:${playerId}:${date}:${kind}`).chance(chance)
  const raw = TALK.effect[kind][success ? 'ok' : 'fail']
  const before = player.condition.morale
  // A conversa leva a moral no máximo ao teto e, para baixo, no máximo ao piso (quem já estava abaixo do piso não cai mais).
  const after = raw >= 0 ? Math.max(before, Math.min(TALK.moraleMax, before + raw)) : Math.min(before, Math.max(TALK.moraleMin, before + raw))
  const promised = kind === 'promise' && success
  const next: TalkState = {
    last: { ...talks.last, [playerId]: date },
    lockedUntil: success ? talks.lockedUntil : { ...talks.lockedUntil, [playerId]: addDays(date, TALK.failLockDays) },
    recent: { ...talks.recent, [teamId]: [...(talks.recent[teamId] ?? []).filter((d) => addDays(d, TALK.weekDays) > date), date] },
    promises: promised ? [...talks.promises, { playerId, teamId, madeOn: date, gamesLeft: TALK.promise.games, missed: 0 }] : talks.promises,
  }
  return {
    ok: true,
    world: { ...world, talks: next, players: world.players.map((p) => (p.id === playerId ? { ...p, condition: { ...p.condition, morale: after } } : p)) },
    outcome: { success, delta: after - before, morale: after, promised },
  }
}

/**
 * Depois de uma partida: cada promessa de vaga dos times que jogaram perde um jogo; quem não foi titular perde moral (até o teto) e quem
 * cumpriu os três jogos ganha um bônus. Promessa de quem saiu do clube some.
 */
export function settlePromises(world: SeasonState, match: { homeTeamId: TeamId; awayTeamId: TeamId; result?: { playerResults: { playerId: PlayerId; minutesPlayed: number }[] } }): SeasonState {
  const talks = world.talks
  if (!talks || talks.promises.length === 0) return world
  const played = new Map((match.result?.playerResults ?? []).map((r) => [r.playerId, r.minutesPlayed]))
  const moraleDelta = new Map<PlayerId, number>()
  const promises: SquadPromise[] = []
  for (const pr of talks.promises) {
    const player = world.players.find((p) => p.id === pr.playerId)
    if (!player || player.teamId !== pr.teamId) continue // saiu do clube: a promessa some
    if (pr.teamId !== match.homeTeamId && pr.teamId !== match.awayTeamId) {
      promises.push(pr)
      continue
    }
    const team = world.teams.find((t) => t.id === pr.teamId)
    const started = (team?.tactic.startingXI.includes(pr.playerId) ?? false) && (played.get(pr.playerId) ?? 0) > 0
    let missed = pr.missed
    let delta = 0
    if (!started) {
      const room = TALK.promise.maxPenalty - missed * TALK.promise.missPenalty
      delta -= Math.min(TALK.promise.missPenalty, Math.max(0, room))
      missed += 1
    }
    const gamesLeft = pr.gamesLeft - 1
    if (gamesLeft <= 0) {
      if (missed === 0) delta += TALK.promise.fulfilledBonus
    } else promises.push({ ...pr, gamesLeft, missed })
    if (delta !== 0) moraleDelta.set(pr.playerId, (moraleDelta.get(pr.playerId) ?? 0) + delta)
  }
  return {
    ...world,
    talks: { ...talks, promises },
    players: moraleDelta.size === 0 ? world.players : world.players.map((p) => (moraleDelta.has(p.id) ? { ...p, condition: { ...p.condition, morale: clamp(p.condition.morale + (moraleDelta.get(p.id) as number), 0, 100) } } : p)),
  }
}
