/** Constantes de balanceamento do motor. Mexer só aqui, nunca espalhado pelo código. */
import type { PlayStyle, Position } from './types'

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
   * Calibrado para a escala 1–100: 10 pontos de vantagem ≈ 59%, 30 pontos ≈ 75%.
   */
  duelK: 0.037,
  /** Chance de a posse chegar ao terço final e virar jogada (o resto é troca de passes sem perigo). */
  attackRate: 0.55,
  /** Substituições permitidas por time. */
  maxSubs: 5,
  /** Paradas para substituir (momentos distintos) além do intervalo, como no futebol. Várias trocas na mesma parada contam uma só. */
  maxSubStops: 3,
  /** Minuto do intervalo: trocas feitas nele não gastam parada. */
  halftimeMinute: 45,

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
  xg: { longShot: 0.031, inBox: 0.124, header: 0.084, oneOnOne: 0.36, penalty: 0.76, freeKick: 0.06 } satisfies Record<ShotType, number>,
  /** Chance de a finalização ser bloqueada antes de chegar ao goleiro. */
  blockChance: { longShot: 0.25, inBox: 0.2, header: 0.05, oneOnOne: 0, penalty: 0, freeKick: 0.3 } satisfies Record<ShotType, number>,
  /** Quando não é gol (nem bloqueio): chance de ir no alvo (defesa do goleiro). */
  onTargetIfMissed: { longShot: 0.35, inBox: 0.45, header: 0.4, oneOnOne: 0.6, penalty: 0.6, freeKick: 0.35 } satisfies Record<ShotType, number>,
  /** Sensibilidade da finalização: e^(shotK × (finalizador − goleiro)) multiplica o xG. */
  shotK: 0.016,
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

  /** Fator casa: multiplica todos os atributos do mandante. Cresce com a lotação do estádio. */
  home: {
    /** Vantagem com estádio vazio. */
    base: 0.05,
    /** Vantagem extra com estádio cheio (proporcional à ocupação). */
    crowd: 0.025,
    /** Fração da torcida que vai ao jogo (estimativa de público até existir bilheteria). */
    fanTurnout: 0.012,
    minFill: 0.2,
    /**
     * Nível dos titulares (força geral média) em que a vantagem vale o configurado acima. Os atributos
     * são multiplicados pelo fator casa, então o mesmo percentual rende menos pontos de atributo num
     * elenco mais fraco; a vantagem é escalada por referência/nível para valer igual em qualquer série.
     * Fica na média dos titulares da Série A gerada.
     */
    referenceLevel: 65,
  },

  /** Condição física: cai durante o jogo e reduz os atributos. */
  fatigue: {
    /** Queda por momento para resistência 50 (escala: (1,5 − resistência/100)). */
    perMoment: 0.3,
    style: { possession: 0.9, 'counter-attack': 1, 'high-press': 1.2 } satisfies Record<PlayStyle, number>,
    /** Cada nível de mentalidade ofensiva cansa um pouco mais. */
    perMentality: 0.05,
    /** Com condição 0, atributos físicos caem até este fator; os demais até `otherFloor`. */
    physicalFloor: 0.6,
    otherFloor: 0.85,
    /** IA troca jogadores cansados a partir deste minuto e abaixo desta condição. */
    subFromMinute: 60,
    subBelowFitness: 70,
    /** Até este minuto a IA guarda uma troca para emergências (lesão). */
    keepOneSubUntil: 80,
  },

  /** Posição improvisada: quanto da penalidade de posição (POSITION_FIT) vale nos duelos. */
  improvisationWeight: 0.6,

  tactics: {
    possession: {
      /** Mais controle no meio (pontos de atributo), menos cara a cara. */
      control: 6,
      oneOnOne: -0.4,
      playType: { through: 1.2, longShot: 0.7 } as Partial<Record<PlayType, number>>,
    },
    counter: {
      /** Abre mão da bola... */
      control: -5,
      /** ...mas, ao recuperá-la, sai em transição rápida. */
      transitionChance: 0.33,
      transitionProgression: 0.3,
      transitionOneOnOne: 0.7,
    },
    highPress: {
      /** Recupera a bola mais alto... */
      press: 9,
      /** ...e deixa espaço nas costas (passe em profundidade e cara a cara do rival). */
      spaceBehind: 0.25,
      /** Bola roubada no campo do rival: chance de sair em transição (como no contra-ataque, menos frequente). */
      transitionChance: 0.2,
    },
    /**
     * Mentalidade (−2 a +2): muda a frequência de ataques, o espaço deixado atrás e
     * o controle do meio (`control`, pontos por nível: quem recua cede a bola).
     */
    mentality: { attackRate: 0.08, openness: 0.2, control: 2.5 },
    /**
     * Comportamento conforme o placar (IA): a partir de `fromMinute`, quem vence recua
     * (`shift` níveis de mentalidade a menos) e quem perde se lança ao ataque.
     */
    gameState: { fromMinute: 65, shift: 2 },
    /**
     * Time bem mais fraco recua (IA): a cada `gap` pontos de força média dos titulares
     * abaixo do rival (já com fator casa), um nível de mentalidade a menos, até `maxShift`.
     */
    underdog: { gap: 3, maxShift: 2 },
  },

  /** Moral, forma e consistência: efeitos pequenos, multiplicam todos os atributos. */
  modifiers: {
    /** Moral 0–100: cada 30 pontos acima/abaixo do neutro valem `effect`. */
    morale: { neutral: 70, effect: 0.02 },
    /** Forma (média das últimas notas, 0 = sem jogos): `perPoint` por ponto de nota acima/abaixo do neutro. */
    form: { neutral: 6.5, perPoint: 0.015, maxEffect: 0.03 },
    /** Consistência 1–100: variação do "dia" do jogador; consistência 0 tem desvio `maxSd`, 100 não varia. */
    consistency: { maxSd: 0.14 },
  },

  /** Formação: número de jogadores por setor (referência: 4 no meio e na defesa, 2 no ataque). */
  formation: {
    /** Pontos de controle/pressão por meio-campista acima/abaixo de 4. */
    perMidfielder: 2.5,
    /** Deslocamento contra a progressão rival por defensor acima/abaixo de 4. */
    perDefender: 0.08,
    /** Deslocamento a favor da progressão por atacante acima/abaixo de 2. */
    perAttacker: 0.06,
    /** Quantos meio-campistas (os melhores) definem a qualidade do meio; os demais contam pelo número. */
    midfieldCore: 3,
    referenceMidfielders: 4,
    referenceDefenders: 4,
    referenceAttackers: 2,
    /**
     * Perfil de cada formação, calibrado por medição (npm run test:balance) para que, com elencos de mesma
     * força, nenhuma formação seja melhor que as outras na média: cada uma muda o jeito de jogar, não o nível.
     * `control`: pontos de controle e pressão no meio (posse); `attack`: deslocamento a favor da própria progressão.
     */
    profile: {
      '4-4-2': { control: 5.7, attack: 0.4 },
      '4-3-3': { control: 2.7, attack: 0.1 },
      '4-2-3-1': { control: 2, attack: 0.5 },
      '4-3-1-2': { control: 0.4, attack: 0.02 },
      '4-1-4-1': { control: -1.3, attack: 0.45 },
      '3-5-2': { control: -3, attack: -0.1 },
    } as Record<string, { control: number; attack: number }>,
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

// ---------------------------------------------------------------------------
// Calendário
// ---------------------------------------------------------------------------

export const SEASON = {
  /** A primeira rodada é no primeiro sábado em ou depois desta data (mês 1–12). */
  startMonth: 4,
  startDay: 11,
  /** Toda rodada múltipla deste número é no meio de semana (quarta); as demais, no fim de semana. */
  midweekEvery: 5,
  /** A última rodada tem todos os jogos juntos, no domingo. */
  finalRoundSameDay: true,
  /** Maior sequência permitida de jogos seguidos em casa ou fora. */
  maxVenueStreak: 2,
} as const

// ---------------------------------------------------------------------------
// Condição dos jogadores entre as partidas
// ---------------------------------------------------------------------------

export const CONDITION = {
  /** Condição física recuperada por dia (pontos de 0 a 100) por um jogador de resistência média. */
  fitnessPerDay: 4,
  /** Quanto a resistência acelera a recuperação: a cada +40 de resistência acima de 60, +este valor × 100%. */
  staminaEffect: 0.2,
  /** Moral volta para o neutro: fração da distância percorrida por dia. */
  moraleDriftPerDay: 0.03,
  /** Moral de todo o elenco conforme o resultado do time. */
  morale: { win: 4, draw: 0, loss: -4 },
  /** Moral individual: pontos por nota acima (ou abaixo) de 6,5, para quem jogou. */
  moralePerRating: 1.5,
  moraleNeutralRating: 6.5,
  /** Minutos mínimos para a nota entrar na forma e mexer na moral individual. */
  minMinutesForForm: 20,
  /** A forma é a média das notas das últimas partidas (quantas guardar). */
  formMatches: 5,
  /** Suspensão por cartão vermelho (jogos). */
  redCardGames: 1,
  /** A cada tantos amarelos acumulados, um jogo de suspensão (e o contador volta a zero). */
  yellowsPerSuspension: 3,
} as const

/** Escalação automática com o elenco cansado: a IA troca titulares desgastados por descansados. */
export const LINEUP = {
  /** Parcela da força que é física (usa o piso físico de MATCH.fatigue); o resto usa o piso dos demais atributos. */
  physicalShare: 0.4,
  /** Multiplica o cansaço percebido na escolha (>1 = poupa jogadores mais cedo que o necessário). */
  restBias: 3,
} as const

// ---------------------------------------------------------------------------
// Finanças
// ---------------------------------------------------------------------------

export const FINANCE = {
  ticket: {
    /** Preço padrão do ingresso: base + perReputation × reputação do time. */
    base: 8,
    perReputation: 1.6,
    min: 5,
    max: 300,
    /**
     * Elasticidade da procura: público = procura base × (preço padrão / preço)^elasticidade. Acima de 1,
     * subir o preço só compensa quando o estádio está cheio; abaixo do ponto em que a procura iguala a
     * capacidade, cada real a mais reduz a receita.
     */
    elasticity: 1.2,
    /** Rival maior atrai mais gente: cada ponto de reputação do visitante acima/abaixo de 10. */
    opponentPerReputation: 0.02,
    opponentFactorMin: 0.8,
    opponentFactorMax: 1.2,
  },
  /** Patrocínio por ano: base + perReputation × reputação^power. Pago por mês. */
  sponsorship: { base: 4_000_000, perReputation: 900_000, power: 1.2 },
  /** Custo anual de operação (estádio, estrutura, comissão): por lugar da capacidade. Pago por mês. */
  operationsPerSeat: 110,
  /** Parcela do saldo que fica disponível para transferências (recalculada todo mês). */
  transferShare: 0.4,
  /** Saldo acima de (receita anual × isto) é reinvestido em estrutura (clubes da IA): evita acumular sem limite. */
  ceilingYears: 1.5,
  /** Parcela do excesso acima do teto investida por mês. */
  ceilingSpendPerMonth: 0.3,
} as const
