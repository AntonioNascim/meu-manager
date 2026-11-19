/**
 * Patrocinador e aposta do ano (estudo do concorrente, Parte 8b). Só do técnico humano; a IA e os clubes sem escolha ficam como sempre.
 *
 * **Patrocinador** (contrato de 1 temporada, escolhido até o primeiro jogo): três ofertas que trocam uma coisa pela outra, com a receita esperada
 * parecida com a de hoje (S = \`annualSponsorship\`): 1 fixo (100% de S, sem bônus), 2 posição (82% fixo + bônus de 36% de S se termina na meta da
 * diretoria ou melhor), 3 superar a meta (90% fixo + bônus de 55% de S se termina 3 posições melhor que a meta, ou campeão). O fixo cai por mês no
 * lugar do patrocínio de sempre e o bônus é pago na virada de temporada.
 *
 * **Aposta do ano**: uma meta extra e opcional por temporada (pontos, vitórias em casa ou gols sofridos), do tamanho do clube, escolhida nas primeiras
 * rodadas. Cumpriu, ganha meio mês de receita esperada; não cumpriu, nada. Conferida na virada. Funções puras.
 */
import { expectedPointsPerGame } from './board'
import { expectedAnnualRevenue, annualSponsorship, recordEntry } from './finance'
import type { SeasonState } from './season/calendar'
import type { BetKind, BetPlan, IsoDate, Match, SeasonRewards, SponsorOffer, StandingRow, Team, TeamId } from './types'
import { BET_KINDS } from './types'

export const SPONSOR = {
  offers: {
    1: { fixed: 1, bonus: 0, beat: null },
    2: { fixed: 0.82, bonus: 0.36, beat: 0 },
    3: { fixed: 0.9, bonus: 0.55, beat: 3 },
  } as Record<SponsorOffer, { fixed: number; bonus: number; beat: number | null }>,
  /** Prêmio da aposta: esta parte do mês de receita esperada. */
  prizeMonths: 0.5,
  /** Pontos a mais que a meta da diretoria pede, para a aposta de pontos. */
  pointsExtra: 4,
  /** A aposta e o patrocinador se escolhem até este número de jogos de liga do time (a aposta) e antes do primeiro (o patrocinador). */
  betMaxPlayed: 4,
} as const

export class SponsorError extends Error {
  constructor(
    readonly code: 'invalid' | 'sponsor-closed' | 'bet-done' | 'bet-closed',
    message: string,
  ) {
    super(message)
  }
}

export const isOffer = (v: unknown): v is SponsorOffer => v === 1 || v === 2 || v === 3
export const isBetKind = (v: unknown): v is BetKind => typeof v === 'string' && (BET_KINDS as readonly string[]).includes(v)

/** Quanto do patrocínio de sempre o contrato paga por mês (1 = tudo, sem escolha ou oferta 1). */
export const sponsorShare = (team: Pick<Team, 'sponsor'>): number => SPONSOR.offers[team.sponsor ?? 1].fixed

/** Bônus anual da oferta (R$): parcela de S (o patrocínio de sempre). */
export const sponsorBonusAmount = (team: Pick<Team, 'reputation' | 'tier' | 'economy' | 'sponsor'>, offer: SponsorOffer = team.sponsor ?? 1): number => Math.round((annualSponsorship(team) * SPONSOR.offers[offer].bonus) / 1_000) * 1_000

/** Colocação que paga o bônus: a meta da diretoria (oferta 2) ou 3 posições melhor, no mínimo o 1º (oferta 3). */
export function bonusPosition(offer: SponsorOffer, target: number): number | null {
  const beat = SPONSOR.offers[offer].beat
  return beat === null ? null : Math.max(1, target - beat)
}

const playedOf = (state: Pick<SeasonState, 'matches'>, teamId: TeamId): number => state.matches.filter((m) => m.cup === undefined && m.status === 'finished' && (m.homeTeamId === teamId || m.awayTeamId === teamId)).length
const teamOf = (state: Pick<SeasonState, 'teams'>, id: TeamId): Team | undefined => state.teams.find((t) => t.id === id)

/** Escolhe a oferta de patrocínio (vale até o primeiro jogo de liga do time). */
export function chooseSponsor(state: SeasonState, teamId: TeamId, offer: unknown): SeasonState {
  const team = teamOf(state, teamId)
  if (!team) throw new SponsorError('invalid', 'Clube não encontrado.')
  if (!isOffer(offer)) throw new SponsorError('invalid', 'Oferta inválida.')
  if (playedOf(state, teamId) > 0) throw new SponsorError('sponsor-closed', 'O contrato de patrocínio é escolhido antes do primeiro jogo.')
  const next: Team = offer === 1 ? (({ sponsor: _s, ...rest }) => (void _s, rest))(team) : { ...team, sponsor: offer }
  return { ...state, teams: state.teams.map((t) => (t.id === teamId ? next : t)) }
}

// ---------------------------------------------------------------------------
// Aposta do ano
// ---------------------------------------------------------------------------

/** O tamanho do campeonato do time: quantos clubes e quantos jogos cada um faz. */
function leagueSize(state: Pick<SeasonState, 'season'>, teamId: TeamId): { size: number; games: number; homeGames: number } {
  const c = state.season.competitions.find((x) => x.teamIds.includes(teamId))
  const size = c?.teamIds.length ?? 20
  const rounds = c?.rounds ?? 2
  const games = (size - 1) * rounds
  return { size, games, homeGames: Math.ceil(games / 2) }
}

/** As três apostas possíveis, do tamanho do clube (a meta da diretoria dá a régua). */
export function betOptions(state: Pick<SeasonState, 'season'>, team: Team): Record<BetKind, number> {
  const { size, games, homeGames } = leagueSize(state, team.id)
  const t = size <= 1 ? 0 : Math.min(1, Math.max(0, (team.objective.targetPosition - 1) / (size - 1)))
  return {
    points: Math.round(expectedPointsPerGame(team.objective.targetPosition, size) * games) + SPONSOR.pointsExtra,
    'home-wins': Math.round(homeGames * (0.7 - 0.45 * t)) + 1,
    'goals-against': Math.max(10, Math.round(games * (0.85 + 0.75 * t)) - 2),
  }
}

/** Prêmio da aposta: meio mês de receita esperada, arredondado a R$ 1.000. */
export const betPrize = (team: Team): number => Math.round((expectedAnnualRevenue(team) / 12 * SPONSOR.prizeMonths) / 1_000) * 1_000

/** Faz a aposta do ano (uma por temporada, nas primeiras rodadas). */
export function placeBet(state: SeasonState, teamId: TeamId, kind: unknown): SeasonState {
  const team = teamOf(state, teamId)
  if (!team) throw new SponsorError('invalid', 'Clube não encontrado.')
  if (!isBetKind(kind)) throw new SponsorError('invalid', 'Aposta inválida.')
  if (team.bet && team.bet.year === state.season.year) throw new SponsorError('bet-done', 'Você já fez a aposta desta temporada.')
  if (playedOf(state, teamId) > SPONSOR.betMaxPlayed) throw new SponsorError('bet-closed', 'O prazo da aposta já passou.')
  const bet: BetPlan = { kind, target: betOptions(state, team)[kind], year: state.season.year }
  return { ...state, teams: state.teams.map((t) => (t.id === teamId ? { ...t, bet } : t)) }
}

/** A aposta foi cumprida, a partir da linha do time na tabela final e dos jogos em casa. */
export function betWon(bet: BetPlan, row: Pick<StandingRow, 'points' | 'goalsAgainst'>, homeWins: number): boolean {
  return bet.kind === 'points' ? row.points >= bet.target : bet.kind === 'home-wins' ? homeWins >= bet.target : row.goalsAgainst <= bet.target
}

const homeWinsOf = (matches: readonly Match[], teamId: TeamId): number => matches.filter((m) => m.cup === undefined && m.status === 'finished' && m.result && m.homeTeamId === teamId && m.result.homeGoals > m.result.awayGoals).length

/**
 * Na virada de temporada: paga o bônus do patrocínio e o prêmio da aposta, registra o que o clube ganhou (\`Team.rewards\`) e apaga o contrato e a
 * aposta para a temporada seguinte. Só mexe nos clubes que escolheram alguma coisa (sem eles, devolve o mesmo estado).
 */
export function settleSeasonRewards(state: SeasonState, finalPositions: Readonly<Record<TeamId, { tier: number; position: number }>>, rows: ReadonlyMap<TeamId, StandingRow>, date: IsoDate): SeasonState {
  if (!state.teams.some((t) => t.sponsor || t.bet)) return state
  const teams = state.teams.map((team) => {
    if (!team.sponsor && !team.bet) return team
    const place = finalPositions[team.id]
    const row = rows.get(team.id)
    if (!place || !row) return team
    let next: Team = team
    let bonus = 0
    let prize = 0
    let won: boolean | undefined
    if (team.sponsor && team.sponsor !== 1) {
      const need = bonusPosition(team.sponsor, team.objective.targetPosition)
      if (need !== null && place.position <= need) {
        bonus = sponsorBonusAmount(team)
        next = recordEntry(next, date, 'sponsorship', bonus, `Bônus do patrocinador (oferta ${team.sponsor})`)
      }
    }
    if (team.bet) {
      won = betWon(team.bet, row, homeWinsOf(state.matches, team.id))
      if (won) {
        prize = betPrize(team)
        next = recordEntry(next, date, 'sponsorship', prize, 'Aposta do ano cumprida')
      }
    }
    const rewards: SeasonRewards = { year: state.season.year, position: place.position, ...(team.sponsor ? { offer: team.sponsor, bonus } : {}), ...(team.bet ? { bet: team.bet, betWon: won === true, prize } : {}) }
    const { sponsor: _s, bet: _b, ...rest } = next
    void _s
    void _b
    return { ...rest, rewards } as Team
  })
  return { ...state, teams }
}
