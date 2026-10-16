/**
 * Calibragem da geração do mundo (escala de força 1 a 100).
 * Mexer aqui para deixar os times mais fortes/fracos ou os craques mais raros.
 */
export const GENERATION = {
  /**
   * Força média dos 11 titulares conforme a reputação (1 a 20) do time, por série:
   * `base` na reputação de referência, somando `perReputation` por ponto acima dela.
   */
  teamLevel: {
    1: { base: 62, referenceReputation: 7, perReputation: 0.55 },
    2: { base: 50, referenceReputation: 3, perReputation: 2.2 },
    3: { base: 40, referenceReputation: 2, perReputation: 1.7 },
  },
  /** Desvio padrão do nível entre times de mesma reputação (pontos de força dos titulares). */
  teamLevelSd: 0.4,
  /** Desvio padrão do talento individual em torno do nível do time. */
  talentSd: 2.5,
  /** Quanto o reserva é mais fraco que o titular do time. */
  backupPenalty: 9,
  /** Nenhum jogador profissional nasce com nível-base abaixo disto (já descontada a idade). */
  qualityFloor: 36,
  /** O piso da Série C é menor: com o piso geral, reservas e garotos de clube pequeno ficariam perto dos titulares. */
  qualityFloorByTier: { 1: 36, 2: 36, 3: 28 } as Record<number, number>,

  /** Craques: raros e só em times grandes da Série A. */
  star: {
    minReputation: 12,
    /** Chance por titular no time de reputação máxima (19); cai linearmente até `minReputation`. */
    maxChance: 0.08,
    bonusMin: 15,
    bonusMax: 22,
  },

  /** Ruído individual de cada atributo. */
  attributeNoiseSd: 4.5,
  /** Acima deste valor o atributo é comprimido, para que valores altos sejam raros. */
  softCap: 90,
  softCapFactor: 0.5,
  /** Pontos a mais/menos por importância do atributo na posição (acima/abaixo da média). */
  emphasis: { above: 25, below: 55 },
  /** Reflexos e saída do gol de jogadores de linha. */
  outfieldGoalkeeperRange: [5, 15],

  age: {
    fullGrowthAge: 22,
    youthPenaltyPerYear: 2,
    declineStartAge: 30,
    physicalDeclinePerYear: 2.25,
    strengthDeclineShare: 0.4,
    mentalGainStartAge: 26,
    mentalGainPerYear: 1.25,
    mentalGainMax: 7.5,
  },
  /** Potencial: pontos de crescimento por ano até os 26 (mín., máx.) e bônus aleatório. */
  growth: { untilAge: 26, perYearMin: 1, perYearMax: 3.5, randomMax: 4 },

  hidden: {
    consistency: { mean: 60, sd: 15 },
    injuryProneness: { mean: 50, sd: 20 },
    professionalism: { mean: 60, sd: 17 },
  },
} as const
