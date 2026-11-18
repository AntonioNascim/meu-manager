/**
 * Leitura do adversário (só leitura, nada entra em conta do motor): prognóstico de vitória, empate e derrota, o craque do time e a
 * força de cada setor. O prognóstico é uma estimativa pela força dos onze e pelo mando, calibrada para a faixa que as medições do
 * motor dão (mandante vence ~45%, empates ~27%), e some em 100%.
 */
import { playerOverall } from '../../../engine/overall'
import type { Player, Position } from '../../../engine/types'
import { squadOf, teamById, teamStrength } from '../../../store/game'
import type { Game } from '../../../store/game'

export const OUTLOOK = {
  /** Vantagem de jogar em casa, em pontos de força dos onze. */
  homeEdge: 2.5,
  /** Diferença de força (pontos) que leva a vitória de "equilibrada" a favorita. */
  scale: 6,
  /** Probabilidade máxima de empate (jogo parelho) e a abertura do empate pela diferença. */
  drawPeak: 0.28,
  drawSpread: 12,
} as const

export interface Outlook {
  win: number
  draw: number
  lose: number
}

/** Prognóstico para quem joga `mineId` contra `otherId`; `mineHome` diz se o seu time é o mandante. Os três somam 1. */
export function outlookOf(mineStrength: number, otherStrength: number, mineHome: boolean): Outlook {
  const diff = mineStrength - otherStrength + (mineHome ? OUTLOOK.homeEdge : -OUTLOOK.homeEdge)
  const draw = OUTLOOK.drawPeak * Math.exp(-((diff / OUTLOOK.drawSpread) ** 2))
  const win = (1 - draw) / (1 + Math.exp(-diff / OUTLOOK.scale))
  return { win, draw, lose: 1 - draw - win }
}

/** Prognóstico do próximo jogo do técnico contra `otherId`, ou `undefined` se não há jogo entre eles. */
export function outlookAgainst(game: Game, otherId: string, mineHome: boolean): Outlook {
  return outlookOf(teamStrength(game, teamById(game, game.userTeamId)), teamStrength(game, teamById(game, otherId)), mineHome)
}

const SECTOR_OF: Record<Position, 'goalkeeper' | 'defence' | 'midfield' | 'attack'> = {
  GK: 'goalkeeper',
  RB: 'defence',
  LB: 'defence',
  CB: 'defence',
  DM: 'midfield',
  CM: 'midfield',
  AM: 'midfield',
  RW: 'attack',
  LW: 'attack',
  ST: 'attack',
}
export type ScoutSector = 'goalkeeper' | 'defence' | 'midfield' | 'attack'
export const SCOUT_SECTORS: readonly ScoutSector[] = ['goalkeeper', 'defence', 'midfield', 'attack']

/** Força média dos melhores de cada setor (1 goleiro, 4 de defesa, 3 de meio, 3 de ataque), a partir de quem joga ali. */
export function sectorLevels(game: Game, teamId: string): Record<ScoutSector, number> {
  const squad = squadOf(game, teamId)
  const take = { goalkeeper: 1, defence: 4, midfield: 3, attack: 3 } as const
  const out = {} as Record<ScoutSector, number>
  for (const s of SCOUT_SECTORS) {
    const best = squad
      .filter((p) => SECTOR_OF[p.position] === s)
      .map((p) => playerOverall(p))
      .sort((a, b) => b - a)
      .slice(0, take[s])
    out[s] = best.length ? best.reduce((a, b) => a + b, 0) / best.length : 0
  }
  return out
}

/** O craque do time (maior força, sem lesionado se houver outro) e o jogador de que ele mais depende (o goleiro ou o melhor do ataque). */
export function starOf(game: Game, teamId: string): { star: Player; overall: number } | undefined {
  const squad = squadOf(game, teamId)
  const sorted = [...squad].sort((a, b) => playerOverall(b) - playerOverall(a))
  const fit = sorted.find((p) => p.condition.injuryDaysLeft === 0) ?? sorted[0]
  return fit ? { star: fit, overall: playerOverall(fit) } : undefined
}

/** O setor mais forte e o mais fraco do adversário, comparados com os do seu time. */
export function sectorVerdict(game: Game, otherId: string): { strongest: ScoutSector; weakest: ScoutSector; diff: Record<ScoutSector, number> } {
  const theirs = sectorLevels(game, otherId)
  const mine = sectorLevels(game, game.userTeamId)
  const diff = Object.fromEntries(SCOUT_SECTORS.map((s) => [s, theirs[s] - mine[s]])) as Record<ScoutSector, number>
  const sorted = [...SCOUT_SECTORS].sort((a, b) => theirs[b] - theirs[a])
  return { strongest: sorted[0] as ScoutSector, weakest: sorted[sorted.length - 1] as ScoutSector, diff }
}
