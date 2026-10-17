/**
 * Carreira do técnico (B6): a reputação dele, as vagas dos clubes e as propostas. Tudo é derivado: a vaga de um clube num mês
 * vem de um sorteio com a semente do mercado, o mês e o clube (o mesmo resultado em qualquer consulta), e a lista é calculada
 * na hora a partir da classificação. Quem está empregado recebe propostas de clubes de prestígio parecido ou maior; quem foi
 * demitido procura emprego entre os clubes com vaga.
 */
import { BOARD, CAREER } from '../config'
import { leagueLevel } from '../economy'
import { createRng } from '../rng'
import { computeStandings } from '../season/standings'
import type { SeasonState } from '../season'
import type { Competition, IsoDate, Match, Team, TeamId } from '../types'

/** Reputação do técnico (escala dos clubes, 1 a 20) e o dia em que chegou ao clube atual. */
export interface Coach {
  reputation: number
  arrivedOn?: IsoDate
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const round1 = (v: number) => Math.round(v * 10) / 10

/** Prestígio de um clube, comparável entre países: reputação mais o nível da liga. */
export const prestige = (team: Pick<Team, 'reputation' | 'economy'>): number => team.reputation + leagueLevel(team) * CAREER.levelWeight

/** Técnico que começa o jogo num clube: a reputação dele é o prestígio do clube. */
export const startingCoach = (team: Pick<Team, 'reputation' | 'economy'>): Coach => ({ reputation: round1(prestige(team)) })

/** Reputação que os outros clubes enxergam: a guardada, mais ou menos um pouco conforme a confiança da diretoria hoje. */
export function perceivedReputation(coach: Coach, confidence: number): number {
  const swing = clamp((confidence - BOARD.atTarget) / (100 - BOARD.atTarget), -1, 1)
  return coach.reputation + swing * CAREER.confidenceSwing
}

/** Nova reputação depois de uma temporada: desempenho contra a meta (posição final × posição da meta) e título. */
export function seasonReputation(coach: Coach, input: { position: number; targetPosition: number; teamCount: number }): number {
  const half = Math.max(1, (input.teamCount - 1) / 2)
  const performance = clamp((input.targetPosition - input.position) / half, -1, 1)
  const title = input.position === 1 ? CAREER.titleBonus : 0
  return round1(clamp(coach.reputation + performance * CAREER.seasonGain + title, 1, 20))
}

/** Reputação depois de uma demissão. */
export const dismissedReputation = (coach: Coach): number => round1(Math.max(1, coach.reputation - CAREER.dismissalPenalty))

export interface JobOpening {
  teamId: TeamId
  competitionId: string
  prestige: number
  /** Posição na liga hoje e a meta que a diretoria dá. */
  position: number
  targetPosition: number
  /** Se o clube procurou o técnico (empregado) ou é uma vaga em que ele se candidata (sem clube). */
  kind: 'offer' | 'vacancy'
}

interface Standing {
  competition: Competition
  position: Map<TeamId, number>
  played: Map<TeamId, number>
}

function standingsByLeague(state: SeasonState): Standing[] {
  const byCompetition = new Map<string, Match[]>()
  for (const m of state.matches) {
    if (m.status !== 'finished') continue
    const list = byCompetition.get(m.competitionId)
    if (list) list.push(m)
    else byCompetition.set(m.competitionId, [m])
  }
  return state.season.competitions.map((competition) => {
    const rows = computeStandings(competition.teamIds, byCompetition.get(competition.id) ?? [])
    return { competition, position: new Map(rows.map((r, i) => [r.teamId, i + 1])), played: new Map(rows.map((r) => [r.teamId, r.played])) }
  })
}

/** Sorteio do clube neste mês (0 a 1): fixo para a mesma semente, mês e clube. */
const monthDraw = (state: SeasonState, teamId: TeamId): number => createRng(`${state.market.seed}:${state.season.currentDate.slice(0, 7)}:${teamId}:job`).next()

/** Chance de o clube estar sem técnico neste mês: a base, e mais para quem vai abaixo da meta ou perto da demissão. */
function vacancyChance(team: Team, position: number, played: number): number {
  const V = CAREER.vacancy
  if (played < BOARD.judgeAfterGames) return V.base
  if (position > team.objective.sackingPosition) return V.base + V.nearSacking
  if (position > team.objective.targetPosition) return V.base + V.belowTarget
  return V.base
}

export interface JobSearch {
  userTeamId: TeamId
  coach: Coach
  /** Confiança da diretoria no clube atual (só para quem está empregado). */
  confidence?: number
  employed: boolean
}

/** Clubes que procuram técnico agora e servem ao dele: propostas (empregado) ou vagas para se candidatar (sem clube). */
export function jobOpenings(state: SeasonState, search: JobSearch): JobOpening[] {
  const teamsById = new Map(state.teams.map((t) => [t.id, t]))
  const own = teamsById.get(search.userTeamId) as Team
  const seen = search.employed ? perceivedReputation(search.coach, search.confidence ?? BOARD.atTarget) : search.coach.reputation
  const kind = search.employed ? 'offer' : 'vacancy'
  const leagues = standingsByLeague(state)
  const make = (s: Standing, team: Team): JobOpening => ({ teamId: team.id, competitionId: s.competition.id, prestige: prestige(team), position: s.position.get(team.id) ?? 0, targetPosition: team.objective.targetPosition, kind })
  const open: JobOpening[] = []
  const rest: { opening: JobOpening; draw: number }[] = []
  for (const s of leagues) {
    for (const id of s.competition.teamIds) {
      if (id === search.userTeamId) continue
      const team = teamsById.get(id) as Team
      const opening = make(s, team)
      const draw = monthDraw(state, id)
      const vacant = draw < vacancyChance(team, opening.position, s.played.get(id) ?? 0)
      if (search.employed) {
        if (vacant && opening.prestige <= seen + CAREER.offer.above && opening.prestige >= prestige(own) - CAREER.offer.slack) open.push(opening)
      } else if (opening.prestige <= seen + CAREER.search.above) {
        if (vacant) open.push(opening)
        else rest.push({ opening, draw })
      }
    }
  }
  open.sort((a, b) => b.prestige - a.prestige)
  if (search.employed) return open.slice(0, CAREER.offer.max)
  // Sem clube: se poucas vagas servem, completa com clubes ao alcance do técnico, na ordem do sorteio do mês.
  if (open.length < CAREER.search.minListed) {
    rest.sort((a, b) => a.draw - b.draw)
    open.push(...rest.slice(0, CAREER.search.minListed - open.length).map((r) => r.opening))
  }
  if (open.length === 0) {
    // Reputação baixíssima: os clubes mais modestos do mundo sempre aceitam.
    const lowest = state.teams.filter((t) => t.id !== search.userTeamId).sort((a, b) => prestige(a) - prestige(b)).slice(0, CAREER.search.minListed)
    for (const t of lowest) open.push(make(leagues.find((s) => s.competition.teamIds.includes(t.id)) as Standing, t))
  }
  return open.sort((a, b) => b.prestige - a.prestige)
}

/**
 * Leva o técnico para outro clube: o plano de treino vai junto, as propostas pendentes dos dois clubes e os anúncios dele saem
 * do mercado, e `refocus` põe a liga nova lance a lance.
 */
export function moveCoach(
  state: SeasonState,
  fromTeamId: TeamId,
  toTeamId: TeamId,
  deps: { refocus: (s: SeasonState, teamId: TeamId) => SeasonState; defaultPlan: SeasonState['training']['plans'][string] },
): SeasonState {
  const plans = { ...state.training.plans }
  delete plans[fromTeamId]
  plans[toTeamId] = state.training.plans[fromTeamId] ?? deps.defaultPlan
  const individual = { ...state.training.individual }
  delete individual[fromTeamId]
  const finished = { ...state.training.finished }
  delete finished[fromTeamId]
  const involved = (o: { buyerId: TeamId; sellerId: TeamId | null }) => [fromTeamId, toTeamId].some((id) => o.buyerId === id || o.sellerId === id)
  const market = {
    ...state.market,
    offers: state.market.offers.filter((o) => !(o.status === 'pending' && involved(o))),
    listings: state.market.listings.filter((l) => l.teamId !== toTeamId && !(l.teamId === fromTeamId && l.by === 'user')),
  }
  return deps.refocus({ ...state, training: { ...state.training, plans, individual, finished }, market }, toTeamId)
}
