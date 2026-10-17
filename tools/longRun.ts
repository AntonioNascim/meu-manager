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
  strengthC: number
  /** Idade média de todos os jogadores com clube e fatias de jovens (≤ 21) e veteranos (≥ 31). */
  meanAge: number
  under22: number
  over30: number
  /** Jogadores de até 21 anos com potencial ≥ 75, e o maior potencial entre os de até 21. */
  prospects: number
  topPotential: number
  /** Jogadores com força geral ≥ 85 (craques), com potencial ≥ 85 e a maior força geral do mundo. */
  stars: number
  highPotential: number
  /** Craques com até 24 anos (a base está repondo os craques). */
  youngStars: number
  topOverall: number
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
  /** O mesmo só para a Série C, cuja receita é pequena: uma venda grande de jogador pesa muito mais no caixa dela. */
  maxBalanceInRevenueYearsC: number
  /** Reputação média da Série A. */
  reputationA: number
  reputationB: number
  reputationC: number
  /** Base: jovens por clube (média), jovens com potencial ≥ 75 em todas as bases e maior potencial entre eles. */
  academySize: number
  academyProspects: number
  /** Maior base de um clube e jovens de 20 anos ou mais ainda na base (nos clubes da IA, deve ser 0 depois da virada). */
  academyMax: number
  academyOverdue: number
  /** Concentração dos 40 melhores jogadores: quantos o clube que mais tem possui e em quantos clubes eles estão. */
  topMaxInClub: number
  topClubs: number
  report?: OffseasonReport
}

/** Força geral a partir da qual o jogador é craque. */
export const STAR_OVERALL = 85

/** Quantos dos melhores jogadores entram na conta de concentração. */
export const TOP_PLAYERS = 40

/** Potencial a partir do qual um jovem (até 21 anos) é promessa. */
export const PROSPECT_POTENTIAL = 75

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

export function snapshot(state: SeasonState): Pick<YearRow, 'strengthA' | 'strengthB' | 'strengthC' | 'meanAge' | 'under22' | 'over30' | 'prospects' | 'topPotential' | 'stars' | 'highPotential' | 'youngStars' | 'topOverall' | 'minSquad' | 'maxSquad' | 'freeAgents' | 'reputationA' | 'reputationB' | 'reputationC' | 'academySize' | 'academyProspects' | 'academyMax' | 'academyOverdue' | 'topMaxInClub' | 'topClubs'> {
  const byId = new Map(state.players.map((p) => [p.id, p]))
  const signed = state.players.filter((p) => p.teamId !== null)
  const squads = state.teams.map((t) => state.players.filter((p) => p.teamId === t.id).length)
  const young = signed.filter((p) => p.age <= 21)
  const top = [...signed].sort((a, b) => playerOverall(b) - playerOverall(a)).slice(0, TOP_PLAYERS)
  const perClub = new Map<string, number>()
  for (const p of top) perClub.set(p.teamId as string, (perClub.get(p.teamId as string) ?? 0) + 1)
  return {
    topMaxInClub: Math.max(...perClub.values()),
    topClubs: perClub.size,
    strengthA: mean(state.teams.filter((t) => t.tier === 1).map((t) => teamStrength(t, byId))),
    strengthB: mean(state.teams.filter((t) => t.tier === 2).map((t) => teamStrength(t, byId))),
    strengthC: mean(state.teams.filter((t) => t.tier === 3).map((t) => teamStrength(t, byId))),
    meanAge: mean(signed.map((p) => p.age)),
    under22: young.length / signed.length,
    over30: signed.filter((p) => p.age >= 31).length / signed.length,
    prospects: young.filter((p) => p.hidden.potential >= PROSPECT_POTENTIAL).length,
    topPotential: Math.max(...young.map((p) => p.hidden.potential)),
    stars: signed.filter((p) => playerOverall(p) >= STAR_OVERALL).length,
    youngStars: signed.filter((p) => p.age <= 24 && playerOverall(p) >= STAR_OVERALL).length,
    highPotential: signed.filter((p) => p.hidden.potential >= STAR_OVERALL).length,
    topOverall: Math.max(...signed.map((p) => playerOverall(p))),
    minSquad: Math.min(...squads),
    maxSquad: Math.max(...squads),
    freeAgents: state.players.length - signed.length,
    reputationA: mean(state.teams.filter((t) => t.tier === 1).map((t) => t.reputation)),
    reputationB: mean(state.teams.filter((t) => t.tier === 2).map((t) => t.reputation)),
    reputationC: mean(state.teams.filter((t) => t.tier === 3).map((t) => t.reputation)),
    academySize: state.academy.length / state.teams.length,
    academyProspects: state.academy.filter((p) => p.hidden.potential >= PROSPECT_POTENTIAL).length,
    academyMax: Math.max(...state.teams.map((t) => state.academy.filter((p) => p.teamId === t.id).length)),
    academyOverdue: state.academy.filter((p) => p.age >= 20).length,
  }
}

export function simulateYears(world: World, years: number, seed: string | number = 'years', options: { market?: boolean } = {}): YearRow[] {
  // As copas do mundo entram por padrão; `NO_CUPS=1` mede só as ligas (para comparar).
  const cupSpecs = process.env.NO_CUPS ? undefined : world.cups
  let state = createSeason({ year: world.startYear, seed, teams: world.teams, players: world.players, academy: world.academy, ...(cupSpecs ? { cupSpecs } : {}) })
  const rows: YearRow[] = []
  for (let i = 0; i < years; i++) {
    const start = snapshot(state)
    const ended = simulateToSeasonEnd(state, { market: options.market ?? true })
    const balances = ended.teams.map((t) => t.finances.balance)
    const lows = ended.teams.map(lowestBalance)
    const revenue = (t: Team) => t.finances.ledger.filter((e) => e.amount > 0 && (e.category === 'ticket-sales' || e.category === 'sponsorship' || e.category === 'tv-rights')).reduce((s, e) => s + e.amount, 0)
    const row: YearRow = {
      year: ended.season.year,
      ...start,
      minEndBalance: Math.min(...balances),
      minBalanceEver: Math.min(...lows),
      maxEndBalance: Math.max(...balances),
      negativeEver: lows.filter((b) => b < 0).length,
      negativeAtEnd: balances.filter((b) => b < 0).length,
      maxBalanceInRevenueYears: Math.max(...ended.teams.filter((t) => t.tier < 3).map((t) => t.finances.balance / Math.max(1, revenue(t)))),
      maxBalanceInRevenueYearsC: Math.max(0, ...ended.teams.filter((t) => t.tier === 3).map((t) => t.finances.balance / Math.max(1, revenue(t)))),
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
    'ano   forçaA forçaB forçaC  idade <22  >30  promessas potMax craques pot85 topFor  elenco   livres  saldo mín(fim) mín(ever) máx(fim) neg  reputA reputB reputC  base prBase base→pro base→fora top40(máx/clubes) campeão',
    ...rows.map((r) =>
      [
        String(r.year),
        r.strengthA.toFixed(1).padStart(7),
        r.strengthB.toFixed(1).padStart(6),
        r.strengthC.toFixed(1).padStart(6),
        r.meanAge.toFixed(1).padStart(6),
        pct(r.under22).padStart(4),
        pct(r.over30).padStart(5),
        String(r.prospects).padStart(9),
        String(r.topPotential).padStart(6),
        String(r.stars).padStart(7),
        String(r.highPotential).padStart(6),
        r.topOverall.toFixed(1).padStart(6),
        `${r.minSquad}-${r.maxSquad}`.padStart(8),
        String(r.freeAgents).padStart(8),
        m(r.minEndBalance).padStart(10),
        m(r.minBalanceEver).padStart(10),
        m(r.maxEndBalance).padStart(9),
        `${r.negativeEver}/${r.negativeAtEnd}`.padStart(5),
        r.reputationA.toFixed(1).padStart(7),
        r.reputationB.toFixed(1).padStart(7),
        r.reputationC.toFixed(1).padStart(7),
        r.academySize.toFixed(1).padStart(6),
        String(r.academyProspects).padStart(6),
        (r.report ? String(Object.values(r.report.academyPromoted).reduce((a, b) => a + b, 0)) : '-').padStart(8),
        (r.report ? String(Object.values(r.report.academyReleased).reduce((a, b) => a + b, 0)) : '-').padStart(9),
        `${r.topMaxInClub}/${r.topClubs}`.padStart(19),
        (r.report ? String(r.report.champions[0]).replace('team-', '') : '-').padStart(8),
      ].join(' '),
    ),
  ].join('\n')
}
