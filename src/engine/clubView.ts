/**
 * "O clube" (estudo do concorrente, Parte 8, o que é só leitura): como a torcida e o mercado veem o técnico. Tudo derivado do que já existe e
 * nunca guardado; **nada entra em conta do jogo** (nem no motor, nem nas finanças, nem na diretoria). Funções puras.
 */
import type { Match, Team, TeamId } from './types'
import { prestige } from './career'

export type MoodBand = 'enthusiastic' | 'with-team' | 'uneasy' | 'angry'

export const FAN = {
  /** Pontos de humor por resultado dos últimos 5 jogos e quanto cada posição acima ou abaixo da meta pesa. */
  result: { win: 10, draw: 2, loss: -8 },
  recent: 5,
  recentScale: 0.6,
  perPosition: 1.5,
  positionCap: 15,
  bands: { enthusiastic: 75, withTeam: 55, uneasy: 35 },
} as const

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const moodBandOf = (value: number): MoodBand => (value >= FAN.bands.enthusiastic ? 'enthusiastic' : value >= FAN.bands.withTeam ? 'with-team' : value >= FAN.bands.uneasy ? 'uneasy' : 'angry')

/**
 * Humor da torcida de 0 a 100: sobe e desce com os últimos 5 jogos e com a posição na tabela contra a meta da diretoria. Sem jogos, neutro
 * (o clube recebe o técnico com esperança).
 */
export function fanMood(matches: readonly Match[], teamId: TeamId, position: number, targetPosition: number): { value: number; band: MoodBand; games: number } {
  const recent = matches
    .filter((m) => m.status === 'finished' && m.result && m.cup === undefined && (m.homeTeamId === teamId || m.awayTeamId === teamId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round)
    .slice(0, FAN.recent)
  if (recent.length === 0) return { value: 60, band: moodBandOf(60), games: 0 }
  let points = 0
  for (const m of recent) {
    const r = m.result as NonNullable<Match['result']>
    const gf = m.homeTeamId === teamId ? r.homeGoals : r.awayGoals
    const ga = m.homeTeamId === teamId ? r.awayGoals : r.homeGoals
    points += gf > ga ? FAN.result.win : gf === ga ? FAN.result.draw : FAN.result.loss
  }
  const position_ = clamp((targetPosition - position) * FAN.perPosition, -FAN.positionCap, FAN.positionCap)
  const value = Math.round(clamp(50 + points * FAN.recentScale + position_, 0, 100))
  return { value, band: moodBandOf(value), games: recent.length }
}

/**
 * Como o mercado enxerga o técnico: a reputação dele contra o prestígio dos clubes da liga (quantos clubes ele "alcança") e a faixa em que cai.
 * `reach` é a parte dos clubes da liga cujo prestígio ele alcança (0 a 1).
 */
export function coachStanding(coachReputation: number, teams: readonly Pick<Team, 'reputation' | 'economy'>[]): { reach: number; reachable: number; total: number; ceilingPrestige: number } {
  const levels = teams.map((t) => prestige(t)).sort((a, b) => a - b)
  const reachable = levels.filter((p) => p <= coachReputation + 0.5).length
  return { reach: levels.length ? reachable / levels.length : 0, reachable, total: levels.length, ceilingPrestige: levels.filter((p) => p <= coachReputation + 0.5).at(-1) ?? 0 }
}
