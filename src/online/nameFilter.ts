/**
 * Filtro de apelidos e de nomes de liga (Fase 6, B2; proposta 6.2). Puro: recebe o texto digitado e diz se serve.
 * Não é à prova de tudo: ofensa disfarçada escapa e é tratada por denúncia (B8/B9).
 */
import { ROOTS, WORDS } from './profanityWords'

export const NICKNAME_MIN = 3
export const NICKNAME_MAX = 16

export type NameIssue =
  | 'too-short'
  | 'too-long'
  | 'invalid-characters'
  | 'mixed-scripts'
  | 'link'
  | 'phone'
  | 'impersonal'
  | 'profanity'
  | 'repeated'

export type NameCheck = { ok: true; name: string } | { ok: false; issue: NameIssue }

/** Nomes que fingem ser do jogo ou da equipe (comparados sem acento, sem espaço e sem número). */
const IMPERSONAL: readonly string[] = ['admin', 'administrador', 'moderador', 'moderator', 'suporte', 'support', 'staff', 'oficial', 'official', 'meumanager', 'sistema', 'system', 'cloudflare', 'anonimo', 'tecnicoremovido']

const LEET: Readonly<Record<string, string>> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' }

/** Letras, números, espaço e `. _ - '`: o que um apelido pode ter. */
const ALLOWED = /^[\p{L}\p{N} ._'-]+$/u

/** Tira acento, passa para minúsculas e junta o que é espaço. Não troca números por letras. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
}

/** Limpa o que foi digitado: espaços de largura zero e especiais somem, espaços repetidos viram um só. */
export function cleanName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scriptsOf(text: string): Set<string> {
  const out = new Set<string>()
  for (const ch of text) {
    if (/\p{Script=Latin}/u.test(ch)) out.add('latin')
    else if (/\p{Script=Cyrillic}/u.test(ch)) out.add('cyrillic')
    else if (/\p{Script=Greek}/u.test(ch)) out.add('greek')
    else if (/\p{L}/u.test(ch)) out.add('other')
  }
  return out
}

/** Letras repetidas "esticam" o palavrão (fuuuuck): reduz cada sequência a no máximo uma letra. */
const squeeze = (s: string): string => s.replace(/(.)\1+/g, '$1')

function hasProfanity(folded: string): boolean {
  // Versões do texto: como digitado, com números lidos como letras e com as letras repetidas reduzidas.
  const leet = [...folded].map((c) => LEET[c] ?? c).join('')
  const variants = new Set([folded, leet, squeeze(folded), squeeze(leet)])
  for (const v of variants) {
    for (const token of v.split(/[^a-zñ]+/).filter(Boolean)) if (WORDS.has(token)) return true
    // Sem separador: pega "f u c k", "f.u.c.k" e palavrão colado em outro texto.
    const compact = v.replace(/[^a-z]/g, '')
    for (const root of ROOTS) {
      const r = foldText(root).replace(/[^a-z]/g, '')
      if (r.length >= 4 && compact.includes(r)) return true
    }
    const joined = v.split(/[^a-zñ]+/).filter(Boolean)
    // Palavra inteira separada por espaços entre as letras ("p u t a").
    if (joined.length >= 3 && joined.every((t) => t.length === 1) && WORDS.has(joined.join(''))) return true
  }
  return false
}

/** O texto sem nenhum separador nem número serve para pegar "admin 1" e "A.d.m.i.n". */
const letters = (folded: string): string => [...folded].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, '')

export function checkName(raw: string, limits: { min: number; max: number } = { min: NICKNAME_MIN, max: NICKNAME_MAX }): NameCheck {
  const name = cleanName(raw)
  const length = [...name].length
  if (length < limits.min) return { ok: false, issue: 'too-short' }
  if (length > limits.max) return { ok: false, issue: 'too-long' }
  const folded = foldText(name)
  // Link ou endereço de contato antes do resto, porque tem pontuação que o filtro de caracteres recusaria.
  if (/(https?:|www\.|\.(com|net|org|br|io|gg|me|tv|ly|xyz|app)\b|[a-z0-9]\.[a-z]{2,3}\/|discord|t\.me|wa\.me|@[a-z0-9_]{3,})/.test(folded)) return { ok: false, issue: 'link' }
  const digits = name.replace(/\D/g, '')
  if (digits.length >= 8 || /\d{4,}[\s.-]?\d{3,}/.test(name)) return { ok: false, issue: 'phone' }
  if (!ALLOWED.test(name)) return { ok: false, issue: 'invalid-characters' }
  if (scriptsOf(name).size > 1) return { ok: false, issue: 'mixed-scripts' }
  if (!/\p{L}/u.test(name)) return { ok: false, issue: 'invalid-characters' }
  const flat = letters(folded)
  if (IMPERSONAL.some((w) => flat === w || flat.startsWith(w) && flat.length <= w.length + 2)) return { ok: false, issue: 'impersonal' }
  if (hasProfanity(folded)) return { ok: false, issue: 'profanity' }
  // Depois do palavrão: "fuuuuck" é palavrão antes de ser letra repetida.
  if (/(.)\1{3,}/u.test(name)) return { ok: false, issue: 'repeated' }
  return { ok: true, name }
}

/** Número do apelido pronto de quem ainda não escolheu (ou foi tirado por denúncia): a interface escreve "Técnico 4821". Estável para a mesma identidade. */
export function anonymousNumber(playerId: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < playerId.length; i++) {
    h ^= playerId.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return 1000 + ((h >>> 0) % 9000)
}
