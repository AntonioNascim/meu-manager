import type { PlayerId, TeamId } from './common'
import type { Position } from './player'

/** Jogador que saiu do jogo ou do clube na virada de temporada (para o resumo na tela). */
export interface DepartedPlayer {
  playerId: PlayerId
  name: string
  age: number
  teamId: TeamId | null
}

/** O que a virada de temporada fez (derivado na hora; o jogo guarda só o resumo por ano). */
export interface OffseasonReport {
  /** Ano da temporada que acabou. */
  year: number
  /** Campeão de cada série (índice = série − 1). */
  champions: TeamId[]
  promoted: TeamId[]
  relegated: TeamId[]
  /** Posição final de cada time na sua série. */
  finalPositions: Record<TeamId, { tier: number; position: number }>
  retired: DepartedPlayer[]
  /** Contratos vencidos que viraram jogador livre. */
  released: DepartedPlayer[]
  /** Contratos renovados pela IA. */
  renewed: number
  /** Jovens que subiram da base, por time. */
  youth: Record<TeamId, number>
  reputationChanges: Record<TeamId, { from: number; to: number }>
}

/** Pedido de jovens ao gerador de dados (o motor não gera jogadores: quem gera é `src/data`). */
export interface YouthRequest {
  teamId: TeamId
  tier: number
  reputation: number
  positions: Position[]
  /** Ano da nova temporada. */
  year: number
}

export interface SeasonSummary {
  year: number
  champions: TeamId[]
  promoted: TeamId[]
  relegated: TeamId[]
  userTeamId: TeamId
  userTier: number
  userPosition: number
}
