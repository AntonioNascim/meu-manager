/**
 * Correções feitas à mão nas planilhas de tarefas (`tarefas/`, preenchidas em `tarefas-feitas/`). Ficam guardadas em `correcoes.json`, por
 * (id do registro, campo), e são reaplicadas por cima de toda rodada nova do script dos elencos: assim, depois de uma janela de
 * transferências, o que a equipe já corrigiu não se perde. Funções puras, exceto a leitura e a gravação do arquivo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseCsv, toCsv } from '../../src/data/package/edit/csv'
import { POSITIONS } from '../../src/engine/types'
import type { Position } from '../../src/engine/types'

/** O que uma correção muda. Posição, cores, cidade, estádio e capacidade vão para as colunas da planilha; força e potencial, para a geração de atributos. */
export type CorrectionField = 'position' | 'secondaryPositions' | 'color1' | 'color2' | 'city' | 'stadiumName' | 'capacity' | 'overall' | 'potential'

export interface Correction {
  /** Id do registro (clube ou jogador) nas planilhas. */
  id: string
  field: CorrectionField
  /** Valor já normalizado (posição `ST`, cor `#aabbcc`, número como texto, posições secundárias separadas por `|`). */
  value: string
  /** Para conferir a olho no arquivo: clube e jogador. */
  club?: string
  player?: string
  /** Data da aplicação (AAAA-MM-DD). */
  at: string
}

export interface CorrectionsFile {
  version: 1
  items: Correction[]
}

export const CORRECTIONS_FILE = 'correcoes.json'
export const DONE_DIR = 'tarefas-feitas'

export function loadCorrections(dir: string): Correction[] {
  const file = join(dir, CORRECTIONS_FILE)
  if (!existsSync(file)) return []
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<CorrectionsFile>
  return Array.isArray(parsed.items) ? parsed.items : []
}

export function saveCorrections(dir: string, items: readonly Correction[]): void {
  mkdirSync(dirname(join(dir, CORRECTIONS_FILE)), { recursive: true })
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id) || a.field.localeCompare(b.field))
  writeFileSync(join(dir, CORRECTIONS_FILE), `${JSON.stringify({ version: 1, items: sorted } satisfies CorrectionsFile, null, 2)}\n`)
}

/** Junta uma correção à lista: a nova substitui a antiga do mesmo registro e campo. Devolve se substituiu uma diferente. */
export function mergeCorrection(items: Correction[], next: Correction): 'new' | 'same' | 'replaced' {
  const i = items.findIndex((c) => c.id === next.id && c.field === next.field)
  if (i < 0) return (items.push(next), 'new')
  const same = (items[i] as Correction).value === next.value
  items[i] = same ? { ...next, at: (items[i] as Correction).at } : next
  return same ? 'same' : 'replaced'
}

const strip = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (text: string): string => strip(text).trim().toLowerCase().replace(/\s+/g, ' ')

/** Rótulos em português usados na interface (`POSITION_LABELS`), para quem preencher a planilha com a sigla que vê no jogo. */
const POSITION_ALIASES: Record<string, Position> = { gol: 'GK', ld: 'RB', le: 'LB', zag: 'CB', vol: 'DM', mc: 'CM', mei: 'AM', pd: 'RW', pe: 'LW', ata: 'ST' }

export function parsePosition(token: string): Position | undefined {
  const t = norm(token)
  return POSITIONS.find((p) => p.toLowerCase() === t) ?? POSITION_ALIASES[t]
}

/** Campos (da planilha de tarefas) que a correção cobre. `undefined` = campo que não dá para aplicar por aqui. */
const CAMPOS: Record<string, CorrectionField[]> = {
  posicao: ['position', 'secondaryPositions'],
  forca: ['overall'],
  potencial: ['potential'],
  cores: ['color1', 'color2'],
  'cor 1': ['color1'],
  'cor 2': ['color2'],
  estadio: ['stadiumName'],
  cidade: ['city'],
  capacidade: ['capacity'],
}

export const fieldsOfCampo = (campo: string): CorrectionField[] | undefined => CAMPOS[norm(campo)]

/** A tarefa já foi resolvida por correções guardadas? (todos os campos dela têm correção) */
export function isTaskDone(items: readonly Correction[], id: string, campo: string): boolean {
  const fields = fieldsOfCampo(campo)
  if (!fields) return false
  // Posição secundária só vem junto quando a pessoa escreve mais de uma posição.
  return fields.filter((f) => f !== 'secondaryPositions').every((f) => items.some((c) => c.id === id && c.field === f))
}

export type Interpreted = { ok: true; entries: { field: CorrectionField; value: string }[] } | { ok: false; reason: string }

const fail = (reason: string): Interpreted => ({ ok: false, reason })

function parseColor(text: string): string | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())
  if (!m) return undefined
  const hex = (m[1] as string).toLowerCase()
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex}`
}

function parseInteger(text: string): number | undefined {
  const t = text.trim().toLowerCase().replace(/\s/g, '')
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''))
  if (/^\d+$/.test(t)) return Number(t)
  return undefined
}

/** Lê o `valor_correto` de uma tarefa conforme o `campo` e o transforma em correções (ou diz por que não dá). */
export function interpretTask(campo: string, rawValue: string): Interpreted {
  const key = norm(campo)
  const value = rawValue.trim()
  if (key === 'elenco') return fail('tarefa de elenco não se aplica por aqui: troque ou acrescente os jogadores no editor (aba Jogadores) ou em <liga>-jogadores.csv')
  if (!(key in CAMPOS)) return fail(`campo "${campo}" desconhecido (aceitos: posição, força, potencial, cores, cor 1, cor 2, estádio, cidade, capacidade)`)
  switch (key) {
    case 'posicao': {
      const tokens = value.split(/[|,/;+\s]+/).filter(Boolean)
      const positions: Position[] = []
      for (const token of tokens) {
        const p = parsePosition(token)
        if (!p) return fail(`"${token}" não é uma posição (use GOL, LD, LE, ZAG, VOL, MC, MEI, PD, PE, ATA ou GK, RB, LB, CB, DM, CM, AM, RW, LW, ST)`)
        if (!positions.includes(p)) positions.push(p)
      }
      const [primary, ...secondary] = positions
      if (!primary) return fail('posição vazia')
      if (secondary.length > 2) return fail('no máximo 2 posições secundárias (3 posições no total)')
      if (primary === 'GK' ? secondary.length > 0 : secondary.includes('GK')) return fail('goleiro não combina com posição de linha')
      return { ok: true, entries: [{ field: 'position', value: primary }, ...(secondary.length > 0 ? [{ field: 'secondaryPositions' as const, value: secondary.join('|') }] : [])] }
    }
    case 'forca':
    case 'potencial': {
      const n = Number(value.replace(',', '.'))
      if (value === '' || !Number.isFinite(n) || n < 1 || n > 100) return fail(`"${value}" não é um número de 1 a 100`)
      return { ok: true, entries: [{ field: key === 'forca' ? 'overall' : 'potential', value: String(Math.round(n)) }] }
    }
    case 'cores':
    case 'cor 1':
    case 'cor 2': {
      const tokens = value.split(/[|;\s]+/).filter(Boolean)
      const colors = tokens.map(parseColor)
      const bad = tokens.find((_, i) => !colors[i])
      if (bad !== undefined || colors.length === 0) return fail(`"${bad ?? value}" não é uma cor (use o código, como #1a2b3c)`)
      const [first, second] = colors as string[]
      if (key === 'cores') return second ? { ok: true, entries: [{ field: 'color1', value: first as string }, { field: 'color2', value: second }] } : fail('informe as duas cores, como "#cc0000 #ffffff"')
      if (colors.length > 1) return fail('informe uma cor só')
      return { ok: true, entries: [{ field: key === 'cor 1' ? 'color1' : 'color2', value: first as string }] }
    }
    case 'capacidade': {
      const n = parseInteger(value)
      if (n === undefined || n < 500 || n > 300_000) return fail(`"${value}" não é uma capacidade de 500 a 300.000`)
      return { ok: true, entries: [{ field: 'capacity', value: String(n) }] }
    }
    default: {
      if (value === '') return fail('valor vazio')
      return { ok: true, entries: [{ field: key === 'cidade' ? 'city' : 'stadiumName', value }] }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Planilha de tarefas

export interface TaskRow {
  /** Linha da planilha (o cabeçalho é a 1). */
  line: number
  tipo: string
  clube: string
  jogador: string
  id: string
  campo: string
  provisorio: string
  correto: string
  feito: boolean
}

const DONE_MARK = /^(sim|s|x|ok|feito|true|verdadeiro|1|v|yes|y|✓|✔|✅)$/i

export function readTaskSheet(text: string): { rows: TaskRow[]; problem?: string } {
  const { rows, lines } = parseCsv(text)
  const header = (rows[0] ?? []).map((h) => norm(h))
  const need = ['id', 'campo', 'valor_correto', 'feito']
  const missing = need.filter((c) => !header.includes(c))
  if (rows.length === 0) return { rows: [], problem: 'arquivo vazio' }
  if (missing.length > 0) return { rows: [], problem: `faltam as colunas ${missing.join(', ')} (cabeçalho: ${(rows[0] ?? []).join(' | ')})` }
  const col = (cells: readonly string[], name: string): string => (cells[header.indexOf(name)] ?? '').trim()
  return {
    rows: rows.slice(1).map((cells, i) => ({
      line: lines[i + 1] as number,
      tipo: col(cells, 'tipo'),
      clube: col(cells, 'clube'),
      jogador: col(cells, 'jogador'),
      id: col(cells, 'id'),
      campo: col(cells, 'campo'),
      provisorio: col(cells, 'valor_provisorio'),
      correto: col(cells, 'valor_correto'),
      feito: DONE_MARK.test(col(cells, 'feito')),
    })),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Planilhas de clubes e jogadores

export interface Sheet {
  header: string[]
  rows: Record<string, string>[]
}

export function readSheet(text: string): Sheet {
  const { rows } = parseCsv(text)
  const header = (rows[0] ?? []).map((h) => h.trim())
  return { header, rows: rows.slice(1).map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))) }
}

export const writeSheet = (sheet: Sheet): string => toCsv(sheet.header, sheet.rows.map((r) => sheet.header.map((h) => r[h] ?? '')))

/** Coluna da planilha de cada campo de correção (força e potencial não são colunas editadas à mão: viram atributos). */
const COLUMN_OF: Partial<Record<CorrectionField, string>> = { position: 'position', secondaryPositions: 'secondaryPositions', color1: 'color1', color2: 'color2', city: 'city', stadiumName: 'stadiumName', capacity: 'stadiumCapacity' }

/** Aplica as correções de posição, cores, cidade, estádio e capacidade às linhas (pelo id). Devolve quantas células mudaram. */
export function patchSheet(sheet: Sheet, items: readonly Correction[]): number {
  const byId = new Map<string, Correction[]>()
  for (const c of items) if (COLUMN_OF[c.field]) (byId.get(c.id) ?? byId.set(c.id, []).get(c.id) ?? []).push(c)
  let changed = 0
  for (const row of sheet.rows) {
    const list = byId.get(row.id ?? '')
    if (!list) continue
    const primary = list.find((c) => c.field === 'position')?.value ?? row.position
    for (const c of list) {
      const column = COLUMN_OF[c.field] as string
      if (!sheet.header.includes(column)) continue
      let value = c.value
      if (c.field === 'secondaryPositions') value = value.split('|').filter((p) => p !== primary && (p === 'GK') === (primary === 'GK')).join('|')
      if (row[column] !== value) (row[column] = value, changed++)
    }
    // Trocou a posição principal e não escolheu secundárias: as de antes que viraram a principal ou que não combinam saem.
    if (list.some((c) => c.field === 'position') && !list.some((c) => c.field === 'secondaryPositions') && 'secondaryPositions' in row) {
      const kept = (row.secondaryPositions ?? '').split('|').filter((p) => p !== '' && p !== primary && (p === 'GK') === (primary === 'GK')).join('|')
      if (kept !== row.secondaryPositions) (row.secondaryPositions = kept, changed++)
    }
  }
  return changed
}
