/**
 * O estilo do time no campo 2D (Fase 6D): forma da equipe (altura das linhas, compactação) e jeito de construir o lance (quantos passes curtos,
 * bola longa). Só representação visual: nada daqui entra no motor, nenhum sorteio do motor é usado e nenhum resultado muda.
 */
import type { PlayStyle, Position } from '../../../engine/types'

export interface StyleShape {
  /** Quanto cada grupo de posições sobe (+) ou recua (−) em relação à posição da formação (fração do campo, na direção do ataque do time). */
  line: number
  mid: number
  att: number
  /** Multiplicador da largura do time (1 = a da formação; menor = mais compacto). */
  compact: number
  /** Quanto o time avança com a bola e quanto recua sem ela (multiplicam o avanço de fase de `shifted`; 0,55 é o recuo neutro). */
  attackPush: number
  defendPush: number
  /** Passes curtos antes da jogada decisiva (mínimo e máximo). */
  passes: [number, number]
  /** Bola longa na saída do contra-ataque e nos passes em profundidade. */
  longBalls: boolean
  /** Rapidez da animação do lance: quanto menor, mais rápido (multiplica o peso dos passos). */
  tempo: number
  // --- Movimento contínuo do campo (`pitchMotion.ts`): como o time se mexe e toca a bola entre os lances do motor. ---
  /** Passes curtos de ligação entre os lances (mínimo e máximo; o limite de tempo do minuto ainda corta). */
  link: [number, number]
  /** Alcance máximo (m) de um passe de ligação: bola longa no lançamento direto, toque curto na posse. */
  reach: number
  /** Peso de passar para a frente (quanto maior, mais vertical) e de passar para quem está aberto (lados). */
  vertical: number
  side: number
  /** Quanto o time se aperta ao redor da bola (1 = normal; menos que 1 mantém a largura). */
  tight: number
  /** Quanto o bloco acompanha a bola em profundidade, com e sem a posse. */
  followAtt: number
  followDef: number
  /** Atacantes que correm para a frente da bola (0 a 1,5) e quantos fecham quem está com ela, até que distância (m). */
  runners: number
  pressers: number
  pressRange: number
  /** Disputa da segunda bola depois de um lançamento (só o lançamento direto). */
  secondBall: boolean
}

const BASE: Record<PlayStyle, StyleShape> = {
  // Meio alto e compacto, muitos passes curtos, jogo paciente.
  possession: { line: 0.02, mid: 0.05, att: 0.02, compact: 0.9, attackPush: 1.1, defendPush: 0.55, passes: [3, 5], longBalls: false, tempo: 1.15, link: [3, 3], reach: 18, vertical: 0.2, side: 0.3, tight: 1.6, followAtt: 0.5, followDef: 0.34, runners: 0.2, pressers: 1, pressRange: 24, secondBall: false },
  // Bloco recuado, só os atacantes ficam à frente; quando recupera, sai rápido e em bola longa.
  'counter-attack': { line: -0.07, mid: -0.08, att: -0.02, compact: 1.05, attackPush: 1.35, defendPush: 0.85, passes: [0, 1], longBalls: true, tempo: 0.8, link: [0, 1], reach: 36, vertical: 1.3, side: 0.2, tight: 0.8, followAtt: 0.46, followDef: 0.16, runners: 1.5, pressers: 1, pressRange: 14, secondBall: false },
  // Bola longa do fundo para o atacante, meio e defesa atrás da bola, quase sem passes curtos.
  direct: { line: -0.02, mid: -0.05, att: 0.05, compact: 1, attackPush: 1.25, defendPush: 0.7, passes: [0, 1], longBalls: true, tempo: 0.85, link: [0, 1], reach: 50, vertical: 1.4, side: 0.1, tight: 0.9, followAtt: 0.4, followDef: 0.26, runners: 0.9, pressers: 1, pressRange: 22, secondBall: true },
  // Laterais e pontas abertos e altos: o time inteiro mais largo, passes para o lado.
  wings: { line: 0.03, mid: 0.02, att: 0.04, compact: 1.3, attackPush: 1.15, defendPush: 0.6, passes: [1, 2], longBalls: false, tempo: 1, link: [1, 2], reach: 26, vertical: 0.6, side: 2.4, tight: 0.5, followAtt: 0.42, followDef: 0.3, runners: 0.6, pressers: 1, pressRange: 24, secondBall: false },
  // Linhas adiantadas, time comprimido no campo do rival, passes verticais e curtos.
  'high-press': { line: 0.11, mid: 0.1, att: 0.06, compact: 0.85, attackPush: 1, defendPush: 0.12, passes: [1, 2], longBalls: false, tempo: 0.95, link: [1, 2], reach: 22, vertical: 0.8, side: 0.4, tight: 1.3, followAtt: 0.44, followDef: 0.42, runners: 0.7, pressers: 3, pressRange: 34, secondBall: false },
}

/** Forma do time para o estilo e a mentalidade em uso (−2 a +2): cada nível sobe ou recua as linhas em 0,03. */
export function shapeOf(style: PlayStyle | undefined, mentality = 0): StyleShape {
  const s = BASE[style ?? 'possession'] ?? BASE.possession
  const m = Math.max(-2, Math.min(2, mentality))
  return { ...s, line: s.line + 0.03 * m, mid: s.mid + 0.03 * m, att: s.att + 0.02 * m }
}

/** Quanto a posição sobe com a forma do estilo: depende do grupo da posição (o goleiro não sobe). */
export function depthShift(slot: Position, shape: StyleShape): number {
  if (slot === 'GK') return 0
  if (slot === 'CB' || slot === 'RB' || slot === 'LB') return shape.line
  if (slot === 'DM' || slot === 'CM') return shape.mid
  return shape.att
}
