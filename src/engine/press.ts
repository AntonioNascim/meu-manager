/**
 * Imprensa do técnico (estudo do concorrente, Parte 7). Duas coisas, ambas **sem efeito no jogo** (nem no motor, nem na diretoria, nem na moral):
 *  - **notícias**: manchetes derivadas do que aconteceu (último resultado, sequência, posição, artilheiro, lesão de destaque, contratação). Nada é
 *    guardado: a lista é recalculada na hora, e o texto fica na interface (o motor só devolve fatos);
 *  - **coletivas**: a pergunta da vez (véspera de jogo, depois de vitória, empate ou derrota) com três tons de resposta. A pergunta é escolhida pela
 *    semente do jogo (só o número vai no registro) e a resposta fica em \`Team.press\` (as últimas 30), para a tela "O que você disse".
 * Não há e-mail nem mensagem para responder. Funções puras.
 */
import { hashSeed } from './rng'
import { playerOverall } from './overall'
import type { SeasonState } from './season/calendar'
import type { IsoDate, Match, PressAnswerRecord, Team, TeamId } from './types'

export const PRESS_TONES = ['humble', 'confident', 'defend'] as const
export type PressTone = (typeof PRESS_TONES)[number]
export const PRESS_OCCASIONS = ['eve', 'win', 'draw', 'loss'] as const
export type PressOccasion = (typeof PRESS_OCCASIONS)[number]

export const isPressTone = (v: unknown): v is PressTone => typeof v === 'string' && (PRESS_TONES as readonly string[]).includes(v)

/** Quantas perguntas diferentes a interface tem por ocasião (o motor só sorteia o número). */
export const PRESS_QUESTIONS = 4
/** Máximo de respostas guardadas por clube. */
export const PRESS_LOG_MAX = 30

export type PressAnswer = PressAnswerRecord

export interface PressOpen {
  key: string
  occasion: PressOccasion
  matchId: string
  question: number
  date: IsoDate
}

export class PressError extends Error {
  constructor(
    readonly code: 'invalid' | 'press-closed' | 'press-done',
    message: string,
  ) {
    super(message)
  }
}

const involves = (m: Match, teamId: TeamId) => m.homeTeamId === teamId || m.awayTeamId === teamId
const goalsOf = (m: Match, teamId: TeamId) => {
  const r = m.result as NonNullable<Match['result']>
  return m.homeTeamId === teamId ? { gf: r.homeGoals, ga: r.awayGoals } : { gf: r.awayGoals, ga: r.homeGoals }
}
const outcomeOf = (m: Match, teamId: TeamId): 'win' | 'draw' | 'loss' => {
  const { gf, ga } = goalsOf(m, teamId)
  return gf > ga ? 'win' : gf === ga ? 'draw' : 'loss'
}

const finishedOf = (state: Pick<SeasonState, 'matches'>, teamId: TeamId): Match[] =>
  state.matches.filter((m) => m.status === 'finished' && m.result && involves(m, teamId)).sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round)

/** A coletiva que está aberta hoje, se houver: depois do último jogo (até 2 dias) ou na véspera do próximo (de hoje até o dia seguinte). */
export function pressOpen(state: Pick<SeasonState, 'matches' | 'season' | 'market'>, teamId: TeamId, answered: readonly string[] = []): PressOpen | undefined {
  const today = state.season.currentDate
  const day = (d: IsoDate, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const last = finishedOf(state, teamId)[0]
  const next = state.matches.filter((m) => m.status !== 'finished' && involves(m, teamId)).sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round)[0]
  const make = (matchId: string, occasion: PressOccasion, date: IsoDate): PressOpen => {
    const key = `${matchId}:${occasion}`
    return { key, occasion, matchId, date, question: hashSeed(`${state.market.seed}:press:${key}`) % PRESS_QUESTIONS }
  }
  if (last && last.date >= day(today, -2) && last.date <= today && !answered.includes(`${last.id}:${outcomeOf(last, teamId)}`)) return make(last.id, outcomeOf(last, teamId), last.date)
  if (next && next.date >= today && next.date <= day(today, 1) && !answered.includes(`${next.id}:eve`)) return make(next.id, 'eve', next.date)
  return undefined
}

/** Registra a resposta da coletiva aberta (a pergunta vem da semente; só o tom vem do técnico). */
export function answerPress(state: Pick<SeasonState, 'matches' | 'season' | 'market'>, team: Team, tone: unknown): Team {
  if (!isPressTone(tone)) throw new PressError('invalid', 'Resposta inválida.')
  const log = team.press ?? []
  const open = pressOpen(state, team.id, log.map((a) => a.key))
  if (!open) throw new PressError(log.length > 0 ? 'press-done' : 'press-closed', 'Não há coletiva aberta agora.')
  const answer: PressAnswer = { key: open.key, occasion: open.occasion, question: open.question, tone, date: state.season.currentDate, matchId: open.matchId }
  return { ...team, press: [...log, answer].slice(-PRESS_LOG_MAX) }
}

// ---------------------------------------------------------------------------
// Notícias (só fatos)
// ---------------------------------------------------------------------------

export type PressFact =
  | { kind: 'result'; date: IsoDate; matchId: string; outcome: 'win' | 'draw' | 'loss'; goalsFor: number; goalsAgainst: number; opponentId: TeamId; home: boolean }
  | { kind: 'streak'; date: IsoDate; outcome: 'win' | 'draw' | 'loss' | 'unbeaten'; games: number }
  | { kind: 'position'; date: IsoDate; position: number; size: number }
  | { kind: 'top-scorer'; date: IsoDate; playerId: string; goals: number }
  | { kind: 'injury'; date: IsoDate; playerId: string; days: number }
  | { kind: 'signing'; date: IsoDate; playerId: string; fromTeamId: TeamId | null; fee: number }

/** As manchetes do momento: do mais novo ao mais velho, até `limit`. Derivado na hora, nunca guardado. */
export function pressFacts(state: SeasonState, teamId: TeamId, position?: { position: number; size: number }, limit = 8): PressFact[] {
  const today = state.season.currentDate
  const facts: PressFact[] = []
  const finished = finishedOf(state, teamId)
  const last = finished[0]
  if (last) {
    const { gf, ga } = goalsOf(last, teamId)
    facts.push({ kind: 'result', date: last.date, matchId: last.id, outcome: outcomeOf(last, teamId), goalsFor: gf, goalsAgainst: ga, opponentId: last.homeTeamId === teamId ? last.awayTeamId : last.homeTeamId, home: last.homeTeamId === teamId })
  }
  // Sequência: vitórias, derrotas ou jogos sem perder, a partir do jogo mais recente (3 ou mais).
  const outcomes = finished.map((m) => outcomeOf(m, teamId))
  const run = (pred: (o: 'win' | 'draw' | 'loss') => boolean) => {
    let n = 0
    for (const o of outcomes) {
      if (!pred(o)) break
      n++
    }
    return n
  }
  const wins = run((o) => o === 'win')
  const losses = run((o) => o === 'loss')
  const unbeaten = run((o) => o !== 'loss')
  if (last && wins >= 3) facts.push({ kind: 'streak', date: last.date, outcome: 'win', games: wins })
  else if (last && losses >= 3) facts.push({ kind: 'streak', date: last.date, outcome: 'loss', games: losses })
  else if (last && unbeaten >= 5) facts.push({ kind: 'streak', date: last.date, outcome: 'unbeaten', games: unbeaten })
  if (position && last) facts.push({ kind: 'position', date: last.date, position: position.position, size: position.size })
  // Artilheiro do clube na temporada (a partir de 3 gols).
  const squad = state.players.filter((p) => p.teamId === teamId)
  const scorer = [...squad].sort((a, b) => b.seasonStats.goals - a.seasonStats.goals || playerOverall(b) - playerOverall(a))[0]
  if (scorer && scorer.seasonStats.goals >= 3) facts.push({ kind: 'top-scorer', date: today, playerId: scorer.id, goals: scorer.seasonStats.goals })
  // Lesão de um dos melhores do elenco.
  const hurt = [...squad].filter((p) => p.condition.injuryDaysLeft > 0).sort((a, b) => playerOverall(b) - playerOverall(a))[0]
  const best = [...squad].sort((a, b) => playerOverall(b) - playerOverall(a)).slice(0, 8)
  if (hurt && best.some((p) => p.id === hurt.id)) facts.push({ kind: 'injury', date: today, playerId: hurt.id, days: hurt.condition.injuryDaysLeft })
  // Contratações recentes (até 30 dias).
  const cutoff = new Date(Date.parse(`${today}T12:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10)
  for (const r of [...state.market.history].reverse()) if (r.toTeamId === teamId && r.date >= cutoff && facts.filter((f) => f.kind === 'signing').length < 2) facts.push({ kind: 'signing', date: r.date, playerId: r.playerId, fromTeamId: r.fromTeamId, fee: r.fee })
  return facts.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}
