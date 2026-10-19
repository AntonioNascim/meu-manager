/**
 * Equilíbrio das copas continentais: joga N temporadas do mundo de 282 clubes (calendários reais, copas nacionais e continentais) com o
 * relógio único e mede os campeões de cada edição (variedade e dinastias), o dinheiro continental de cada clube contra a receita dele e a
 * reputação dos campeões. Uso: node --expose-gc tools/run.mjs continentalRun [--years 10] [--seed 7] [--focus Brazil]
 * (`--focus` troca o país jogado lance a lance; o resto usa a partida simplificada: serve para ver se a diferença entre as duas favorece um país).
 */
import { writeFileSync } from 'node:fs'
import { createYouth } from '../src/data/generateYouth'
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { advanceSeason } from '../src/engine/offseason'
import { advanceUntil, createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { continentOf } from '../src/engine/types'
import type { TeamId } from '../src/engine/types'

export interface Edition {
  cup: string
  year: number
  winnerId: TeamId
  runnerUpId?: TeamId
  /** País do campeão (pirâmide), continente e reputação dele antes do título. */
  winnerPyramid: string
  winnerContinent: string
  winnerReputation: number
}

export interface MoneyRow {
  teamId: TeamId
  year: number
  pyramid: string
  continental: number
  /** Premiação da Copa Intercontinental e do Mundial de Clubes no ano. */
  world: number
  revenue: number
  reputation: number
  tier: number
}

export interface ContinentalRun {
  editions: Edition[]
  money: MoneyRow[]
  /** Reputação média dos campeões continentais um ano antes e um ano depois do título. */
  reputationAfter: { before: number; after: number }[]
  clubsInContinental: Map<string, number>
}

const revenueOf = (ledger: { amount: number; category: string }[]) => ledger.filter((e) => e.amount > 0 && ['ticket-sales', 'sponsorship', 'tv-rights'].includes(e.category)).reduce((s, e) => s + e.amount, 0)

/** Observador das viradas: guarda os campeões continentais, o dinheiro continental de cada clube e a reputação dos campeões. */
export interface TurnObserver {
  before(state: SeasonState, pyramid: string): void
  after(state: SeasonState, pyramid: string): void
}

export function continentalObserver(): { observer: TurnObserver; run: ContinentalRun } {
  const run: ContinentalRun = { editions: [], money: [], reputationAfter: [], clubsInContinental: new Map() }
  const seen = new Set<string>()
  const pending = new Map<TeamId, number>()
  const scopeOf = (s: SeasonState, pyramid: string) => new Set(s.season.competitions.filter((c) => (c.pyramid ?? 'default') === pyramid).flatMap((c) => c.teamIds))
  const observer: TurnObserver = {
    before(s, pyramid) {
      const scope = scopeOf(s, pyramid)
      const year = s.cycles[pyramid]?.year ?? 0
      for (const cup of s.cups ?? []) {
        if (cup.pyramid !== undefined) continue
        if (cup.winnerId && !seen.has(`${cup.id}:${cup.year}`)) {
          seen.add(`${cup.id}:${cup.year}`)
          const team = s.teams.find((t) => t.id === cup.winnerId)!
          const home = s.season.competitions.find((c) => c.teamIds.includes(cup.winnerId as string))
          run.editions.push({ cup: cup.id, year: cup.year, winnerId: cup.winnerId, ...(cup.runnerUpId ? { runnerUpId: cup.runnerUpId } : {}), winnerPyramid: home?.pyramid ?? '?', winnerContinent: continentOf(home?.region ?? 'BR'), winnerReputation: team.reputation })
          pending.set(cup.winnerId, team.reputation)
        }
        if (!seen.has(`n:${cup.id}:${cup.year}`)) {
          seen.add(`n:${cup.id}:${cup.year}`)
          for (const e of cup.entrants) run.clubsInContinental.set(e.teamId, (run.clubsInContinental.get(e.teamId) ?? 0) + 1)
        }
      }
      for (const t of s.teams) {
        if (!scope.has(t.id)) continue
        const continental = t.finances.ledger.filter((e) => e.category === 'cup-prize' && ((e.description ?? '').startsWith('Liga Continental') || (e.description ?? '').startsWith('Copa Continental'))).reduce((sum, e) => sum + e.amount, 0)
        const world = t.finances.ledger.filter((e) => e.category === 'cup-prize' && ((e.description ?? '').startsWith('Copa Intercontinental') || (e.description ?? '').startsWith('Mundial de Clubes'))).reduce((sum, e) => sum + e.amount, 0)
        run.money.push({ teamId: t.id, year, pyramid, continental, world, revenue: revenueOf(t.finances.ledger), reputation: t.reputation, tier: t.tier })
      }
    },
    after(next, pyramid) {
      const scope = scopeOf(next, pyramid)
      for (const [teamId, before] of pending) {
        const now = next.teams.find((t) => t.id === teamId)
        if (now && scope.has(teamId)) {
          run.reputationAfter.push({ before, after: now.reputation })
          pending.delete(teamId)
        }
      }
    },
  }
  return { observer, run }
}

export function simulateContinental(years: number, seed = 7, focus = 'Brazil'): ContinentalRun {
  const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(seed))))
  if (!pkg) throw new Error('pacote inválido')
  const world = loadWorld(seed, pkg)
  const state = createSeason({ year: world.startYear, seed, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus, ...(world.cups ? { cupSpecs: world.cups } : {}) })
  const { observer, run } = continentalObserver()
  const turn = (s: SeasonState, pyramid: string) => {
    observer.before(s, pyramid)
    const turned = advanceSeason(s, { createYouth, pyramid })
    observer.after(turned.state, pyramid)
    return turned
  }
  advanceUntil(state, `${world.startYear + years}-06-30`, { market: true, turn })
  return run
}

if (process.argv[1]?.includes('continentalRun')) {
  const args = process.argv.slice(2)
  const opt = (name: string, fallback: string) => (args.includes(`--${name}`) ? (args[args.indexOf(`--${name}`) + 1] as string) : fallback)
  const years = Number(opt('years', '10'))
  const run = simulateContinental(years, Number(opt('seed', '7')), opt('focus', 'Brazil'))
  const cups = [...new Set(run.editions.map((e) => e.cup))]
  for (const cup of cups) {
    const list = run.editions.filter((e) => e.cup === cup).sort((a, b) => a.year - b.year)
    const titles = new Map<string, number>()
    for (const e of list) titles.set(e.winnerId, (titles.get(e.winnerId) ?? 0) + 1)
    const byCountry = new Map<string, number>()
    for (const e of list) byCountry.set(e.winnerPyramid, (byCountry.get(e.winnerPyramid) ?? 0) + 1)
    const byContinent = new Map<string, number>()
    for (const e of list) byContinent.set(e.winnerContinent, (byContinent.get(e.winnerContinent) ?? 0) + 1)
    console.log(`${cup}: por continente ${[...byContinent].map(([k, v]) => `${k} ${v}`).join(', ')}`)
    console.log(`${cup}: ${list.length} edições, ${titles.size} campeões diferentes, máximo ${Math.max(...titles.values())} títulos, seguidos: ${list.reduce((best, e, i) => (i > 0 && list[i - 1]!.winnerId === e.winnerId ? best + 1 : best), 0)} repetições em sequência; por país: ${[...byCountry].map(([k, v]) => `${k} ${v}`).join(', ')}`)
  }
  const shares = run.money.filter((m) => m.continental > 0).map((m) => m.continental / Math.max(1, m.revenue))
  const sorted = [...shares].sort((a, b) => a - b)
  const mean = shares.reduce((a, b) => a + b, 0) / (shares.length || 1)
  console.log(`dinheiro continental / receita (clubes que jogaram): média ${(100 * mean).toFixed(1)}%, mediana ${(100 * (sorted[Math.floor(sorted.length / 2)] ?? 0)).toFixed(1)}%, máximo ${(100 * (sorted[sorted.length - 1] ?? 0)).toFixed(1)}% (${shares.length} clube-temporadas)`)
  const dependent = run.money.map((m) => ({ ...m, share: (m.continental + m.world) / Math.max(1, m.revenue) })).sort((a, b) => b.share - a.share).slice(0, 8)
  console.log(`maiores dependências das copas (clube, ano, país, reputação, continental+mundial/receita): ${dependent.map((m) => `${m.teamId.replace('team-', '')} ${m.year} ${m.pyramid} rep${m.reputation} ${(m.continental / 1e6).toFixed(1)}M+${(m.world / 1e6).toFixed(1)}M/${(m.revenue / 1e6).toFixed(0)}M=${(100 * m.share).toFixed(0)}%`).join('; ')}`)
  const worldShares = run.money.filter((m) => m.world > 0).map((m) => m.world / Math.max(1, m.revenue))
  if (worldShares.length > 0) console.log(`dinheiro das copas mundiais / receita (clubes que jogaram): média ${((100 * worldShares.reduce((a, b) => a + b, 0)) / worldShares.length).toFixed(1)}%, máximo ${(100 * Math.max(...worldShares)).toFixed(1)}% (${worldShares.length} clube-temporadas)`)
  const deltas = run.reputationAfter.map((r) => r.after - r.before)
  console.log(`reputação do campeão continental na virada: ${(deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1)).toFixed(2)} (${deltas.length} títulos)`)
  if (process.env.DUMP) {
    writeFileSync(process.env.DUMP, JSON.stringify(run.money))
  }
  const counts = [...run.clubsInContinental.values()]
  console.log(`clubes que jogaram alguma copa continental: ${counts.length}; mais vezes: ${Math.max(...counts)} edições`)
}
