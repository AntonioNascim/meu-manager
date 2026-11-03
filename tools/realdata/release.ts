/**
 * Monta uma versão do pacote para publicar (Fase 6, B3): o arquivo `.json.gz`, o hash e o índice. Sem rede e sem nuvem; o envio ao R2 é um passo à parte
 * (`tools/publishPackage.ts` mostra os comandos). Uma versão publicada nunca muda: o mesmo `id@versão` com conteúdo diferente é recusado.
 */
import { gzipSync } from 'node:zlib'
import { hashOf, INDEX_FORMAT, isVersion, parseIndex, pathOf, type PackageIndex, type PackageListing } from '../../src/data/package/delivery'

export interface ReleaseInput {
  /** Texto do `pacote-real.json`. */
  jsonText: string
  id: string
  version: string
  /** `AAAA-MM-DD`. */
  publishedAt: string
  notes?: string
  /** O índice que já está publicado, se houver (as versões antigas continuam nele). */
  existing?: unknown
}

export interface Release {
  /** O arquivo comprimido, pronto para enviar em `path`. */
  gz: Uint8Array
  listing: PackageListing
  /** O índice novo, com as versões antigas mais esta. */
  index: PackageIndex
  /** Já estava publicado com o mesmo conteúdo (nada a enviar de novo). */
  alreadyPublished: boolean
}

export function buildRelease(input: ReleaseInput): Release {
  if (!isVersion(input.version)) throw new Error(`Versão inválida "${input.version}": use AAAA.MM (ou AAAA.MM.N).`)
  let pkg: { format?: string; name?: string }
  try {
    pkg = JSON.parse(input.jsonText)
  } catch {
    throw new Error('O arquivo do pacote não é um JSON válido.')
  }
  if (pkg.format !== 'meu-manager-package') throw new Error('O arquivo não é um pacote do Meu Manager.')
  // Nível 9 e sem carimbo de data no cabeçalho do gzip: o mesmo conteúdo gera sempre os mesmos bytes (e o mesmo hash).
  const gz = new Uint8Array(gzipSync(Buffer.from(input.jsonText, 'utf8'), { level: 9 }))
  gz.fill(0, 4, 8)
  const listing: PackageListing = {
    id: input.id,
    version: input.version,
    name: pkg.name ?? input.id,
    publishedAt: input.publishedAt,
    path: pathOf(input.id, input.version),
    gzipBytes: gz.byteLength,
    jsonBytes: Buffer.byteLength(input.jsonText, 'utf8'),
    sha256: hashOf(gz),
    ...(input.notes ? { notes: input.notes } : {}),
  }
  let packages: PackageListing[] = []
  if (input.existing !== undefined) {
    const parsed = parseIndex(input.existing)
    if (!parsed.ok) throw new Error(`O índice publicado não é válido: ${parsed.issues.map((i) => i.code).join(', ')}.`)
    packages = parsed.index.packages
  }
  const same = packages.find((p) => p.id === listing.id && p.version === listing.version)
  if (same && same.sha256 !== listing.sha256) throw new Error(`${listing.id}@${listing.version} já foi publicada com outro conteúdo. Uma versão publicada nunca muda: use um número de versão novo.`)
  const merged = same ? packages : [...packages, listing]
  return { gz, listing, index: { format: INDEX_FORMAT, version: 1, packages: merged }, alreadyPublished: !!same }
}
