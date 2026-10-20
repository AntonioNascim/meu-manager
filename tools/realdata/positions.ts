/**
 * Converte as posições das fontes (Wikidata em inglês e a sigla GK/DF/MF/FW das tabelas de elenco da Wikipedia) nas do jogo.
 * Quando a fonte só diz "defensor", "meio-campista" ou "atacante", escolhe a mais provável e marca para revisão.
 */
import type { Foot, Position } from '../../src/engine/types'

export type Coarse = 'GK' | 'DF' | 'MF' | 'FW'

export interface PositionGuess {
  primary: Position
  secondary: Position[]
  /** Motivos de revisão (vazio = posição clara na fonte). */
  review: string[]
}

/** Posição exata a partir do texto da fonte (já em minúsculas). */
const SPECIFIC: [RegExp, Position][] = [
  [/\bgoalkeeper\b|\bgoalie\b|\bkeeper\b/, 'GK'],
  [/right[- ]?(back|wing[- ]?back|full[- ]?back)/, 'RB'],
  [/left[- ]?(back|wing[- ]?back|full[- ]?back)/, 'LB'],
  [/cent(re|er|ral)[- ]?(back|defender|half)|\bsweeper\b|\blibero\b|\bstopper\b/, 'CB'],
  [/defensive midfield|holding midfield|\banchor\b|\bdestroyer\b|deep[- ]lying|\bregista\b|\bhalf[- ]?back\b/, 'DM'],
  [/attacking midfield|offensive midfield|\bplaymaker\b|\btrequartista\b|\bnumber 10\b|\bsecond striker\b|\bshadow striker\b/, 'AM'],
  [/right (winger|wing|midfield)|\bright[- ]sided (midfield|winger)|\bright wide/, 'RW'],
  [/left (winger|wing|midfield)|\bleft[- ]sided (midfield|winger)|\bleft wide/, 'LW'],
  [/cent(re|er|ral)[- ]?(midfield)|box[- ]to[- ]box|\bmezzala\b|\bcarrilero\b/, 'CM'],
  [/\bstriker\b|cent(re|er)[- ]?forward|\bfalse (9|nine)\b|\bpoacher\b|\btarget man\b/, 'ST'],
]

/** Termos genéricos: o lado ou o setor não está na fonte. */
const GENERIC = /\b(defender|full[- ]?back|wing[- ]?back|midfielder|winger|forward|wide midfielder|attacker|wing half|inside forward)\b/

const SECTOR: Record<Coarse, readonly Position[]> = {
  GK: ['GK'],
  DF: ['RB', 'LB', 'CB'],
  MF: ['DM', 'CM', 'AM', 'RW', 'LW'],
  FW: ['ST', 'RW', 'LW', 'AM'],
}

const COARSE_DEFAULT: Record<Coarse, Position> = { GK: 'GK', DF: 'CB', MF: 'CM', FW: 'ST' }

const norm = (text: string): string => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** Posição exata (ou `undefined`) de um texto da fonte. */
export function specificPosition(text: string): Position | undefined {
  const t = norm(text)
  for (const [pattern, position] of SPECIFIC) if (pattern.test(t)) return position
  return undefined
}

/** Posição provável de um termo genérico; `foot` decide o lado de laterais e pontas. */
export function genericPosition(text: string, foot?: Foot): Position | undefined {
  const t = norm(text)
  if (!GENERIC.test(t)) return undefined
  const left = foot === 'left'
  if (/full[- ]?back|wing[- ]?back/.test(t)) return left ? 'LB' : 'RB'
  if (/winger|wide midfielder|wing half|inside forward/.test(t)) return left ? 'LW' : 'RW'
  if (/defender/.test(t)) return 'CB'
  if (/midfielder/.test(t)) return 'CM'
  return 'ST'
}

/**
 * Junta as posições do Wikidata e a sigla da Wikipedia. A sigla da Wikipedia (mantida pela comunidade do clube, sempre atual) manda no
 * setor; o Wikidata só vale quando cai no mesmo setor.
 */
export function guessPositions(wikidata: readonly string[], coarse: Coarse | undefined, foot?: Foot, local?: Position): PositionGuess {
  const specific: Position[] = []
  const generic: Position[] = []
  for (const text of wikidata) {
    const s = specificPosition(text)
    if (s) {
      if (!specific.includes(s)) specific.push(s)
      continue
    }
    const g = genericPosition(text, foot)
    if (g && !generic.includes(g)) generic.push(g)
  }
  const review: string[] = []
  const inSector = (p: Position): boolean => !coarse || SECTOR[coarse].includes(p)
  const matching = specific.filter(inSector)

  if (specific.length > 0 && matching.length === 0 && coarse) review.push(`posição do Wikidata (${specific.join('/')}) diverge da tabela do clube (${coarse})`)
  let primary: Position
  if (matching.length > 0) primary = matching[0] as Position
  else if (local && inSector(local)) primary = local
  else if (specific.length > 0 && !coarse) primary = specific[0] as Position
  else {
    const generics = generic.filter(inSector)
    if (coarse === 'GK') primary = 'GK'
    else if (generics.length > 0) (primary = generics[0] as Position), review.push(`fonte só diz a posição genérica; escolhida ${primary}`)
    else if (coarse) {
      primary = COARSE_DEFAULT[coarse]
      review.push(`fonte só diz ${coarse}; escolhida ${primary}`)
    } else if (generic.length > 0) (primary = generic[0] as Position), review.push(`fonte só diz a posição genérica; escolhida ${primary}`)
    else (primary = 'CM'), review.push('sem posição na fonte; escolhida CM')
  }
  const secondary = [...matching, ...(local ? [local] : []), ...generic.filter(inSector)].filter((p, i, all) => p !== primary && all.indexOf(p) === i && (primary === 'GK') === (p === 'GK')).slice(0, 2)
  return { primary, secondary, review }
}

/** Sigla de setor das tabelas da Wikipedia (`GK`, `DF`, `MF`, `FW`, também por extenso). */
export function parseCoarse(text: string | undefined): Coarse | undefined {
  if (!text) return undefined
  const t = norm(text).replace(/[^a-z]/g, '')
  if (['gk', 'goalkeeper', 'goalie'].includes(t)) return 'GK'
  if (['df', 'def', 'defender', 'defence', 'defense'].includes(t)) return 'DF'
  if (['mf', 'mid', 'midfielder', 'midfield'].includes(t)) return 'MF'
  if (['fw', 'fwd', 'forward', 'striker', 'attacker'].includes(t)) return 'FW'
  return undefined
}
