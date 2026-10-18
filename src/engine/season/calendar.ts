/**
 * Calendário da temporada: datas das rodadas e partidas de todas as séries.
 * Rodadas aos fins de semana (jogos no sábado e no domingo) e algumas na quarta-feira.
 */
import { SEASON } from '../config'
import { createCups } from '../cups'
import { refreshListings } from '../market/listings'
import { createRng, hashSeed } from '../rng'
import { emptyTraining } from '../types'
import type { Competition, CompetitionId, Cup, CupHistory, CupSpec, Cycle, ForeignLimit, IsoDate, LeagueEconomy, Nationality, MarketState, Match, Player, Region, Season, Team, TrainingState } from '../types'
import { SATURDAY, addDays, makeDate, onOrAfterWeekday } from './dates'
import { makeCycle, firstCycle } from './cycles'
import { DEFAULT_PYRAMID } from './fidelity'
import { buildLeagueRounds } from './schedule'

/**
 * A temporada inteira: dados puros, guardados e salvos como estão. A classificação é sempre derivada.
 * Os times e jogadores vão junto porque a condição dos jogadores (físico, lesão, suspensão, forma, moral)
 * muda a cada dia de jogos.
 */
export interface SeasonState {
  season: Season
  matches: Match[]
  teams: Team[]
  players: Player[]
  /** Categorias de base: jovens de 15 a 19 anos (e quem fez 20 e espera decisão), de todos os clubes (`teamId`). Não jogam partidas. */
  academy: Player[]
  /** Propostas, histórico de transferências e controle dos eventos do mercado. */
  market: MarketState
  /** Treino: plano de cada time, vaga individual e histórico mensal da força. */
  training: TrainingState
  /** A temporada de cada pirâmide (país): ano civil ou atravessando o ano. `season.year` e `season.phase` são os da pirâmide do foco. */
  cycles: Record<string, Cycle>
  /** Pirâmide do técnico: só as competições dela são jogadas lance a lance, as outras usam o resultado simplificado (`fidelity.ts`). Sem ela (padrão), todas são lance a lance. */
  focus?: string
  /** Copas da temporada (sem elas, o mundo só tem ligas). Os jogos delas ficam em `matches` com `cup`. */
  cups?: Cup[]
  /** Definição das copas do mundo: refeita a cada temporada, com as vagas da temporada passada. */
  cupSpecs?: CupSpec[]
  /** Campeão e vice de cada edição das copas. */
  cupHistory?: CupHistory
  /** Último número usado nos ids dos jogadores (`player-N`): jovens novos continuam daqui. */
  playerCounter: number
}

export interface RoundSlot {
  round: number
  kind: 'weekend' | 'midweek'
  /** Dias possíveis dos jogos da rodada (fim de semana: sábado e domingo; meio de semana: quarta). */
  days: IsoDate[]
}

export const isMidweekRound = (round: number) => round % SEASON.midweekEvery === 0

/** Datas de cada rodada. Rodadas de meio de semana não avançam o fim de semana seguinte. `start` = mês e dia a partir do qual vale o primeiro sábado (padrão: o do calendário brasileiro). */
export function roundSlots(year: number, roundCount: number, start: readonly [number, number] = [SEASON.startMonth, SEASON.startDay], gapEvery?: number): RoundSlot[] {
  let saturday = onOrAfterWeekday(makeDate(year, start[0], start[1]), SATURDAY)
  let lastSaturday = saturday
  let weekends = 0
  const slots: RoundSlot[] = []
  for (let round = 1; round <= roundCount; round++) {
    if (isMidweekRound(round) && round < roundCount) {
      // Quarta-feira depois do último fim de semana jogado.
      slots.push({ round, kind: 'midweek', days: [addDays(lastSaturday, 4)] })
      continue
    }
    const sunday = addDays(saturday, 1)
    const days = SEASON.finalRoundSameDay && round === roundCount ? [sunday] : [saturday, sunday]
    slots.push({ round, kind: 'weekend', days })
    lastSaturday = saturday
    // Pausa de calendário: uma semana sem rodada a cada `gapEvery` rodadas de fim de semana.
    saturday = addDays(saturday, gapEvery && ++weekends % gapEvery === 0 ? 14 : 7)
  }
  return slots
}

export interface CompetitionSetup {
  id: CompetitionId
  name: string
  tier: number
  teams: readonly Team[]
  /** Região (janelas de transferência), início do calendário e turno único; os padrões são os da liga brasileira. */
  region?: Region
  start?: [number, number]
  rounds?: 1 | 2
  /** Temporada que atravessa o ano (a pirâmide inteira segue a da primeira divisão) e pausas de calendário. */
  split?: boolean
  gapEvery?: number
  /** Pirâmide do país (divisões ligadas por acesso e rebaixamento). */
  pyramid?: string
  /** Economia da liga (a do Brasil quando falta) e reputação média da divisão. */
  economy?: LeagueEconomy
  reputationMean?: number
  /** País da liga, limite de estrangeiros e quantos sobem e caem (padrão: 4, menos na primeira e na última divisão da pirâmide). */
  country?: Nationality
  foreignLimit?: ForeignLimit
  promotion?: number
  relegation?: number
}

const SERIES_LETTERS = ['a', 'b', 'c', 'd'] as const

/** Séries padrão do mundo (a pirâmide do país): uma por `tier` que tem times, com todos os times dela. */
export function defaultCompetitions(teams: readonly Team[]): CompetitionSetup[] {
  const tiers = [...new Set(teams.map((t) => t.tier))].sort((a, b) => a - b)
  return tiers.map((tier) => {
    const letter = SERIES_LETTERS[tier - 1] ?? String(tier)
    return { id: `serie-${letter}`, name: `Série ${letter.toUpperCase()}`, tier, teams: teams.filter((t) => t.tier === tier) }
  })
}

export interface SeasonOptions {
  /** Ano em que o mundo começa. */
  year: number
  /** Dia em que o relógio começa (padrão: 1º de janeiro de `year`). Cada pirâmide joga a primeira temporada que começa nessa data ou depois. */
  startDate?: IsoDate
  /** Mesma seed = mesmo calendário e mesmas seeds de partida. */
  seed: number | string
  teams: readonly Team[]
  players: readonly Player[]
  /** Base dos clubes (padrão: vazia). */
  academy?: readonly Player[]
  /** Treino que vem da temporada anterior (padrão: vazio). */
  training?: TrainingState
  /** Padrão: Série A e Série B com os times de cada `tier`. */
  competitions?: readonly CompetitionSetup[]
  /** Pirâmide jogada lance a lance (as outras são simplificadas); sem ela todas são lance a lance. */
  focus?: string
  /** Copas do mundo (definições do pacote) e o campeão de cada edição passada; sem elas só há ligas. */
  cupSpecs?: readonly CupSpec[]
  cupHistory?: CupHistory
}

/** Os times com a economia, o país e o limite de estrangeiros da liga em que jogam (quem já tem os mesmos não é recriado). */
function withEconomy(teams: readonly Team[], setups: readonly CompetitionSetup[]): Team[] {
  const setupOf = new Map<string, CompetitionSetup>()
  for (const s of setups) if (s.economy || s.country || s.foreignLimit) for (const t of s.teams) setupOf.set(t.id, s)
  if (setupOf.size === 0) return [...teams]
  return teams.map((t) => {
    const s = setupOf.get(t.id)
    if (!s) return t
    const next: Team = { ...t }
    if (s.economy) next.economy = s.economy
    if (s.country) next.country = s.country
    else delete next.country
    if (s.foreignLimit) next.foreignLimit = s.foreignLimit
    else delete next.foreignLimit
    return next.economy === t.economy && next.country === t.country && next.foreignLimit === t.foreignLimit ? t : next
  })
}

export interface PyramidBuild {
  competitions: Competition[]
  matches: Match[]
}

/** As ligas de uma pirâmide numa temporada: tabela de jogos (datas e sementes) e as competições. `rng` sorteia os mandos. */
export function buildPyramid(args: { seed: number | string; cycle: Cycle; setups: readonly CompetitionSetup[]; rng: ReturnType<typeof createRng> }): PyramidBuild {
  const { seed, cycle, setups, rng } = args
  const matches: Match[] = []
  const competitions: Competition[] = []
  // A divisão mais baixa da pirâmide é a única que não rebaixa.
  const lowestTier = Math.max(...setups.map((s) => s.tier))
  for (const setup of setups) {
    const rounds = buildLeagueRounds(setup.teams.map((t) => t.id), rng.fork(setup.id), setup.rounds ?? 2)
    const start = setup.start ?? (cycle.split ? [SEASON.split.startMonth, SEASON.split.startDay] : undefined)
    const gapEvery = (setup.gapEvery ?? SEASON.gapEvery) || undefined
    const slots = roundSlots(cycle.year, rounds.length, start, gapEvery)
    rounds.forEach((fixtures, roundIndex) => {
      const slot = slots[roundIndex] as RoundSlot
      fixtures.forEach((fixture, i) => {
        const id = `${setup.id}-r${String(slot.round).padStart(2, '0')}-${i + 1}`
        matches.push({
          id,
          competitionId: setup.id,
          round: slot.round,
          date: slot.days[i % slot.days.length] as IsoDate,
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          status: 'scheduled',
          seed: hashSeed(`${seed}:${cycle.year}:${id}`),
        })
      })
    })
    competitions.push({
      id: setup.id,
      name: setup.name,
      type: 'league',
      tier: setup.tier,
      teamIds: setup.teams.map((t) => t.id),
      roundCount: rounds.length,
      // Pirâmide: 4 sobem de cada divisão (menos a primeira) e 4 caem de cada uma (menos a última).
      promotionSlots: setup.promotion ?? (setup.tier === 1 ? 0 : 4),
      relegationSlots: setup.relegation ?? (setup.tier === lowestTier ? 0 : 4),
      ...(setup.region ? { region: setup.region } : {}),
      ...(setup.start ? { start: setup.start } : {}),
      ...(setup.rounds ? { rounds: setup.rounds } : {}),
      ...(cycle.split ? { split: true } : {}),
      ...(setup.gapEvery ? { gapEvery: setup.gapEvery } : {}),
      ...(setup.pyramid ? { pyramid: setup.pyramid } : {}),
      ...(setup.economy ? { economy: setup.economy } : {}),
      ...(setup.country ? { country: setup.country } : {}),
      ...(setup.foreignLimit ? { foreignLimit: setup.foreignLimit } : {}),
      ...(setup.reputationMean !== undefined ? { reputationMean: setup.reputationMean } : {}),
    })
  }
  return { competitions, matches }
}

/** A pirâmide de um `CompetitionSetup`. */
const setupPyramid = (s: Pick<CompetitionSetup, 'pyramid'>): string => s.pyramid ?? DEFAULT_PYRAMID

/** Cria a temporada: todas as partidas (com data e seed) de todas as ligas, ainda por jogar. Cada pirâmide tem a sua temporada (`cycles`). */
export function createSeason(options: SeasonOptions): SeasonState {
  const rng = createRng(`${options.seed}:${options.year}:calendar`)
  const startDate = options.startDate ?? makeDate(options.year, 1, 1)
  const matches: Match[] = []
  const competitions: Competition[] = []
  const cycles: Record<string, Cycle> = {}
  const setups = options.competitions ?? defaultCompetitions(options.teams)
  const pyramids: string[] = []
  for (const s of setups) if (!pyramids.includes(setupPyramid(s))) pyramids.push(setupPyramid(s))
  for (const pyramid of pyramids) {
    const own = setups.filter((s) => setupPyramid(s) === pyramid)
    // A temporada do país segue a da primeira divisão dele.
    const cycle = firstCycle(own.slice().sort((a, b) => a.tier - b.tier)[0]?.split === true, startDate)
    cycles[pyramid] = cycle
    const built = buildPyramid({ seed: options.seed, cycle, setups: own, rng })
    matches.push(...built.matches)
    competitions.push(...built.competitions)
  }
  // A ordem das competições é a dos setups (a interface depende dela).
  const order = new Map(setups.map((s, i) => [s.id, i]))
  competitions.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  matches.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const focus = options.focus ?? (competitions[0] ? setupPyramid(competitions[0]) : DEFAULT_PYRAMID)
  const state: SeasonState = {
    season: {
      year: (cycles[focus] ?? Object.values(cycles)[0] ?? makeCycle(options.year, false)).year,
      currentDate: startDate,
      phase: 'pre-season',
      competitions,
      matchIds: matches.map((m) => m.id),
    },
    cycles,
    matches,
    teams: withEconomy(options.teams, setups),
    players: [...options.players],
    academy: [...(options.academy ?? [])],
    training: options.training ?? emptyTraining(),
    ...(options.focus !== undefined ? { focus: options.focus } : {}),
    playerCounter: [...options.players, ...(options.academy ?? [])].reduce((max, p) => Math.max(max, Number(p.id.replace(/\D/g, '')) || 0), 0),
    market: { seed: options.seed, offers: [], history: [], listings: [], preContracts: [], handled: startDate, counter: 0 },
  }
  // As copas entram depois das ligas: o sorteio da primeira fase já escolhe os dias livres de jogo.
  // `cupSpecs: []` guarda que o mundo não quer copas (um save de antes das copas não tem o campo e ganha as padrão na virada).
  const withCups = options.cupSpecs && options.cupSpecs.length > 0 ? createCups({ ...state, ...(options.cupHistory ? { cupHistory: options.cupHistory } : {}) }, options.cupSpecs) : options.cupSpecs ? { ...state, cupSpecs: [] } : state
  // A janela de janeiro já abre com os anúncios dos clubes da IA (o jogador, se houver, anuncia depois).
  return refreshListings(withCups, startDate)
}
