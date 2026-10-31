/**
 * Elencos reais por clube, preenchidos à mão (`elencos-reais/<liga>-<clube>.csv`): trocam os jogadores gerados pelos reais. Ficam fora das
 * planilhas que o script reescreve, e o passo final (`finalize.ts`) os reaplica em toda rodada, então nada se perde ao rodar de novo.
 * Cada jogador da planilha entra com id estável (`sq-<id do clube>-<nome>`); quem já está no clube com o mesmo nome é atualizado, e para
 * cada jogador novo sai um gerado do clube (da mesma posição, se houver). Funções puras, exceto a leitura e a escrita dos modelos.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv, toCsv } from '../../src/data/package/edit/csv'
import type { Foot, Nationality, Position } from '../../src/engine/types'
import { parsePosition } from './corrections'
import type { Sheet } from './corrections'
import { toNationality } from './nationality'

export const SQUAD_DIR = 'elencos-reais'
export const SQUAD_COLUMNS = ['jogador', 'posicao', 'nascimento', 'pais', 'pe', 'apelido', 'forca', 'tirar'] as const
export const SQUAD_LIMITS = { min: 18, max: 30 }

const strip = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Texto sem acento, minúsculo e sem pontuação: para comparar nomes e montar nomes de arquivo. */
export const slug = (text: string): string => strip(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Nome do arquivo de um clube: `<liga>-<clube>.csv` (sem acento). */
export const squadFileName = (leagueId: string, clubName: string): string => `${leagueId}-${slug(clubName)}.csv`

function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Países escritos em português (e uns apelidos comuns) que `toNationality` não entende. */
const COUNTRIES_PT: Record<string, Nationality> = {
  brasil: 'Brazil', uruguai: 'Uruguay', paraguai: 'Paraguay', colombia: 'Colombia', equador: 'Ecuador', bolivia: 'Bolivia', 'estados unidos': 'United States', eua: 'United States',
  canada: 'Canada', mexico: 'Mexico', espanha: 'Spain', italia: 'Italy', alemanha: 'Germany', franca: 'France', inglaterra: 'England', escocia: 'Scotland', holanda: 'Netherlands',
  'paises baixos': 'Netherlands', belgica: 'Belgium', suica: 'Switzerland', dinamarca: 'Denmark', suecia: 'Sweden', noruega: 'Norway', polonia: 'Poland', croacia: 'Croatia',
  servia: 'Serbia', grecia: 'Greece', turquia: 'Turkey', ucrania: 'Ukraine', russia: 'Russia', japao: 'Japan', 'coreia do sul': 'South Korea', china: 'China', australia: 'Australia',
  'nova zelandia': 'New Zealand', egito: 'Egypt', marrocos: 'Morocco', argelia: 'Algeria', tunisia: 'Tunisia', nigeria: 'Nigeria', gana: 'Ghana', camaroes: 'Cameroon',
  'costa do marfim': 'Ivory Coast', 'africa do sul': 'South Africa', 'cabo verde': 'Cape Verde', 'costa rica': 'Costa Rica', panama: 'Panama', jamaica: 'Jamaica', irlanda: 'Ireland',
  'pais de gales': 'Wales', gales: 'Wales', 'arabia saudita': 'Saudi Arabia', catar: 'Qatar', ira: 'Iran', iraque: 'Iraq', angola: 'Angola', mocambique: 'Mozambique',
}

const FOOT_WORDS: Record<string, Foot> = { direito: 'right', destro: 'right', d: 'right', right: 'right', esquerdo: 'left', canhoto: 'left', e: 'left', left: 'left', ambos: 'both', ambidestro: 'both', both: 'both' }

const norm = (text: string): string => strip(text).trim().toLowerCase().replace(/\s+/g, ' ')

/** `AAAA-MM-DD`, `DD/MM/AAAA` (o que o Excel e o Google Planilhas mostram no Brasil) ou só o ano. `exact` = tem dia e mês. */
export function parseBirth(text: string): { date: string; exact: boolean } | undefined {
  const t = text.trim()
  if (t === '') return undefined
  const check = (y: number, m: number, d: number): { date: string; exact: boolean } | undefined => {
    const date = new Date(Date.UTC(y, m - 1, d))
    if (y < 1960 || y > 2015 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined
    return { date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, exact: true }
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (m) return check(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  if (m) return check(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{4})$/.exec(t)
  if (m && Number(m[1]) >= 1960 && Number(m[1]) <= 2015) return { date: `${m[1]}-07-01`, exact: false }
  return undefined
}

export interface SquadPlayer {
  /** Linha da planilha (o cabeçalho é a 1). */
  line: number
  name: string
  position: Position
  secondary: Position[]
  birth: { date: string; exact: boolean } | undefined
  nationality: Nationality | undefined
  foot: Foot | undefined
  nickname: string
  overall: number | undefined
  /** Coluna `tirar` marcada: o jogador sai do clube (patrocinador que a Wikipedia listou como jogador, quem foi embora). */
  remove: boolean
}

export interface SquadSheet {
  players: SquadPlayer[]
  /** Problemas por linha; a linha com problema não entra. */
  problems: { line: number; reason: string }[]
  /** Linhas com a posição preenchida e o nome em branco (vagas do modelo ainda abertas). */
  open: number
}

/** Lê a planilha de um clube. Linhas sem nome e sem posição são ignoradas; com nome e sem posição (ou o contrário) viram problema. */
export function readSquadSheet(text: string): SquadSheet | { header: string } {
  const { rows, lines } = parseCsv(text)
  const header = (rows[0] ?? []).map((h) => norm(h))
  if (!header.includes('jogador') || !header.includes('posicao')) return { header: (rows[0] ?? []).join(' | ') }
  const col = (cells: readonly string[], name: string): string => (cells[header.indexOf(name)] ?? '').trim()
  const out: SquadSheet = { players: [], problems: [], open: 0 }
  const seen = new Map<string, number>()
  rows.slice(1).forEach((cells, i) => {
    const line = lines[i + 1] as number
    const name = col(cells, 'jogador')
    const rawPosition = col(cells, 'posicao')
    const extra = ['nascimento', 'pais', 'pe', 'apelido', 'forca', 'tirar'].some((c) => col(cells, c) !== '')
    if (name === '') {
      if (rawPosition !== '' && !extra) out.open++
      else if (extra) out.problems.push({ line, reason: 'tem dados mas o nome do jogador está em branco' })
      return
    }
    const fail = (reason: string): void => void out.problems.push({ line, reason: `${name}: ${reason}` })
    if (/^(sim|s|x|1|true|verdadeiro)$/i.test(col(cells, 'tirar'))) {
      out.players.push({ line, name, position: 'CM', secondary: [], birth: undefined, nationality: undefined, foot: undefined, nickname: '', overall: undefined, remove: true })
      return
    }
    const tokens = rawPosition.split(/[|,/;+\s]+/).filter(Boolean)
    const positions: Position[] = []
    for (const token of tokens) {
      const p = parsePosition(token)
      if (!p) return fail(`"${token}" não é uma posição (use GOL, LD, LE, ZAG, VOL, MC, MEI, PD, PE ou ATA)`)
      if (!positions.includes(p)) positions.push(p)
    }
    const [position, ...secondary] = positions
    if (!position) return fail('falta a posição')
    if (secondary.length > 2) return fail('no máximo 2 posições secundárias')
    if (position === 'GK' ? secondary.length > 0 : secondary.includes('GK')) return fail('goleiro não combina com posição de linha')

    const rawBirth = col(cells, 'nascimento')
    const birth = parseBirth(rawBirth)
    if (rawBirth !== '' && !birth) return fail(`nascimento "${rawBirth}" não vale (use DD/MM/AAAA, AAAA-MM-DD ou só o ano)`)
    const rawCountry = col(cells, 'pais')
    const nationality = rawCountry === '' ? undefined : (toNationality(rawCountry) ?? COUNTRIES_PT[norm(rawCountry)])
    if (rawCountry !== '' && !nationality) return fail(`país "${rawCountry}" não existe no jogo (veja a lista de países no guia)`)
    const rawFoot = col(cells, 'pe')
    const foot = rawFoot === '' ? undefined : FOOT_WORDS[norm(rawFoot)]
    if (rawFoot !== '' && !foot) return fail(`pé "${rawFoot}" não vale (use direito, esquerdo ou ambos)`)
    const rawOverall = col(cells, 'forca')
    const overall = rawOverall === '' ? undefined : Number(rawOverall.replace(',', '.'))
    if (overall !== undefined && (!Number.isFinite(overall) || overall < 1 || overall > 100)) return fail(`força "${rawOverall}" não é um número de 1 a 100`)

    const key = slug(name)
    if (seen.has(key)) return fail(`repetido (já está na linha ${seen.get(key)})`)
    seen.set(key, line)
    out.players.push({ line, name, position, secondary, birth, nationality, foot, nickname: col(cells, 'apelido'), overall: overall === undefined ? undefined : Math.round(overall), remove: false })
  })
  return out
}

export const squadPlayerId = (clubId: string, name: string): string => `sq-${clubId}-${slug(name)}`

export interface MergeResult {
  added: number
  updated: number
  replacedGenerated: number
  removed: number
  /** Jogadores do clube depois da troca. */
  size: number
}

const isGenerated = (row: Record<string, string>): boolean => /^(sim|s|1|true)$/i.test(row.generated ?? '')

/**
 * Acrescenta os jogadores da planilha ao clube (`playerSheet`) e tira um jogador gerado para cada novo (da mesma posição; se não houver,
 * o último gerado). Idempotente: rodar de novo com a mesma planilha não muda nada. `overrides` recebe a força pedida na coluna `forca`.
 */
export function mergeSquad(playerSheet: Sheet, club: { id: string; name: string }, squad: readonly SquadPlayer[], options: { startYear: number; country: Nationality; overrides?: Map<string, { overall?: number; potential?: number }> }): MergeResult {
  const result: MergeResult = { added: 0, updated: 0, replacedGenerated: 0, removed: 0, size: 0 }
  const inClub = (): Record<string, string>[] => playerSheet.rows.filter((r) => r.club === club.id)
  const known = inClub().filter((r) => r.birthDate && r.birthEstimated !== 'sim')
  const ages = known.map((r) => options.startYear - Number((r.birthDate as string).slice(0, 4)))
  const baseAge = ages.length >= 5 ? ages.reduce((a, b) => a + b, 0) / ages.length : 26

  for (const p of squad) {
    if (p.remove) {
      const gone = inClub().find((r) => r.id === squadPlayerId(club.id, p.name) || slug(r.name ?? '') === slug(p.name))
      if (gone) (playerSheet.rows.splice(playerSheet.rows.indexOf(gone), 1), result.removed++)
      continue
    }
    const id = squadPlayerId(club.id, p.name)
    const existing = inClub().find((r) => r.id === id || slug(r.name ?? '') === slug(p.name))
    const hash = hashOf(id)
    let birthDate = p.birth?.date
    let estimated = p.birth ? !p.birth.exact : true
    if (!birthDate) {
      const age = Math.max(17, Math.round(baseAge) + (hash % 7) - 3)
      birthDate = `${options.startYear - age}-${String(1 + ((hash >>> 3) % 12)).padStart(2, '0')}-${String(1 + ((hash >>> 7) % 28)).padStart(2, '0')}`
    }
    // Já no clube com data conhecida e sem data na planilha: a data que existe vale mais que uma estimada.
    if (existing && !p.birth && existing.birthDate) (birthDate = existing.birthDate, (estimated = existing.birthEstimated === 'sim'))

    let row: Record<string, string>
    if (existing) {
      row = existing
      result.updated++
    } else {
      row = Object.fromEntries(playerSheet.header.map((h) => [h, '']))
      row.id = id
      const generated = inClub().filter(isGenerated)
      const victim = generated.find((g) => g.position === p.position) ?? generated[generated.length - 1]
      if (victim) {
        playerSheet.rows.splice(playerSheet.rows.indexOf(victim), 1)
        result.replacedGenerated++
      }
      playerSheet.rows.push(row)
      result.added++
    }
    row.name = p.name
    if (p.nickname !== '') row.nickname = p.nickname
    row.birthDate = birthDate
    row.birthEstimated = estimated ? 'sim' : ''
    row.nationality = p.nationality ?? row.nationality ?? options.country
    if (!row.nationality) row.nationality = options.country
    row.position = p.position
    row.secondaryPositions = p.secondary.join('|')
    if (p.foot) row.foot = p.foot
    row.club = club.id
    row.clubName = club.name
    row.generated = ''
    if (p.overall !== undefined && options.overrides) {
      const entry = options.overrides.get(row.id as string) ?? {}
      entry.overall ??= p.overall
      options.overrides.set(row.id as string, entry)
    }
  }
  result.size = inClub().length
  return result
}

export interface SquadReport {
  /** Clubes que receberam a planilha. */
  clubs: { league: string; club: string; file: string; added: number; updated: number; replacedGenerated: number; removed: number; size: number; open: number }[]
  /** Arquivos que não bateram com nenhum clube, linhas recusadas e elencos fora de 18 a 30. */
  problems: string[]
}

/** Arquivos da pasta de elencos, em ordem. */
export function squadFiles(dir: string): string[] {
  const folder = join(dir, SQUAD_DIR)
  return existsSync(folder) ? readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.csv')).sort() : []
}

/** Modelo de planilha de um clube: os jogadores reais que o script já achou (para não repetir) e uma linha em branco, com a posição que falta, para cada gerado. */
export function squadTemplate(players: readonly Record<string, string>[], clubId: string): string {
  const mine = players.filter((r) => r.club === clubId)
  const rows: (string | number)[][] = []
  for (const r of mine.filter((p) => !isGenerated(p))) rows.push([r.name ?? '', r.position ?? '', r.birthEstimated === 'sim' ? '' : (r.birthDate ?? ''), r.nationality ?? '', r.foot === 'right' ? 'direito' : r.foot === 'left' ? 'esquerdo' : r.foot === 'both' ? 'ambos' : '', r.nickname ?? '', '', ''])
  for (const r of mine.filter(isGenerated)) rows.push(['', r.position ?? '', '', '', '', '', '', ''])
  return toCsv([...SQUAD_COLUMNS], rows)
}

export function writeSquadTemplate(dir: string, leagueId: string, clubName: string, text: string): { file: string; created: boolean } {
  const folder = join(dir, SQUAD_DIR)
  mkdirSync(folder, { recursive: true })
  const file = join(folder, squadFileName(leagueId, clubName))
  // Nunca sobrescreve: o arquivo pode já ter o trabalho de alguém.
  if (existsSync(file)) return { file, created: false }
  writeFileSync(file, text)
  return { file, created: true }
}

/** Aplica à liga os arquivos de elenco dos clubes dela. Devolve os arquivos usados; clubes e problemas entram em `report`. */
export function applyLeagueSquads(dir: string, league: { id: string; country: Nationality }, clubSheet: Sheet, playerSheet: Sheet, options: { startYear: number; overrides: Map<string, { overall?: number; potential?: number }> }, report: SquadReport): string[] {
  const files = new Set(squadFiles(dir))
  const used: string[] = []
  for (const club of clubSheet.rows) {
    const file = squadFileName(league.id, club.name ?? '')
    if (!files.has(file)) continue
    used.push(file)
    const read = readSquadSheet(readFileSync(join(dir, SQUAD_DIR, file), 'utf8'))
    if ('header' in read) {
      report.problems.push(`${file}: faltam as colunas jogador e posicao (cabeçalho: ${read.header})`)
      continue
    }
    for (const p of read.problems) report.problems.push(`${file}, linha ${p.line}: ${p.reason}`)
    const merged = mergeSquad(playerSheet, { id: club.id ?? '', name: club.name ?? '' }, read.players, { startYear: options.startYear, country: league.country, overrides: options.overrides })
    report.clubs.push({ league: league.id, club: club.name ?? '', file, added: merged.added, updated: merged.updated, replacedGenerated: merged.replacedGenerated, removed: merged.removed, size: merged.size, open: read.open })
    if (merged.size < SQUAD_LIMITS.min || merged.size > SQUAD_LIMITS.max) report.problems.push(`${file}: o ${club.name} ficou com ${merged.size} jogadores (o jogo exige de ${SQUAD_LIMITS.min} a ${SQUAD_LIMITS.max})`)
  }
  return used
}
