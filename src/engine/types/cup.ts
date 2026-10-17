import type { MatchId, TeamId } from './common'
import type { Region } from './competition'
import type { Nationality } from './player'

/** Formato da copa: só mata-mata, grupos seguidos de mata-mata, ou uma fase de liga (tabela única) seguida de mata-mata. */
export type CupFormat = 'knockout' | 'groups-knockout' | 'league-knockout'

/** De onde vêm os clubes de uma vaga. */
export type CupEntrantSource =
  /** Clubes de uma liga: com `positions` ([de, até] inclusive), os que terminaram a temporada passada nessas posições; sem, todos os que estão na liga hoje. */
  | { type: 'league'; league: string; positions?: [number, number] }
  /** Campeão ou vice de outra copa na temporada passada. */
  | { type: 'cup'; cup: string; place: 'winner' | 'runner-up' }

/** Uma vaga na copa: de onde vem o clube, em que fase ele entra e quem ocupa se o primeiro escolhido já está na copa. */
export interface CupEntrant {
  source: CupEntrantSource
  /** Se o clube já se classificou por outra vaga, vale este (ex.: o vice da liga quando o campeão da liga também ganhou a copa). */
  fallback?: CupEntrantSource
  /** Fase em que entra (0 = a primeira fase da copa; padrão 0). */
  stage?: number
}

/** Uma fase de mata-mata. */
export interface CupStageSpec {
  name: string
  /** 1 = jogo único, 2 = ida e volta. */
  legs: 1 | 2
  /** Dia de referência do primeiro jogo (mês e dia): o jogo vai para a primeira quarta-feira livre a partir dele. */
  date: [number, number]
  /** Dias entre a ida e a volta (padrão `CUP.legGapDays`). */
  legGap?: number
  /** Jogo único num estádio neutro (final de jogo único): sem vantagem de casa nem bilheteria. */
  neutral?: boolean
}

/** Fase de grupos. */
export interface CupGroupsSpec {
  name: string
  count: number
  /** Quantos de cada grupo passam. */
  advance: number
  /** 1 = só ida, 2 = ida e volta dentro do grupo. */
  legs: 1 | 2
  /** Dia de referência da primeira rodada de grupos; as outras vêm de `gapDays` em `gapDays`. */
  date: [number, number]
  gapDays?: number
}

/** Fase de liga: uma tabela só, cada clube enfrenta `matchesPerTeam` rivais de potes diferentes. */
export interface CupLeaguePhaseSpec {
  name: string
  /** Número de potes (por força); cada clube enfrenta o mesmo tanto de rivais de cada pote. */
  pots: number
  matchesPerTeam: number
  date: [number, number]
  gapDays?: number
  /** Os melhores `direct` pulam a primeira fase de mata-mata; os `playoff` seguintes jogam essa fase. */
  direct: number
  playoff: number
}

export interface CupDiscipline {
  /** Amarelos acumulados que geram suspensão (neste torneio). */
  yellowsPerSuspension: number
  /** Jogos de suspensão por vermelho. */
  redCardGames: number
  /** Depois desta fase (índice) os amarelos acumulados zeram. */
  clearYellowsAfterStage?: number
}

/** Premiação em dinheiro (valores do Brasil; vezes o índice de receita da liga do clube). */
export interface CupPrize {
  /** Pago a cada clube quando ele estreia em cada fase (índice = fase). */
  perStage: number[]
  champion: number
  runnerUp?: number
}

/** Definição de uma copa (vem do pacote de dados). */
export interface CupSpec {
  id: string
  name: string
  kind: 'cup' | 'supercup'
  /** Copa de um país (a pirâmide dele) ou de uma região (continental). */
  country?: Nationality
  region?: Region
  format: CupFormat
  entrants: CupEntrant[]
  groups?: CupGroupsSpec
  leaguePhase?: CupLeaguePhaseSpec
  /** Fases de mata-mata, da primeira à final. */
  stages: CupStageSpec[]
  /** Sorteio: aleatório, ou com cabeças de chave (os mais fortes pela reputação são separados e, no mata-mata, ficam com as folgas). */
  seeding: 'random' | 'seeded'
  /** Mandante do jogo único: sorteado ou o clube de menor reputação. */
  homeOfSingleLeg: 'draw' | 'lower-reputation'
  /** Regra do gol fora (desligada por padrão): só na ida e volta. */
  awayGoals: boolean
  extraTime: boolean
  penalties: boolean
  discipline: CupDiscipline
  prize: CupPrize
}

/** Fase já sorteada: quem jogou (e quem folgou) nela. */
export interface CupStageLog {
  stage: number
  kind: 'groups' | 'league' | 'knockout'
  /** Nome para mostrar. */
  name: string
  /** Todos os clubes da fase, com os que folgam (passam direto para a seguinte). */
  teams: TeamId[]
  byes: TeamId[]
}

/** Uma copa da temporada: a definição, quem se classificou e o que já foi sorteado. */
export interface Cup {
  id: string
  name: string
  year: number
  spec: CupSpec
  entrants: { teamId: TeamId; stage: number }[]
  log: CupStageLog[]
  /** Preenchido quando a copa acaba. */
  winnerId?: TeamId
  runnerUpId?: TeamId
}

/** Campeão e vice de cada edição, por copa (alimenta as vagas "campeão da copa" na temporada seguinte). */
export type CupHistory = Record<string, { year: number; winnerId: TeamId; runnerUpId?: TeamId }[]>

/** Marcação de uma partida de copa. */
export interface MatchCupInfo {
  /** Índice da fase na copa (0 = a primeira fase jogada). */
  stage: number
  kind: 'group' | 'league' | 'knockout'
  /** Confronto dentro da fase de mata-mata. */
  tie?: number
  leg?: 1 | 2
  group?: number
  /** Estádio neutro. */
  neutral?: boolean
  /** Para a engine do jogo: id das partidas da mesma disputa (ida), para somar o placar. */
  firstLegId?: MatchId
}
