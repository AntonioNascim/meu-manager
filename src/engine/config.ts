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
  /** Divisão do orçamento: o total é compras + salários mensais × este número de meses (mover dinheiro de um lado para o outro não muda o total). */
  budget: { salaryMonths: 12 },
  /** Pedir verba: o caixa mantém `reserveMonths` meses de folha + operação, a diretoria só ouve acima da confiança mínima, libera até `maxShareOfCash` do caixa (× confiança) e nada abaixo de `minGrant`. */
  funds: { reserveMonths: 3, minConfidence: 40, maxShareOfCash: 0.2, minGrant: 500_000 },
  /** Máximo de lançamentos guardados por clube na temporada (os mais antigos saem; o saldo e o balanço por categoria não dependem do que sai). */
  ledgerMax: 400,
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
  sponsorship: { base: 5_500_000, perReputation: 900_000, power: 1.2 },
  /** Cota de TV por clube e por ano, conforme a divisão (paga por mês): bem maior na Série A. */
  tvRights: { 1: 20_000_000, 2: 3_000_000 } as Record<number, number>,
  /** Custo anual de operação (estádio, estrutura, comissão): por lugar da capacidade. Pago por mês. */
  operationsPerSeat: 110,
  /** Parcela do saldo que fica disponível para transferências (recalculada todo mês). */
  transferShare: 0.4,
  /** Saldo acima de (receita anual × isto) é reinvestido em estrutura (clubes da IA): evita acumular sem limite. */
  ceilingYears: 1.5,
  /** Parcela do excesso acima do teto investida por mês. */
  ceilingSpendPerMonth: 0.3,
  /** Orçamento de salários do jogador depois da virada: folha × isto (o da IA é folha × 1,1). */
  salaryBudgetMargin: 1.1,
  /** Folha sustentável da IA: (receita esperada − operação) × isto, por ano. Acima disso a IA não aumenta a folha e corta. */
  payrollShareOfNet: 0.95,
  /** A IA só corta salários quando a folha passa da sustentável por esta margem. */
  payrollCutMargin: 1.0,
  /** A IA só corta se o saldo aguenta menos que isto de anos de déficit (folha acima da sustentável). */
  cutRunwayYears: 2,
  /** Se a folha passa da sustentável por mais que isto, a IA corta até titulares (peças-chave ficam). */
  hardCutMargin: 1.15,
} as const

// ---------------------------------------------------------------------------
// Mercado de transferências
// ---------------------------------------------------------------------------

export const MARKET = {
  /** Valor de mercado: base × e^(perPoint × (força efetiva − referência)), vezes idade e contrato. */
  value: {
    base: 300_000,
    perPoint: 0.115,
    referenceOverall: 40,
    minimum: 20_000,
    /** Peso da distância até o potencial (só para jovens). */
    potentialWeight: 0.6,
    /** Até esta idade o potencial vale por inteiro; some em `youthSpan` anos. */
    youthUntil: 21,
    youthSpan: 6,
    /** Multiplicador por idade: o primeiro par cuja idade máxima cobre o jogador. */
    ageFactors: [[19, 1.15], [23, 1.1], [28, 1], [29, 0.85], [30, 0.7], [31, 0.55], [32, 0.4], [33, 0.3], [34, 0.2]] as readonly (readonly [number, number])[],
    olderFactor: 0.12,
    /** Contrato curto vale menos: de `shortestFactor` (sem contrato) a 1 com `fullYears` anos ou mais. */
    contract: { shortestFactor: 0.6, fullYears: 3 },
  },
  /** Quanto o clube pede em relação ao valor de mercado, conforme a importância do jogador para ele. */
  ask: { key: 1.5, starter: 1.25, rotation: 1, surplus: 0.85 },
  /** Taxa de empréstimo (por temporada) em fração do valor. */
  loanFeeShare: 0.12,
  /** Mínimo de jogadores por posição que o clube mantém depois de vender/emprestar/liberar. */
  minByPosition: { GK: 2, RB: 1, LB: 1, CB: 2, DM: 2, CM: 2, AM: 1, RW: 1, LW: 1, ST: 2 } as Record<string, number>,
  /** Elenco mínimo depois de uma saída (o limite do jogo é SQUAD_MIN). */
  minSquadAfterSale: 19,
  /** Máximo antes de contratar (o limite do jogo é SQUAD_MAX). */
  maxSquadBeforeSigning: 29,

  windows: {
    /** Janela do meio do ano: mês/dia de abertura e de fechamento. */
    midYear: { start: [7, 1], end: [7, 31] } as { start: [number, number]; end: [number, number] },
    /** A IA negocia a cada tantos dias dentro da janela. */
    tickDays: 7,
    /** Dias até a resposta a uma proposta do jogador. */
    responseDays: 2,
    /** Dias de validade de uma proposta recebida. */
    offerValidDays: 7,
  },

  /** Pré-contrato: abre em 1º do mês `fromMonth`. A IA tenta nos primeiros dias dos meses `months`, com moderação: chance por clube em cada rodada, no máximo `maxPerClub` por clube, ninguém perde mais que `maxLossPerClub` jogadores e só vale a pena com ganho de força maior que o da compra normal. */
  preContract: { fromMonth: 7, ai: { months: [7, 8, 9, 10, 11] as readonly number[], chance: 0.2, maxPerClub: 1, maxLossPerClub: 2, extraUpgrade: 1 } },
  /** Listas: preço anunciado (fração do valor de mercado / da taxa de empréstimo), quantos anúncios cada clube da IA mantém e quando o elenco é curto demais para anunciar. */
  listing: { transferShare: 0.7, loanShare: 0.8, maxPerTeam: 2, minSquad: 22, listChance: 0.5, loanAge: 24, youngLoanShare: 0.7, oldLoanShare: 0.15, userBias: 0.6 },
  /** Busca de jogadores: atalhos "Barganhas" (valor até esta fração do valor pela força sozinha) e "Jovens promessas" (idade e potencial estimado). */
  search: { bargainShare: 0.55, prospectAge: 21, prospectPotential: 78 },
  /** Interesse do jogador em vir para o seu clube: salário mínimo que ele aceitaria ÷ salário esperado pela força dele. */
  interest: { high: 0.8, medium: 1, low: 1.6 },

  /** Decisão do jogador: soma ponderada de salário, reputação do clube e tempo de jogo; aceita se ≥ 0. */
  player: {
    salaryWeight: 1,
    /** Cada 1,5× no salário vale 1 ponto (limitado a ±salaryClamp pontos). */
    salaryStep: 1.5,
    salaryClamp: 2,
    reputationWeight: 0.8,
    /** Diferença de reputação (ponto) que vale 1 ponto de reputação, limitada a ±1,5. */
    reputationStep: 6,
    playingTimeWeight: 0.8,
    /** Reputação que o jogador livre considera como "clube de origem". */
    freeAgent: {
      a: { base: 62, referenceReputation: 7, perReputation: 0.55 },
      b: { base: 47, referenceReputation: 3, perReputation: 2.2 },
      min: 3,
      max: 19,
    },
    /** Viés contra mudar de clube. */
    inertia: 0.2,
    /** Tempo de jogo pesa mais para quem é bom: 0,6 + ambition × força/100. */
    ambitionBase: 0.6,
    ambition: 0.6,
    /** No empréstimo, a reputação do novo clube pesa menos. */
    loanReputationShare: 0.5,
  },

  /** Venda, empréstimo e liberação de jogadores do time do jogador. */
  userSale: {
    /** Até quanto (× valor de mercado) um clube interessado paga numa compra / paga de taxa num empréstimo. */
    purchaseWillingness: 1.15,
    loanWillingness: 1.25,
    /** Rescisão ao liberar: fração do salário dos meses de contrato que restam. */
    releaseCostShare: 0.5,
  },

  ai: {
    /** Elenco abaixo disto: o clube sai procurando reforço de profundidade. */
    wantsDepthBelow: 23,
    /** Ganho mínimo de força (pontos) sobre o titular da posição para valer a contratação. */
    minUpgrade: 4,
    /** Idade máxima de quem a IA contrata. */
    maxAge: 33,
    /** Reserva de caixa: meses de folha + operação que o clube não gasta em transferências. */
    reserveMonths: 3,
    /** Clubes que olham o elenco do jogador a cada rodada de negociações, e chance de a proposta sair. */
    userOfferChance: 0.12,
    maxPendingIncoming: 4,
    /** Quanto acima/abaixo do pedido a IA oferece ao jogador (propostas recebidas). */
    userOfferFee: [0.9, 1.25] as readonly [number, number],
    /** Parcela das propostas recebidas que é de empréstimo. */
    userLoanShare: 0.25,
    /** Máximo de contratações por clube por janela. */
    maxSigningsPerWindow: 5,
    /** Elenco acima disto: o clube libera o pior reserva depois de contratar. */
    releaseAbove: 27,
    /** Anos de contrato novo (mín., máx.). */
    contractYears: [1, 4] as readonly [number, number],
  },
} as const

/** Diretoria: a confiança vem dos pontos por jogo comparados à meta e ao limite de demissão. */
export const BOARD = {
  /** Pontos por jogo esperados para quem termina em 1º e em último (interpolação linear entre eles). */
  pointsPerGame: { first: 2.1, last: 0.8 },
  /** Confiança de quem está exatamente na meta. */
  atTarget: 70,
  /** Confiança no limite de demissão (posição de `sackingPosition`). */
  atSacking: 0,
  /** Jogos até a diretoria julgar por inteiro: antes disso a confiança fica perto do neutro. */
  judgeAfterGames: 10,
  /** Abaixo desta confiança (depois do período de graça) o técnico é demitido. */
  dismissBelow: 8,
  /** Abaixo disto o aviso vira alerta; abaixo de `dangerBelow`, perigo. */
  warningBelow: 55,
  dangerBelow: 30,
  /** Dívida: saldo abaixo de (− meses × custo mensal) demite; saldo negativo já tira confiança. */
  debtMonths: 3,
  debtPenaltyMax: 25,
} as const

// ---------------------------------------------------------------------------
// Virada de temporada
// ---------------------------------------------------------------------------

export const OFFSEASON = {
  reputation: {
    /** Pontos de reputação por (posição esperada − posição final) / step, limitados a ±max. */
    positionStep: 5,
    positionMax: 2,
    /** Reputação média de cada divisão e quanto da distância até ela o clube recupera por ano: mantém a distância entre as séries. */
    tierMean: { 1: 12, 2: 5.5 } as Record<number, number>,
    tierPull: 0.3,
    champion: 0,
    promoted: 1,
    relegated: -1,
  },

  /** Evolução anual dos atributos (pontos por ano, sobre todos os atributos do jogador). */
  evolution: {
    /** Ganho médio por ano abaixo de `youthUntil` anos (igual ao `youthPenaltyPerYear` da geração). */
    youthGain: 2,
    youthUntil: 22,
    /** Quem ainda cresce (até esta idade) recebe um bônus/penalidade pela distância até o potencial. */
    growthUntil: 26,
    /** Distância média entre potencial e força geral de quem já amadureceu (22 a 26 anos): o excesso acima disso vira ganho extra. */
    maturePotentialGap: 12,
    /** Potencial alto fica mais perto do teto: a distância de maturidade vai de 12 (potencial `from`) a `minShare` × 12 (potencial `top`). */
    highPotential: { from: 90, top: 100, minShare: 0.35 },
    /** Quanto do excesso de potencial (sobre a média da idade) vira ganho por ano restante até `growthUntil`. */
    potentialPull: 3,
    /** Ruído do ganho do jogador e de cada atributo. */
    playerNoise: 0.8,
    attributeNoise: 1.2,
    /** Desenvolvimento: 0,8 + 0,4 × fração dos minutos jogados; profissionalismo ajusta ±10%. */
    minutesBase: 0.8,
    minutesWeight: 0.4,
    professionalismWeight: 0.2,
    /** Declínio físico (pontos/ano) depois de `declineStartAge`, e leitura de jogo até `mentalGainUntil`. */
    declineStartAge: 30,
    paceStaminaDecline: 2.25,
    strengthDecline: 0.9,
    mentalGainFrom: 26,
    mentalGainUntil: 32,
    mentalGainPerYear: 1.25,
    /** Depois desta idade a técnica também cai. */
    technicalDeclineFrom: 33,
    technicalDecline: 0.8,
  },

  contracts: {
    /** Anos de contrato novo por idade: o primeiro par cuja idade máxima cobre o jogador [mín., máx.]. */
    years: [[22, [3, 5]], [28, [2, 4]], [31, [1, 3]], [99, [1, 1]]] as readonly (readonly [number, readonly [number, number]])[],
    /** A IA só renova quem tem esta importância no elenco ou melhor, ou quem é jovem com potencial. */
    aiMaxAge: 35,
    /** Reserva (sobra) só é renovada até esta idade, enquanto o elenco não chega ao tamanho desejado. */
    reserveMaxAge: 33,
  },

  renewal: {
    /** Pedido salarial: salário de mercado × reputação do clube (cada ponto acima/abaixo da referência desconta/acrescenta isto, entre min e max). */
    referenceReputation: 10,
    reputationDiscount: 0.015,
    reputationMin: 0.85,
    reputationMax: 1.2,
    /** Jovem com potencial pede mais: até +prospectPremium quando faltam `prospectGap` pontos até o potencial. */
    prospectAge: 24,
    prospectPremium: 0.3,
    prospectGap: 20,
    /** Veterano pede menos: −veteranDiscount por ano a partir de `veteranAge`. */
    veteranAge: 32,
    veteranDiscount: 0.06,
    minimumSalary: 5_000,
    /** Aceita até este tanto abaixo do pedido. */
    tolerance: 0.97,
    /** Sem espaço no time, só fica por esta proporção do pedido. */
    benchPremium: 1.35,
  },

  retirement: {
    /** Chance anual = (idade − from) × perYear, limitada a 1; aposentadoria obrigatória em `forcedAge`. */
    from: 33,
    perYear: 0.17,
    forcedAge: 40,
    /** Quem ainda é muito forte joga mais: a chance cai pela metade acima desta força. */
    strongOverall: 70,
  },

  youth: {
    /** Idade dos jovens que sobem da base (mín., máx.). */
    ageRange: [16, 19] as readonly [number, number],
    /** Elenco que a IA tenta ter depois da virada: 24 + (reputação − 3)/16 × 6, arredondado. */
    minPerTeam: 1,
    /** Além de repor as posições descobertas, a base preenche no máximo isto para chegar ao elenco desejado. */
    maxFill: 1,
    /** A IA corta o excesso (reservas de menor valor) até este tamanho. */
    aiMaxSquad: 30,
    /** O elenco do jogador sobe ao menos até aqui com jovens (nunca fica abaixo do mínimo do jogo). */
    userMinSquad: 22,
    /** Promessas: chance de um jovem vir bem acima do nível do time, e quanto (pontos de qualidade). */
    prospectChance: 0.08,
    prospectBonus: [5, 11] as readonly [number, number],
    /** Fenômeno: raríssimo (cerca de 1 por ano no mundo todo); nasce já com qualidade de craque, em qualquer time. */
    wonderkidChance: 0.006,
    wonderkidQuality: 86,
    wonderkidQualitySd: 2.5,
    /** Jovem de base é reserva: qualidade = nível do time − isto (±talento). */
    qualityBelowTeam: { 1: 5, 2: 18 } as Record<number, number>,
  },
} as const

// ---------------------------------------------------------------------------
// Treino
// ---------------------------------------------------------------------------

/**
 * Treino durante a temporada. A evolução que antes vinha toda na virada agora chega aos poucos, a cada avanço
 * (proporcional aos dias que passaram, entre a primeira e a última rodada); a virada cuida só do envelhecimento
 * e do declínio. No treino Normal o total por temporada é o mesmo de antes (`OFFSEASON.evolution`).
 */
export const TRAINING = {
  /** Efeito de cada intensidade: multiplicador do ganho, da recuperação diária da condição, teto da condição e do risco de lesão no treino. */
  intensity: {
    light: { growth: 0.8, recovery: 1.16, fitnessCeiling: 100, injury: 0.5 },
    normal: { growth: 1, recovery: 1, fitnessCeiling: 100, injury: 1 },
    intense: { growth: 1.3, recovery: 0.96, fitnessCeiling: 98, injury: 1.8 },
  },
  /** Multiplica todo o ganho de treino: compensa o treino Leve que a IA faz em semana de jogo no meio da semana, para o mundo evoluir como antes. */
  growthScale: 1.03,
  /** Foco: os atributos do foco evoluem `boost` vezes mais; os outros descem para o total não mudar. */
  focusBoost: 1.8,
  /** Lesão no treino: chance por dia (jogador de propensão média, treino Normal) e duração em dias. */
  injury: { perDay: 0.0004, days: [5, 25] as readonly [number, number], pronenessWeight: 1 },
  /** A IA treina Leve quando o intervalo entre dois avanços é de 2 a 4 dias (semana com jogo no meio da semana; sábado→domingo, 1 dia, não conta). */
  ai: { shortWeek: [2, 4] as readonly [number, number] },
  /** Treino individual: duração, pontos extras por atributo do grupo ao longo dele (limitados pela distância até o potencial). */
  individual: { days: 30, pointsPerAttribute: 0.5 },
  /** Histórico mensal da força: quantos pontos guardar por jogador e quantos dias antes a comparação "desde o último mês" olha. */
  history: { maxEntries: 40, compareDays: 25 },
  /** Faixa estimada do potencial: desvio da estimativa aos 17 anos ou menos e aos 30 ou mais (entre eles, linear). */
  potentialRange: { sdYoung: 6, sdOld: 2, youngAge: 17, oldAge: 30 },
} as const

/** Categorias de base: elenco de jovens separado do profissional, que não joga partidas. */
export const ACADEMY = {
  /** Idades na base: de 15 a 19 anos; quem faz 20 precisa ser promovido ou dispensado. */
  minAge: 15,
  graduationAge: 20,
  /** Máximo de jovens na base de um clube. */
  maxSize: 15,
  /** Quantos chegam por temporada (mín., máx.) e com que idade. */
  arrivals: [3, 5] as readonly [number, number],
  arrivalAge: [15, 17] as readonly [number, number],
  /** Base inicial de um mundo novo (ou de um save antigo): tamanho por reputação e idades. */
  initialSize: { min: 7, max: 12 },
  /** Fração dos minutos possíveis que conta na evolução anual: a base evolui um pouco mais devagar que quem joga. */
  evolutionShare: 0.2,
  /** Qualidade dos garotos da base em relação à dos jovens do profissional (pontos): a IA escolhe os melhores entre vários, então o conjunto precisa começar mais fraco. */
  qualityOffset: { 1: -8, 2: -20 } as Record<number, number>,
  /** Ajuste do potencial dos garotos da base por divisão (pontos): clubes menores formam gente de teto mais baixo. */
  potentialOffset: { 1: -2, 2: -10 } as Record<number, number>,
  /** Chance de promessa entre os garotos da base (são mais garotos por ano que antes, e a IA escolhe os melhores: sem isso sobram craques demais). */
  prospectChance: 0.04,
  /** Fenômeno que chega à base: raro, mas existe (cerca de 1 a cada poucos anos no mundo todo). */
  wonderkidChance: 0.001,
  /** Promoção pela IA: o jovem vale a pena se o valor dele (força + parte da margem até o potencial) alcança o do jogador que ocupa esta posição do ranking do clube, menos a tolerância. Só promove por mérito a partir de `minAge`. */
  ai: { benchmarkRank: 18, tolerance: 0, potentialShare: 0.15, minAge: 19 },
  /** Salário do contrato profissional de jovem: esta fração do salário esperado, no mínimo `OFFSEASON.renewal.minimumSalary`. */
  salaryShare: 0.6,
  contractYears: 3,
  /** Estrelas do potencial (1 a 5): limites mínimos de potencial para 2, 3, 4 e 5 estrelas, e a incerteza (desvio, em pontos) aos 15 e aos 19 anos. */
  stars: { thresholds: [58, 66, 74, 82] as readonly number[], uncertaintyAt15: 5, uncertaintyAt19: 2 },
} as const
