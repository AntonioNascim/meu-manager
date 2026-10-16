/**
 * Medições para calibrar e conferir a partida simplificada (`engine/match/quick.ts`) contra o motor completo:
 * as mesmas duplas de times, jogadas pelos dois, e um resumo comparável (placar, estatísticas, eventos por posição, notas, condição).
 */
import type { World } from '../src/data/generateWorld'
import { matchAttendance } from '../src/engine/finance'
import { quickLines, simulateMatch, simulateQuick } from '../src/engine/match'
import { playerOverall } from '../src/engine/overall'
import { createRng } from '../src/engine/rng'
import { POSITIONS } from '../src/engine/types'
import type { MatchResult, Player, Team } from '../src/engine/types'

export interface Sample {
  home: Team
  away: Team
  homePlayers: Player[]
  awayPlayers: Player[]
  /** Linhas das duas escalações simplificadas (goleiro, defesa, meio, ataque). */
  homeLines: number[]
  awayLines: number[]
  /** Média dos titulares da tática do time (mede a "força" do time). */
  homeStrength: number
  awayStrength: number
  fill: number
  full: MatchResult
  quick: MatchResult
}

const strengthOf = (team: Team, players: readonly Player[]) => {
  const byId = new Map(players.map((p) => [p.id, p]))
  return team.tactic.startingXI.reduce((s, id) => s + playerOverall(byId.get(id) as Player), 0) / 11
}

/** `n` duplas sorteadas da mesma série de cada mundo, jogadas pelo motor completo e pelo simplificado. */
export function collectSamples(worlds: readonly World[], n: number, label: string, tiers: readonly number[] = [1, 2, 3]): Sample[] {
  const out: Sample[] = []
  for (const [w, world] of worlds.entries()) {
    const rng = createRng(`${label}:${w}`)
    const squads = new Map<string, Player[]>(world.teams.map((t) => [t.id, []]))
    for (const p of world.players) if (p.teamId) squads.get(p.teamId)?.push(p)
    for (let i = 0; i < n; i++) {
      const tier = tiers[i % tiers.length] as number
      const teams = world.teams.filter((t) => t.tier === tier)
      const home = rng.pick(teams)
      let away = rng.pick(teams)
      while (away === home) away = rng.pick(teams)
      const homePlayers = squads.get(home.id) as Player[]
      const awayPlayers = squads.get(away.id) as Player[]
      const attendance = matchAttendance(home, away)
      const seed = rng.int(0, 2 ** 31 - 1)
      const full = simulateMatch({ home: { team: home, players: homePlayers }, away: { team: away, players: awayPlayers }, seed, attendance })
      const quick = simulateQuick({ home: { team: home, players: homePlayers }, away: { team: away, players: awayPlayers }, seed, attendance, capacity: home.stadium.capacity })
      out.push({
        home,
        away,
        homePlayers,
        awayPlayers,
        homeLines: quickLines(homePlayers, home.tactic.formationId),
        awayLines: quickLines(awayPlayers, away.tactic.formationId),
        homeStrength: strengthOf(home, homePlayers),
        awayStrength: strengthOf(away, awayPlayers),
        fill: Math.min(1, attendance / home.stadium.capacity),
        full,
        quick,
      })
    }
  }
  return out
}

// --- Ajuste do número esperado de gols (regressão de Poisson com log, mínimos quadrados reponderados) ---

function solve(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i] as number])
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs((m[r] as number[])[c] as number) > Math.abs((m[pivot] as number[])[c] as number)) pivot = r
    ;[m[c], m[pivot]] = [m[pivot] as number[], m[c] as number[]]
    const row = m[c] as number[]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const target = m[r] as number[]
      const factor = (target[c] as number) / (row[c] as number)
      for (let k = c; k <= n; k++) target[k] = (target[k] as number) - factor * (row[k] as number)
    }
  }
  return m.map((row, i) => (row[n] as number) / (row[i] as number))
}

export interface GoalFit {
  intercept: number
  own: number[]
  opponent: number[]
  home: number
  occupancy: number
  level: number[]
  homeLevel: number
}

/** Coeficientes de `QUICK.goals` que melhor explicam os gols do motor completo. */
export function fitGoals(samples: readonly Sample[], reference: number, ridge = 0.5): GoalFit {
  const rows: { x: number[]; y: number }[] = []
  for (const s of samples) {
    const line = (l: number[]) => l.map((v) => v - reference)
    const level = (s.homeLines.reduce((a, b) => a + b, 0) + s.awayLines.reduce((a, b) => a + b, 0)) / 8 - reference
    rows.push({ x: [1, ...line(s.homeLines), ...line(s.awayLines), 1, s.fill - 0.5, level / 10, (level / 10) ** 2, level / 10], y: s.full.homeGoals })
    rows.push({ x: [1, ...line(s.awayLines), ...line(s.homeLines), 0, 0, level / 10, (level / 10) ** 2, 0], y: s.full.awayGoals })
  }
  const k = rows[0]?.x.length as number
  let beta = new Array<number>(k).fill(0)
  beta[0] = Math.log(1.2)
  for (let iter = 0; iter < 30; iter++) {
    const xtwx = Array.from({ length: k }, () => new Array<number>(k).fill(0))
    const xtz = new Array<number>(k).fill(0)
    for (const r of rows) {
      const eta = r.x.reduce((sum, v, i) => sum + v * (beta[i] as number), 0)
      const mu = Math.exp(eta)
      const z = eta + (r.y - mu) / mu
      for (let i = 0; i < k; i++) {
        xtz[i] = (xtz[i] as number) + (r.x[i] as number) * mu * z
        for (let j = 0; j < k; j++) (xtwx[i] as number[])[j] = ((xtwx[i] as number[])[j] as number) + (r.x[i] as number) * (r.x[j] as number) * mu
      }
    }
    // Um pouco de regularização afasta coeficientes instáveis (as linhas andam juntas) sem enviesar o intercepto.
    for (let i = 1; i < k; i++) (xtwx[i] as number[])[i] = ((xtwx[i] as number[])[i] as number) + ridge * rows.length * 0.0005
    beta = solve(xtwx, xtz)
  }
  const b = (i: number) => Math.round((beta[i] as number) * 10000) / 10000
  return { intercept: b(0), own: [1, 2, 3, 4].map(b), opponent: [5, 6, 7, 8].map(b), home: b(9), occupancy: b(10), level: [b(11), b(12)], homeLevel: b(13) }
}

// --- Resumo comparável ---

export interface Summary {
  matches: number
  goals: number
  homeWin: number
  draw: number
  awayWin: number
  /** Desvio padrão do total de gols por jogo (dispersão). */
  goalsSd: number
  shots: number
  yellows: number
  reds: number
  ownGoals: number
  /** Parte dos gols por linha de quem marcou (goleiro, defesa, meio, ataque). */
  goalShare: number[]
  assistShare: number[]
  assistPerGoal: number
  crossShare: number
  injuriesPerMatch: number
  injuryDays: number
  subsPerTeam: number
  /** Condição perdida por jogador que jogou 90 minutos, por resistência (<55, 55–70, >70). */
  fitnessDrop: number[]
  /** Nota média e desvio por linha. */
  ratingMean: number[]
  ratingSd: number[]
  /** Nota média de quem jogou 90 minutos por faixa de força (<55, 55–65, >65). */
  ratingByStrength: number[]
  /** Chance do time de maior força vencer e média de pontos dele, por diferença de força (<2, 2–5, >5). */
  strongerWin: number[]
  strongerPoints: number[]
  strongerGoalDiff: number[]
  /** Proporção das partidas de cada faixa de diferença. */
  gapShare: number[]
}

const GROUP: Record<string, number> = { GK: 0, RB: 1, LB: 1, CB: 1, DM: 2, CM: 2, AM: 2, RW: 3, LW: 3, ST: 3 }
const bump = (xs: number[], i: number, by = 1) => {
  xs[i] = (xs[i] ?? 0) + by
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const sd = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

export function summarizeSamples(samples: readonly Sample[], which: 'full' | 'quick'): Summary {
  const results = samples.map((s) => s[which])
  const n = results.length
  const totalGoals = results.map((r) => r.homeGoals + r.awayGoals)
  const goalShare = new Array<number>(10).fill(0)
  const assistShare = new Array<number>(10).fill(0)
  let goalsWithEvents = 0
  let assisted = 0
  let crosses = 0
  let ownGoals = 0
  let injuries = 0
  let injuryDays = 0
  let playerRows = 0
  const drop: number[][] = [[], [], []]
  const rating: number[][] = [[], [], [], []]
  const ratingStrength: number[][] = [[], [], []]
  for (const [index, r] of results.entries()) {
    // Os ids de jogador se repetem de um mundo para outro: cada partida procura nos elencos dela.
    const sample = samples[index] as Sample
    const byId = new Map<string, Player>()
    for (const p of [...sample.homePlayers, ...sample.awayPlayers]) byId.set(p.id, p)
    for (const e of r.events) {
      if (e.type === 'goal') {
        goalsWithEvents++
        bump(goalShare, POSITIONS.indexOf((byId.get(e.playerId) as Player).position))
        if (e.relatedPlayerId) {
          assisted++
          bump(assistShare, POSITIONS.indexOf((byId.get(e.relatedPlayerId) as Player).position))
          if (e.assistKind === 'cross') crosses++
        }
      } else if (e.type === 'own-goal') ownGoals++
    }
    for (const pr of r.playerResults) {
      const p = byId.get(pr.playerId) as Player
      playerRows++
      if (pr.injuryDays) {
        injuries++
        injuryDays += pr.injuryDays
      }
      if (pr.minutesPlayed >= 90) {
        const stamina = p.attributes.stamina
        drop[stamina < 55 ? 0 : stamina <= 70 ? 1 : 2]?.push(p.condition.fitness - pr.finalFitness)
        const strength = playerOverall(p)
        ratingStrength[strength < 55 ? 0 : strength <= 65 ? 1 : 2]?.push(pr.rating)
      }
      if (pr.minutesPlayed >= 20) rating[GROUP[p.position] as number]?.push(pr.rating)
    }
  }
  const gaps = [0, 0, 0]
  const strongWins = [0, 0, 0]
  const strongPoints = [0, 0, 0]
  const strongDiff = [0, 0, 0]
  for (const s of samples) {
    const r = s[which]
    const homeStronger = s.homeStrength >= s.awayStrength
    const gap = Math.abs(s.homeStrength - s.awayStrength)
    const band = gap < 2 ? 0 : gap <= 5 ? 1 : 2
    const strongGoals = homeStronger ? r.homeGoals : r.awayGoals
    const weakGoals = homeStronger ? r.awayGoals : r.homeGoals
    bump(gaps, band)
    bump(strongDiff, band, strongGoals - weakGoals)
    if (strongGoals > weakGoals) bump(strongWins, band)
    bump(strongPoints, band, strongGoals > weakGoals ? 3 : strongGoals === weakGoals ? 1 : 0)
  }
  return {
    matches: n,
    goals: mean(totalGoals),
    homeWin: results.filter((r) => r.homeGoals > r.awayGoals).length / n,
    draw: results.filter((r) => r.homeGoals === r.awayGoals).length / n,
    awayWin: results.filter((r) => r.homeGoals < r.awayGoals).length / n,
    goalsSd: sd(totalGoals),
    shots: mean(results.flatMap((r) => [r.homeStats.shots, r.awayStats.shots])),
    yellows: mean(results.map((r) => r.homeStats.yellowCards + r.awayStats.yellowCards)),
    reds: mean(results.map((r) => r.homeStats.redCards + r.awayStats.redCards)),
    ownGoals: ownGoals / n,
    goalShare: goalShare.map((g) => g / (goalsWithEvents || 1)),
    assistShare: assistShare.map((g) => g / (assisted || 1)),
    assistPerGoal: assisted / (goalsWithEvents || 1),
    crossShare: crosses / (assisted || 1),
    injuriesPerMatch: injuries / n,
    injuryDays: injuryDays / (injuries || 1),
    subsPerTeam: (playerRows - n * 22) / (n * 2),
    fitnessDrop: drop.map(mean),
    ratingMean: rating.map(mean),
    ratingSd: rating.map(sd),
    ratingByStrength: ratingStrength.map(mean),
    strongerWin: strongWins.map((w, i) => w / (gaps[i] || 1)),
    strongerPoints: strongPoints.map((w, i) => w / (gaps[i] || 1)),
    strongerGoalDiff: strongDiff.map((w, i) => w / (gaps[i] || 1)),
    gapShare: gaps.map((g) => g / n),
  }
}
