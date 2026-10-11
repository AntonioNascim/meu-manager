import { RATING } from '../config'
import type { PitchPlayer } from './state'

/** Nota do jogador: parte de 6,0 e soma/subtrai por ação (pesos em `RATING`, no config). */
export function playerRating(p: PitchPlayer, minutesPlayed: number, teamGoals: number, opponentGoals: number): number {
  const t = p.tally
  const r = RATING
  let delta =
    t.goals * r.goal +
    t.ownGoals * r.ownGoal +
    t.assists * r.assist +
    t.keyPasses * r.keyPass +
    t.shotsOnTarget * r.shotOnTarget +
    Math.max(0, t.shots - t.shotsOnTarget) * r.shotOff +
    t.dribblesWon * r.dribbleWon +
    t.dribblesLost * r.dribbleLost +
    t.tacklesWon * r.tackleWon +
    t.headersWon * r.headerWon +
    t.fouls * r.foul +
    Math.min(p.yellowCards, 1) * r.yellow +
    (p.sentOff ? r.red : 0) +
    t.penaltiesMissed * r.penaltyMissed

  const cleanSheet = t.goalsConceded === 0 && minutesPlayed >= r.cleanSheetMinMinutes
  if (p.slot === 'GK') {
    delta += t.saves * r.save + t.goalsConceded * r.goalkeeperConceded + (cleanSheet ? r.goalkeeperCleanSheet : 0)
  } else if (p.sector === 'defense') {
    delta += t.goalsConceded * r.defenderConceded + (cleanSheet ? r.defenderCleanSheet : 0)
  }

  if (teamGoals > opponentGoals) delta += r.win
  else if (teamGoals < opponentGoals) delta += r.loss

  // Quem jogou pouco fica perto de 6,0.
  const weight = Math.min(1, minutesPlayed / r.fullWeightMinutes)
  const rating = r.base + delta * weight
  return Math.round(Math.min(r.max, Math.max(r.min, rating)) * 10) / 10
}
