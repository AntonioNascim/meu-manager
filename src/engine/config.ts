/** Constantes de balanceamento do motor. Mexer só aqui, nunca espalhado pelo código. */
import type { Position } from './types'

/** Escala dos atributos visíveis, ocultos e da força geral (inteiros). A reputação dos times continua de 1 a 20. */
export const ATTRIBUTE_MIN = 1
export const ATTRIBUTE_MAX = 100

/**
 * Multiplicador da força de um jogador conforme a posição em que joga.
 * São proporções, então valem em qualquer escala (ex.: 80 de força vira 60 improvisado).
 */
export const POSITION_FIT = {
  /** Posição secundária: penalidade pequena (80 vira ~74). */
  secondary: 0.93,
  /** Posição que não é a principal nem secundária (80 vira 60). */
  outOfPosition: 0.75,
  /** Goleiro na linha ou jogador de linha no gol (80 vira 24). */
  goalkeeperMismatch: 0.3,
} as const

/** Quantos reservas entram no banco ao montar a escalação automática. */
export const BENCH_SIZE = 7

/**
 * Escalação automática: formações com pontuação até esta fração abaixo da melhor
 * são consideradas equivalentes (a IA sorteia entre elas para variar).
 */
export const FORMATION_TIE_TOLERANCE = 0.005

// ---------------------------------------------------------------------------
// Motor de partida
// ---------------------------------------------------------------------------

export type PlayType = 'dribble' | 'through' | 'cross' | 'longShot'
export type ShotType = 'longShot' | 'inBox' | 'header' | 'oneOnOne' | 'penalty' | 'freeKick'

export const MATCH = {
  /** Momentos de posse por partida (cada um pode terminar em qualquer etapa). */
  moments: 96,
  /**
   * k da fórmula do duelo: chance = 1 / (1 + e^(−k × (ataque − defesa))).
   * Calibrado para a escala 1–100: 10 pontos de vantagem ≈ 65% num duelo equilibrado.
   */
  duelK: 0.06,
  /** Chance de a posse chegar ao terço final e virar jogada (o resto é troca de passes sem perigo). */
  attackRate: 0.56,
  /** Substituições permitidas por time. */
  maxSubs: 5,

  /** Deslocamento da curva do duelo por etapa (negativo = mais difícil para o ataque). */
  offset: {
    dribble: -0.5,
    through: -0.7,
    cross: 0,
    /** Passe em profundidade que vira cara a cara (velocidade do atacante × da defesa). */
    oneOnOne: -1.2,
    /** Disputa de cabeça após cruzamento. */
    header: -0.4,
    /** Disputa de cabeça após escanteio (área cheia). */
    cornerHeader: -0.9,
  },

  /** Peso de cada posição para ser o condutor da jogada. */
  carrierWeight: {
    GK: 0, CB: 0.15, RB: 0.55, LB: 0.55, DM: 0.45, CM: 0.9, AM: 1.3, RW: 1.15, LW: 1.15, ST: 1.1,
  } satisfies Record<Position, number>,

  /** Tipo de jogada conforme a posição do condutor. */
  playTypeWeight: {
    GK: { dribble: 0, through: 1, cross: 0, longShot: 0 },
    CB: { dribble: 0.1, through: 0.55, cross: 0.15, longShot: 0.2 },
    RB: { dribble: 0.25, through: 0.1, cross: 0.6, longShot: 0.05 },
    LB: { dribble: 0.25, through: 0.1, cross: 0.6, longShot: 0.05 },
    DM: { dribble: 0.15, through: 0.55, cross: 0, longShot: 0.3 },
    CM: { dribble: 0.2, through: 0.5, cross: 0.05, longShot: 0.25 },
    AM: { dribble: 0.3, through: 0.45, cross: 0, longShot: 0.25 },
    RW: { dribble: 0.4, through: 0.1, cross: 0.45, longShot: 0.05 },
    LW: { dribble: 0.4, through: 0.1, cross: 0.45, longShot: 0.05 },
    ST: { dribble: 0.55, through: 0.25, cross: 0, longShot: 0.2 },
  } satisfies Record<Position, Record<PlayType, number>>,

  /** Quem marca o condutor: peso de cada posição do time que defende (as não listadas valem `fallback`). */
  markerWeight: {
    GK: {},
    CB: { ST: 2, AM: 1 },
    RB: { LW: 2, LB: 1, CM: 0.5 },
    LB: { RW: 2, RB: 1, CM: 0.5 },
    DM: { AM: 2, CM: 1.5, ST: 1 },
    CM: { CM: 2, DM: 1.5, AM: 1 },
    AM: { DM: 3, CM: 1.5, CB: 1 },
    RW: { LB: 3, CB: 1, DM: 0.5 },
    LW: { RB: 3, CB: 1, DM: 0.5 },
    ST: { CB: 3, DM: 1 },
  } satisfies Record<Position, Partial<Record<Position, number>>>,
  markerFallbackWeight: 0.1,

  /** Quem recebe o passe em profundidade / o cruzamento. */
  throughReceiverWeight: { ST: 3, RW: 1.5, LW: 1.5, AM: 1, CM: 0.3 } satisfies Partial<Record<Position, number>>,
  crossReceiverWeight: { ST: 3, AM: 1, RW: 0.7, LW: 0.7, CM: 0.5, CB: 0.3, DM: 0.3 } satisfies Partial<Record<Position, number>>,
  /** Quem disputa a bola aérea na defesa. */
  aerialDefenderWeight: { CB: 3, DM: 1, RB: 0.5, LB: 0.5 } satisfies Partial<Record<Position, number>>,

  /** Tipo de finalização após drible certo: atacantes vs. demais. */
  shotAfterDribble: {
    attacker: { oneOnOne: 0.2, inBox: 0.6, longShot: 0.2 },
    other: { oneOnOne: 0, inBox: 0.4, longShot: 0.6 },
  },

  /** xG base por tipo de finalização. */
  xg: { longShot: 0.035, inBox: 0.12, header: 0.09, oneOnOne: 0.38, penalty: 0.76, freeKick: 0.06 } satisfies Record<ShotType, number>,
  /** Chance de a finalização ser bloqueada antes de chegar ao goleiro. */
  blockChance: { longShot: 0.25, inBox: 0.2, header: 0.05, oneOnOne: 0, penalty: 0, freeKick: 0.3 } satisfies Record<ShotType, number>,
  /** Quando não é gol (nem bloqueio): chance de ir no alvo (defesa do goleiro). */
  onTargetIfMissed: { longShot: 0.35, inBox: 0.45, header: 0.4, oneOnOne: 0.6, penalty: 0.6, freeKick: 0.35 } satisfies Record<ShotType, number>,
  /** Sensibilidade da finalização: e^(shotK × (finalizador − goleiro)) multiplica o xG. */
  shotK: 0.02,
  maxGoalChance: 0.95,

  corner: { afterBlock: 0.45, afterSave: 0.35, afterLostCross: 0.35, afterLostHeader: 0.3 },
  ownGoalOnLostHeader: 0.01,

  foul: {
    /** Falta do marcador quando o drible dá errado / quando ele é batido. */
    onFailedDribble: 0.4,
    onBeaten: 0.12,
    /** Falta no meio-campo em momentos sem jogada de ataque. */
    midfield: 0.5,
    /** Falta perto da área: chance de pênalti e de cobrança direta. */
    penalty: 0.075,
    freeKickShot: 0.25,
  },
  card: {
    yellowPerFoul: 0.16,
    straightRedPerFoul: 0.004,
    /** Jogador já advertido se cuida: chance de novo amarelo multiplicada por isto. */
    bookedCaution: 0.35,
  },

  /** Chance de lesão por momento, por jogador com propensão 50 (escala com a propensão). */
  injuryPerMoment: 1.5e-4,
  /** Condição física abaixo disto aumenta o risco de lesão. */
  injuryLowFitness: 60,
  injuryLowFitnessFactor: 1.5,
} as const

/** Nota do jogador: parte de `base` (6,0) e soma/subtrai por ação. */
export const RATING = {
  base: 6,
  goal: 1,
  ownGoal: -1,
  assist: 0.6,
  keyPass: 0.15,
  shotOnTarget: 0.1,
  shotOff: -0.05,
  dribbleWon: 0.1,
  dribbleLost: -0.05,
  tackleWon: 0.12,
  headerWon: 0.08,
  foul: -0.1,
  yellow: -0.4,
  red: -1.5,
  penaltyMissed: -0.6,
  save: 0.3,
  goalkeeperConceded: -0.35,
  defenderConceded: -0.15,
  goalkeeperCleanSheet: 0.6,
  defenderCleanSheet: 0.4,
  /** Minutos mínimos para ganhar o bônus de jogo sem sofrer gol. */
  cleanSheetMinMinutes: 60,
  win: 0.3,
  loss: -0.3,
  /** Abaixo disto a nota é puxada para 6,0 (pouco tempo em campo). */
  fullWeightMinutes: 30,
  min: 1,
  max: 10,
} as const
