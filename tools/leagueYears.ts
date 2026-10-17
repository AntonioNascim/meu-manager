/**
 * Várias temporadas seguidas com várias ligas (economia por liga, B5): a mesma virada do jogo (acesso e rebaixamento dentro de
 * cada pirâmide), com o mercado ligado e sem time do jogador, medindo cada liga: força dos titulares, reputação, finanças,
 * onde estão os melhores jogadores e o fluxo de jogadores entre as ligas. Usado por `npm run analyze -- years` e pelos testes.
 */
import { createYouth } from '../src/data/generateYouth'
import { computeStandings } from '../src/engine/season/standings'
import { advanceSeason } from '../src/engine/offseason'
import { playerOverall } from '../src/engine/overall'
import { createSeason, simulateToSeasonEnd } from '../src/engine/season'
import type { CompetitionSetup, SeasonState } from '../src/engine/season'
import type { Player, Team } from '../src/engine/types'
import { lowestBalance } from './longRun'

export interface LeagueInit {
  year: number
  seed: string | number
  teams: Team[]
  players: Player[]
  academy: Player[]
  competitions?: CompetitionSetup[]
  focus?: string
}

export interface LeagueYear {
  id: string
  name: string
  clubs: number
  /** Média da força dos 11 titulares no começo da temporada e reputação média. */
  strength: number
  reputation: number
  /** Dos 40 melhores jogadores do mundo (começo da temporada), quantos jogam na liga. */
  top40: number
  /** Maior saldo final / receita (em anos) e quantos clubes ficaram no vermelho em algum momento. */
  maxBalanceYears: number
  negativeEver: number
  /** Folha anual / receita anual (média dos clubes) e receita média por clube (R$). */
  payrollShare: number
  meanRevenue: number
  /** Maior venda de jogador de um clube / receita do clube e maior compra / receita. */
  maxSaleShare: number
  maxPurchaseShare: number
  /** O mesmo na média dos clubes. */
  meanSaleShare: number
  meanPurchaseShare: number
  /** Compras entre ligas: jogadores que chegaram de outra liga e que saíram para outra liga neste ano. */
  signedFromOutside: number
  soldToOutside: number
  /** Campeão da temporada, seus pontos e o número de jogos dele. */
  championId: string
  championPoints: number
  championGames: number
  /** Idade média dos jogadores dos clubes e quantos têm força geral de 85 ou mais (começo da temporada). */
  meanAge: number
  stars: number
}

export interface LeagueRun {
  year: number
  leagues: LeagueYear[]
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

function revenueOf(t: Team): number {
  return t.finances.ledger.filter((e) => e.amount > 0 && (e.category === 'ticket-sales' || e.category === 'sponsorship' || e.category === 'tv-rights')).reduce((s, e) => s + e.amount, 0)
}
const sumOf = (t: Team, category: string, sign: 1 | -1) => t.finances.ledger.filter((e) => e.category === category && e.amount * sign > 0).reduce((s, e) => s + e.amount * sign, 0)

export function simulateLeagueYears(init: LeagueInit, years: number): LeagueRun[] {
  let state: SeasonState = createSeason({ year: init.year, seed: init.seed, teams: init.teams, players: init.players, academy: init.academy, ...(init.competitions ? { competitions: init.competitions } : {}), ...(init.focus !== undefined ? { focus: init.focus } : {}) })
  const runs: LeagueRun[] = []
  for (let i = 0; i < years; i++) {
    const byId = new Map(state.players.map((p) => [p.id, p]))
    const leagueOf = new Map<string, string>()
    for (const c of state.season.competitions) for (const id of c.teamIds) leagueOf.set(id, c.id)
    const top40 = new Map<string, number>()
    for (const p of [...state.players].filter((x) => x.teamId).sort((a, b) => playerOverall(b) - playerOverall(a)).slice(0, 40)) {
      const l = leagueOf.get(p.teamId as string) as string
      top40.set(l, (top40.get(l) ?? 0) + 1)
    }
    const strengthOf = (t: Team) => mean(t.tactic.startingXI.map((id) => playerOverall(byId.get(id) as Player)))
    const teamOf = new Map(state.teams.map((t) => [t.id, t]))
    const startStrength = new Map(state.season.competitions.map((c) => [c.id, mean(c.teamIds.map((id) => strengthOf(teamOf.get(id) as Team)))]))
    const startRep = new Map(state.season.competitions.map((c) => [c.id, mean(c.teamIds.map((id) => (teamOf.get(id) as Team).reputation))]))

    const clubsOf = new Map(state.season.competitions.map((c) => [c.id, new Set(c.teamIds)]))
    const squadOf = (id: string) => state.players.filter((p) => p.teamId && clubsOf.get(id)?.has(p.teamId))
    const squads = new Map(state.season.competitions.map((c) => [c.id, squadOf(c.id)]))

    const ended = simulateToSeasonEnd(state, { market: true })
    const endedTeams = new Map(ended.teams.map((t) => [t.id, t]))
    const signed = new Map<string, number>()
    const sold = new Map<string, number>()
    for (const h of ended.market.history) {
      if (h.kind !== 'purchase') continue
      const to = leagueOf.get(h.toTeamId)
      const from = h.fromTeamId ? leagueOf.get(h.fromTeamId) : undefined
      if (!to || !from || to === from) continue
      signed.set(to, (signed.get(to) ?? 0) + 1)
      sold.set(from, (sold.get(from) ?? 0) + 1)
    }
    const leagues: LeagueYear[] = ended.season.competitions.map((c) => {
      const teams = c.teamIds.map((id) => endedTeams.get(id) as Team)
      const revenue = teams.map(revenueOf)
      const table = computeStandings(c.teamIds, ended.matches.filter((m) => m.competitionId === c.id))
      const squad = squads.get(c.id) as Player[]
      const payroll = teams.map((t) => ended.players.filter((p) => p.teamId === t.id).reduce((s, p) => s + p.contract.salary, 0) * 12)
      return {
        id: c.id,
        name: c.name,
        clubs: teams.length,
        strength: startStrength.get(c.id) as number,
        reputation: startRep.get(c.id) as number,
        top40: top40.get(c.id) ?? 0,
        maxBalanceYears: Math.max(...teams.map((t, k) => t.finances.balance / Math.max(1, revenue[k] as number))),
        negativeEver: teams.filter((t) => lowestBalance(t) < 0).length,
        payrollShare: mean(teams.map((_, k) => (payroll[k] as number) / Math.max(1, revenue[k] as number))),
        meanRevenue: mean(revenue),
        maxSaleShare: Math.max(...teams.map((t, k) => sumOf(t, 'player-sales', 1) / Math.max(1, revenue[k] as number))),
        maxPurchaseShare: Math.max(...teams.map((t, k) => sumOf(t, 'player-purchases', -1) / Math.max(1, revenue[k] as number))),
        meanSaleShare: mean(teams.map((t, k) => sumOf(t, 'player-sales', 1) / Math.max(1, revenue[k] as number))),
        meanPurchaseShare: mean(teams.map((t, k) => sumOf(t, 'player-purchases', -1) / Math.max(1, revenue[k] as number))),
        signedFromOutside: signed.get(c.id) ?? 0,
        soldToOutside: sold.get(c.id) ?? 0,
        championId: (table[0] as { teamId: string }).teamId,
        championPoints: (table[0] as { points: number }).points,
        championGames: (table[0] as { played: number }).played,
        meanAge: mean(squad.map((p) => p.age)),
        stars: squad.filter((p) => playerOverall(p) >= 85).length,
      }
    })
    runs.push({ year: ended.season.year, leagues })
    if (i < years - 1) state = advanceSeason(ended, { createYouth }).state
  }
  return runs
}

const money = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : `${(x / 1e3).toFixed(0)}k`)

/** Uma tabela por liga: ano a ano. */
export function formatLeagueYears(runs: LeagueRun[]): string {
  const ids = runs[0]?.leagues.map((l) => l.id) ?? []
  const out: string[] = []
  for (const id of ids) {
    const rows = runs.map((r) => ({ year: r.year, l: r.leagues.find((x) => x.id === id) as LeagueYear }))
    out.push(`\n${rows[0]?.l.name} (${rows[0]?.l.clubs} clubes)`, 'ano   força  reput  top40  saldo/rec(máx) vermelho  folha/rec  receita  venda/rec(méd/máx) compra/rec(méd/máx)  chegam  saem')
    for (const { year, l } of rows) {
      out.push(
        [String(year), l.strength.toFixed(1).padStart(7), l.reputation.toFixed(1).padStart(6), String(l.top40).padStart(6), l.maxBalanceYears.toFixed(2).padStart(15), String(l.negativeEver).padStart(8), `${(100 * l.payrollShare).toFixed(0)}%`.padStart(10), money(l.meanRevenue).padStart(8), `${l.meanSaleShare.toFixed(2)}/${l.maxSaleShare.toFixed(1)}`.padStart(18), `${l.meanPurchaseShare.toFixed(2)}/${l.maxPurchaseShare.toFixed(1)}`.padStart(19), String(l.signedFromOutside).padStart(7), String(l.soldToOutside).padStart(5)].join(' '),
      )
    }
  }
  return out.join('\n')
}

/** Resumo de uma linha por liga: média dos primeiros e dos últimos 3 anos. */
export function formatLeagueSummary(runs: LeagueRun[]): string {
  const ids = runs[0]?.leagues.map((l) => l.id) ?? []
  const take = (id: string, from: number, to: number) => runs.slice(from, to).map((r) => r.leagues.find((x) => x.id === id) as LeagueYear)
  return ids
    .map((id) => {
      const early = take(id, 0, 3)
      const late = take(id, -3, runs.length)
      const name = early[0]?.name ?? id
      return `${name.padEnd(12)} força ${mean(early.map((l) => l.strength)).toFixed(1)} → ${mean(late.map((l) => l.strength)).toFixed(1)} | top40 ${mean(early.map((l) => l.top40)).toFixed(1)} → ${mean(late.map((l) => l.top40)).toFixed(1)} | receita ${money(mean(early.map((l) => l.meanRevenue)))} | folha/rec ${(100 * mean(late.map((l) => l.payrollShare))).toFixed(0)}% | compra/rec ${mean(late.map((l) => l.meanPurchaseShare)).toFixed(2)} (máx ${Math.max(...late.map((l) => l.maxPurchaseShare)).toFixed(1)}) venda/rec ${mean(late.map((l) => l.meanSaleShare)).toFixed(2)} (máx ${Math.max(...late.map((l) => l.maxSaleShare)).toFixed(1)}) | saldo/rec máx ${Math.max(...late.map((l) => l.maxBalanceYears)).toFixed(2)} | vermelho ${late.reduce((s, l) => s + l.negativeEver, 0)} | chegam ${mean(late.map((l) => l.signedFromOutside)).toFixed(1)} saem ${mean(late.map((l) => l.soldToOutside)).toFixed(1)} por ano`
    })
    .join('\n')
}

export interface Dynasty {
  id: string
  name: string
  /** Média de pontos do campeão e quantos campeões passaram de `highPoints`. */
  championPoints: number
  highCount: number
  /** Por bloco de 10 temporadas: campeões diferentes, mais títulos de um clube e maior sequência de títulos seguidos. */
  blocks: { distinct: number; maxTitles: number; maxStreak: number }[]
}

/** Campeões de cada liga: pontos, e dinastias em blocos de `block` temporadas. */
export function dynastiesOf(runs: LeagueRun[], highPoints = 92, block = 10): Dynasty[] {
  const ids = runs[0]?.leagues.map((l) => l.id) ?? []
  return ids.map((id) => {
    const rows = runs.map((r) => r.leagues.find((x) => x.id === id) as LeagueYear)
    const blocks: Dynasty['blocks'] = []
    for (let i = 0; i + block <= rows.length; i += block) {
      const part = rows.slice(i, i + block)
      const counts = new Map<string, number>()
      let streak = 0
      let maxStreak = 0
      part.forEach((l, k) => {
        counts.set(l.championId, (counts.get(l.championId) ?? 0) + 1)
        streak = k > 0 && part[k - 1]?.championId === l.championId ? streak + 1 : 1
        maxStreak = Math.max(maxStreak, streak)
      })
      blocks.push({ distinct: counts.size, maxTitles: Math.max(...counts.values()), maxStreak })
    }
    return { id, name: rows[0]?.name ?? id, championPoints: mean(rows.map((l) => l.championPoints)), highCount: rows.filter((l) => l.championPoints > highPoints).length, blocks }
  })
}

/** Tendência por liga: força, melhores jogadores, craques e idade nos três anos iniciais, no meio e nos finais. */
export function formatTrend(runs: LeagueRun[]): string {
  const ids = runs[0]?.leagues.map((l) => l.id) ?? []
  const n = runs.length
  const mid = Math.floor(n / 2)
  const spans: [number, number][] = [[0, 3], [mid - 1, mid + 2], [n - 3, n]]
  const avg = (id: string, [a, b]: [number, number], pick: (l: LeagueYear) => number) => mean(runs.slice(a, b).map((r) => pick(r.leagues.find((x) => x.id === id) as LeagueYear)))
  const trio = (id: string, pick: (l: LeagueYear) => number, d = 1) => spans.map((s) => avg(id, s, pick).toFixed(d)).join(' → ')
  return ids
    .map((id) => {
      const name = runs[0]?.leagues.find((l) => l.id === id)?.name ?? id
      return `${name.padEnd(12)} força ${trio(id, (l) => l.strength)} | top40 ${trio(id, (l) => l.top40)} | craques ${trio(id, (l) => l.stars)} | idade ${trio(id, (l) => l.meanAge)} | folha/rec ${trio(id, (l) => 100 * l.payrollShare, 0)}% | saldo/rec máx ${Math.max(...runs.map((r) => (r.leagues.find((x) => x.id === id) as LeagueYear).maxBalanceYears)).toFixed(2)} | vermelho ${runs.reduce((s, r) => s + (r.leagues.find((x) => x.id === id) as LeagueYear).negativeEver, 0)}`
    })
    .join('\n')
}

export function formatDynasties(runs: LeagueRun[]): string {
  return dynastiesOf(runs)
    .map((d) => `${d.name.padEnd(12)} pontos do campeão ${d.championPoints.toFixed(1)} (acima de 92: ${d.highCount}) | por bloco de 10: ${d.blocks.map((b) => `${b.distinct} campeões, máx ${b.maxTitles} títulos, ${b.maxStreak} seguidos`).join(' / ')}`)
    .join('\n')
}
