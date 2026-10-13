/**
 * Condição dos jogadores entre as partidas: recuperação por dia, contagem regressiva das lesões,
 * suspensões (vermelho e amarelos acumulados), forma (média das últimas notas) e moral.
 * Funções puras: recebem jogadores e devolvem cópias novas.
 */
import { CONDITION } from '../config'
import type { Match, Player, PlayerCondition, PlayerId, TeamId } from '../types'

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))
const MORALE_NEUTRAL = 70

/** Condição recuperada por dia: quem tem mais resistência se recupera um pouco mais rápido. */
export function fitnessRecoveryPerDay(player: Player): number {
  return CONDITION.fitnessPerDay * (1 + (CONDITION.staminaEffect * (player.attributes.stamina - 60)) / 40)
}

/** Recuperação do dia a dia de um time: multiplica a velocidade e limita a condição (intensidade do treino). */
export type RecoveryProfile = (teamId: TeamId | null) => { recovery: number; ceiling: number }

/** Passa `days` dias: recupera a condição física, desconta os dias de lesão e aproxima a moral do neutro. */
export function progressDays(players: readonly Player[], days: number, profile?: RecoveryProfile): Player[] {
  if (days <= 0) return [...players]
  const drift = 1 - (1 - CONDITION.moraleDriftPerDay) ** days
  return players.map((p) => {
    const c = p.condition
    const { recovery, ceiling } = profile ? profile(p.teamId) : { recovery: 1, ceiling: 100 }
    // O teto só limita a recuperação: quem já está acima dele (treino mudou) não perde condição por isso.
    const fitness = Math.min(Math.max(ceiling, c.fitness), c.fitness + days * fitnessRecoveryPerDay(p) * recovery)
    const injuryDaysLeft = Math.max(0, c.injuryDaysLeft - days)
    const morale = c.morale + (MORALE_NEUTRAL - c.morale) * drift
    if (fitness === c.fitness && injuryDaysLeft === c.injuryDaysLeft && morale === c.morale) return p
    return { ...p, condition: { ...c, fitness, injuryDaysLeft, morale } }
  })
}

/** Quantos amarelos contam para a suspensão: a expulsão por segundo amarelo vale como um vermelho só. */
function countedYellows(yellowsInMatch: number): number {
  return yellowsInMatch >= 2 ? 0 : yellowsInMatch
}

/**
 * Efeitos de uma partida finalizada nos jogadores dos dois times (`squads` = elencos completos).
 * Devolve só os jogadores alterados. Quem estava suspenso antes da partida cumpre um jogo;
 * as novas suspensões valem para a próxima partida.
 */
export function applyMatchToPlayers(squads: ReadonlyMap<TeamId, readonly Player[]>, match: Match): Player[] {
  const result = match.result
  if (match.status !== 'finished' || !result) return []

  const goals = new Map<PlayerId, number>()
  const assists = new Map<PlayerId, number>()
  const crossAssists = new Map<PlayerId, number>()
  const yellows = new Map<PlayerId, number>()
  const reds = new Set<PlayerId>()
  for (const e of result.events) {
    if (e.type === 'goal') {
      goals.set(e.playerId, (goals.get(e.playerId) ?? 0) + 1)
      if (e.relatedPlayerId) {
        assists.set(e.relatedPlayerId, (assists.get(e.relatedPlayerId) ?? 0) + 1)
        if (e.assistKind === 'cross') crossAssists.set(e.relatedPlayerId, (crossAssists.get(e.relatedPlayerId) ?? 0) + 1)
      }
    } else if (e.type === 'yellow-card') yellows.set(e.playerId, (yellows.get(e.playerId) ?? 0) + 1)
    else if (e.type === 'red-card') reds.add(e.playerId)
  }
  const played = new Map(result.playerResults.map((r) => [r.playerId, r]))

  const sides = [
    { teamId: match.homeTeamId, goalsFor: result.homeGoals, goalsAgainst: result.awayGoals },
    { teamId: match.awayTeamId, goalsFor: result.awayGoals, goalsAgainst: result.homeGoals },
  ]
  const updated: Player[] = []
  for (const side of sides) {
    const moraleShift =
      side.goalsFor > side.goalsAgainst ? CONDITION.morale.win : side.goalsFor === side.goalsAgainst ? CONDITION.morale.draw : CONDITION.morale.loss
    for (const p of squads.get(side.teamId) ?? []) {
      const r = played.get(p.id)
      const c: PlayerCondition = { ...p.condition, recentRatings: [...p.condition.recentRatings] }
      const stats = { ...p.seasonStats }
      let morale = c.morale + moraleShift

      if (c.suspensionGames > 0) c.suspensionGames--

      if (r && r.minutesPlayed > 0) {
        c.fitness = r.finalFitness
        stats.appearances++
        stats.minutes += r.minutesPlayed
        if (r.minutesPlayed >= CONDITION.minMinutesForForm) {
          c.recentRatings = [r.rating, ...c.recentRatings].slice(0, CONDITION.formMatches)
          c.form = c.recentRatings.reduce((a, b) => a + b, 0) / c.recentRatings.length
          stats.ratingSum += r.rating
          stats.ratedGames++
          morale += (r.rating - CONDITION.moraleNeutralRating) * CONDITION.moralePerRating
        }
        if (r.injuryDays) c.injuryDaysLeft = Math.max(c.injuryDaysLeft, r.injuryDays)
      }

      const scored = goals.get(p.id) ?? 0
      const assisted = assists.get(p.id) ?? 0
      const crossed = crossAssists.get(p.id) ?? 0
      stats.goals += scored
      if (side.teamId === match.homeTeamId) stats.homeGoals += scored
      else stats.awayGoals += scored
      stats.assists += assisted
      stats.crossAssists += crossed
      stats.passAssists += assisted - crossed

      const yellow = yellows.get(p.id) ?? 0
      stats.yellowCards += yellow
      c.yellowCards += countedYellows(yellow)
      while (c.yellowCards >= CONDITION.yellowsPerSuspension) {
        c.yellowCards -= CONDITION.yellowsPerSuspension
        c.suspensionGames++
      }
      if (reds.has(p.id)) {
        stats.redCards++
        c.redCards++
        c.suspensionGames += CONDITION.redCardGames
      }

      c.morale = clamp(morale, 0, 100)
      updated.push({ ...p, condition: c, seasonStats: stats })
    }
  }
  return updated
}
