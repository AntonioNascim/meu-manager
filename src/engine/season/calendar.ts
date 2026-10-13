/**
 * Calendário da temporada: datas das rodadas e partidas de todas as séries.
 * Rodadas aos fins de semana (jogos no sábado e no domingo) e algumas na quarta-feira.
 */
import { SEASON } from '../config'
import { refreshListings } from '../market/listings'
import { createRng, hashSeed } from '../rng'
import { emptyTraining } from '../types'
import type { Competition, CompetitionId, IsoDate, MarketState, Match, Player, Season, Team, TrainingState } from '../types'
import { SATURDAY, addDays, makeDate, onOrAfterWeekday } from './dates'
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

/** Datas de cada rodada. Rodadas de meio de semana não avançam o fim de semana seguinte. */
export function roundSlots(year: number, roundCount: number): RoundSlot[] {
  let saturday = onOrAfterWeekday(makeDate(year, SEASON.startMonth, SEASON.startDay), SATURDAY)
  let lastSaturday = saturday
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
    saturday = addDays(saturday, 7)
  }
  return slots
}

export interface CompetitionSetup {
  id: CompetitionId
  name: string
  tier: number
  teams: readonly Team[]
}

/** Séries padrão do mundo: todos os times de cada `tier`. */
export function defaultCompetitions(teams: readonly Team[]): CompetitionSetup[] {
  return [
    { id: 'serie-a', name: 'Série A', tier: 1, teams: teams.filter((t) => t.tier === 1) },
    { id: 'serie-b', name: 'Série B', tier: 2, teams: teams.filter((t) => t.tier === 2) },
  ]
}

export interface SeasonOptions {
  year: number
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
}

/** Cria a temporada: todas as partidas (com data e seed) de todas as ligas, ainda por jogar. */
export function createSeason(options: SeasonOptions): SeasonState {
  const rng = createRng(`${options.seed}:${options.year}:calendar`)
  const matches: Match[] = []
  const competitions: Competition[] = []

  for (const setup of options.competitions ?? defaultCompetitions(options.teams)) {
    const rounds = buildLeagueRounds(setup.teams.map((t) => t.id), rng.fork(setup.id))
    const slots = roundSlots(options.year, rounds.length)
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
          seed: hashSeed(`${options.seed}:${options.year}:${id}`),
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
      promotionSlots: setup.tier === 1 ? 0 : 4,
      relegationSlots: setup.tier === 1 ? 4 : 0,
    })
  }

  matches.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const state: SeasonState = {
    season: {
      year: options.year,
      currentDate: makeDate(options.year, 1, 1),
      phase: 'pre-season',
      competitions,
      matchIds: matches.map((m) => m.id),
    },
    matches,
    teams: [...options.teams],
    players: [...options.players],
    academy: [...(options.academy ?? [])],
    training: options.training ?? emptyTraining(),
    playerCounter: [...options.players, ...(options.academy ?? [])].reduce((max, p) => Math.max(max, Number(p.id.replace(/\D/g, '')) || 0), 0),
    market: { seed: options.seed, offers: [], history: [], listings: [], handled: makeDate(options.year, 1, 1), counter: 0 },
  }
  // A janela de janeiro já abre com os anúncios dos clubes da IA (o jogador, se houver, anuncia depois).
  return refreshListings(state, makeDate(options.year, 1, 1))
}
