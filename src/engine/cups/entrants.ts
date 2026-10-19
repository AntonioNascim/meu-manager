/**
 * Quem joga cada copa na temporada: as vagas do pacote (`CupSpec.entrants`) viram clubes, a partir da classificação final da
 * temporada passada (histórico dos clubes), do campeão da outra copa (`cupHistory`) e, na primeira temporada, da reputação.
 */
import type { Competition, CupEntrantSource, CupHistory, CupSpec, Team, TeamId } from '../types'
import { seedOrder } from './draw'

export interface EntrantContext {
  year: number
  teams: readonly Team[]
  competitions: readonly Pick<Competition, 'id' | 'tier' | 'teamIds' | 'pyramid'>[]
  cupHistory: CupHistory
  /** Todas as copas, para resolver "campeão da copa X" na primeira temporada (sem histórico) pelos clubes que ela teria. */
  specs: readonly CupSpec[]
  /** Clubes que já estão em outras copas da mesma edição (`CupSpec.excludeCups`): não entram nesta. */
  excluded?: ReadonlySet<TeamId>
}

const byReputation = (ctx: EntrantContext) => {
  const rep = new Map(ctx.teams.map((t) => [t.id, t.reputation]))
  return (id: TeamId) => rep.get(id) ?? 0
}

/** Clubes de uma fonte de liga, do primeiro ao último colocado da temporada passada (na primeira temporada, pela reputação). */
function leagueRanking(source: Extract<CupEntrantSource, { type: 'league' }>, ctx: EntrantContext): TeamId[] {
  const competition = ctx.competitions.find((c) => c.id === source.league)
  if (!competition) return []
  const strength = byReputation(ctx)
  if (!source.positions) return seedOrder(competition.teamIds, strength)
  const to = source.positions[1]
  // Quem terminou a temporada passada nesta divisão (do mesmo país), pela colocação final.
  const last = ctx.teams
    .flatMap((t) => {
      const h = t.history[t.history.length - 1]
      return h && h.year === ctx.year - 1 && h.tier === competition.tier && ctx.competitions.some((c) => c.pyramid === competition.pyramid && c.teamIds.includes(t.id)) ? [{ id: t.id, position: h.finalPosition }] : []
    })
    .sort((a, b) => a.position - b.position)
  if (last.length < to) return seedOrder(competition.teamIds, strength)
  // Quem não estava na divisão na temporada passada (subiu ou caiu) vem depois, pela reputação.
  const placed = new Set(last.map((x) => x.id))
  return [...last.map((x) => x.id), ...seedOrder(competition.teamIds.filter((id) => !placed.has(id)), strength)]
}

/** Clubes de uma fonte de liga, do primeiro ao último colocado da temporada passada (na primeira temporada, pela reputação). */
function leagueSource(source: Extract<CupEntrantSource, { type: 'league' }>, ctx: EntrantContext): TeamId[] {
  const ranked = leagueRanking(source, ctx)
  return source.positions ? ranked.slice(source.positions[0] - 1, source.positions[1]) : ranked
}

/**
 * Colocações [de, até] de uma liga sem os clubes que já estão na copa (por outra vaga ou por serem de uma copa excluída): quem sobra
 * é reposto pelos colocados logo abaixo, então a copa mantém o número de clubes.
 */
function leagueFilled(source: Extract<CupEntrantSource, { type: 'league' }>, ctx: EntrantContext, taken: ReadonlySet<TeamId>): TeamId[] {
  const [from, to] = source.positions as [number, number]
  const ranked = leagueRanking(source, ctx)
  const out: TeamId[] = []
  for (let i = from - 1; i < ranked.length && out.length < to - from + 1; i++) if (!taken.has(ranked[i] as TeamId)) out.push(ranked[i] as TeamId)
  return out
}

function cupSource(source: Extract<CupEntrantSource, { type: 'cup' }>, ctx: EntrantContext, depth: number): TeamId[] {
  const entry = (ctx.cupHistory[source.cup] ?? []).find((h) => h.year === ctx.year - 1)
  if (entry) {
    const id = source.place === 'winner' ? entry.winnerId : entry.runnerUpId
    return id ? [id] : []
  }
  // Sem edição passada: o mais forte (ou o segundo mais forte) entre os clubes que a copa teria.
  const other = ctx.specs.find((s) => s.id === source.cup)
  if (!other || depth > 2) return []
  const strength = byReputation(ctx)
  const pool = seedOrder(resolveEntrants(other, ctx, depth + 1).map((e) => e.teamId), strength)
  const pick = pool[source.place === 'winner' ? 0 : 1]
  return pick ? [pick] : []
}

function fromSource(source: CupEntrantSource, ctx: EntrantContext, depth: number): TeamId[] {
  if (source.type === 'league') return leagueSource(source, ctx)
  // Os classificados pelos grupos de outra copa só se conhecem quando eles terminam: entram depois (`progressCups`).
  if (source.type === 'cup-group-place') return []
  return cupSource(source, ctx, depth)
}

/** Os clubes da copa e a fase em que cada um entra. Um clube que já entrou por outra vaga não entra de novo (vale a vaga reserva, se houver). */
export function resolveEntrants(spec: CupSpec, ctx: EntrantContext, depth = 0): { teamId: TeamId; stage: number }[] {
  const taken = new Set<TeamId>(ctx.excluded ?? [])
  const out: { teamId: TeamId; stage: number }[] = []
  for (const rule of spec.entrants) {
    const stage = rule.stage ?? 0
    const candidatesOf = (source: CupEntrantSource) => (source.type === 'league' && source.positions ? leagueFilled(source, ctx, taken) : fromSource(source, ctx, depth).filter((id) => !taken.has(id)))
    let candidates = candidatesOf(rule.source)
    // Vaga que repete clube (ex.: o campeão da liga também ganhou a copa): o primeiro da vaga reserva ocupa o lugar.
    if (candidates.length === 0 && rule.fallback) candidates = candidatesOf(rule.fallback).slice(0, 1)
    for (const id of candidates) {
      taken.add(id)
      out.push({ teamId: id, stage })
    }
  }
  return out
}
