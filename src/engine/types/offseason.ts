import type { PlayerId, TeamId } from './common'
import type { Nationality, Position } from './player'
import type { LeagueEconomy } from './team'

/** Linha resumida da classificação final: time, jogos, vitórias, empates, derrotas, gols pró, gols contra, pontos. */
export type ArchivedRow = [teamId: string, played: number, wins: number, draws: number, losses: number, goalsFor: number, goalsAgainst: number, points: number]

/** A virada de temporada de um país: o relatório e a classificação final de cada liga dele (antes da virada). */
export interface TurnRecord {
  pyramid: string
  /** Ano em que a temporada começou e o nome dela ("2026" ou "2026/27"). */
  year: number
  label: string
  report: OffseasonReport
  tables: { competitionId: string; tier: number; rows: ArchivedRow[] }[]
}

/** Jogador que saiu do jogo ou do clube na virada de temporada (para o resumo na tela). */
export interface DepartedPlayer {
  playerId: PlayerId
  name: string
  age: number
  teamId: TeamId | null
}

/** O que a virada de temporada fez (derivado na hora; o jogo guarda só o resumo por ano). */
export interface OffseasonReport {
  /** Ano em que a temporada que acabou começou. */
  year: number
  /** Pirâmide (país) que virou a temporada e o nome da temporada ("2026" ou "2026/27"). */
  pyramid?: string
  label?: string
  /** Campeão de cada série (índice = série − 1). */
  champions: TeamId[]
  /** Campeão de cada competição (todas as ligas do mundo), pelo id da competição. */
  championsByCompetition?: Record<string, TeamId>
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
  /** Jovens que chegaram à base, por time. */
  academyArrivals: Record<TeamId, number>
  /** Jovens da base promovidos ao profissional pela IA, e quantos foram dispensados (por time). */
  academyPromoted: Record<TeamId, number>
  academyReleased: Record<TeamId, number>
  /** Jovens do time do jogador que fizeram 20 anos e esperam a decisão (promover ou dispensar). */
  academyPending: PlayerId[]
  reputationChanges: Record<TeamId, { from: number; to: number }>
  /** Pré-contratos que valeram na virada: o jogador mudou de clube de graça. */
  preContracts: { playerId: PlayerId; fromTeamId: TeamId; toTeamId: TeamId }[]
}

/** Pedido de jovens ao gerador de dados (o motor não gera jogadores: quem gera é `src/data`). */
export interface YouthRequest {
  teamId: TeamId
  tier: number
  reputation: number
  /** Economia da liga do clube (nível dos jogadores e salários); sem ela, a do Brasil. */
  economy?: LeagueEconomy
  /** País da liga do clube (a base nasce com a nacionalidade dele); sem ele, o Brasil. */
  country?: Nationality
  positions: Position[]
  /** Idade de cada jovem (mesma ordem de `positions`); sem isso o gerador usa a faixa padrão dos jovens do profissional. */
  ages?: number[]
  /** Jovens para a base (15 a 19 anos): o gerador usa a chance de fenômeno da base. */
  academy?: boolean
  /** Ano da nova temporada. */
  year: number
  /** A temporada do país atravessa o ano (os contratos terminam em 30/6). */
  split?: boolean
}

export interface SeasonSummary {
  year: number
  /** Nome da temporada ("2026" ou "2026/27"). */
  label?: string
  champions: TeamId[]
  promoted: TeamId[]
  relegated: TeamId[]
  userTeamId: TeamId
  userTier: number
  userPosition: number
}
