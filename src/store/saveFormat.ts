/**
 * Formato do save: envelope com número de versão, migrações entre versões, compactação (para o save não
 * crescer sem limite) e validação. Nada aqui toca o navegador: é só dado, para poder ser testado e exportado.
 *
 * REGRA: sempre que o formato de `Game` (ou de qualquer coisa dentro dele) mudar de um jeito que um save
 * antigo não satisfaz, aumente `SAVE_VERSION` e acrescente em `MIGRATIONS` a função que leva os dados da
 * versão anterior para a nova. O teste `tests/saves.test.ts` confere que a versão atual abre e valida.
 */
import { FORMATION_IDS, readyGrid } from '../engine/formations'
import { createAcademy } from '../data/generateAcademy'
import { isSlim, slimResult } from '../engine/season/compact'
import { birthDateFor, contractEndOn } from '../engine/season/dates'
import type { Match, Player, Team } from '../engine/types'
import { userTeam } from './game'
import type { Game } from './game'

export const SAVE_VERSION = 10

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
 * 9 → 10: data de nascimento dos jogadores (a idade passa a aumentar no aniversário, não na virada) e contratos com data de fim valida. As datas são geradas de forma estável a partir de cada jogador: quem está no elenco profissional faz a idade atual na data do save; a base mantém a idade do começo da temporada (ela envelhece na virada). O mundo continua com as séries que o save já tinha (um save de duas séries segue com duas).
 * 8 → 9: posicionamento livre (`tactic.grid`, o ponto da grade de cada titular): as táticas dos times e as escalações guardadas ganham a grade da formação pronta que já tinham, então nada muda no jogo.
 * 7 → 8: contagens novas por jogador (gols em casa e fora, assistências de passe e de cruzamento); saves antigos começam em zero (a artilharia geral não muda, as abas Casa, Fora, Passes e Cruzamentos contam dali em diante).
 * 6 → 7: orçamento (`finances.budgetShift`, `purchaseBonus` e `fundsRequests` em todos os times); saves antigos começam sem nada movido nem pedido.
 * 5 → 6: pré-contratos (`season.market.preContracts` e `lastReport.preContracts`); saves antigos começam sem nenhum.
 * 4 → 5: listas do mercado (`season.market.listings`); saves antigos começam sem anúncios (os clubes da IA anunciam na próxima rodada de negociações).
 * 3 → 4: treino (`season.training`); saves antigos começam com o treino Normal e foco equilibrado para o time do jogador e sem histórico de força.
 * 2 → 3: categorias de base (`season.academy`); saves antigos ganham uma base inicial para cada clube, gerada com a semente do jogo.
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
  2: (envelope) => {
    const game = envelope.game as { seed: number; season?: { teams?: Team[]; players?: Player[]; academy?: Player[]; playerCounter?: number; season?: { year?: number } }; lastReport?: Record<string, unknown> }
    const s = game.season
    if (s && !s.academy && s.teams && s.players) {
      s.academy = createAcademy({ teams: s.teams, seed: game.seed, year: s.season?.year ?? 2026, firstNumber: (s.playerCounter ?? 0) + 1, takenNames: s.players.map((p) => p.name) })
      s.playerCounter = (s.playerCounter ?? 0) + s.academy.length
    }
    if (game.lastReport) {
      for (const key of ['academyArrivals', 'academyPromoted', 'academyReleased']) game.lastReport[key] ??= {}
      game.lastReport.academyPending ??= []
    }
    return { ...envelope, version: 3 }
  },
  3: (envelope) => {
    const game = envelope.game as { userTeamId?: string; season?: { training?: unknown } }
    if (game.season && !game.season.training) {
      game.season.training = { plans: game.userTeamId ? { [game.userTeamId]: { intensity: 'normal', focus: 'balanced' } } : {}, individual: {}, finished: {}, history: {} }
    }
    return { ...envelope, version: 4 }
  },
  4: (envelope) => {
    const game = envelope.game as { season?: { market?: { listings?: unknown[] } } }
    if (game.season?.market) game.season.market.listings ??= []
    return { ...envelope, version: 5 }
  },
  5: (envelope) => {
    const game = envelope.game as { season?: { market?: { preContracts?: unknown[] } }; lastReport?: Record<string, unknown> }
    if (game.season?.market) game.season.market.preContracts ??= []
    if (game.lastReport) game.lastReport.preContracts ??= []
    return { ...envelope, version: 6 }
  },
  6: (envelope) => {
    const game = envelope.game as { season?: { teams?: { finances?: Record<string, unknown> }[] } }
    for (const t of game.season?.teams ?? []) {
      if (!t.finances) continue
      t.finances.budgetShift ??= 0
      t.finances.purchaseBonus ??= 0
      t.finances.fundsRequests ??= []
    }
    return { ...envelope, version: 7 }
  },
  7: (envelope) => {
    const game = envelope.game as { season?: { players?: { seasonStats?: Record<string, number> }[]; academy?: { seasonStats?: Record<string, number> }[] } }
    for (const p of [...(game.season?.players ?? []), ...(game.season?.academy ?? [])]) {
      if (!p.seasonStats) continue
      for (const key of ['homeGoals', 'awayGoals', 'passAssists', 'crossAssists']) p.seasonStats[key] ??= 0
    }
    return { ...envelope, version: 8 }
  },
  8: (envelope) => {
    const game = envelope.game as { season?: { teams?: { tactic?: { formationId?: string; grid?: unknown } }[] }; savedLineups?: ({ formationId?: string; grid?: unknown } | null)[] }
    const withGrid = (t: { formationId?: string; grid?: unknown } | null | undefined) => {
      if (!t || t.grid || !t.formationId || !FORMATION_IDS.includes(t.formationId)) return
      t.grid = readyGrid(t.formationId)
    }
    for (const team of game.season?.teams ?? []) withGrid(team.tactic)
    for (const saved of game.savedLineups ?? []) withGrid(saved)
    return { ...envelope, version: 9 }
  },
  9: (envelope) => {
    type OldPlayer = { id: string; name: string; age: number; birthDate?: string; contract?: { endDate?: string } }
    const game = envelope.game as { season?: { players?: OldPlayer[]; academy?: OldPlayer[]; season?: { year?: number; currentDate?: string } } }
    const today = game.season?.season?.currentDate ?? '2026-01-01'
    const year = game.season?.season?.year ?? Number(today.slice(0, 4))
    const valid = (d: unknown): d is string => typeof d === 'string' && /^d{4}-d{2}-d{2}$/.test(d)
    const fix = (p: OldPlayer, reference: string) => {
      p.birthDate ??= birthDateFor(`${p.id}|${p.name}`, p.age, reference)
      if (p.contract && !valid(p.contract.endDate)) p.contract.endDate = contractEndOn(year + 1)
    }
    for (const p of game.season?.players ?? []) fix(p, today)
    for (const p of game.season?.academy ?? []) fix(p, `${year}-01-01`)
    return { ...envelope, version: 10 }
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
  if (!s || !Array.isArray(s.teams) || !Array.isArray(s.players) || !Array.isArray(s.matches) || !Array.isArray(s.academy) || typeof s.training !== 'object' || s.training === null || !s.season || !s.market || !Array.isArray(s.market.listings) || !Array.isArray(s.market.preContracts)) problems.push('temporada incompleta')
  else {
    if (typeof g.userTeamId === 'string' && !s.teams.some((t) => t.id === g.userTeamId)) problems.push('o time do jogador não existe')
    if (typeof s.playerCounter !== 'number') problems.push('contador de jogadores ausente')
    if (s.players.some((p) => typeof p.birthDate !== 'string') || s.academy.some((p) => typeof p.birthDate !== 'string')) problems.push('jogadores sem data de nascimento')
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
  const slim = (m: Match): Match => {
    const r = m.result
    if (m.status !== 'finished' || !r || m.id === keep || isSlim(r)) return m
    changed = true
    return { ...m, result: slimResult(r) }
  }
  const matches = game.season.matches.map(slim)
  const lastDay = game.lastDay.map(slim)
  return changed ? { ...game, lastDay, season: { ...game.season, matches } } : game
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
