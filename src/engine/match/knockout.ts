/**
 * Mata-mata: prorrogação e disputa de pênaltis. Funções puras, usadas pelo motor completo (`simulateMatch.ts`) e pelo
 * simplificado (`quick.ts`). Quem decide a disputa de pênaltis são os atributos: finalização e frieza (determinação e decisão)
 * do cobrador contra os reflexos, o posicionamento e a decisão do goleiro.
 */
import { MATCH } from '../config'
import type { Rng } from '../rng'
import type { MatchResult, Player } from '../types'

/** Regras de um jogo de mata-mata. */
export interface KnockoutRules {
  /** Se o confronto está empatado depois dos 90 minutos, joga 30 minutos de prorrogação. */
  extraTime: boolean
  /** Se continua empatado, decide nos pênaltis. */
  penalties: boolean
  /** Regra do gol fora na volta de um confronto de ida e volta (desligada por padrão). */
  awayGoals?: boolean
  /**
   * Volta de um confronto de ida e volta: gols que o mandante e o visitante DESTA partida fizeram na ida. O confronto é decidido
   * pelo total dos dois jogos.
   */
  priorLeg?: { home: number; away: number }
}

/** Quem está na frente do confronto com estes gols desta partida (`null` = empatado). */
export function knockoutLeader(rules: Pick<KnockoutRules, 'awayGoals' | 'priorLeg'>, homeGoals: number, awayGoals: number): 'home' | 'away' | null {
  const prior = rules.priorLeg
  const homeTotal = homeGoals + (prior?.home ?? 0)
  const awayTotal = awayGoals + (prior?.away ?? 0)
  if (homeTotal !== awayTotal) return homeTotal > awayTotal ? 'home' : 'away'
  if (rules.awayGoals && prior) {
    // O mandante desta partida jogou fora na ida (marcou `prior.home` lá); o visitante desta partida marca `awayGoals` fora aqui.
    if (prior.home !== awayGoals) return prior.home > awayGoals ? 'home' : 'away'
  }
  return null
}

/** Pontuação do cobrador: finalização e frieza (a média de determinação e decisão). */
export const takerScore = (p: Player): number => 0.6 * p.attributes.finishing + 0.4 * ((p.attributes.determination + p.attributes.decisions) / 2)

/** Pontuação do goleiro nos pênaltis. */
export const keeperScore = (gk: Player | undefined): number => (gk ? 0.6 * gk.attributes.reflexes + 0.2 * gk.attributes.positioning + 0.2 * gk.attributes.decisions : MATCH.shootout.noKeeper)

export interface ShootoutSide {
  teamId: string
  /** Jogadores em campo no fim do jogo (os cobradores). */
  onPitch: readonly Player[]
  /** Cobradores de pênalti do técnico, em ordem de preferência. */
  preferred: readonly string[]
  keeper: Player | undefined
}

export interface ShootoutResult {
  home: number
  away: number
  kicks: NonNullable<MatchResult['shootout']>
}

/** Ordem das cobranças: os cobradores do técnico, depois os melhores cobradores, o goleiro por último. */
export function shootoutOrder(side: ShootoutSide): Player[] {
  const by = new Map(side.onPitch.map((p) => [p.id, p]))
  const first = side.preferred.flatMap((id) => (by.has(id) ? [by.get(id) as Player] : []))
  const taken = new Set(first.map((p) => p.id))
  const rest = side.onPitch.filter((p) => !taken.has(p.id) && p.position !== 'GK').sort((a, b) => takerScore(b) - takerScore(a) || a.id.localeCompare(b.id))
  const keepers = side.onPitch.filter((p) => !taken.has(p.id) && p.position === 'GK')
  const order = [...first, ...rest, ...keepers]
  return order.length > 0 ? order : [...side.onPitch]
}

/** Disputa de pênaltis: 5 cobranças para cada lado (para antes se um lado não alcança mais) e depois morte súbita. */
export function runShootout(rng: Rng, home: ShootoutSide, away: ShootoutSide): ShootoutResult {
  const cfg = MATCH.shootout
  const orders = { home: shootoutOrder(home), away: shootoutOrder(away) }
  const keepers = { home: keeperScore(home.keeper), away: keeperScore(away.keeper) }
  const teamIds = { home: home.teamId, away: away.teamId }
  const score = { home: 0, away: 0 }
  const taken = { home: 0, away: 0 }
  const kicks: ShootoutResult['kicks'] = []
  const first: 'home' | 'away' = rng.chance(0.5) ? 'home' : 'away'
  const kick = (side: 'home' | 'away'): void => {
    const order = orders[side]
    const shooter = order[taken[side] % order.length] as Player
    const other = side === 'home' ? 'away' : 'home'
    const p = Math.min(cfg.max, Math.max(cfg.min, cfg.base + cfg.slope * (takerScore(shooter) - keepers[other])))
    const scored = rng.chance(p)
    if (scored) score[side]++
    taken[side]++
    kicks.push({ teamId: teamIds[side], playerId: shooter.id, scored })
  }
  const sides: ('home' | 'away')[] = first === 'home' ? ['home', 'away'] : ['away', 'home']
  for (let round = 0; round < cfg.kicks; round++) {
    for (const side of sides) {
      kick(side)
      const left = (s: 'home' | 'away') => cfg.kicks - taken[s]
      if (score.home > score.away + left('away') || score.away > score.home + left('home')) return { home: score.home, away: score.away, kicks }
    }
  }
  for (let round = 0; round < cfg.suddenDeathMax; round++) {
    const before = { ...score }
    for (const side of sides) kick(side)
    if (score.home !== score.away && (score.home - before.home !== score.away - before.away)) return { home: score.home, away: score.away, kicks }
  }
  // Muito improvável: ninguém desempatou na morte súbita; o sorteio decide.
  if (score.home === score.away) score[rng.chance(0.5) ? 'home' : 'away']++
  return { home: score.home, away: score.away, kicks }
}
