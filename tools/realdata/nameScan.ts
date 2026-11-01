/**
 * Varredura de nomes suspeitos (vandalismo da Wikipedia/Wikidata que chega pela coleta). Olha nomes e apelidos de jogadores (do elenco e da base),
 * nomes de clubes, estádios e cidades, e acha: palavrões e ofensas (`profanity.ts`), frases no lugar de nome, texto de página (`&nbsp;`, links),
 * letras minúsculas fora do comum, caracteres e números estranhos, nomes enormes e apelidos sem nenhuma relação com o nome.
 * Roda no fim do `dados:finalizar` (e sozinha em `tests/realNames.test.ts`, que barra o pacote com achado grave). Funções puras.
 */
import type { DataPackage } from '../../src/data/package/types'
import { MILD, ROOTS, WORDS } from './profanity'

export type NameSeverity = 'alta' | 'media' | 'baixa'
export type NameKind = 'jogador' | 'base' | 'clube' | 'estadio' | 'cidade'
/** Campo na planilha de tarefas (volta pelo `dados:aplicar`). */
export type NameField = 'nome' | 'apelido' | 'nome curto' | 'estádio' | 'cidade'

export interface NameEntry {
  kind: NameKind
  id: string
  league: string
  /** Clube (nome) do jogador, para quem confere. */
  club: string
  /** Nome (jogador/clube), nome do estádio ou da cidade. */
  name: string
  nickname?: string
  shortName?: string
}

export interface NameFinding {
  severity: NameSeverity
  code: string
  kind: NameKind
  id: string
  league: string
  club: string
  field: NameField
  value: string
  /** Para o jogador/clube dono do achado (o nome atual), quando o campo é outro. */
  owner: string
  why: string
  /** Texto limpo, quando dá para sugerir sozinho. */
  suggestion?: string
}

const strip = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (text: string): string => strip(text).toLowerCase()

/** Partículas que podem ficar em minúsculas dentro de um nome. */
const PARTICLES: ReadonlySet<string> = new Set([
  'de', 'da', 'do', 'dos', 'das', 'del', 'della', 'delle', 'dei', 'degli', 'di', 'du', 'des', 'van', 'von', 'der', 'den', 'ten', 'ter', 'te', 'la', 'le', 'el', 'al', 'bin', 'ibn', 'bint', 'abu', 'ben', 'af', 'av', 'y', 'e', 'dal', 'dalla', 'op', 'zu', 'zur', 'vom', 'het', 't', 'd', 'l', 'lo', 'los', 'las', 'mc', 'mac', 'o', 'ap', 'ab', 'ul', 'vander', 'vanden', 'st', 'san', 'a', 'of', 'the', 'and', 'dos', 'jr', 'sr', 'ii', 'iii',
])

/** Palavras de frase, que não existem em nome de pessoa. */
const PHRASE_WORDS: ReadonlySet<string> = new Set(['que', 'con', 'sin', 'para', 'bien', 'muy', 'mas', 'pero', 'porque', 'como', 'quien', 'tiene', 'es', 'esta', 'este', 'eso', 'mi', 'tu', 'su', 'mamá', 'mama', 'is', 'are', 'was', 'with', 'from', 'this', 'that', 'my', 'your', 'his', 'her', 'who', 'what', 'um', 'uma', 'com', 'sem', 'mais', 'meu', 'minha', 'seu', 'sua', 'ele', 'ela', 'foi', 'ser', 'rica', 'rico', 'gostosa', 'gostoso', 'lindo', 'linda', 'melhor', 'mejor', 'super', 'mamacita'])

const HTML = /&[a-z]{2,8};|&#\d+;|<\/?[a-z][^>]*>/i
const LINK = /https?:|www\.|@|\.(com|net|org|br)\b/i
const INVISIBLE = /[\u00a0\u200b-\u200d\u2060\ufeff\u00ad]/
/** Palavras que podem ficar em minúscula em nome de clube, estádio ou cidade (além das partículas de nome). */
const PLACE_WORDS: ReadonlySet<string> = new Set(['sporting', 'club', 'athletic', 'sports', 'sport', 'an', 'am', 'im', 'auf', 'sur', 'en', 'in', 'on', 'at', 'upon', 'del-rei', 'aan', 'bij', 'ter', 'ten', 'pro', 'das', 'dos'])

/** Letras (com acento), espaço, ponto, hífen e apóstrofo: o que um nome de pessoa pode ter. */
const PERSON_CHARS = /^[\p{L}\p{M}' .\-’]+$/u
/** Para clubes, estádios e cidades: também números, &, parênteses, barra e vírgula. */
const PLACE_CHARS = /^[\p{L}\p{M}\d' .\-’&()/,]+$/u

/** Textos que parecem estranhos mas são o nome real (conferido à mão): a varredura não os acusa. */
export const KNOWN_OK: ReadonlySet<string> = new Set(['Jizz Hornkamp', 'Tomás Porra', 'MAC³PARK stadion', 'Mostafa AlZenary', 'Mohamed ElSayed', 'Omar AbdulAziz', 'El búfalo', 'ista-Borussia-Park', 'Japanese Messi'])

const CP1252 = new TextDecoder('windows-1252')
const REVERSE_1252 = new Map<string, number>(Array.from({ length: 256 }, (_, b) => [CP1252.decode(Uint8Array.of(b)), b] as [string, number]))
const MOJIBAKE = /[ÃÂÄÅÆÇÐÑØ][-¿ŒœŠšŸŽžƒˆ˜–-›€™]/

/** Texto que foi lido com a codificação errada ("VoniÄ‡" no lugar de "Vonić"); devolve o certo, ou `undefined` se não der. */
export function fixMojibake(text: string): string | undefined {
  const bytes: number[] = []
  for (const ch of text) {
    const b = REVERSE_1252.get(ch)
    if (b === undefined) return undefined
    bytes.push(b)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
  } catch {
    return undefined
  }
}

/** Letras gregas e cirílicas que se desenham como letras latinas. */
const LOOKALIKE: Readonly<Record<string, string>> = { Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X', ο: 'o', ν: 'v', А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x' }

const words = (text: string): string[] => text.split(/[\s\-–—/]+/).filter(Boolean)

/** Clubes com número no nome (a lista inteira: qualquer outro número vira achado). */
const CLUB_DIGITS = /^(1\. [A-Z]+ |.* (0[0-9]|1[0-9]{3}|9[0-9])|2 de Mayo|.*\b(1[0-9]{3})\b.*)/

export function cleanSpaces(text: string): string {
  return text.replace(/&nbsp;/gi, ' ').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '').replace(/\s+/g, ' ').trim()
}

/** Palavrões e ofensas: `alta` para os de verdade, `baixa` para os que podem ser só apelido de torcida. */
export function profanityOf(text: string): { severity: NameSeverity; word: string } | undefined {
  const tokens = norm(text).split(/[^a-z0-9ñ]+/).filter(Boolean)
  for (const t of tokens) if (WORDS.has(t)) return { severity: 'alta', word: t }
  const compact = norm(text).replace(/[^a-z0-9]/g, '')
  for (const root of ROOTS) if (compact.includes(root.replace(/[^a-z0-9]/g, ''))) return { severity: 'alta', word: root }
  for (const t of tokens) if (t.includes('sex') && !['essex', 'sexton', 'sextus'].includes(t)) return { severity: 'media', word: 'sex' }
  for (const t of tokens) if (MILD.has(t)) return { severity: 'baixa', word: t }
  return undefined
}

function lowerWords(text: string, extra: ReadonlySet<string> = new Set()): string[] {
  return text.split(/\s+/).filter(Boolean).filter((w) => {
    if (/^[d|l|o]['’]/i.test(w)) return false
    const first = [...w][0] as string
    if (!/\p{Ll}/u.test(first)) return false
    const n = norm(w).replace(/\./g, '')
    return !PARTICLES.has(n) && !extra.has(n)
  })
}

function relatedNames(name: string, nick: string): boolean {
  const split = (t: string): string[] => norm(t).split(/[^a-z]+/).filter((w) => w.length >= 3 && !PARTICLES.has(w))
  const a = split(name)
  const b = split(nick)
  return b.some((x) => a.some((y) => x === y || x.startsWith(y) || y.startsWith(x) || commonPrefix(x, y) >= 4))
}

function commonPrefix(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

type Add = (severity: NameSeverity, code: string, field: NameField, value: string, why: string, suggestion?: string) => void

function checkText(add: Add, kind: NameKind, field: NameField, value: string, person: boolean): void {
  if (KNOWN_OK.has(value)) return
  if (/^Q\d+$/.test(value.trim())) add('alta', 'id-wikidata', field, value, 'sobrou o código do Wikidata no lugar do nome')
  const chars = person ? PERSON_CHARS : PLACE_CHARS
  const bad = profanityOf(value)
  // Em nome de lugar (clube, estádio, cidade) até as palavras leves pedem olhar ("Gorda hilda"); "Preto" e "Negro" existem em nome de cidade.
  const placeWord = !person && bad?.severity === 'baixa' && !['preto', 'negro'].includes(bad.word)
  if (bad && (bad.severity !== 'baixa' || person || placeWord)) add(placeWord ? 'media' : bad.severity, bad.severity === 'baixa' && !placeWord ? 'apelido-de-torcida' : 'palavrao', field, value, `contém "${bad.word}"`)
  if (HTML.test(value) || INVISIBLE.test(value) || /\s{2}|^\s|\s$/.test(value)) add('alta', 'texto-de-pagina', field, value, 'espaço estranho ou código de página (&nbsp;, tags)', cleanSpaces(value.replace(/<[^>]*>/g, '')))
  if (MOJIBAKE.test(value)) add('alta', 'codificacao', field, value, 'letras com a codificação errada', fixMojibake(value))
  // Letra de outro alfabeto que parece latina ("Αrda" com alfa grego): some na busca e quebra a ordem alfabética.
  if (/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(value)) add('alta', 'alfabeto-misturado', field, value, 'letra de outro alfabeto (grego, cirílico...) que parece latina', value.replace(/[Α-Ωα-ωА-Яа-я]/gu, (ch) => LOOKALIKE[ch] ?? ch))
  if (LINK.test(value)) add('alta', 'link', field, value, 'endereço de internet ou e-mail')
  if (!chars.test(cleanSpaces(value.replace(/&nbsp;/gi, ' ')))) add(person ? 'alta' : 'media', 'caracteres', field, value, person ? 'número, aspas, parênteses ou símbolo em nome de pessoa' : 'caractere fora do comum')
  if (/(.)\1{3,}/u.test(value)) add('media', 'repeticao', field, value, 'letra repetida 4 vezes ou mais')
  if (person) {
    const low = lowerWords(value)
    if (low.length > 0) add(field === 'apelido' ? 'baixa' : 'alta', 'minusculas', field, value, `palavra em minúscula fora do comum: ${low.join(', ')}`)
    const phrase = words(value).filter((w) => PHRASE_WORDS.has(norm(w)))
    if (phrase.length >= 2) add('alta', 'frase', field, value, `palavras de frase, não de nome: ${phrase.join(', ')}`)
    const shouting = words(value).filter((w) => w.length >= 4 && !w.includes('.') && w === w.toUpperCase() && /\p{L}/u.test(w) && !/^[IVX]+$/.test(w))
    if (shouting.length > 0) add('media', 'maiusculas', field, value, `palavra toda em maiúsculas: ${shouting.join(', ')}`)
    const camel = words(value).filter((w) => /\p{Ll}\p{Lu}/u.test(w) && !/^(Mc|Mac|De|Di|Da|La|Le|Van|Von|Ter|Ten|O'|D')/.test(w) && !/^[A-Z]{2,}\p{Ll}/u.test(w))
    if (camel.length > 0) add('media', 'maiuscula-no-meio', field, value, `maiúscula no meio da palavra: ${camel.join(', ')}`)
    if (words(value).length >= 7) add('media', 'muitas-palavras', field, value, `${words(value).length} palavras`)
    if (field === 'nome' && value.length > 45) add('media', 'comprido', field, value, `${value.length} letras`)
    if (field === 'apelido' && value.length > 28) add('media', 'comprido', field, value, `${value.length} letras`)
  } else {
    const low = lowerWords(value, PLACE_WORDS)
    if (low.length > 0) add('media', 'minusculas', field, value, `palavra em minúscula: ${low.join(', ')}`)
    if (kind === 'clube' && value.length > 40) add('media', 'comprido', field, value, `${value.length} letras`)
    if (kind === 'estadio' && value.length > 60) add('baixa', 'comprido', field, value, `${value.length} letras`)
    if (/\d/.test(value) && kind === 'clube' && !CLUB_DIGITS.test(value)) add('media', 'numero', field, value, 'número no nome do clube')
    if (/\d/.test(value) && kind === 'cidade') add('media', 'numero', field, value, 'número no nome da cidade')
  }
}

export function scanNames(entries: readonly NameEntry[]): NameFinding[] {
  const out: NameFinding[] = []
  for (const e of entries) {
    const base = { kind: e.kind, id: e.id, league: e.league, club: e.club, owner: e.name }
    const add: Add = (severity, code, field, value, why, suggestion) => out.push({ ...base, severity, code, field, value, why, ...(suggestion !== undefined ? { suggestion } : {}) })
    const person = e.kind === 'jogador' || e.kind === 'base'
    if (e.kind === 'estadio') {
      checkText(add, e.kind, 'estádio', e.name, false)
      continue
    }
    if (e.kind === 'cidade') {
      checkText(add, e.kind, 'cidade', e.name, false)
      continue
    }
    checkText(add, e.kind, 'nome', e.name, person)
    if (e.shortName) checkText(add, e.kind, 'nome curto', e.shortName, false)
    if (person && e.nickname) {
      checkText(add, e.kind, 'apelido', e.nickname, true)
      const nick = e.nickname
      if (!KNOWN_OK.has(nick) && !relatedNames(e.name, nick)) {
        const many = words(nick).length >= 2
        const epithet = /^(el|la|los|las|the|o|a)\s/i.test(nick)
        add(!epithet && (many || nick.length >= 14) ? 'media' : 'baixa', 'apelido-sem-relacao', 'apelido', nick, `nenhuma palavra do apelido aparece no nome "${e.name}"`)
      }
      // Nome que começa com o apelido e continua com artigo ("Carlos Quintana El Destructor De Cacas"): o apelido da torcida entrou no nome.
      const nameWords = words(e.name)
      const nickWords = words(nick)
      if (nameWords.length - nickWords.length >= 3 && norm(e.name).startsWith(norm(nick)) && nameWords.slice(nickWords.length).some((w) => ['el', 'la', 'los', 'las', 'the', 'o', 'a'].includes(norm(w)) && w === w[0]?.toUpperCase() + w.slice(1))) {
        add('alta', 'apelido-no-nome', 'nome', e.name, `o nome continua o apelido "${nick}" com uma expressão (${nameWords.slice(nickWords.length).join(' ')})`, nick)
      }
    }
  }
  const rank = { alta: 0, media: 1, baixa: 2 } as const
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code) || a.id.localeCompare(b.id))
}

/** Entradas a partir das planilhas de uma liga (clubes, jogadores e base). */
export function entriesFromSheets(league: string, clubs: readonly Record<string, string>[], players: readonly Record<string, string>[], academy: readonly Record<string, string>[]): NameEntry[] {
  const clubName = new Map(clubs.map((c) => [c.id ?? '', c.name ?? '']))
  const out: NameEntry[] = []
  for (const c of clubs) {
    out.push({ kind: 'clube', id: c.id ?? '', league, club: c.name ?? '', name: c.name ?? '', ...(c.shortName ? { shortName: c.shortName } : {}) })
    if (c.stadiumName) out.push({ kind: 'estadio', id: c.id ?? '', league, club: c.name ?? '', name: c.stadiumName })
    if (c.city) out.push({ kind: 'cidade', id: c.id ?? '', league, club: c.name ?? '', name: c.city })
  }
  for (const [kind, rows] of [['jogador', players], ['base', academy]] as const) {
    for (const p of rows) out.push({ kind, id: p.id ?? '', league, club: p.club ? (clubName.get(p.club) ?? '') : '(livre)', name: p.name ?? '', ...(p.nickname ? { nickname: p.nickname } : {}) })
  }
  return out
}

/** Entradas a partir de um pacote de dados (para a conferência de `data/pacote-real.json`). */
export function entriesFromPackage(pkg: Pick<DataPackage, 'clubs' | 'players'> & { academy?: DataPackage['players'] }): NameEntry[] {
  const clubs = new Map(pkg.clubs.map((c) => [c.id, c]))
  const out: NameEntry[] = []
  for (const c of pkg.clubs) {
    out.push({ kind: 'clube', id: c.id, league: c.league, club: c.name, name: c.name, ...(c.shortName ? { shortName: c.shortName } : {}) })
    if (c.stadium.name) out.push({ kind: 'estadio', id: c.id, league: c.league, club: c.name, name: c.stadium.name })
    if (c.city) out.push({ kind: 'cidade', id: c.id, league: c.league, club: c.name, name: c.city })
  }
  for (const [kind, rows] of [['jogador', pkg.players], ['base', pkg.academy ?? []]] as const) {
    for (const p of rows) {
      const club = p.club ? clubs.get(p.club) : undefined
      out.push({ kind, id: p.id ?? p.name, league: club?.league ?? '', club: club?.name ?? '(livre)', name: p.name, ...(p.nickname ? { nickname: p.nickname } : {}) })
    }
  }
  return out
}

export function findingsCsvRows(findings: readonly NameFinding[]): (string | number)[][] {
  return findings.map((f) => [f.severity, f.code, f.league, f.club, f.owner, f.id, f.field, f.value, f.suggestion ?? '', f.why, ''])
}

export const FINDINGS_HEADER = ['gravidade', 'tipo_de_achado', 'liga', 'clube', 'jogador_ou_clube', 'id', 'campo', 'valor_provisorio', 'sugestao', 'motivo', 'valor_correto', 'feito'] as const
