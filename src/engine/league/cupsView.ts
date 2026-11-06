/**
 * As copas numa liga online (Fase 6, B8.8; proposta, seção 29). Puro. As copas já fazem parte do mundo da liga (nacionais, continentais e mundiais, como no jogo
 * solo) e o relógio da liga trata a partida de copa de um clube humano como qualquer outra partida humana (evento, Pronto, resultado direto ou ao vivo, com
 * prorrogação e pênaltis); aqui ficam só as visões para a tela: o que cada evento tem de jogo humano (liga ou copa, e a fase) e o resumo das copas.
 */
import { cupPath, matchLabel, type PathStep } from '../cups'
import type { SeasonState } from '../season'
import type { Cup, IsoDate, TeamId } from '../types'

/** Um jogo de clube humano num evento: onde é (liga ou copa) e a fase. */
export interface LeagueFixture {
  homeTeamId: TeamId
  awayTeamId: TeamId
  /** Nome da liga ou da copa. */
  competition: string
  /** Rodada, fase (com ida ou volta) ou grupo. */
  detail: string
  cup: boolean
}

/** Os jogos de clubes humanos nas datas pedidas (uma passada só pelas partidas do mundo). */
export function fixturesOn(world: SeasonState, humans: ReadonlySet<TeamId>, dates: ReadonlySet<IsoDate>, includePlayed = false): Map<IsoDate, LeagueFixture[]> {
  const out = new Map<IsoDate, LeagueFixture[]>()
  for (const m of world.matches) {
    if (!dates.has(m.date) || (!includePlayed && m.status !== 'scheduled')) continue
    if (!humans.has(m.homeTeamId) && !humans.has(m.awayTeamId)) continue
    const label = matchLabel(world, m)
    const list = out.get(m.date) ?? []
    list.push({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, competition: label.competition, detail: label.detail, cup: m.cup !== undefined })
    out.set(m.date, list)
  }
  return out
}

export interface CupCard {
  id: string
  name: string
  year: number
  finished: boolean
  winnerId?: TeamId
  runnerUpId?: TeamId
  /** O caminho do meu clube na copa (vazio se ele não está nela). */
  steps: PathStep[]
  /** O meu clube ainda está vivo na copa. */
  alive: boolean
}

export interface CupsBody {
  /** As copas desta temporada em que o meu clube está, e as outras copas do mundo em andamento (o nome e quem ganhou). */
  mine: CupCard[]
  others: CupCard[]
  /** Campeões das edições passadas (as mais recentes primeiro). */
  history: { cupId: string; name: string; year: number; winnerId: TeamId; runnerUpId?: TeamId }[]
}

const cardOf = (world: SeasonState, cup: Cup, teamId: TeamId): CupCard => {
  const steps = cupPath(world.matches, cup, teamId)
  const last = steps.at(-1)
  return {
    id: cup.id,
    name: cup.name,
    year: cup.year,
    finished: cup.winnerId !== undefined,
    ...(cup.winnerId ? { winnerId: cup.winnerId } : {}),
    ...(cup.runnerUpId ? { runnerUpId: cup.runnerUpId } : {}),
    steps,
    alive: cup.winnerId === undefined && steps.length > 0 && last?.state !== 'out',
  }
}

export function cupsBody(world: SeasonState, teamId: TeamId): CupsBody {
  const cups = world.cups ?? []
  const names = new Map<string, string>([...(world.cupSpecs ?? []).map((c): [string, string] => [c.id, c.name]), ...cups.map((c): [string, string] => [c.id, c.name])])
  const inCup = (cup: Cup) => cup.entrants.some((e) => e.teamId === teamId)
  const history = Object.entries(world.cupHistory ?? {})
    .flatMap(([cupId, list]) => list.map((h) => ({ cupId, name: names.get(cupId) ?? cupId, year: h.year, winnerId: h.winnerId, ...(h.runnerUpId ? { runnerUpId: h.runnerUpId } : {}) })))
    .sort((a, b) => b.year - a.year || (a.name < b.name ? -1 : 1))
    .slice(0, 30)
  return {
    mine: cups.filter(inCup).map((c) => cardOf(world, c, teamId)),
    others: cups.filter((c) => !inCup(c)).map((c) => cardOf(world, c, teamId)),
    history,
  }
}
