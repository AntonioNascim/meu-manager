/**
 * "Se terminar assim": a situação do seu time se a partida acabasse agora, e o prognóstico de antes do jogo. Tudo derivado das
 * partidas decididas (nada é guardado) e só leitura. Vale para:
 *  - **liga**: posição na tabela, com a zona (liderança, acesso, rebaixamento) e a vaga continental que a posição dá;
 *  - **copa, fase de grupos ou de liga**: posição no grupo ou na tabela e se está entre os classificados;
 *  - **copa, mata-mata**: classificado, eliminado ou empatado (prorrogação e pênaltis), somando a ida quando há.
 *
 * Os outros jogos do dia o motor (ou o servidor, no online) já decidiu: a tabela-base deixa todos eles de fora e só soma o
 * placar que a tela já viu (no solo, o relógio da partida; no online, os quadros ao vivo dos jogos dos técnicos), então a projeção
 * nunca entrega um resultado que ainda não apareceu. Antes do apito (minuto 0) os outros jogos ainda não contam.
 */
import { groupTables, leaguePhaseTable } from '../../../engine/cups/tie'
import { isContinental } from '../../../engine/cups/plan'
import { computeStandings } from '../../../engine/season/standings'
import type { Competition, Cup, CupSpec, Match, StandingRow, TeamId, TeamMatchStats } from '../../../engine/types'
import type { Game } from '../../../store/game'
import { otherGamesOf, scoreAt } from './otherGames'
import { zoneOf } from '../standings/Table'

export type ProjectionZone = 'leader' | 'promotion' | 'relegation'

/** Vaga continental que a posição dá (para a próxima edição da copa). */
export interface ContinentalSlot {
  cupId: string
  cupName: string
  /** Em que ponto da copa o clube entra: fase prévia, fase de grupos ou de liga, ou mata-mata. */
  entry: 'qualifying' | 'groups' | 'league-phase' | 'knockout'
}

export interface LeagueProjection {
  kind: 'league'
  position: number
  size: number
  points: number
  zone: ProjectionZone | null
  continental: ContinentalSlot | null
  /** Posição na tabela de hoje (só as partidas já decididas, sem este jogo): serve para a seta de subiu ou desceu. */
  current: number
}
/** Nome antigo, mantido porque os componentes e testes de liga o usam. */
export type Projection = LeagueProjection

export interface GroupProjection {
  kind: 'group' | 'league-phase'
  cupName: string
  /** Nome do grupo (A, B...); vazio na fase de liga. */
  group: string
  position: number
  size: number
  /** Quantos primeiros colocados passam (direto) e, na fase de liga, quantos vão à repescagem. */
  direct: number
  playoff: number
  status: 'direct' | 'playoff' | 'advance' | 'out'
}

export interface KnockoutProjection {
  kind: 'knockout'
  cupName: string
  stageName: string
  /** Ida de um confronto de ida e volta: ainda não decide nada. */
  firstLeg: boolean
  /** Gols do seu time e do rival no confronto (somando a ida). */
  goalsFor: number
  goalsAgainst: number
  status: 'through' | 'out' | 'tied-extra-time' | 'tied-penalties' | 'tied' | 'ahead' | 'behind' | 'level'
}

export type CupProjection = GroupProjection | KnockoutProjection
export type AnyProjection = LeagueProjection | CupProjection

export interface Prognosis {
  win: AnyProjection
  draw: AnyProjection
  lose: AnyProjection
}

/** Placar de outro jogo que a tela já viu. */
export interface LiveScore {
  match: Match
  home: number
  away: number
}

/** Os outros jogos do dia: quais ficam fora da tabela-base e o placar já visto de cada um. */
export interface Others {
  excluded: ReadonlySet<string>
  scores: readonly LiveScore[]
}

const NO_STATS: TeamMatchStats = { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, xg: 0 }

/** Solo: os outros jogos decididos pelo motor, revelados pelo relógio da partida (nenhum no minuto 0). */
export function soloOthers(game: Game, match: Match, minute: number): Others {
  const others = otherGamesOf(game)
  const scores = minute > 0 ? others.map((m) => ({ match: m, ...(({ home, away }) => ({ home, away }))(scoreAt(m, minute)) })) : []
  return { excluded: new Set([match.id, ...others.map((m) => m.id)]), scores }
}

/**
 * Online: o servidor já simulou os jogos da rodada; ficam todos fora da tabela-base. Só entram os que a tela vê ao vivo
 * (os jogos dos outros técnicos, com o placar de cada quadro).
 */
export function onlineOthers(game: Game, match: Match, live: readonly { matchId: string; homeGoals: number; awayGoals: number }[]): Others {
  const sameDay = (m: Match) => m.competitionId === match.competitionId && m.round === match.round && m.date === match.date
  const excluded = new Set<string>([match.id, ...game.season.matches.filter(sameDay).map((m) => m.id)])
  const byId = new Map(game.season.matches.map((m) => [m.id, m]))
  const scores = live.flatMap((g) => {
    const m = byId.get(g.matchId)
    return m && m.id !== match.id && sameDay(m) ? [{ match: m, home: g.homeGoals, away: g.awayGoals }] : []
  })
  return { excluded, scores }
}

/** A liga do jogo do técnico (copa não tem tabela de pontos corridos). */
export function leagueOf(game: Game, match: Match | undefined): Competition | undefined {
  if (!match || match.cup) return undefined
  const competition = game.season.season.competitions.find((c) => c.id === match.competitionId)
  return competition && competition.type === 'league' ? competition : undefined
}

/** A copa do jogo do técnico. */
export function cupOf(game: Game, match: Match | undefined): Cup | undefined {
  if (!match?.cup) return undefined
  return (game.season.cups ?? []).find((c) => c.id === match.competitionId)
}

const asFinished = (m: Match, homeGoals: number, awayGoals: number): Match => ({
  ...m,
  status: 'finished',
  result: m.result ? { ...m.result, homeGoals, awayGoals } : { homeGoals, awayGoals, events: [], homeStats: NO_STATS, awayStats: NO_STATS, playerResults: [] },
})

/** As partidas da competição com este jogo no placar dado e os outros jogos como a tela os viu. */
function matchesWith(game: Game, competitionId: string, match: Match, home: number, away: number, others: Others): Match[] {
  const base = game.season.matches.filter((m) => m.competitionId === competitionId && m.status === 'finished' && !others.excluded.has(m.id))
  return [...base, asFinished(match, home, away), ...others.scores.map((s) => asFinished(s.match, s.home, s.away))]
}

const positionOf = (table: readonly StandingRow[], teamId: TeamId): StandingRow & { position: number } => {
  const i = table.findIndex((r) => r.teamId === teamId)
  return { ...(table[i] as StandingRow), position: i + 1 }
}

// ---------- vagas continentais ----------

const entryOf = (spec: CupSpec, stage: number): ContinentalSlot['entry'] => {
  if (stage > 0) return 'knockout'
  if (spec.preliminary && spec.preliminary.length > 0) return 'qualifying'
  return spec.format === 'league-knockout' ? 'league-phase' : spec.format === 'groups-knockout' ? 'groups' : 'knockout'
}

/**
 * Vagas continentais que uma liga dá, pela colocação final: para cada copa continental, as vagas por colocação dessa liga
 * (`[de, até]`). Vale para a próxima edição da copa. Ordem: a vaga mais alta primeiro.
 */
export function continentalSlots(specs: readonly CupSpec[] | undefined, leagueId: string): { from: number; to: number; slot: ContinentalSlot }[] {
  const out: { from: number; to: number; slot: ContinentalSlot }[] = []
  for (const spec of specs ?? []) {
    if (!isContinental(spec)) continue
    for (const e of spec.entrants) {
      const s = e.source
      if (s.type !== 'league' || s.league !== leagueId || !s.positions) continue
      out.push({ from: s.positions[0], to: s.positions[1], slot: { cupId: spec.id, cupName: spec.name, entry: entryOf(spec, e.stage ?? 0) } })
    }
  }
  return out.sort((a, b) => a.from - b.from)
}

/** A vaga continental da posição (a primeira da lista que a contém), ou `null`. */
export function continentalOf(specs: readonly CupSpec[] | undefined, leagueId: string, position: number): ContinentalSlot | null {
  return continentalSlots(specs, leagueId).find((s) => position >= s.from && position <= s.to)?.slot ?? null
}

// ---------- liga ----------

function zoneAt(competition: Competition, position: number, size: number): ProjectionZone | null {
  if (position === 1) return 'leader'
  return zoneOf(position, size, competition)
}

/** Posição de hoje (só as partidas decididas, sem este jogo nem os outros do dia). */
function currentPosition(game: Game, competition: Competition, teamId: TeamId, others: Others): number {
  const base = game.season.matches.filter((m) => m.competitionId === competition.id && m.status === 'finished' && !others.excluded.has(m.id))
  return positionOf(computeStandings(competition.teamIds, base), teamId).position
}

function projectLeague(game: Game, competition: Competition, match: Match, teamId: TeamId, home: number, away: number, others: Others): LeagueProjection {
  const table = computeStandings(competition.teamIds, matchesWith(game, competition.id, match, home, away, others))
  const row = positionOf(table, teamId)
  return {
    kind: 'league',
    position: row.position,
    size: table.length,
    points: row.points,
    zone: zoneAt(competition, row.position, table.length),
    continental: continentalOf(game.season.cupSpecs, competition.id, row.position),
    current: currentPosition(game, competition, teamId, others),
  }
}

// ---------- copas ----------

const groupLetter = (g: number) => String.fromCharCode(65 + (g % 26))

function projectGroup(game: Game, cup: Cup, match: Match, teamId: TeamId, home: number, away: number, others: Others): GroupProjection | null {
  const info = match.cup
  if (!info) return null
  const all = matchesWith(game, cup.id, match, home, away, others).filter((m) => m.cup !== undefined)
  if (info.kind === 'league') {
    const table = leaguePhaseTable(all, info.stage)
    const i = table.findIndex((r) => r.teamId === teamId)
    if (i < 0) return null
    const spec = cup.spec.leaguePhase
    const direct = spec?.direct ?? 0
    const playoff = spec?.playoff ?? 0
    const position = i + 1
    return { kind: 'league-phase', cupName: cup.name, group: '', position, size: table.length, direct, playoff, status: position <= direct ? 'direct' : position <= direct + playoff ? 'playoff' : 'out' }
  }
  const tables = groupTables(all, info.stage)
  const mine = tables.find((t) => t.rows.some((r) => r.teamId === teamId))
  if (!mine) return null
  const advance = cup.spec.groups?.advance ?? 0
  const direct = cup.spec.groups?.direct ?? 0
  const position = mine.rows.findIndex((r) => r.teamId === teamId) + 1
  return { kind: 'group', cupName: cup.name, group: groupLetter(mine.group), position, size: mine.rows.length, direct, playoff: 0, status: position <= direct ? 'direct' : position <= advance ? 'advance' : 'out' }
}

function projectKnockout(game: Game, cup: Cup, match: Match, teamId: TeamId, home: number, away: number): KnockoutProjection | null {
  const info = match.cup
  if (!info || info.kind !== 'knockout') return null
  const mineHome = match.homeTeamId === teamId
  let goalsFor = mineHome ? home : away
  let goalsAgainst = mineHome ? away : home
  const firstLeg = info.leg === 1 && cup.spec.stages[info.stage]?.legs === 2
  // Volta: soma a ida (a ida é jogo já decidido).
  const prior = info.firstLegId ? game.season.matches.find((m) => m.id === info.firstLegId) : undefined
  let awayGoalsFor = mineHome ? 0 : away
  let awayGoalsAgainst = mineHome ? away : 0
  if (prior?.result) {
    const priorMine = prior.homeTeamId === teamId
    goalsFor += priorMine ? prior.result.homeGoals : prior.result.awayGoals
    goalsAgainst += priorMine ? prior.result.awayGoals : prior.result.homeGoals
    awayGoalsFor = (mineHome ? 0 : away) + (priorMine ? 0 : prior.result.awayGoals)
    awayGoalsAgainst = (mineHome ? away : 0) + (priorMine ? prior.result.awayGoals : 0)
  }
  const stageName = cup.spec.stages[info.stage]?.name ?? ''
  const base = { kind: 'knockout' as const, cupName: cup.name, stageName, firstLeg, goalsFor, goalsAgainst }
  if (firstLeg) return { ...base, status: goalsFor > goalsAgainst ? 'ahead' : goalsFor < goalsAgainst ? 'behind' : 'level' }
  if (goalsFor !== goalsAgainst) return { ...base, status: goalsFor > goalsAgainst ? 'through' : 'out' }
  if (cup.spec.awayGoals && prior && awayGoalsFor !== awayGoalsAgainst) return { ...base, status: awayGoalsFor > awayGoalsAgainst ? 'through' : 'out' }
  return { ...base, status: cup.spec.extraTime ? 'tied-extra-time' : cup.spec.penalties ? 'tied-penalties' : 'tied' }
}

// ---------- interface pública ----------

function project(game: Game, match: Match, teamId: TeamId, home: number, away: number, others: Others): AnyProjection | null {
  const competition = leagueOf(game, match)
  if (competition) return competition.teamIds.includes(teamId) ? projectLeague(game, competition, match, teamId, home, away, others) : null
  const cup = cupOf(game, match)
  if (!cup || !match.cup) return null
  return match.cup.kind === 'knockout' ? projectKnockout(game, cup, match, teamId, home, away) : projectGroup(game, cup, match, teamId, home, away, others)
}

/** A situação do seu time se a partida acabasse agora, com o placar ao vivo e os outros jogos como a tela os viu. */
export function projectNow(game: Game, match: Match | undefined, teamId: TeamId, score: { home: number; away: number }, others: Others): AnyProjection | null {
  return match ? project(game, match, teamId, score.home, score.away, others) : null
}

/** Antes do apito: a situação se vencer (1 a 0), empatar (0 a 0) ou perder (0 a 1), com os outros jogos do dia ainda por decidir. */
export function prognosisOf(game: Game, match: Match | undefined, teamId: TeamId, others?: Others): Prognosis | null {
  if (!match) return null
  const none = others ?? soloOthers(game, match, 0)
  const mine = match.homeTeamId === teamId ? 'home' : 'away'
  const at = (win: boolean | null): AnyProjection | null => {
    const g = win === null ? [0, 0] : win ? [1, 0] : [0, 1]
    const [h, a] = mine === 'home' ? [g[0] as number, g[1] as number] : [g[1] as number, g[0] as number]
    return project(game, match, teamId, h, a, { excluded: none.excluded, scores: [] })
  }
  const win = at(true)
  const draw = at(null)
  const lose = at(false)
  return win && draw && lose ? { win, draw, lose } : null
}

export const isLeagueProjection = (p: AnyProjection): p is LeagueProjection => p.kind === 'league'
