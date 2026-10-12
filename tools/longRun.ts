/**
 * Várias temporadas seguidas (mercado ligado, virada de temporada entre elas, sem time do jogador), com as
 * métricas de longo prazo: força das séries, idades, promessas, finanças e elencos. Usado por
 * `npm run analyze -- years` e pelos testes de balanceamento.
 */
import { createYouth } from '../src/data/generateYouth'
import type { World } from '../src/data/generateWorld'
import { advanceSeason } from '../src/engine/offseason'
import { playerOverall } from '../src/engine/overall'
import { createSeason, simulateToSeasonEnd } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import type { OffseasonReport, Player, Team } from '../src/engine/types'

export interface YearRow {
  year: number
  /** Força média dos 11 titulares por série (no início da temporada). */
  strengthA: number
  strengthB: number
  /** Idade média de todos os jogadores com clube e fatias de jovens (≤ 21) e veteranos (≥ 31). */
  meanAge: number
  under22: number
  over30: number
  /** Jogadores de até 21 anos com potencial ≥ 75, e o maior potencial entre os de até 21. */
  prospects: number
  topPotential: number
  /** Jogadores com força geral ≥ 85 (craques). */
  stars: number
  /** Menor e maior elenco; jogadores livres no mercado. */
  minSquad: number
  maxSquad: number
  freeAgents: number
  /** Finanças no fim da temporada (todos os clubes; ninguém é do jogador). */
  minEndBalance: number
  /** Menor saldo em qualquer momento da temporada. */
  minBalanceEver: number
  maxEndBalance: number
  /** Clubes com saldo negativo em algum momento / no fim. */
  negativeEver: number
  negativeAtEnd: number
  /** Maior saldo final em anos de receita esperada (o teto é `FINANCE.ceilingYears`). */
  maxBalanceInRevenueYears: number
  /** Reputação média da Série A. */
  reputationA: number
  reputationB: number
  report?: OffseasonReport
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

function teamStrength(team: Team, byId: Map<string, Player>): number {
  return mean(team.tactic.startingXI.map((id) => playerOverall(byId.get(id) as Player)))
}

/** Menor saldo da temporada: parte do saldo final e desfaz os lançamentos. */
export function lowestBalance(team: Team): number {
  let balance = team.finances.balance - team.finances.ledger.reduce((s, e) => s + e.amount, 0)
  let lowest = balance
  for (const e of team.finances.ledger) {
    balance += e.amount
    lowest = Math.min(lowest, balance)
  }
  return lowest
}

export function snapshot(state: SeasonState): Pick<YearRow, 'strengthA' | 'strengthB' | 'meanAge' | 'under22' | 'over30' | 'prospects' | 'topPotential' | 'stars' | 'minSquad' | 'maxSquad' | 'freeAgents' | 'reputationA' | 'reputationB'> {
  const byId = new Map(state.players.map((p) => [p.id, p]))
  const signed = state.players.filter((p) => p.teamId !== null)
  const squads = state.teams.map((t) => state.players.filter((p) => p.teamId === t.id).length)
  const young = signed.filter((p) => p.age <= 21)
  return {
    strengthA: mean(state.teams.filter((t) => t.tier === 1).map((t) => teamStrength(t, byId))),
    strengthB: mean(state.teams.filter((t) => t.tier === 2).map((t) => teamStrength(t, byId))),
    meanAge: mean(signed.map((p) => p.age)),
    under22: young.length / signed.length,
    over30: signed.filter((p) => p.age >= 31).length / signed.length,
    prospects: young.filter((p) => p.hidden.potential >= 75).length,
    topPotential: Math.max(...young.map((p) => p.hidden.potential)),
    stars: signed.filter((p) => playerOverall(p) >= 85).length,
    minSquad: Math.min(...squads),
    maxSquad: Math.max(...squads),
    freeAgents: state.players.length - signed.length,
    reputationA: mean(state.teams.filter((t) => t.tier === 1).map((t) => t.reputation)),
    reputationB: mean(state.teams.filter((t) => t.tier === 2).map((t) => t.reputation)),
  }
}

export function simulateYears(world: World, years: number, seed: string | number = 'years'): YearRow[] {
  let state = createSeason({ year: world.startYear, seed, teams: world.teams, players: world.players })
  const rows: YearRow[] = []
  for (let i = 0; i < years; i++) {
    const start = snapshot(state)
    const ended = simulateToSeasonEnd(state, { market: true })
    const balances = ended.teams.map((t) => t.finances.balance)
    const lows = ended.teams.map(lowestBalance)
    const revenue = (t: Team) => t.finances.ledger.filter((e) => e.amount > 0 && (e.category === 'ticket-sales' || e.category === 'sponsorship')).reduce((s, e) => s + e.amount, 0)
    const row: YearRow = {
      year: ended.season.year,
      ...start,
      minEndBalance: Math.min(...balances),
      minBalanceEver: Math.min(...lows),
      maxEndBalance: Math.max(...balances),
      negativeEver: lows.filter((b) => b < 0).length,
      negativeAtEnd: balances.filter((b) => b < 0).length,
      maxBalanceInRevenueYears: Math.max(...ended.teams.map((t) => t.finances.balance / Math.max(1, revenue(t)))),
    }
    if (i < years - 1) {
      const turned = advanceSeason(ended, { createYouth })
      row.report = turned.report
      state = turned.state
    }
    rows.push(row)
  }
  return rows
}

const m = (x: number) => `${(x / 1e6).toFixed(0)}M`
const pct = (x: number) => `${(100 * x).toFixed(0)}%`

/** Tabela ano a ano para o terminal. */
export function formatYears(rows: YearRow[]): string {
  return [
    'ano   forçaA forçaB  idade <22  >30  promessas potMax craques  elenco   livres  saldo mín(fim) mín(ever) máx(fim) neg  reputA reputB',
    ...rows.map((r) =>
      [
        String(r.year),
        r.strengthA.toFixed(1).padStart(7),
        r.strengthB.toFixed(1).padStart(6),
        r.meanAge.toFixed(1).padStart(6),
        pct(r.under22).padStart(4),
        pct(r.over30).padStart(5),
        String(r.prospects).padStart(9),
        String(r.topPotential).padStart(6),
        String(r.stars).padStart(7),
        `${r.minSquad}-${r.maxSquad}`.padStart(8),
        String(r.freeAgents).padStart(8),
        m(r.minEndBalance).padStart(10),
        m(r.minBalanceEver).padStart(10),
        m(r.maxEndBalance).padStart(9),
        `${r.negativeEver}/${r.negativeAtEnd}`.padStart(5),
        r.reputationA.toFixed(1).padStart(7),
        r.reputationB.toFixed(1).padStart(7),
      ].join(' '),
    ),
  ].join('\n')
}
