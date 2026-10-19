/**
 * Mundo de teste do tamanho do plano (Brasil A/B/C, seis ligas da América do Sul, sete da Europa, México e Estados Unidos e uma liga de elite
 * da África, da Ásia e da Oceania: 358 clubes em 21 ligas), montado com a mesma geração do jogo. As três ligas de elite são o jeito leve de
 * manter vivos os clubes mais fortes desses continentes (as copas mundiais precisam deles): uma divisão pequena, sem acesso nem rebaixamento. Serve só para medir desempenho (tela `?diagnostico=1` e `tools/worldScale.ts`);
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
import type { CupSpec, LeagueEconomy, Nationality, Player, Region, Team } from '../engine/types'
import type { Game } from '../store/game'

export interface LeagueSpec {
  id: string
  name: string
  region: Region
  /** Nome da liga no pacote de exemplo (padrão: "Liga" e o nome do país). */
  leagueName?: string
  teams: number
  format: 'double' | 'single'
  tier: 1 | 2 | 3
  /** Reputação do primeiro e do último colocado por reputação (1 a 20). */
  repTop: number
  repBottom: number
  /** Forma da escada de reputação: 1 = reta; acima de 1 os primeiros ficam juntos no alto e o meio cai (poucos clubes grandes, como nas ligas pequenas e nas europeias). */
  repCurve?: number
  /** Economia da liga (índice de receita e nível dos jogadores em relação ao Brasil); sem ela, a do Brasil. */
  economy?: LeagueEconomy
}

export const FULL_WORLD: LeagueSpec[] = [
  { id: 'br-1', name: 'Brasil A', region: 'BR', teams: 20, format: 'double', tier: 1, repTop: 19, repBottom: 7 },
  { id: 'br-2', name: 'Brasil B', region: 'BR', teams: 20, format: 'double', tier: 2, repTop: 8, repBottom: 3 },
  { id: 'br-3', name: 'Brasil C', region: 'BR', teams: 20, format: 'double', tier: 3, repTop: 6, repBottom: 2 },
  { id: 'ar-1', name: 'Argentina', region: 'SA', teams: 28, format: 'single', tier: 1, repTop: 16, repBottom: 5, economy: { revenue: 0.6, level: -1 } },
  { id: 'uy-1', name: 'Uruguai', region: 'SA', teams: 16, format: 'double', tier: 1, repTop: 11, repBottom: 3, repCurve: 1.5, economy: { revenue: 0.3, level: -4 } },
  { id: 'py-1', name: 'Paraguai', region: 'SA', teams: 12, format: 'double', tier: 1, repTop: 10, repBottom: 3, repCurve: 1.5, economy: { revenue: 0.25, level: -5 } },
  { id: 'cl-1', name: 'Chile', region: 'SA', teams: 16, format: 'double', tier: 1, repTop: 11, repBottom: 3, repCurve: 1.5, economy: { revenue: 0.4, level: -3 } },
  { id: 'co-1', name: 'Colômbia', region: 'SA', teams: 20, format: 'double', tier: 1, repTop: 12, repBottom: 3, repCurve: 1.3, economy: { revenue: 0.45, level: -2 } },
  { id: 'ec-1', name: 'Equador', region: 'SA', teams: 16, format: 'double', tier: 1, repTop: 10, repBottom: 3, repCurve: 1.5, economy: { revenue: 0.3, level: -4 } },
  { id: 'en-1', name: 'Inglaterra', region: 'EU', teams: 20, format: 'double', tier: 1, repTop: 20, repBottom: 8, repCurve: 1.7, economy: { revenue: 3.6, level: 7 } },
  { id: 'es-1', name: 'Espanha', region: 'EU', teams: 20, format: 'double', tier: 1, repTop: 20, repBottom: 8, repCurve: 2, economy: { revenue: 3.4, level: 7.4 } },
  { id: 'it-1', name: 'Itália', region: 'EU', teams: 20, format: 'double', tier: 1, repTop: 19, repBottom: 7, repCurve: 1.7, economy: { revenue: 2.9, level: 6.6 } },
  { id: 'de-1', name: 'Alemanha', region: 'EU', teams: 18, format: 'double', tier: 1, repTop: 19, repBottom: 7, repCurve: 1.7, economy: { revenue: 2.6, level: 5.8 } },
  { id: 'fr-1', name: 'França', region: 'EU', teams: 18, format: 'double', tier: 1, repTop: 17, repBottom: 6, repCurve: 1.7, economy: { revenue: 1.8, level: 3.5 } },
  { id: 'pt-1', name: 'Portugal', region: 'EU', teams: 18, format: 'double', tier: 1, repTop: 15, repBottom: 4, repCurve: 1.7, economy: { revenue: 0.9, level: 2 } },
  { id: 'nl-1', name: 'Países Baixos', region: 'EU', teams: 18, format: 'double', tier: 1, repTop: 15, repBottom: 4, repCurve: 1.7, economy: { revenue: 1.2, level: 2.6 } },
  { id: 'mx-1', name: 'México', region: 'NA', teams: 18, format: 'double', tier: 1, repTop: 15, repBottom: 4, repCurve: 1.4, economy: { revenue: 1, level: 0 } },
  { id: 'us-1', name: 'Estados Unidos', region: 'NA', teams: 20, format: 'single', tier: 1, repTop: 13, repBottom: 3, repCurve: 1.5, economy: { revenue: 0.9, level: -2 } },
  // Ligas de elite: só os clubes mais fortes do continente, para as copas mundiais (África, Ásia e Oceania não têm ligas completas).
  { id: 'af-1', name: 'Elite da África', leagueName: 'Elite da África', region: 'AF', teams: 8, format: 'double', tier: 1, repTop: 13, repBottom: 6, repCurve: 1.3, economy: { revenue: 0.35, level: -3.5 } },
  { id: 'as-1', name: 'Elite da Ásia', leagueName: 'Elite da Ásia', region: 'AS', teams: 8, format: 'double', tier: 1, repTop: 14, repBottom: 6, repCurve: 1.3, economy: { revenue: 0.7, level: -1.5 } },
  { id: 'oc-1', name: 'Elite da Oceania', leagueName: 'Elite da Oceania', region: 'OC', teams: 4, format: 'double', tier: 1, repTop: 10, repBottom: 6, economy: { revenue: 0.3, level: -4 } },
]

/** País de cada pirâmide do mundo de teste (o prefixo do id da liga). */
export const COUNTRY_OF_PYRAMID: Record<string, Nationality> = { br: 'Brazil', ar: 'Argentina', uy: 'Uruguay', py: 'Paraguay', cl: 'Chile', co: 'Colombia', ec: 'Ecuador', en: 'England', es: 'Spain', it: 'Italy', de: 'Germany', fr: 'France', pt: 'Portugal', nl: 'Netherlands', mx: 'Mexico', us: 'United States', af: 'Egypt', as: 'Japan', oc: 'Australia' }

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
      const reputation = Math.max(1, Math.round(spec.repBottom + (spec.repTop - spec.repBottom) * (1 - i / (spec.teams - 1)) ** (spec.repCurve ?? 1)))
      const abbreviation = `${li.toString(36)}${String(i + 1).padStart(2, '0')}`
      const def: TeamDefinition = { name: `${spec.name} ${i + 1}`, abbreviation, city: spec.name, state: 'XX', colors: ['#111111', '#f2f2f2'], tier: spec.tier, reputation, ...(spec.economy ? { economy: spec.economy } : {}) }
      const made = generateTeam(rng.fork(abbreviation), ctx, def, i + 1)
      inLeague.push(made.team)
      teams.push(made.team)
      players.push(...made.players)
    }
    competitions.push({ id: spec.id, name: spec.name, tier: spec.tier, teams: inLeague, region: spec.region, rounds: spec.format === 'single' ? 1 : 2, pyramid: pyramidOfLeague(spec), ...(COUNTRY_OF_PYRAMID[pyramidOfLeague(spec)] && COUNTRY_OF_PYRAMID[pyramidOfLeague(spec)] !== 'Brazil' ? { country: COUNTRY_OF_PYRAMID[pyramidOfLeague(spec)] } : {}), ...(spec.economy ? { economy: spec.economy, reputationMean: Math.round((inLeague.reduce((sum, t) => sum + t.reputation, 0) / inLeague.length) * 10) / 10 } : {}) })
  })
  const academy = createAcademy({ teams, seed, year: 2026, firstNumber: ctx.nextPlayerNumber, takenNames: players.map((p) => p.name) })
  return { teams, players, academy, competitions }
}

/** `focus`: só a pirâmide do técnico é lance a lance e as outras ligas usam o resultado simplificado; sem ele, todas são lance a lance. */
export function buildScaleGame(specs: LeagueSpec[], seed: number, options: { focus?: boolean; cupSpecs?: CupSpec[] } = {}): { game: Game; genMs: number; seasonMs: number } {
  let t = performance.now()
  const w = buildScaleWorld(specs, seed)
  const genMs = performance.now() - t
  const userTeamId = (w.competitions[0]?.teams[7] as Team).id
  t = performance.now()
  let season: SeasonState = createSeason({ year: 2026, seed, teams: w.teams, players: w.players, academy: w.academy, training: { ...emptyTraining(), plans: { [userTeamId]: DEFAULT_PLAN } }, competitions: w.competitions, ...(options.focus ? { focus: pyramidOfLeague(specs[0] as LeagueSpec) } : {}), ...(options.cupSpecs ? { cupSpecs: options.cupSpecs } : {}) })
  const seasonMs = performance.now() - t
  // A diretoria não demite: o objetivo é medir custo, não desempenho.
  season = { ...season, teams: season.teams.map((tm) => (tm.id === userTeamId ? { ...tm, objective: { targetPosition: 20, sackingPosition: 20 } } : tm)) }
  const game: Game = { seed, userTeamId, season, lastDay: [], notices: [], seasonLog: [], archive: [] }
  return { game, genMs, seasonMs }
}
