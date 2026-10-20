/**
 * Junta o elenco da Wikipedia em inglês com o da Wikipedia no idioma do país: os jogadores que aparecem nas duas ganham a posição exata
 * e o país da tabela local; quando o elenco em inglês não chega a um time inteiro (ou não existe), os jogadores que só a tabela local
 * tem completam o elenco. Funções puras.
 */
import type { LocalEntry } from './localSquad'
import type { SquadEntry } from './wikitext'

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Nomes pelos quais o mesmo jogador pode aparecer: o texto da tabela e o título do artigo, sem parênteses. */
const keysOf = (entry: { display: string; title?: string }): string[] => [...new Set([normalize(entry.display), ...(entry.title ? [normalize(entry.title)] : [])].filter(Boolean))]

/** Mesmo jogador: algum nome igual, ou o nome de uma das tabelas (apelido, sobrenome) contido inteiro no nome completo da outra. */
export function sameName(a: { display: string; title?: string }, b: { display: string; title?: string }): boolean {
  const ka = keysOf(a)
  const kb = keysOf(b)
  if (ka.some((x) => kb.includes(x))) return true
  const contains = (short: string, long: string): boolean => short.length >= 4 && long.split(' ').includes(short)
  return ka.some((x) => kb.some((y) => contains(x, y) || contains(y, x)))
}

export interface MergeResult {
  entries: SquadEntry[]
  /** Quantos jogadores da tabela local foram acrescentados. */
  added: number
  /** Quantos ganharam posição exata ou país da tabela local. */
  enriched: number
}

/** Elenco máximo do pacote: a tabela local, quando é a única fonte, não passa disso (as tabelas costumam trazer também emprestados e base). */
export const MAX_SQUAD = 30

export function mergeSquads(english: readonly SquadEntry[], local: readonly LocalEntry[], lang: string, wanted = 18): MergeResult {
  const used = new Set<number>()
  let enriched = 0
  const entries: SquadEntry[] = english.map((entry) => {
    const at = local.findIndex((l, i) => !used.has(i) && sameName(entry, l))
    if (at < 0) return entry
    used.add(at)
    const l = local[at] as LocalEntry
    const next: SquadEntry = { ...entry }
    if (l.position) next.localPosition = l.position
    if (!next.pos && l.pos) next.pos = l.pos
    if (!next.nat && l.nat) next.nat = l.nat
    if (next.localPosition !== entry.localPosition || next.pos !== entry.pos || next.nat !== entry.nat) enriched++
    return next
  })
  let added = 0
  if (entries.length < wanted) {
    local.forEach((l, i) => {
      if (used.has(i) || entries.length >= MAX_SQUAD) return
      const entry: SquadEntry = { display: l.display, lang }
      if (l.title) entry.title = l.title
      if (l.number !== undefined) entry.number = l.number
      if (l.nat) entry.nat = l.nat
      if (l.pos) entry.pos = l.pos
      if (l.position) entry.localPosition = l.position
      entries.push(entry)
      added++
    })
  }
  return { entries, added, enriched }
}
