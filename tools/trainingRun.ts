/**
 * Experimento de intensidade de treino: times da IA treinam sempre Leve, Normal ou Intensa durante várias
 * temporadas seguidas (com mercado e virada), distribuídos em zigue-zague por força dentro de cada série para os
 * grupos começarem parecidos. Mede pontos, evolução da força, lesões e condição. Usado por
 * `npm run analyze -- training` e pelo teste de balanceamento.
 */
import { createYouth } from '../src/data/generateYouth'
import { generateWorld } from '../src/data/generateWorld'
import { advanceSeason } from '../src/engine/offseason'
import { playerOverall } from '../src/engine/overall'
import { advanceToNextEvent, computeStandings, createSeason, nextEvent } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { TRAINING_INTENSITIES } from '../src/engine/types'
import type { Player, TeamId, TrainingIntensity } from '../src/engine/types'

export interface IntensityStats {
  intensity: TrainingIntensity
  teamSeasons: number
  /** Pontos por temporada acima (ou abaixo) da média da série. */
  relativePoints: number
  /** Desvio padrão dos pontos relativos (para estimar o erro da média). */
  pointsSd: number
  /** Força média dos 11 melhores do elenco: mudança entre o começo da primeira e o começo da última temporada, por ano. */
  strengthPerYear: number
  /** Evolução dos jogadores de até 23 anos do grupo em uma temporada (pontos de força, do começo ao fim, antes da virada). */
  youngGrowth: number
  /** Média de jogadores machucados por time ao longo da temporada. */
  injured: number
  /** Condição física média do elenco ao longo da temporada. */
  fitness: number
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)
const sd = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/** Força média dos 11 melhores jogadores (sem olhar posição) do elenco. */
function topEleven(players: readonly Player[], teamId: TeamId): number {
  return mean(
    players
      .filter((p) => p.teamId === teamId)
      .map(playerOverall)
      .sort((a, b) => b - a)
      .slice(0, 11),
  )
}

/** Divide os times de cada série em zigue-zague (por força) entre as intensidades: Leve, Normal, Intensa, Intensa, Normal, Leve... */
function assign(state: SeasonState, intensities: readonly TrainingIntensity[]): Map<TeamId, TrainingIntensity> {
  const groups = new Map<TeamId, TrainingIntensity>()
  for (const tier of [1, 2]) {
    const teams = state.teams.filter((t) => t.tier === tier).sort((a, b) => topEleven(state.players, b.id) - topEleven(state.players, a.id))
    teams.forEach((t, i) => {
      const round = Math.floor(i / intensities.length)
      const k = i % intensities.length
      const intensity = intensities[round % 2 === 0 ? k : intensities.length - 1 - k]
      if (i < Math.floor(teams.length / intensities.length) * intensities.length && intensity) groups.set(t.id, intensity)
    })
  }
  return groups
}

export function simulateTrainingExperiment(options: { seeds: number[]; years: number; intensities?: readonly TrainingIntensity[] }): IntensityStats[] {
  const intensities = options.intensities ?? TRAINING_INTENSITIES
  const points = new Map<TrainingIntensity, number[]>(intensities.map((i) => [i, []]))
  const injured = new Map<TrainingIntensity, number[]>(intensities.map((i) => [i, []]))
  const fitness = new Map<TrainingIntensity, number[]>(intensities.map((i) => [i, []]))
  const strengthStart = new Map<TrainingIntensity, number[]>(intensities.map((i) => [i, []]))
  const growth = new Map<TrainingIntensity, number[]>(intensities.map((i) => [i, []]))
  const strengthEnd = new Map<TrainingIntensity, number[]>(intensities.map((i) => [i, []]))

  for (const seed of options.seeds) {
    const world = generateWorld({ seed })
    let state = createSeason({ year: world.startYear, seed: `train-${seed}`, teams: world.teams, players: world.players, academy: world.academy })
    const groups = assign(state, intensities)
    const plans = Object.fromEntries([...groups].map(([teamId, intensity]) => [teamId, { intensity, focus: 'balanced' as const }]))
    state = { ...state, training: { ...state.training, plans } }

    for (let year = 0; year < options.years; year++) {
      const start = new Map([...groups.keys()].map((id) => [id, topEleven(state.players, id)]))
      if (year === 0) for (const [id, intensity] of groups) strengthStart.get(intensity)?.push(start.get(id) ?? 0)
      const youth = state.players.filter((p) => p.teamId !== null && groups.has(p.teamId) && p.age <= 23).map((p) => ({ id: p.id, intensity: groups.get(p.teamId as TeamId) as TrainingIntensity, overall: playerOverall(p) }))
      const samples = new Map<TeamId, { injured: number[]; fitness: number[] }>([...groups.keys()].map((id) => [id, { injured: [], fitness: [] }]))
      while (nextEvent(state).type === 'matchday') {
        state = advanceToNextEvent(state, { market: true }).state
        for (const id of groups.keys()) {
          const squad = state.players.filter((p) => p.teamId === id)
          samples.get(id)?.injured.push(squad.filter((p) => p.condition.injuryDaysLeft > 0).length)
          samples.get(id)?.fitness.push(mean(squad.map((p) => p.condition.fitness)))
        }
      }
      state = advanceToNextEvent(state, { market: true }).state
      const byId = new Map(state.players.map((p) => [p.id, p]))
      for (const y of youth) {
        const now = byId.get(y.id)
        if (now) growth.get(y.intensity)?.push(playerOverall(now) - y.overall)
      }
      for (const competition of state.season.competitions) {
        const rows = computeStandings(competition.teamIds, state.matches.filter((m) => m.competitionId === competition.id))
        const tierMean = mean(rows.map((r) => r.points))
        for (const r of rows) {
          const intensity = groups.get(r.teamId)
          if (!intensity) continue
          points.get(intensity)?.push(r.points - tierMean)
          injured.get(intensity)?.push(mean(samples.get(r.teamId)?.injured ?? []))
          fitness.get(intensity)?.push(mean(samples.get(r.teamId)?.fitness ?? []))
        }
      }
      if (year === options.years - 1) {
        const turned = advanceSeason(state, { createYouth })
        for (const [id, intensity] of groups) strengthEnd.get(intensity)?.push(topEleven(turned.state.players, id))
        break
      }
      state = advanceSeason(state, { createYouth }).state
    }
  }

  return intensities.map((intensity) => ({
    intensity,
    teamSeasons: points.get(intensity)?.length ?? 0,
    relativePoints: mean(points.get(intensity) ?? []),
    pointsSd: sd(points.get(intensity) ?? []),
    youngGrowth: mean(growth.get(intensity) ?? []),
    strengthPerYear: (mean(strengthEnd.get(intensity) ?? []) - mean(strengthStart.get(intensity) ?? [])) / options.years,
    injured: mean(injured.get(intensity) ?? []),
    fitness: mean(fitness.get(intensity) ?? []),
  }))
}

export function formatTraining(rows: IntensityStats[]): string {
  return [
    'intensidade  times×anos  pontos (vs média)  jovens/temp.  força/ano  machucados  condição',
    ...rows.map((r) =>
      [
        r.intensity.padEnd(11),
        String(r.teamSeasons).padStart(10),
        `${r.relativePoints >= 0 ? '+' : ''}${r.relativePoints.toFixed(2)} ±${(r.pointsSd / Math.sqrt(Math.max(1, r.teamSeasons))).toFixed(2)}`.padStart(19),
        `${r.youngGrowth >= 0 ? '+' : ''}${r.youngGrowth.toFixed(2)}`.padStart(12),
        `${r.strengthPerYear >= 0 ? '+' : ''}${r.strengthPerYear.toFixed(2)}`.padStart(10),
        r.injured.toFixed(2).padStart(11),
        r.fitness.toFixed(1).padStart(9),
      ].join(' '),
    ),
  ].join('\n')
}
