/**
 * Elenco a partir da Wikipedia no idioma do país (espanhol, português, alemão, italiano, francês, neerlandês): lê o HTML da seção de elenco
 * do artigo do clube. As tabelas variam muito (colunas de número, bandeira e posição em ordens diferentes, até três jogadores por linha),
 * então a leitura anda pelas células na ordem: guarda o número, a bandeira e a posição que viu e fecha um jogador a cada nome com link.
 * O país vem do nome do arquivo da bandeira (`Flag_of_Brazil.svg`), que é o mesmo em todas as línguas. Funções puras.
 */
import type { Coarse } from './positions'
import type { Position } from '../../src/engine/types'

export interface LocalEntry {
  /** Artigo do jogador na Wikipedia local (ausente em link vermelho ou sem link). */
  title?: string
  display: string
  number?: number
  /** País em inglês, do nome do arquivo da bandeira. */
  nat?: string
  /** Setor da tabela. */
  pos?: Coarse
  /** Posição exata do jogo, quando a tabela traz (zagueiro, volante, ponta...). */
  position?: Position
}

const strip = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')

type PosInfo = { coarse: Coarse; position?: Position }

const gk = (...keys: string[]): [string, PosInfo][] => keys.map((k) => [k, { coarse: 'GK', position: 'GK' }])
const generic = (coarse: Coarse, ...keys: string[]): [string, PosInfo][] => keys.map((k) => [k, { coarse }])
const exact = (coarse: Coarse, position: Position, ...keys: string[]): [string, PosInfo][] => keys.map((k) => [k, { coarse, position }])

/** Siglas e palavras de posição nas seis línguas (sem acento, sem pontuação). */
const BASE = new Map<string, PosInfo>([
  ...gk('POR', 'GK', 'G', 'GOL', 'GR', 'TW', 'TOR', 'P', 'GARDIEN', 'DOELMAN', 'GUARDAMETA', 'ARQUERO', 'PORTERO', 'GOLEIRO', 'GUARDAREDES', 'KEEPER', 'TORWART', 'PORTIERE', 'GUARDIENDEBUT'),
  ...generic('DF', 'DEF', 'DF', 'D', 'DEFENSA', 'DEFENSOR', 'DEFENSEUR', 'VERDEDIGER', 'ABWEHR', 'DEFENDER', 'DEFESA', 'DIFENSORE', 'LAT', 'LATERAL', 'ABW', 'VERD'),
  ...exact('DF', 'RB', 'LD', 'RB', 'DD', 'CAD', 'LATERALDIREITO', 'LATERALDERECHO', 'RV'),
  ...exact('DF', 'LB', 'LB', 'LE', 'LI', 'DS', 'CAI', 'LATERALESQUERDO', 'LATERALIZQUIERDO', 'LV'),
  ...exact('DF', 'CB', 'DFC', 'ZAG', 'CB', 'ZAGUEIRO', 'DEFENSACENTRAL', 'DEFENSEURCENTRAL', 'CENTRALE'),
  ...generic('MF', 'MED', 'MF', 'M', 'MEDIOCAMPISTA', 'MEIO', 'MEIOCAMPISTA', 'C', 'CENTROCAMPISTA', 'MILIEU', 'MIDDENVELDER', 'MITTELFELD', 'MIT', 'MV', 'CENTROCAMPO'),
  ...exact('MF', 'DM', 'MCD', 'VOL', 'V', 'DM', 'MDC', 'VOLANTE', 'PIVOT', 'MEDIOCENTRODEFENSIVO'),
  ...exact('MF', 'CM', 'MC', 'CM', 'MEDIOCENTRO'),
  ...exact('MF', 'AM', 'MCO', 'MEI', 'MP', 'AM', 'MA', 'MEIA', 'ENGANCHE', 'MEDIAPUNTA', 'TREQUARTISTA', 'TQ', 'OM'),
  ...exact('MF', 'LW', 'MI', 'ME', 'LM', 'MEIAESQUERDA'),
  ...exact('MF', 'RW', 'MD', 'RM', 'MEIADIREITA'),
  ...generic('FW', 'DEL', 'FW', 'ATA', 'AT', 'A', 'ATT', 'ATACANTE', 'ATTACCANTE', 'ATTAQUANT', 'AANVALLER', 'STURM', 'DELANTERO', 'ATAQUE', 'AANV', 'STU'),
  ...exact('FW', 'LW', 'EI', 'PE', 'LW', 'PONTAESQUERDA', 'EXTREMOIZQUIERDO', 'AILIERGAUCHE', 'LINKSAUSSEN'),
  ...exact('FW', 'RW', 'ED', 'PD', 'RW', 'PONTADIREITA', 'EXTREMODERECHO', 'AILIERDROIT', 'RECHTSAUSSEN'),
  ...exact('FW', 'ST', 'DC', 'SD', 'ST', 'CA', 'CENTROAVANTE', 'DELANTEROCENTRO', 'MITTELSTURMER', 'BU'),
])

/** Ajustes por língua onde a mesma sigla significa outra coisa. */
const OVERRIDES: Record<string, [string, PosInfo][]> = {
  it: [...exact('DF', 'CB', 'DC'), ...exact('FW', 'ST', 'ATT')],
  fr: [...exact('FW', 'ST', 'BU')],
}

export function positionInfo(text: string, lang: string): PosInfo | undefined {
  const key = strip(text)
  if (key === '') return undefined
  const override = OVERRIDES[lang]?.find(([k]) => k === key)
  return override ? override[1] : BASE.get(key)
}

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
}

const visibleText = (html: string): string =>
  decode(
    html
      .replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/g, '')
      .replace(/<sup[\s\S]*?<\/sup>/g, '')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()

/** País a partir do arquivo da bandeira (`Flag_of_Brazil.svg`, `Flag_of_the_Netherlands.svg`, `Flag_of_France_(1974–2020).svg`). */
export function flagCountry(cellHtml: string): string | undefined {
  const match = /Flag_of_([^"\/?.]+?)(?:_\([^)]*\))?(?:%28[^"\/?]*?%29)?\.(?:svg|png)/i.exec(cellHtml)
  if (!match) return undefined
  const raw = decodeURIComponent((match[1] as string).replace(/%28.*$/, '')).replace(/_/g, ' ').replace(/^the /i, '').trim()
  return raw
}

interface Anchor {
  href: string
  inner: string
  classes: string
}

function anchorsOf(html: string): Anchor[] {
  const list: Anchor[] = []
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attrs = match[1] as string
    const href = /href="([^"]*)"/.exec(attrs)?.[1] ?? ''
    list.push({ href, inner: match[2] as string, classes: /class="([^"]*)"/.exec(attrs)?.[1] ?? '' })
  }
  return list
}

const FILE_LINK = /\/wiki\/(File|Image|Archivo|Fichier|Bestand|Datei|Ficheiro|Ficheiro|Immagine|Arquivo):/i
const NOT_PLAYER_TEXT = /^(capit[aã]o|captain|capit[aá]n|capitaine|kapit[aä]n|kapitein|capitano|\(c\))$/i

/** Cabeçalhos depois dos quais a lista deixa de ser o elenco principal (emprestados, base, reservas). */
const STOP_HEADING = /empr[eé]stimo|pr[eé]stamo|cedid|oud-|voormalig|ehemalig|ancien|storic|passati|bekende|leyenda|prestad|loan|pr[eê]t|verliehen|leihe|leiha|prestit|uitgeleend|cantera|categor|academ|formativ|vivero|juvenil|reserva|reserve|amateur|jeunes|jugend|jong|primavera|\bu-?\d{2}\b|sub-?\d{2}|retired|aposentad|retirad|n[uú]meros? retirad|former|ex-|hist[oó]ric|legend/i

/** Corta o HTML no primeiro título de subseção que fala de emprestados, base ou histórico. */
export function mainSquadHtml(html: string): string {
  for (const match of html.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const text = visibleText(match[2] as string)
    if (STOP_HEADING.test(text)) return html.slice(0, match.index)
  }
  return html
}

export function parseSquadHtml(html: string, lang: string): LocalEntry[] {
  const entries: LocalEntry[] = []
  for (const row of mainSquadHtml(html).match(/<tr\b[\s\S]*?<\/tr>/g) ?? []) {
    let pending: { number?: number; nat?: string; info?: PosInfo } = {}
    let closed = 0
    for (const cell of row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/g) ?? []) {
      const flag = flagCountry(cell)
      if (flag) pending.nat = flag
      const text = visibleText(cell)
      const anchors = anchorsOf(cell).filter((a) => !FILE_LINK.test(a.href) && !/mw-file-description/.test(a.classes) && !/<img/i.test(a.inner))
      const person = anchors.find((a) => {
        const text = visibleText(a.inner)
        const isArticle = a.href.startsWith('/wiki/') && !a.href.slice(6).includes(':')
        return text.length >= 2 && !positionInfo(text, lang) && !NOT_PLAYER_TEXT.test(text) && (isArticle || /redlink=1/.test(a.href))
      })
      const label = person ? visibleText(person.inner) : ''
      const info = positionInfo(text, lang) ?? (anchors.length === 1 ? positionInfo(visibleText(anchors[0]!.inner), lang) : undefined)
      if (info && text.length <= 24) {
        pending.info = info
        continue
      }
      if (/^\d{1,2}$/.test(text)) {
        pending.number = Number(text)
        continue
      }
      // Depois do primeiro jogador da linha, outro nome só conta se veio com número ou posição (senão é o clube de origem, o empréstimo...).
      if (person && label !== '' && (closed === 0 || pending.number !== undefined || pending.info)) {
        const redlink = /redlink=1/.test(person.href)
        const title = redlink ? undefined : decodeURIComponent(person.href.replace(/^\/wiki\//, '').replace(/#.*$/, '')).replace(/_/g, ' ')
        const entry: LocalEntry = { display: label }
        if (title && !/:/.test(title)) entry.title = title
        if (pending.number !== undefined) entry.number = pending.number
        if (pending.nat) entry.nat = pending.nat
        if (pending.info) (entry.pos = pending.info.coarse), pending.info.position && (entry.position = pending.info.position)
        entries.push(entry)
        closed++
        pending = {}
      }
    }
  }
  return entries
}

/** Escolhe a seção de elenco do artigo entre as seções da página (título, índice). */
export function pickSquadSection(sections: { index: string; line: string }[]): { index: string; line: string } | undefined {
  const head = /elenco|plantel|plantilla|jugadores|jogadores|kader|rosa\b|effectif|spelers|selectie|equipa|squadra|giocatori|joueurs|spieler|mannschaft|first team|primer equipo/i
  const not = /hist[oó]ri|bekende|\bex-|antigu|legend|statist|estad[ií]st|record|ehemalige|ancien|storici|passati|palmar|titul|jeugd|juvenil|cantera|reserve|amateur|jong|\bu-?\d{2}\b|primavera|sub-?\d{2}|entrenador|t[eé]cnic|comissão|staff|treinador/i
  const clean = (line: string): string => decode(line.replace(/<[^>]+>/g, ''))
  const candidates = sections.filter((s) => head.test(clean(s.line)) && !not.test(clean(s.line)))
  const current = /actuel|atual|actual|aktuell|attuale|huidig|current|20dd|profi|primer equipo|first/i
  return candidates.find((s) => current.test(clean(s.line))) ?? candidates[0]
}
