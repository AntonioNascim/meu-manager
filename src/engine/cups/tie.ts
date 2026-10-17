/**
 * Confrontos de mata-mata e tabelas de grupos, sempre derivados das partidas (nada disso é guardado): o vencedor de um
 * confronto sai dos placares, da regra do gol fora (se ligada), da prorrogação e dos pênaltis.
 */
import { hashSeed } from '../rng'
import { computeStandings } from '../season/standings'
import type { Cup, CupSpec, Match, StandingRow, TeamId } from '../types'
import type { KnockoutRules } from '../match/knockout'

export type TieDecision = 'goals' | 'away-goals' | 'extra-time' | 'penalties' | 'draw'

export interface TieView {
  stage: number
  tie: number
  /** [primeiro mandante (ida), outro]. */
  teams: [TeamId, TeamId]
  legs: Match[]
  finished: boolean
  winnerId?: TeamId
  decidedBy?: TieDecision
  /** Gols de cada clube somando as pernas já jogadas. */
  goals: Record<TeamId, number>
}

export const cupMatches = (matches: readonly Match[], cupId: string): Match[] => matches.filter((m) => m.competitionId === cupId && m.cup !== undefined)

/** Vencedor de um confronto cujas partidas terminaram. */
export function tieOutcome(legs: readonly Match[], spec: Pick<CupSpec, 'awayGoals'>): { winnerId: TeamId; decidedBy: TieDecision } | undefined {
  const ordered = [...legs].sort((a, b) => (a.cup?.leg ?? 1) - (b.cup?.leg ?? 1))
  if (ordered.length === 0 || ordered.some((m) => m.status !== 'finished' || !m.result)) return undefined
  const first = ordered[0] as Match
  const last = ordered[ordered.length - 1] as Match
  const a = first.homeTeamId
  const b = first.awayTeamId
  const goals = { [a]: 0, [b]: 0 } as Record<TeamId, number>
  for (const m of ordered) {
    const r = m.result as NonNullable<Match['result']>
    goals[m.homeTeamId] = (goals[m.homeTeamId] ?? 0) + r.homeGoals
    goals[m.awayTeamId] = (goals[m.awayTeamId] ?? 0) + r.awayGoals
  }
  const lastResult = last.result as NonNullable<Match['result']>
  if (goals[a] !== goals[b]) return { winnerId: (goals[a] as number) > (goals[b] as number) ? a : b, decidedBy: lastResult.extraTime ? 'extra-time' : 'goals' }
  if (spec.awayGoals && ordered.length === 2) {
    const awayA = (last.result as NonNullable<Match['result']>).awayGoals
    const awayB = (first.result as NonNullable<Match['result']>).awayGoals
    if (awayA !== awayB) return { winnerId: awayA > awayB ? a : b, decidedBy: lastResult.extraTime ? 'extra-time' : 'away-goals' }
  }
  if (lastResult.penalties) {
    const homeWon = lastResult.penalties.home > lastResult.penalties.away
    return { winnerId: homeWon ? last.homeTeamId : last.awayTeamId, decidedBy: 'penalties' }
  }
  // Copa sem prorrogação nem pênaltis (ou configuração incompleta): o sorteio da partida decide, para a copa nunca travar.
  return { winnerId: hashSeed(`${last.id}:${last.seed}`) % 2 === 0 ? a : b, decidedBy: 'draw' }
}

/** Confrontos de uma fase de mata-mata, na ordem do sorteio. */
export function tiesOfStage(matches: readonly Match[], spec: Pick<CupSpec, 'awayGoals'>, stage: number): TieView[] {
  const byTie = new Map<number, Match[]>()
  let cupId: string | undefined
  for (const m of matches) {
    if (!m.cup || m.cup.kind !== 'knockout' || m.cup.stage !== stage) continue
    // Confrontos de copas diferentes têm o mesmo número de fase e de confronto: quem chama passa só os jogos de uma copa (`cupMatches`).
    if (cupId !== undefined && cupId !== m.competitionId) throw new Error('tiesOfStage precisa dos jogos de uma copa só')
    cupId = m.competitionId
    byTie.set(m.cup.tie ?? 0, [...(byTie.get(m.cup.tie ?? 0) ?? []), m])
  }
  return [...byTie.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([tie, legs]) => {
      const sorted = [...legs].sort((p, q) => (p.cup?.leg ?? 1) - (q.cup?.leg ?? 1))
      const first = sorted[0] as Match
      const goals: Record<TeamId, number> = { [first.homeTeamId]: 0, [first.awayTeamId]: 0 }
      for (const m of sorted) {
        if (m.status !== 'finished' || !m.result) continue
        goals[m.homeTeamId] = (goals[m.homeTeamId] ?? 0) + m.result.homeGoals
        goals[m.awayTeamId] = (goals[m.awayTeamId] ?? 0) + m.result.awayGoals
      }
      const outcome = tieOutcome(sorted, spec)
      return { stage, tie, teams: [first.homeTeamId, first.awayTeamId] as [TeamId, TeamId], legs: sorted, finished: outcome !== undefined, goals, ...(outcome ? { winnerId: outcome.winnerId, decidedBy: outcome.decidedBy } : {}) }
    })
}

/** Grupos de uma fase de grupos: clubes e tabela (cada grupo separado). */
export function groupTables(matches: readonly Match[], stage: number): { group: number; rows: StandingRow[] }[] {
  const groups = new Map<number, Match[]>()
  for (const m of matches) if (m.cup?.kind === 'group' && m.cup.stage === stage) groups.set(m.cup.group ?? 0, [...(groups.get(m.cup.group ?? 0) ?? []), m])
  return [...groups.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([group, list]) => ({ group, rows: computeStandings([...new Set(list.flatMap((m) => [m.homeTeamId, m.awayTeamId]))], list) }))
}

/** Tabela única da fase de liga. */
export function leaguePhaseTable(matches: readonly Match[], stage: number): StandingRow[] {
  const list = matches.filter((m) => m.cup?.kind === 'league' && m.cup.stage === stage)
  return computeStandings([...new Set(list.flatMap((m) => [m.homeTeamId, m.awayTeamId]))], list)
}

/** As regras de mata-mata da partida (prorrogação, pênaltis, gol fora e placar da ida), ou `undefined` se ela se decide no tempo normal (liga, grupos, ida de um confronto de ida e volta). */
export function knockoutRulesFor(cup: Pick<Cup, 'spec'> | undefined, match: Match, matches: readonly Match[]): KnockoutRules | undefined {
  if (!cup || !match.cup || match.cup.kind !== 'knockout') return undefined
  const spec = cup.spec
  const base = { extraTime: spec.extraTime, penalties: spec.penalties }
  if (match.cup.leg === undefined || match.cup.leg === 1) {
    const twoLegged = matches.some((m) => m.competitionId === match.competitionId && m.cup?.stage === match.cup?.stage && m.cup?.tie === match.cup?.tie && m.cup?.leg === 2)
    return twoLegged ? undefined : base
  }
  const firstLeg = matches.find((m) => m.competitionId === match.competitionId && m.cup?.stage === match.cup?.stage && m.cup?.tie === match.cup?.tie && m.cup?.leg === 1)
  const r = firstLeg?.result
  return { ...base, awayGoals: spec.awayGoals, ...(r ? { priorLeg: { home: r.awayGoals, away: r.homeGoals } } : {}) }
}
