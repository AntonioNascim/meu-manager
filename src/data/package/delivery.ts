/**
 * Entrega do pacote de dados (Fase 6, B3; proposta, seção 5). Parte pura: o formato do índice que o servidor publica, a comparação de
 * versões e a conferência do arquivo baixado. Quem baixa, guarda e escolhe está em `src/store/packageSource.ts`.
 *
 * O servidor guarda cada versão num arquivo `pacote.json.gz` que nunca muda (versão nova = arquivo novo) e um `index.json` que diz qual é a
 * mais recente. O arquivo só vale depois que o hash confere com o do índice.
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export const INDEX_FORMAT = 'meu-manager-package-index'

/** Uma versão publicada de um pacote. */
export interface PackageListing {
  /** Qual pacote ("mundo-real"). */
  id: string
  /** Versão no formato `AAAA.MM` (ou `AAAA.MM.N` para correções no mesmo mês). */
  version: string
  /** Nome para mostrar ("Mundo real 2026"). */
  name: string
  /** Quando foi publicada (`AAAA-MM-DD`). */
  publishedAt: string
  /** Caminho do arquivo `.json.gz` a partir da base dos pacotes (`mundo-real/2026.11/pacote.json.gz`). */
  path: string
  /** Tamanho do arquivo comprimido, em bytes. */
  gzipBytes: number
  /** Tamanho do JSON já aberto, em bytes (para avisar quanto vai usar de memória). */
  jsonBytes: number
  /** SHA-256 do arquivo **comprimido**, em hexadecimal (64 letras). */
  sha256: string
  /** Notas da versão, em texto curto (opcional). */
  notes?: string
}

export interface PackageIndex {
  format: typeof INDEX_FORMAT
  version: 1
  packages: PackageListing[]
}

export type IndexIssue =
  | { code: 'not-object' }
  | { code: 'wrong-format' }
  | { code: 'wrong-version' }
  | { code: 'no-packages' }
  | { code: 'bad-listing'; index: number; field: string }
  | { code: 'duplicate'; id: string; version: string }

const VERSION = /^\d{4}\.(0[1-9]|1[0-2])(\.\d{1,3})?$/
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const HASH = /^[0-9a-f]{64}$/

/** Caminho que o arquivo de uma versão tem de ter: sem barras soltas nem `..`, sempre dentro da pasta do próprio pacote. */
export const pathOf = (id: string, version: string): string => `${id}/${version}/pacote.json.gz`

export const isVersion = (text: unknown): text is string => typeof text === 'string' && VERSION.test(text)

/** Lê e confere o índice. Devolve os problemas em vez de estourar: um índice ruim nunca atrapalha o jogo, só não é usado. */
export function parseIndex(raw: unknown): { ok: true; index: PackageIndex } | { ok: false; issues: IndexIssue[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, issues: [{ code: 'not-object' }] }
  const o = raw as Record<string, unknown>
  if (o.format !== INDEX_FORMAT) return { ok: false, issues: [{ code: 'wrong-format' }] }
  if (o.version !== 1) return { ok: false, issues: [{ code: 'wrong-version' }] }
  if (!Array.isArray(o.packages) || o.packages.length === 0) return { ok: false, issues: [{ code: 'no-packages' }] }
  const issues: IndexIssue[] = []
  const seen = new Set<string>()
  const packages: PackageListing[] = []
  o.packages.forEach((item, index) => {
    const bad = (field: string) => issues.push({ code: 'bad-listing', index, field })
    if (typeof item !== 'object' || item === null) return bad('item')
    const p = item as Record<string, unknown>
    if (typeof p.id !== 'string' || !ID.test(p.id)) return bad('id')
    if (!isVersion(p.version)) return bad('version')
    if (typeof p.name !== 'string' || p.name.length === 0 || p.name.length > 80) return bad('name')
    if (typeof p.publishedAt !== 'string' || !DATE.test(p.publishedAt)) return bad('publishedAt')
    if (p.path !== pathOf(p.id, p.version)) return bad('path')
    if (!Number.isSafeInteger(p.gzipBytes) || (p.gzipBytes as number) <= 0 || (p.gzipBytes as number) > MAX_GZIP_BYTES) return bad('gzipBytes')
    if (!Number.isSafeInteger(p.jsonBytes) || (p.jsonBytes as number) <= 0 || (p.jsonBytes as number) > MAX_JSON_BYTES) return bad('jsonBytes')
    if (typeof p.sha256 !== 'string' || !HASH.test(p.sha256)) return bad('sha256')
    if (p.notes !== undefined && (typeof p.notes !== 'string' || p.notes.length > 400)) return bad('notes')
    const key = `${p.id}@${p.version}`
    if (seen.has(key)) {
      issues.push({ code: 'duplicate', id: p.id, version: p.version })
      return
    }
    seen.add(key)
    packages.push({ id: p.id, version: p.version, name: p.name, publishedAt: p.publishedAt, path: p.path, gzipBytes: p.gzipBytes as number, jsonBytes: p.jsonBytes as number, sha256: p.sha256, ...(p.notes !== undefined ? { notes: p.notes } : {}) })
  })
  return issues.length > 0 ? { ok: false, issues } : { ok: true, index: { format: INDEX_FORMAT, version: 1, packages } }
}

/** Tetos para não aceitar um índice que mande baixar um arquivo absurdo. */
export const MAX_GZIP_BYTES = 30 * 1024 * 1024
export const MAX_JSON_BYTES = 150 * 1024 * 1024

/** Compara versões `AAAA.MM[.N]` (negativo se `a` é mais antiga). Sem o terceiro número vale 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** A versão mais recente de um pacote no índice. */
export function latestOf(index: PackageIndex, id: string): PackageListing | undefined {
  return index.packages.filter((p) => p.id === id).sort((x, y) => compareVersions(y.version, x.version))[0]
}

export type DownloadError = 'size' | 'hash'

/** Confere o arquivo comprimido baixado contra o índice (tamanho e SHA-256). Só depois disso ele pode ser aberto ou guardado. */
export function verifyDownload(bytes: Uint8Array, listing: Pick<PackageListing, 'gzipBytes' | 'sha256'>): { ok: true } | { ok: false; error: DownloadError } {
  if (bytes.byteLength !== listing.gzipBytes) return { ok: false, error: 'size' }
  return bytesToHex(sha256(bytes)) === listing.sha256 ? { ok: true } : { ok: false, error: 'hash' }
}

export const hashOf = (bytes: Uint8Array): string => bytesToHex(sha256(bytes))

/** Qual versão um jogo novo usa: a mais nova entre as que o aparelho já tem (a embutida e as baixadas). */
export function newestAvailable<T extends { version: string }>(available: readonly T[]): T | undefined {
  return [...available].sort((x, y) => compareVersions(y.version, x.version))[0]
}

/**
 * Há versão mais nova no índice do que a que o aparelho já tem? Devolve a listagem para avisar; `undefined` se não há nada novo.
 * `dismissed` é a versão que a pessoa já dispensou (o aviso não volta até sair outra).
 */
export function updateAvailable(index: PackageIndex, id: string, have: readonly string[], dismissed?: string): PackageListing | undefined {
  const latest = latestOf(index, id)
  if (!latest) return undefined
  if (have.some((v) => compareVersions(v, latest.version) >= 0)) return undefined
  if (dismissed !== undefined && compareVersions(dismissed, latest.version) >= 0) return undefined
  return latest
}
