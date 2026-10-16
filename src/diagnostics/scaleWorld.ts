/**
 * Mundo de teste do tamanho do plano (Brasil A/B/C, seis ligas da América do Sul, seis da Europa: 282 clubes),
 * montado com a mesma geração do jogo. Serve só para medir desempenho (tela `?diagnostico=1` e `tools/worldScale.ts`);
 * não é um mundo jogável. O motor aceita várias competições em `createSeason`, então este mundo é jogado pelo mesmo
 * caminho do jogo (`advanceToMatchday` + `playPendingAuto`).
 */
import { createAcademy } from '../data/generateAcademy'
import { createGenerationContext, generateTeam } from '../data/generateTeam'
import type { TeamDefinition } from '../data/teamDefinitions'
import { createRng } from '../engine/rng'
import { createSeason } from '../engine/season'
import type { CompetitionSetup, SeasonState } from '../engine/season'
import { DEFAULT_PLAN } from '../engine/training'
import { emptyTraining } from '../engine/types'
import type { Player, Team } from '../engine/types'
import type { Game } from '../store/game'

export interface LeagueSpec {
  id: string
  name: string
  region: 'BR' | 'SA' | 'EU'
  teams: number
  format: 'double' | 'single'
  tier: 1 | 2 | 3
  /** Reputação do primeiro e do último colocado por reputação (1 a 20). */
  repTop: number
  repBottom: number
}

export const FULL_WORLD: LeagueSpec[] = [
  { id: 'br-1', name: 'Brasil A', region: 'BR', teams: 20, format: 'double', tier: 1, repTop: 19, repBottom: 7 },
  { id: 'br-2', name: 'Brasil B', region: 'BR', teams: 20, format: 'double', tier: 2, repTop: 8, repBottom: 3 },
  { id: 'br-3', name: 'Brasil C', region: 'BR', teams: 20, format: 'double', tier: 3, repTop: 6, repBottom: 2 },
  { id: 'ar-1', name: 'Argentina', region: 'SA', teams: 28, format: 'single', tier: 1, repTop: 16, repBottom: 5 },
  { id: 'uy-1', name: 'Uruguai', region: 'SA', teams: 16, format: 'double', tier: 1, repTop: 11, repBottom: 3 },
  { id: 'py-1', name: 'Paraguai', region: 'SA', teams: 12, format: 'double', tier: 1, repTop: 10, repBottom: 3 },
  { id: 'cl-1', name: 'Chile', region: 'SA', teams: 16, format: 'double', tier: 1, repTop: 11, repBottom: 3 },
  { id: 'co-1', name: 'Colômbia', region: 'SA', teams: 20, format: 'double', tier: 1, repTop: 12, repBottom: 3 },
  { id: 'ec-1', name: 'Equador', region: 'SA', teams: 16, format: 'double', tier: 1, repTop: 10, repBottom: 3 },
  { id: 'en-1', name: 'Inglaterra', region: 'EU', teams: 20, format: 'double', tier: 1, repTop: 20, repBottom: 9 },
  { id: 'es-1', name: 'Espanha', region: 'EU', teams: 20, format: 'double', tier: 1, repTop: 20, repBottom: 8 },
  { id: 'it-1', name: 'Itália', region: 'EU', teams: 20, format: 'double', tier: 1, repTop: 19, repBottom: 7 },
  { id: 'de-1', name: 'Alemanha', region: 'EU', teams: 18, format: 'double', tier: 1, repTop: 19, repBottom: 7 },
  { id: 'fr-1', name: 'França', region: 'EU', teams: 18, format: 'double', tier: 1, repTop: 17, repBottom: 6 },
  { id: 'pt-1', name: 'Portugal', region: 'EU', teams: 18, format: 'double', tier: 1, repTop: 15, repBottom: 4 },
]

/** A pirâmide de um país: o prefixo do id da liga (`br-1`, `br-2` e `br-3` são o Brasil). */
export const pyramidOfLeague = (spec: Pick<LeagueSpec, 'id'>): string => spec.id.split('-')[0] as string

export const BRAZIL_ONLY: LeagueSpec[] = FULL_WORLD.filter((l) => l.region === 'BR')

export function buildScaleWorld(specs: LeagueSpec[], seed: number) {
  const ctx = createGenerationContext(2026)
  const rng = createRng(seed)
  const teams: Team[] = []
  const players: Player[] = []
  const competitions: CompetitionSetup[] = []
  specs.forEach((spec, li) => {
    const inLeague: Team[] = []
    for (let i = 0; i < spec.teams; i++) {
      const reputation = Math.max(1, Math.round(spec.repTop - ((spec.repTop - spec.repBottom) * i) / (spec.teams - 1)))
      const abbreviation = `${li.toString(36)}${String(i + 1).padStart(2, '0')}`
      const def: TeamDefinition = { name: `${spec.name} ${i + 1}`, abbreviation, city: spec.name, state: 'XX', colors: ['#111111', '#f2f2f2'], tier: spec.tier, reputation }
      const made = generateTeam(rng.fork(abbreviation), ctx, def, i + 1)
      inLeague.push(made.team)
      teams.push(made.team)
      players.push(...made.players)
    }
    competitions.push({ id: spec.id, name: spec.name, tier: spec.tier, teams: inLeague, region: spec.region, rounds: spec.format === 'single' ? 1 : 2, pyramid: pyramidOfLeague(spec) })
  })
  const academy = createAcademy({ teams, seed, year: 2026, firstNumber: ctx.nextPlayerNumber, takenNames: players.map((p) => p.name) })
  return { teams, players, academy, competitions }
}

/** `focus`: só a pirâmide do técnico é lance a lance e as outras ligas usam o resultado simplificado; sem ele, todas são lance a lance. */
export function buildScaleGame(specs: LeagueSpec[], seed: number, options: { focus?: boolean } = {}): { game: Game; genMs: number; seasonMs: number } {
  let t = performance.now()
  const w = buildScaleWorld(specs, seed)
  const genMs = performance.now() - t
  const userTeamId = (w.competitions[0]?.teams[7] as Team).id
  t = performance.now()
  let season: SeasonState = createSeason({ year: 2026, seed, teams: w.teams, players: w.players, academy: w.academy, training: { ...emptyTraining(), plans: { [userTeamId]: DEFAULT_PLAN } }, competitions: w.competitions, ...(options.focus ? { focus: pyramidOfLeague(specs[0] as LeagueSpec) } : {}) })
  const seasonMs = performance.now() - t
  // A diretoria não demite: o objetivo é medir custo, não desempenho.
  season = { ...season, teams: season.teams.map((tm) => (tm.id === userTeamId ? { ...tm, objective: { targetPosition: 20, sackingPosition: 20 } } : tm)) }
  const game: Game = { seed, userTeamId, season, lastDay: [], notices: [], seasonLog: [], archive: [] }
  return { game, genMs, seasonMs }
}
