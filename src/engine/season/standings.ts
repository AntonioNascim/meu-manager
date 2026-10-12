/**
 * Classificação sempre derivada das partidas finalizadas (nunca guardada).
 * Desempate do Brasileirão: pontos, vitórias, saldo de gols, gols marcados, confronto direto,
 * cartões vermelhos (menos), cartões amarelos (menos) e sorteio (determinístico pela seed).
 */
import { hashSeed } from '../rng'
import type { Match, StandingRow, TeamId } from '../types'

function emptyRow(teamId: TeamId): StandingRow {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0 }
}

function pointsOf(goalsFor: number, goalsAgainst: number): number {
  return goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0
}

/** Soma uma partida finalizada nas linhas (altera `rows`, que são cópias locais). */
function addMatch(rows: Map<TeamId, StandingRow>, match: Match): void {
  const result = match.result
  if (match.status !== 'finished' || !result) return
  const sides = [
    { id: match.homeTeamId, gf: result.homeGoals, ga: result.awayGoals, stats: result.homeStats },
    { id: match.awayTeamId, gf: result.awayGoals, ga: result.homeGoals, stats: result.awayStats },
  ]
  for (const s of sides) {
    const row = rows.get(s.id)
    if (!row) continue
    const pts = pointsOf(s.gf, s.ga)
    row.played++
    row.points += pts
    if (pts === 3) row.wins++
    else if (pts === 1) row.draws++
    else row.losses++
    row.goalsFor += s.gf
    row.goalsAgainst += s.ga
    row.goalDifference = row.goalsFor - row.goalsAgainst
    row.yellowCards += s.stats.yellowCards
    row.redCards += s.stats.redCards
  }
}

const cloneRows = (rows: ReadonlyMap<TeamId, StandingRow>) => new Map([...rows].map(([id, row]) => [id, { ...row }]))

/** Critérios numéricos, na ordem do regulamento (maior é melhor). */
const primaryKey = (r: StandingRow) => [r.points, r.wins, r.goalDifference, r.goalsFor]

function comparePrimary(a: StandingRow, b: StandingRow): number {
  const ka = primaryKey(a)
  const kb = primaryKey(b)
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return (kb[i] as number) - (ka[i] as number)
  return 0
}

/** Desempate dentro de um grupo empatado nos critérios numéricos: confronto direto, cartões, sorteio. */
function breakTies(group: StandingRow[], matches: readonly Match[], drawSeed: string): StandingRow[] {
  if (group.length < 2) return group
  const ids = new Set(group.map((r) => r.teamId))
  const headToHead = new Map<TeamId, number>(group.map((r) => [r.teamId, 0]))
  for (const m of matches) {
    if (m.status !== 'finished' || !m.result || !ids.has(m.homeTeamId) || !ids.has(m.awayTeamId)) continue
    const { homeGoals, awayGoals } = m.result
    headToHead.set(m.homeTeamId, (headToHead.get(m.homeTeamId) ?? 0) + pointsOf(homeGoals, awayGoals))
    headToHead.set(m.awayTeamId, (headToHead.get(m.awayTeamId) ?? 0) + pointsOf(awayGoals, homeGoals))
  }
  const draw = (r: StandingRow) => hashSeed(`${drawSeed}:${r.teamId}`)
  return [...group].sort(
    (a, b) =>
      (headToHead.get(b.teamId) ?? 0) - (headToHead.get(a.teamId) ?? 0) ||
      a.redCards - b.redCards ||
      a.yellowCards - b.yellowCards ||
      draw(a) - draw(b),
  )
}

function sortRows(rows: Iterable<StandingRow>, matches: readonly Match[], drawSeed: string): StandingRow[] {
  const sorted = [...rows].sort(comparePrimary)
  const table: StandingRow[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1
    while (j < sorted.length && comparePrimary(sorted[i] as StandingRow, sorted[j] as StandingRow) === 0) j++
    table.push(...breakTies(sorted.slice(i, j), matches, drawSeed))
    i = j
  }
  return table
}

/** Classificação completa de uma competição a partir das partidas finalizadas (até `upToRound`, se dado). */
export function computeStandings(
  teamIds: readonly TeamId[],
  matches: readonly Match[],
  options: { upToRound?: number; drawSeed?: string } = {},
): StandingRow[] {
  const considered = matches.filter((m) => m.status === 'finished' && m.round <= (options.upToRound ?? Infinity))
  const rows = new Map(teamIds.map((id) => [id, emptyRow(id)]))
  for (const m of considered) addMatch(rows, m)
  return sortRows(rows.values(), considered, options.drawSeed ?? 'draw')
}

interface CacheEntry {
  /** Partidas finalizadas até a rodada: se não mudou, a entrada continua valendo. */
  finished: number
  stats: Map<TeamId, StandingRow>
  table?: StandingRow[]
}

/**
 * Cache por rodada da classificação de uma competição. Cada rodada guarda a soma acumulada
 * da anterior, então tabelas novas custam só os jogos da rodada. Uma entrada só é reaproveitada
 * se o número de partidas finalizadas até ela não mudou (partidas finalizadas nunca mudam).
 */
export class StandingsCache {
  private readonly entries = new Map<number, CacheEntry>()

  constructor(
    private readonly teamIds: readonly TeamId[],
    private readonly drawSeed = 'draw',
  ) {}

  /** Classificação logo após `round` (0 = antes de começar). Ignora partidas ainda não jogadas. */
  table(matches: readonly Match[], round: number): StandingRow[] {
    const byRound = new Map<number, Match[]>()
    for (const m of matches) {
      if (m.status !== 'finished' || m.round > round) continue
      byRound.set(m.round, [...(byRound.get(m.round) ?? []), m])
    }
    const entry = this.entry(byRound, round)
    entry.table ??= sortRows(entry.stats.values(), [...byRound.values()].flat(), this.drawSeed).map((row) => ({ ...row }))
    return entry.table
  }

  private entry(byRound: ReadonlyMap<number, Match[]>, round: number): CacheEntry {
    let finished = 0
    for (const [r, ms] of byRound) if (r <= round) finished += ms.length
    const cached = this.entries.get(round)
    if (cached && cached.finished === finished) return cached

    const stats = round <= 0 ? new Map(this.teamIds.map((id) => [id, emptyRow(id)])) : cloneRows(this.entry(byRound, round - 1).stats)
    if (round > 0) for (const m of byRound.get(round) ?? []) addMatch(stats, m)
    const entry: CacheEntry = { finished, stats }
    this.entries.set(round, entry)
    return entry
  }

  /** Quantas rodadas estão guardadas (para testes). */
  get size(): number {
    return this.entries.size
  }
}
