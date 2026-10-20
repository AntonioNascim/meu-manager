import type { Position } from '../../src/engine/types'

/** Leitura do texto wiki da Wikipedia: tabelas de elenco dos clubes e lista de clubes da temporada de uma liga. Funções puras. */

export interface WikiLink {
  /** Título do artigo (sem âncora). */
  title: string
  /** Texto exibido. */
  display: string
}

export interface SquadEntry {
  /** Artigo do jogador (ausente quando o nome não tem link). */
  title?: string
  /** Nome como aparece na tabela. */
  display: string
  number?: number
  /** País como a tabela escreve (nome ou sigla da FIFA). */
  nat?: string
  /** Sigla de setor da tabela: GK, DF, MF, FW. */
  pos?: string
  /** Observação da tabela (capitão, emprestado...). */
  note?: string
  /** Língua da Wikipedia de onde o jogador veio (ausente = inglês). */
  lang?: string
  /** Posição exata que a tabela da Wikipedia local traz (zagueiro, volante, ponta...). */
  localPosition?: Position
}

const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g

/** Tira marcação simples do texto exibido (negrito, itálico, notas, etiquetas html). */
export function cleanText(text: string): string {
  return text
    .replace(/<ref[^>]*>.*?<\/ref>|<ref[^>]*\/>/gs, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Todos os links `[[Título|texto]]` de um trecho (arquivos e categorias ficam de fora). */
export function allLinks(text: string): WikiLink[] {
  const links: WikiLink[] = []
  for (const match of text.matchAll(LINK)) {
    const title = (match[1] as string).trim()
    if (/^(file|image|category|ficheiro|arquivo|categoria):/i.test(title)) continue
    links.push({ title, display: cleanText(match[2] ?? title) })
  }
  return links
}

export const firstLink = (text: string): WikiLink | undefined => allLinks(text)[0]

interface Heading {
  level: number
  title: string
  /** Posição do título (o fim do corpo da seção anterior). */
  start: number
  /** Posição do começo do texto da seção (depois da linha do título). */
  bodyStart: number
}

function headingsOf(wikitext: string): Heading[] {
  const headings: Heading[] = []
  for (const match of wikitext.matchAll(/^(={2,5})[ \t]*(.+?)[ \t]*\1[ \t]*$/gm)) {
    headings.push({ level: (match[1] as string).length, title: cleanText(match[2] as string), start: match.index as number, bodyStart: (match.index as number) + match[0].length })
  }
  return headings
}

/** Texto próprio de cada seção (até o próximo título, de qualquer nível). */
export function sectionsOf(wikitext: string): { level: number; title: string; body: string }[] {
  const headings = headingsOf(wikitext)
  return headings.map((h, i) => ({ level: h.level, title: h.title, body: wikitext.slice(h.bodyStart, headings[i + 1]?.start ?? wikitext.length) }))
}

/** Divide `a|b=c|{{x|y}}|[[l|t]]` em partes de primeiro nível. */
function splitParams(text: string): string[] {
  const parts: string[] = []
  let curly = 0
  let square = 0
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2)
    if (two === '{{') (curly++, (current += two), i++)
    else if (two === '}}') (curly--, (current += two), i++)
    else if (two === '[[') (square++, (current += two), i++)
    else if (two === ']]') (square--, (current += two), i++)
    else if (text[i] === '|' && curly === 0 && square === 0) (parts.push(current), (current = ''))
    else current += text[i]
  }
  parts.push(current)
  return parts
}

export interface WikiTemplate {
  name: string
  params: Map<string, string>
  positional: string[]
}

/** Modelos `{{nome|...}}` do texto cujo nome combina com `names` (os de dentro de outros modelos não entram). */
export function templatesOf(text: string, names: RegExp): WikiTemplate[] {
  const found: WikiTemplate[] = []
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{{', i)
    if (open < 0) break
    let depth = 0
    let end = -1
    for (let j = open; j < text.length - 1; j++) {
      if (text.startsWith('{{', j)) (depth++, j++)
      else if (text.startsWith('}}', j)) {
        depth--
        j++
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    if (end < 0) break
    const [head, ...rest] = splitParams(text.slice(open + 2, end - 1))
    const name = (head ?? '').trim()
    if (names.test(name)) {
      const params = new Map<string, string>()
      const positional: string[] = []
      for (const part of rest) {
        const eq = /^\s*([A-Za-z0-9_ -]+?)\s*=([\s\S]*)$/.exec(part)
        if (eq) params.set((eq[1] as string).toLowerCase(), (eq[2] as string).trim())
        else positional.push(part.trim())
      }
      found.push({ name, params, positional })
      i = end + 1
    } else i = open + 2
  }
  return found
}

const SQUAD_TEMPLATE = /^(fs player|football squad player|fs2 player|fb player|squad player)$/i
const SQUAD_SECTION = /^(first[- ]team( squad| players)?|current squad|squad|first team|players|senior squad|current players|team|the squad)$/i
const NOT_FIRST_TEAM = /loan|youth|reserve|academy|under[- ]?\d|u-?\d\d|retired|notable|former|previous|staff|coach|management/i
const ON_LOAN_AWAY = /\bon loan (to|at)\b|\bloaned (out )?to\b|\bloan(ed)? out\b/i

/** O país do modelo vem como nome, sigla ou `{{flag|Brasil}}`; devolve só o texto. */
function flagName(text: string): string {
  const template = /^\{\{\s*(?:flag(?:icon|country|athlete)?|fb)\s*\|([^|}]+)/i.exec(text.trim())
  return cleanText(template ? (template[1] as string) : text)
}

export function squadFromTemplates(text: string): SquadEntry[] {
  const entries: SquadEntry[] = []
  for (const template of templatesOf(text, SQUAD_TEMPLATE)) {
    const rawName = template.params.get('name') ?? template.positional[0] ?? ''
    const note = template.params.get('other')
    if (!rawName.trim()) continue
    if (note && ON_LOAN_AWAY.test(cleanText(note))) continue
    const link = firstLink(rawName)
    const number = Number(template.params.get('no') ?? '')
    const nat = template.params.get('nat') ?? template.params.get('nationality')
    const pos = template.params.get('pos') ?? template.params.get('position')
    const entry: SquadEntry = { display: link?.display ?? cleanText(rawName) }
    if (link) entry.title = link.title
    if (Number.isInteger(number) && number > 0) entry.number = number
    if (nat) entry.nat = flagName(nat)
    if (pos) entry.pos = cleanText(pos).toUpperCase()
    if (note) entry.note = cleanText(note)
    if (entry.display) entries.push(entry)
  }
  return entries
}

/** Elenco principal do artigo de um clube: a primeira seção de elenco com pelo menos 5 jogadores (empréstimos e base ficam de fora). */
export function parseSquad(wikitext: string): { entries: SquadEntry[]; section?: string } {
  const sections = sectionsOf(wikitext)
  for (const section of sections) {
    if (!SQUAD_SECTION.test(section.title)) continue
    const entries = squadFromTemplates(section.body)
    if (entries.length >= 5) return { entries, section: section.title }
  }
  // Artigos sem título de elenco reconhecido: o primeiro bloco com cara de elenco completo.
  for (const section of sections) {
    if (NOT_FIRST_TEAM.test(section.title)) continue
    const entries = squadFromTemplates(section.body)
    if (entries.length >= 11) return { entries, section: section.title }
  }
  return { entries: [] }
}

const TEAMS_SECTION = /^(teams|participating (teams|clubs)|clubs|participants|member clubs|current clubs|league teams)$|stadi|location|venue/i

const VENUE_SECTION = /stadi|location|venue/i

function linksOfSections(sections: { title: string; body: string }[]): WikiLink[] {
  const links: WikiLink[] = []
  for (const section of sections) {
    for (const line of section.body.split(/\r?\n/)) {
      if (!/^\s*[|!*{]/.test(line)) continue
      for (const link of allLinks(line)) if (!links.some((l) => l.title === link.title)) links.push(link)
    }
  }
  return links
}

/**
 * Links da lista de clubes de uma página da temporada (só linhas de tabela e de lista das seções de clubes), em dois grupos: a tabela
 * de estádios e cidades (`primary`, uma linha por participante) e as demais seções de clubes (`secondary`, que costumam trazer
 * também os rebaixados da temporada anterior; só entram quando a primeira não basta).
 */
export function parseSeasonLinkGroups(wikitext: string): { primary: WikiLink[]; secondary: WikiLink[] } {
  const sections = sectionsOf(wikitext).filter((s) => TEAMS_SECTION.test(s.title))
  const primary = linksOfSections(sections.filter((s) => VENUE_SECTION.test(s.title)))
  const secondary = linksOfSections(sections.filter((s) => !VENUE_SECTION.test(s.title))).filter((l) => !primary.some((p) => p.title === l.title))
  return { primary, secondary }
}

export function parseSeasonLinks(wikitext: string): WikiLink[] {
  const { primary, secondary } = parseSeasonLinkGroups(wikitext)
  return primary.length >= 8 ? primary : [...primary, ...secondary]
}

export interface ClubInfobox {
  /** Cores do uniforme principal (`#rrggbb`), do desenho da camisa: corpo, calção, meias e manga. */
  kit: string[]
  /** Estádio e cidade como o quadro escreve (`ground`), sem links. */
  ground?: string
}

function hexOf(text: string | undefined): string | undefined {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec((text ?? '').trim())
  if (!m) return undefined
  const h = (m[1] as string).toLowerCase()
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`
}

/** Quadro do clube (`Infobox football club`): as cores do uniforme principal e o texto do estádio. */
export function parseClubInfobox(wikitext: string): ClubInfobox {
  const box = templatesOf(wikitext, /^infobox football club$/i)[0]
  const out: ClubInfobox = { kit: [] }
  if (!box) return out
  for (const key of ['body1', 'shorts1', 'socks1', 'leftarm1', 'rightarm1', 'body', 'shorts', 'socks', 'leftarm']) {
    const hex = hexOf(box.params.get(key))
    if (hex && !out.kit.includes(hex)) out.kit.push(hex)
  }
  const ground = box.params.get('ground')
  if (ground) out.ground = cleanText(ground.replace(/<br\s*\/?>/gi, ', '))
  return out
}
