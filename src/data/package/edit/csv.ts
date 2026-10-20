/**
 * Planilha (CSV) de jogadores e clubes: uma linha por jogador (ou clube), com os mesmos campos do pacote, para editar em massa no
 * Google Planilhas ou no Excel e importar de volta. Os erros saem por linha e coluna (`CsvIssue`; o texto fica em `labels.ts`).
 *
 * - Exporta com `;` e BOM UTF-8 (o Excel em português abre certo); lê `;`, `,` ou tab, e datas `AAAA-MM-DD` ou `DD/MM/AAAA`.
 * - A coluna `id` liga a linha ao jogador (ou clube) do pacote: com id existente atualiza, sem id ou com id novo cria.
 * - Célula vazia num campo opcional = o jogo gera o valor (atributos: ou todos preenchidos, ou todos vazios).
 */
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from '../../../engine/config'
import { ATTRIBUTE_NAMES, NATIONALITIES, POSITIONS } from '../../../engine/types'
import type { Attributes, Foot, Nationality, Position } from '../../../engine/types'
import type { DataPackage, PackageClub, PackagePlayer } from '../types'
import { freeAbbreviation, freeId, playersOf, syncTeamCounts, withPlayers } from './ops'
import type { PlayerList } from './ops'
import { suggestPlayerData } from './suggest'

export type CsvIssueCode =
  | 'empty-file'
  | 'missing-column'
  | 'bad-quote'
  | 'missing-field'
  | 'bad-number'
  | 'out-of-range'
  | 'unknown-value'
  | 'bad-date'
  | 'bad-color'
  | 'duplicate-id'
  | 'unknown-club'
  | 'unknown-league'
  | 'attributes-incomplete'
  | 'too-many-positions'
  | 'duplicate-abbreviation'

export interface CsvIssue {
  /** Linha da planilha (o cabeçalho é a 1; a primeira linha de dados é a 2). 0 = problema do arquivo. */
  line: number
  column?: string
  code: CsvIssueCode
  detail?: string | number
}

export const PLAYER_COLUMNS = [
  'id', 'name', 'nickname', 'birthDate', 'birthEstimated', 'nationality', 'position', 'secondaryPositions', 'foot', 'club', 'clubName',
  ...ATTRIBUTE_NAMES, 'potential', 'consistency', 'injuryProneness', 'professionalism', 'salary', 'contractEnd', 'releaseClause',
] as const

export const CLUB_COLUMNS = ['id', 'name', 'abbreviation', 'color1', 'color2', 'city', 'state', 'stadiumName', 'stadiumCapacity', 'reputation', 'league', 'leagueName'] as const

/** Colunas só para ler na planilha: a importação as ignora sem avisar. */
const INFO_COLUMNS = new Set(['clubName', 'leagueName'])
const SEPARATOR = ';'

// ---------------------------------------------------------------------------------------------------------------------
// Leitura e escrita do CSV

/** Separa o texto em linhas de células (aspas duplas, `""` dentro de aspas, quebras de linha dentro de aspas). */
export function parseCsv(input: string): { delimiter: string; rows: string[][]; badQuote: boolean } {
  const text = input.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = [';', ',', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 })).sort((a, b) => b.n - a.n)
  const delimiter = (counts[0] as { d: string; n: number }).n > 0 ? (counts[0] as { d: string }).d : SEPARATOR
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let badQuote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') (cell += '"'), i++
        else quoted = false
      } else cell += ch
    } else if (ch === '"') {
      if (cell === '') quoted = true
      else cell += ch
    } else if (ch === delimiter) (row.push(cell), (cell = ''))
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else cell += ch
  }
  if (quoted) badQuote = true
  if (cell !== '' || row.length > 0) (row.push(cell), rows.push(row))
  return { delimiter, rows: rows.filter((r) => r.some((c) => c.trim() !== '')), badQuote }
}

const quote = (v: string): string => (/[";\n\r]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v)

export const toCsv = (header: readonly string[], rows: readonly (readonly (string | number | undefined | null)[])[]): string => `﻿${[header, ...rows].map((r) => r.map((c) => quote(c === undefined || c === null ? '' : String(c))).join(SEPARATOR)).join('\r\n')}\r\n`

// ---------------------------------------------------------------------------------------------------------------------
// Exportação

export interface PlayersExportOptions {
  /** Só os jogadores destes clubes (a divisão do trabalho por liga). */
  clubIds?: ReadonlySet<string>
  /** Inclui os jogadores livres (sem clube) quando há filtro de clubes. */
  withFree?: boolean
  /** Preenche com os valores que o jogo geraria os jogadores que ainda não têm atributos, para ajustar à mão. */
  fillGenerated?: boolean
}

export function playersToCsv(pkg: DataPackage, list: PlayerList, options: PlayersExportOptions = {}): string {
  const clubName = new Map(pkg.clubs.map((c) => [c.id, c.name]))
  const rows = playersOf(pkg, list)
    .filter((p) => !options.clubIds || (p.club ? options.clubIds.has(p.club) : options.withFree === true))
    .map((p) => {
      const gen = options.fillGenerated && !(p.attributes && p.potential !== undefined && p.hidden && p.contract) ? suggestPlayerData(pkg, p) : undefined
      const merged = { attributes: p.attributes ?? gen?.attributes, potential: p.potential ?? gen?.potential, hidden: p.hidden ?? gen?.hidden, contract: p.contract ?? gen?.contract }
      return [
        p.id, p.name, p.nickname, p.birthDate, p.birthEstimated ? 'sim' : '', p.nationality, p.position, p.secondaryPositions ? (p.secondaryPositions.length > 0 ? p.secondaryPositions.join('|') : '-') : '', p.foot, p.club, p.club ? clubName.get(p.club) : '',
        ...ATTRIBUTE_NAMES.map((a) => merged.attributes?.[a]),
        merged.potential, merged.hidden?.consistency, merged.hidden?.injuryProneness, merged.hidden?.professionalism,
        merged.contract?.salary, merged.contract?.endDate, merged.contract?.releaseClause,
      ]
    })
  return toCsv(PLAYER_COLUMNS, rows)
}

export function clubsToCsv(pkg: DataPackage, options: { leagueIds?: ReadonlySet<string> } = {}): string {
  const leagueName = new Map(pkg.leagues.map((l) => [l.id, l.name]))
  const rows = pkg.clubs
    .filter((c) => !options.leagueIds || options.leagueIds.has(c.league))
    .map((c) => [c.id, c.name, c.abbreviation, c.colors[0], c.colors[1], c.city, c.state, c.stadium.name, c.stadium.capacity, c.reputation, c.league, leagueName.get(c.league)])
  return toCsv(CLUB_COLUMNS, rows)
}

// ---------------------------------------------------------------------------------------------------------------------
// Leitura das células

interface Cells {
  line: number
  get(column: string): string
}

class RowReader {
  constructor(
    private readonly cells: Cells,
    readonly issues: CsvIssue[],
  ) {}
  get line() {
    return this.cells.line
  }
  raw(column: string): string {
    return this.cells.get(column).trim()
  }
  fail(code: CsvIssueCode, column: string | undefined, detail?: string | number) {
    this.issues.push({ line: this.cells.line, ...(column ? { column } : {}), code, ...(detail !== undefined ? { detail } : {}) })
  }
  text(column: string, required: boolean): string | undefined {
    const v = this.raw(column)
    if (v === '' && required) this.fail('missing-field', column)
    return v === '' ? undefined : v
  }
  int(column: string, min: number, max: number, required: boolean): number | undefined {
    const v = this.raw(column)
    if (v === '') {
      if (required) this.fail('missing-field', column)
      return undefined
    }
    const n = Number(v.replace(/\s/g, ''))
    if (!Number.isInteger(n)) return void this.fail('bad-number', column, v)
    if (n < min || n > max) return void this.fail('out-of-range', column, `${v} (${min}–${max})`)
    return n
  }
  date(column: string, required: boolean): string | undefined {
    const v = this.raw(column)
    if (v === '') {
      if (required) this.fail('missing-field', column)
      return undefined
    }
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
    const iso = br ? `${br[3]}-${(br[2] as string).padStart(2, '0')}-${(br[1] as string).padStart(2, '0')}` : v
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) return void this.fail('bad-date', column, v)
    return iso
  }
  pick<T extends string>(column: string, allowed: readonly T[], required: boolean): T | undefined {
    const v = this.raw(column)
    if (v === '') {
      if (required) this.fail('missing-field', column)
      return undefined
    }
    const found = allowed.find((a) => a.toLowerCase() === v.toLowerCase())
    if (!found) this.fail('unknown-value', column, v)
    return found
  }
}

export interface CsvParsed<T> {
  /** Linhas lidas sem problema, com a linha da planilha. */
  rows: { line: number; value: T }[]
  issues: CsvIssue[]
  /** Quantas linhas de dados a planilha tem. */
  total: number
  /** Colunas que o jogo não conhece (ignoradas). */
  ignoredColumns: string[]
}

function readSheet<T>(text: string, known: readonly string[], required: readonly string[], readRow: (r: RowReader) => T | undefined): CsvParsed<T> {
  const issues: CsvIssue[] = []
  const { rows, badQuote } = parseCsv(text)
  const result: CsvParsed<T> = { rows: [], issues, total: 0, ignoredColumns: [] }
  if (badQuote) issues.push({ line: 0, code: 'bad-quote' })
  const header = (rows[0] ?? []).map((h) => h.trim())
  if (rows.length === 0) {
    issues.push({ line: 0, code: 'empty-file' })
    return result
  }
  const index = new Map(header.map((h, i) => [h, i]))
  for (const column of required) if (!index.has(column)) issues.push({ line: 1, column, code: 'missing-column' })
  result.ignoredColumns = header.filter((h) => h !== '' && !known.includes(h) && !INFO_COLUMNS.has(h))
  if (issues.some((i) => i.code === 'missing-column')) return result
  const ids = new Map<string, number>()
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2
    result.total++
    const own: CsvIssue[] = []
    const value = readRow(new RowReader({ line, get: (column) => (index.has(column) ? (cells[index.get(column) as number] ?? '') : '') }, own))
    const rawId = (value as unknown as { id?: unknown } | undefined)?.id
    const id = typeof rawId === 'string' && rawId !== '' ? rawId : undefined
    if (id !== undefined) {
      if (ids.has(id)) own.push({ line, column: 'id', code: 'duplicate-id', detail: `${id} (linha ${ids.get(id)})` })
      else ids.set(id, line)
    }
    issues.push(...own)
    if (own.length === 0 && value !== undefined) result.rows.push({ line, value })
  })
  return result
}

// ---------------------------------------------------------------------------------------------------------------------
// Jogadores

export function parsePlayersCsv(text: string, pkg: DataPackage): CsvParsed<PackagePlayer> {
  const clubIds = new Set(pkg.clubs.map((c) => c.id))
  return readSheet(text, PLAYER_COLUMNS, ['name', 'birthDate', 'nationality', 'position'], (r) => {
    const name = r.text('name', true)
    const birthDate = r.date('birthDate', true)
    const nationality = r.pick<Nationality>('nationality', NATIONALITIES, true)
    const position = r.pick<Position>('position', POSITIONS, true)
    const player: PackagePlayer = { name: name ?? '', birthDate: birthDate ?? '', nationality: nationality as Nationality, position: position as Position }
    const id = r.text('id', false)
    if (id) player.id = id
    if (/^(sim|s|1|true|yes|x|estimada)$/i.test(r.raw('birthEstimated'))) player.birthEstimated = true
    const nickname = r.text('nickname', false)
    if (nickname) player.nickname = nickname
    const rawSecondary = r.raw('secondaryPositions')
    if (rawSecondary !== '') {
      const parts = rawSecondary === '-' ? [] : rawSecondary.split(/[|,/ ]+/).filter(Boolean)
      const secondary = parts.flatMap((p) => {
        const found = POSITIONS.find((x) => x.toLowerCase() === p.toLowerCase())
        if (!found) r.fail('unknown-value', 'secondaryPositions', p)
        return found ? [found] : []
      })
      if (secondary.length > 2) r.fail('too-many-positions', 'secondaryPositions', secondary.length)
      player.secondaryPositions = secondary.slice(0, 2)
    }
    const foot = r.pick<Foot>('foot', ['right', 'left', 'both'], false)
    if (foot) player.foot = foot
    const club = r.text('club', false)
    if (club && !clubIds.has(club)) r.fail('unknown-club', 'club', club)
    player.club = club ?? null

    const filled = ATTRIBUTE_NAMES.filter((a) => r.raw(a) !== '')
    if (filled.length > 0 && filled.length < ATTRIBUTE_NAMES.length) r.fail('attributes-incomplete', filled.length < ATTRIBUTE_NAMES.length ? ATTRIBUTE_NAMES.find((a) => r.raw(a) === '') : undefined, `${filled.length}/${ATTRIBUTE_NAMES.length}`)
    else if (filled.length > 0) {
      const attributes = {} as Attributes
      for (const a of ATTRIBUTE_NAMES) attributes[a] = r.int(a, ATTRIBUTE_MIN, ATTRIBUTE_MAX, true) ?? 0
      player.attributes = attributes
    }
    const potential = r.int('potential', ATTRIBUTE_MIN, ATTRIBUTE_MAX, false)
    if (potential !== undefined) player.potential = potential
    const hidden = ['consistency', 'injuryProneness', 'professionalism'] as const
    if (hidden.some((h) => r.raw(h) !== '')) {
      const [consistency, injuryProneness, professionalism] = hidden.map((h) => r.int(h, ATTRIBUTE_MIN, ATTRIBUTE_MAX, true))
      player.hidden = { consistency: consistency ?? 0, injuryProneness: injuryProneness ?? 0, professionalism: professionalism ?? 0 }
    }
    if (['salary', 'contractEnd', 'releaseClause'].some((c) => r.raw(c) !== '')) {
      const salary = r.int('salary', 0, 1_000_000_000, true)
      const endDate = r.date('contractEnd', true)
      const releaseClause = r.int('releaseClause', 0, 10_000_000_000, true)
      player.contract = { salary: salary ?? 0, endDate: endDate ?? '', releaseClause: releaseClause ?? 0 }
    }
    return player
  })
}

export interface ImportOptions {
  /** Importa só as linhas sem erro (as outras ficam de fora). Sem isto, qualquer erro cancela tudo. */
  validOnly?: boolean
  /** Tira do pacote quem não aparece na planilha, dentro do que a planilha cobre (os clubes dela, ou as ligas dela). */
  removeMissing?: boolean
}

export interface ImportSummary {
  pkg: DataPackage
  added: number
  updated: number
  removed: number
}

export function applyPlayersImport(pkg: DataPackage, list: PlayerList, parsed: CsvParsed<PackagePlayer>, options: ImportOptions = {}): ImportSummary {
  if (parsed.issues.length > 0 && !options.validOnly) return { pkg, added: 0, updated: 0, removed: 0 }
  const current = playersOf(pkg, list)
  const byId = new Map(current.flatMap((p, i) => (p.id ? [[p.id, i] as const] : [])))
  const taken = new Set([...pkg.players, ...(pkg.academy ?? [])].flatMap((p) => (p.id ? [p.id] : [])))
  const next = [...current]
  const seen = new Set<string>()
  const clubsInFile = new Set<string>()
  let added = 0
  let updated = 0
  for (const { value } of parsed.rows) {
    if (value.club) clubsInFile.add(value.club)
    const existing = value.id ? byId.get(value.id) : undefined
    if (existing !== undefined) {
      next[existing] = value
      seen.add(value.id as string)
      updated++
    } else {
      const id = value.id && !taken.has(value.id) ? value.id : freeId('player-ed', taken)
      taken.add(id)
      seen.add(id)
      next.push({ ...value, id })
      added++
    }
  }
  const kept = options.removeMissing ? next.filter((p) => !(p.club && clubsInFile.has(p.club) && !(p.id && seen.has(p.id)))) : next
  return { pkg: withPlayers(pkg, list, kept), added, updated, removed: next.length - kept.length }
}

// ---------------------------------------------------------------------------------------------------------------------
// Clubes

export function parseClubsCsv(text: string, pkg: DataPackage): CsvParsed<PackageClub> {
  const leagueIds = new Set(pkg.leagues.map((l) => l.id))
  const abbreviations = new Map<string, number>()
  const parsed = readSheet(text, CLUB_COLUMNS, ['name', 'league'], (r) => {
    const name = r.text('name', true)
    const abbreviation = r.text('abbreviation', false)?.toUpperCase()
    if (abbreviation !== undefined && !/^[A-Z]{3}$/.test(abbreviation)) r.fail('out-of-range', 'abbreviation', `${abbreviation} (3 letras)`)
    else if (abbreviation !== undefined) {
      if (abbreviations.has(abbreviation)) r.fail('duplicate-abbreviation', 'abbreviation', `${abbreviation} (linha ${abbreviations.get(abbreviation)})`)
      else abbreviations.set(abbreviation, r.line)
    }
    const color = (column: string, fallback: string): string => {
      const v = r.raw(column)
      if (v === '') return fallback
      const hex = v.startsWith('#') ? v : `#${v}`
      if (!/^#[0-9a-fA-F]{6}$/.test(hex)) r.fail('bad-color', column, v)
      return hex.toLowerCase()
    }
    const colors: [string, string] = [color('color1', '#c8102e'), color('color2', '#f2f2f2')]
    const capacity = r.int('stadiumCapacity', 500, 300_000, false)
    const reputation = r.int('reputation', 1, 20, true)
    const league = r.text('league', true)
    if (league && !leagueIds.has(league)) r.fail('unknown-league', 'league', league)
    const club: PackageClub = {
      id: r.text('id', false) ?? '',
      name: name ?? '',
      abbreviation: abbreviation ?? '',
      colors,
      city: r.text('city', false) ?? '',
      stadium: { name: r.text('stadiumName', false) ?? '', capacity: capacity ?? 20_000 },
      reputation: reputation ?? 8,
      league: league ?? '',
    }
    const state = r.text('state', false)
    if (state) club.state = state
    return club
  })
  return parsed
}

export function applyClubsImport(pkg: DataPackage, parsed: CsvParsed<PackageClub>, options: ImportOptions = {}): ImportSummary {
  if (parsed.issues.length > 0 && !options.validOnly) return { pkg, added: 0, updated: 0, removed: 0 }
  const byId = new Map(pkg.clubs.map((c, i) => [c.id, i]))
  const taken = new Set(pkg.clubs.map((c) => c.id))
  const abbreviations = new Set(pkg.clubs.map((c) => c.abbreviation))
  const next = [...pkg.clubs]
  const seen = new Set<string>()
  const leaguesInFile = new Set<string>()
  let added = 0
  let updated = 0
  for (const { value } of parsed.rows) {
    leaguesInFile.add(value.league)
    const existing = value.id ? byId.get(value.id) : undefined
    if (existing !== undefined) {
      const old = next[existing] as PackageClub
      // A sigla só muda se continua única no pacote.
      const abbreviation = value.abbreviation && (value.abbreviation === old.abbreviation || !abbreviations.has(value.abbreviation)) ? value.abbreviation : old.abbreviation
      abbreviations.delete(old.abbreviation)
      abbreviations.add(abbreviation)
      next[existing] = { ...old, ...value, abbreviation, ...(value.state === undefined ? { state: old.state } : {}) }
      seen.add(old.id)
      updated++
    } else {
      const id = value.id && !taken.has(value.id) ? value.id : freeId('club-ed', taken)
      taken.add(id)
      seen.add(id)
      const abbreviation = value.abbreviation && !abbreviations.has(value.abbreviation) ? value.abbreviation : freeAbbreviation(value.name, abbreviations)
      abbreviations.add(abbreviation)
      next.push({ ...value, id, abbreviation })
      added++
    }
  }
  let players = pkg.players
  let academy = pkg.academy
  let clubs = next
  if (options.removeMissing) {
    const gone = new Set(next.filter((c) => leaguesInFile.has(c.league) && !seen.has(c.id)).map((c) => c.id))
    clubs = next.filter((c) => !gone.has(c.id))
    players = pkg.players.map((p) => (p.club && gone.has(p.club) ? { ...p, club: null } : p))
    academy = pkg.academy?.filter((p) => !(p.club && gone.has(p.club)))
  }
  const result = syncTeamCounts({ ...pkg, clubs, players, ...(academy ? { academy } : {}) })
  return { pkg: result, added, updated, removed: next.length - clubs.length }
}
