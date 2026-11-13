/**
 * VAR como narrativa (só visual): em alguns lances a tela mostra o VAR analisando e a decisão final, que é **sempre a que o motor já tomou**. Nada aqui
 * muda resultado: lê o rastro e os eventos que o motor gerou e escolhe, pela semente da partida, quais lances ganham a cena. Rara por regra
 * (no máximo `VAR.maxPerMatch` por jogo) e igual no solo e no online (a semente é o id da partida).
 *
 * As cenas:
 * - gol que vale: às vezes "VAR checando impedimento… Gol confirmado";
 * - pênalti que o motor deu: "Pênalti marcado… VAR analisando… Pênalti confirmado";
 * - lance na área que o motor decidiu que não foi pênalti: "Pênalti marcado… VAR analisando… Pênalti anulado";
 * - cartão vermelho que o motor deu: "VAR revisando… Vermelho confirmado".
 */
import type { PlayTrace } from '../../../engine/match'
import type { MatchEvent } from '../../../engine/types'

export const VAR = {
  maxPerMatch: 2,
  /** Chance de cada tipo de lance receber a cena (antes do teto por partida). */
  chance: { goal: 0.22, penalty: 0.5, noPenalty: 0.03, red: 0.8 },
  /** Quanto cada passo da cena fica na tela (ms); o último fica um pouco mais. */
  stepMs: 1300,
  lastStepMs: 1800,
} as const

export type VarKind = 'goal-check' | 'penalty-confirmed' | 'penalty-overturned' | 'red-confirmed'

export interface VarMoment {
  kind: VarKind
  /** Os textos, em ordem; o último é a decisão final. */
  steps: string[]
  /** Minuto do lance. */
  minute: number
}

const STEPS: Record<VarKind, string[]> = {
  'goal-check': ['VAR checando impedimento…', 'Gol confirmado'],
  'penalty-confirmed': ['Pênalti marcado…', 'VAR analisando…', 'Pênalti confirmado'],
  'penalty-overturned': ['Pênalti marcado…', 'VAR analisando…', 'Pênalti anulado: o jogo segue'],
  'red-confirmed': ['VAR revisando…', 'Vermelho confirmado'],
}

/** Hash próprio (FNV-1a) em [0, 1): a animação não usa o gerador do motor. */
const unit = (key: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 4294967296
}

/** Lances na área em que quem atacava perdeu o duelo no drible ou no passe em profundidade: dão a cena do "pênalti anulado". */
const isNoPenaltyCandidate = (t: PlayTrace): boolean => !t.shot && t.outcome === 'lost' && (t.play === 'dribble' || t.play === 'through')

interface Candidate {
  key: string
  minute: number
  order: number
  kind: VarKind
  chance: number
}

/**
 * Os lances que ganham a cena, por chave (`t:<índice do lance>` ou `e:<índice do evento>`). Percorre tudo na ordem do jogo e aplica o teto por partida,
 * então escolher com o jogo pela metade dá o mesmo que escolher depois: os primeiros lances nunca mudam.
 */
export function varMoments(trace: readonly PlayTrace[], events: readonly MatchEvent[], seedKey: string, chanceScale = 1): Map<string, VarMoment> {
  const list: Candidate[] = []
  trace.forEach((t, i) => {
    if (t.shot?.type === 'penalty') list.push({ key: `t:${i}`, minute: t.minute, order: 0, kind: 'penalty-confirmed', chance: VAR.chance.penalty })
    else if (t.shot?.result === 'goal') list.push({ key: `t:${i}`, minute: t.minute, order: 0, kind: 'goal-check', chance: VAR.chance.goal })
    else if (isNoPenaltyCandidate(t)) list.push({ key: `t:${i}`, minute: t.minute, order: 0, kind: 'penalty-overturned', chance: VAR.chance.noPenalty })
  })
  events.forEach((e, i) => {
    if (e.type === 'red-card') list.push({ key: `e:${i}`, minute: e.minute, order: 1, kind: 'red-confirmed', chance: VAR.chance.red })
  })
  list.sort((a, b) => a.minute - b.minute || a.order - b.order || (a.key < b.key ? -1 : 1))
  const out = new Map<string, VarMoment>()
  for (const c of list) {
    if (out.size >= VAR.maxPerMatch) break
    if (unit(`${seedKey}:var:${c.minute}:${c.kind}:${c.key}`) < c.chance * chanceScale) out.set(c.key, { kind: c.kind, steps: STEPS[c.kind], minute: c.minute })
  }
  return out
}
