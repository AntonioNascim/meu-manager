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
}

const BASE: Record<PlayStyle, StyleShape> = {
  // Meio alto e compacto, muitos passes curtos, jogo paciente.
  possession: { line: 0.02, mid: 0.05, att: 0.02, compact: 0.9, attackPush: 1.1, defendPush: 0.55, passes: [3, 5], longBalls: false, tempo: 1.15 },
  // Bloco recuado, só os atacantes ficam à frente; quando recupera, sai rápido e em bola longa.
  'counter-attack': { line: -0.07, mid: -0.08, att: -0.02, compact: 1.05, attackPush: 1.35, defendPush: 0.85, passes: [0, 1], longBalls: true, tempo: 0.8 },
  // Bola longa do fundo para o atacante, meio e defesa atrás da bola, quase sem passes curtos.
  direct: { line: -0.02, mid: -0.05, att: 0.05, compact: 1, attackPush: 1.25, defendPush: 0.7, passes: [0, 1], longBalls: true, tempo: 0.85 },
  // Laterais e pontas abertos e altos: o time inteiro mais largo, passes para o lado.
  wings: { line: 0.03, mid: 0.02, att: 0.04, compact: 1.3, attackPush: 1.15, defendPush: 0.6, passes: [1, 2], longBalls: false, tempo: 1 },
  // Linhas adiantadas, time comprimido no campo do rival, passes verticais e curtos.
  'high-press': { line: 0.11, mid: 0.1, att: 0.06, compact: 0.85, attackPush: 1, defendPush: 0.12, passes: [1, 2], longBalls: false, tempo: 0.95 },
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
