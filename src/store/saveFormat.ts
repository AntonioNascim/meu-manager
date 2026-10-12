/**
 * Formato do save: envelope com número de versão, migrações entre versões, compactação (para o save não
 * crescer sem limite) e validação. Nada aqui toca o navegador: é só dado, para poder ser testado e exportado.
 *
 * REGRA: sempre que o formato de `Game` (ou de qualquer coisa dentro dele) mudar de um jeito que um save
 * antigo não satisfaz, aumente `SAVE_VERSION` e acrescente em `MIGRATIONS` a função que leva os dados da
 * versão anterior para a nova. O teste `tests/saves.test.ts` confere que a versão atual abre e valida.
 */
import type { MatchResult } from '../engine/types'
import { userTeam } from './game'
import type { Game } from './game'

export const SAVE_VERSION = 2

/** O que vai para o disco (e para o arquivo de backup). */
export interface SaveEnvelope {
  version: number
  /** Quando foi salvo (ISO com hora). */
  savedAt: string
  game: Game
}

/** Resumo mostrado na lista de saves (guardado à parte, para listar sem carregar o jogo inteiro). */
export interface SaveSummary {
  slot: number
  version: number
  savedAt: string
  teamName: string
  abbreviation: string
  colors: [string, string]
  tier: number
  /** Ano da temporada em andamento e data atual do jogo (AAAA-MM-DD). */
  year: number
  date: string
  /** Temporadas já encerradas. */
  seasonsPlayed: number
}

export const SLOT_COUNT = 3

/** Migração: recebe o envelope na versão `n` (como estava gravado) e devolve na versão `n + 1`. */
export type Migration = (envelope: { version: number; savedAt: string; game: unknown }) => { version: number; savedAt: string; game: unknown }

/**
 * Migrações por versão de origem: `MIGRATIONS[1]` leva a versão 1 para a 2, e assim por diante.
 * 1 → 2: as estatísticas da temporada ganharam `ratingSum` e `ratedGames` (nota média); os saves antigos partem das
 * notas das últimas partidas (`recentRatings`), a única informação que eles guardavam.
 */
export const MIGRATIONS: Record<number, Migration> = {
  1: (envelope) => {
    const game = envelope.game as { season?: { players?: { seasonStats?: Record<string, number>; condition?: { recentRatings?: number[] } }[] } }
    for (const p of game.season?.players ?? []) {
      const ratings = p.condition?.recentRatings ?? []
      if (p.seasonStats) {
        p.seasonStats.ratingSum ??= ratings.reduce((a, b) => a + b, 0)
        p.seasonStats.ratedGames ??= ratings.length
      }
    }
    return { ...envelope, version: 2 }
  },
}

export class SaveError extends Error {
  constructor(
    readonly code: 'newer-version' | 'missing-migration' | 'invalid' | 'not-found',
    message: string,
  ) {
    super(message)
  }
}

/** Leva um envelope de qualquer versão até `target` aplicando as migrações em ordem. */
export function migrateSave(raw: unknown, migrations: Record<number, Migration> = MIGRATIONS, target: number = SAVE_VERSION): SaveEnvelope {
  if (typeof raw !== 'object' || raw === null) throw new SaveError('invalid', 'O arquivo de save não é válido.')
  let envelope = raw as { version?: unknown; savedAt?: unknown; game?: unknown }
  if (typeof envelope.version !== 'number' || !Number.isInteger(envelope.version) || envelope.version < 1) throw new SaveError('invalid', 'O save não tem número de versão.')
  if (envelope.version > target) throw new SaveError('newer-version', 'Este save foi criado por uma versão mais nova do jogo.')
  let current = envelope as { version: number; savedAt: string; game: unknown }
  while (current.version < target) {
    const step = migrations[current.version]
    if (!step) throw new SaveError('missing-migration', `Não há migração da versão ${current.version} do save.`)
    const next = step(current)
    if (next.version !== current.version + 1) throw new SaveError('invalid', `A migração da versão ${current.version} devolveu a versão ${next.version}.`)
    current = next
  }
  envelope = current
  const result = { version: current.version, savedAt: String(current.savedAt ?? ''), game: current.game as Game }
  const problems = validateGame(result.game)
  if (problems.length > 0) throw new SaveError('invalid', `Save corrompido: ${problems[0]}`)
  return result
}

/** Confere o mínimo para o jogo abrir sem quebrar. Devolve os problemas encontrados. */
export function validateGame(game: unknown): string[] {
  const problems: string[] = []
  const g = game as Partial<Game> | null
  if (typeof g !== 'object' || g === null) return ['jogo ausente']
  if (typeof g.userTeamId !== 'string') problems.push('time do jogador ausente')
  if (typeof g.seed !== 'number') problems.push('semente ausente')
  for (const key of ['lastDay', 'notices', 'seasonLog', 'archive'] as const) if (!Array.isArray(g[key])) problems.push(`${key} ausente`)
  const s = g.season
  if (!s || !Array.isArray(s.teams) || !Array.isArray(s.players) || !Array.isArray(s.matches) || !s.season || !s.market) problems.push('temporada incompleta')
  else {
    if (typeof g.userTeamId === 'string' && !s.teams.some((t) => t.id === g.userTeamId)) problems.push('o time do jogador não existe')
    if (typeof s.playerCounter !== 'number') problems.push('contador de jogadores ausente')
  }
  return problems
}

/**
 * Tira do jogo o que só serve na hora da partida: lances e notas dos jogos já decididos (o placar, as
 * estatísticas de cartões e os pontos da classificação ficam). O último jogo do time do jogador fica inteiro.
 * Temporadas passadas já são só o resumo em `archive`; aqui cuida-se da temporada em andamento.
 */
export function compactGame(game: Game): Game {
  const keep = lastFinishedUserMatchId(game)
  let changed = false
  const matches = game.season.matches.map((m) => {
    const r = m.result
    if (m.status !== 'finished' || !r || m.id === keep || (r.events.length === 0 && r.playerResults.length === 0)) return m
    changed = true
    const slim: MatchResult = { homeGoals: r.homeGoals, awayGoals: r.awayGoals, homeStats: r.homeStats, awayStats: r.awayStats, events: [], playerResults: [] }
    return { ...m, result: slim }
  })
  return changed ? { ...game, season: { ...game.season, matches } } : game
}

function lastFinishedUserMatchId(game: Game): string | undefined {
  let last: { id: string; date: string } | undefined
  for (const m of game.season.matches) {
    if (m.status !== 'finished' || (m.homeTeamId !== game.userTeamId && m.awayTeamId !== game.userTeamId)) continue
    if (!last || m.date >= last.date) last = { id: m.id, date: m.date }
  }
  return last?.id
}

export function summarizeGame(game: Game, slot: number, savedAt: string): SaveSummary {
  const team = userTeam(game)
  return {
    slot,
    version: SAVE_VERSION,
    savedAt,
    teamName: team.name,
    abbreviation: team.abbreviation,
    colors: team.colors,
    tier: team.tier,
    year: game.season.season.year,
    date: game.season.season.currentDate,
    seasonsPlayed: game.seasonLog.length,
  }
}

export function makeEnvelope(game: Game, savedAt: string): SaveEnvelope {
  return { version: SAVE_VERSION, savedAt, game: compactGame(game) }
}
