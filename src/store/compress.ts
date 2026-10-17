/**
 * Compressão gzip dos pedaços do save (`CompressionStream`, que roda fora da thread da tela). Navegador sem a API
 * grava o texto puro: o formato diz como cada pedaço foi gravado, então os dois jeitos abrem em qualquer aparelho.
 */

export type Encoding = 'gzip' | 'json'

export interface Packed {
  enc: Encoding
  data: Uint8Array | string
  /** Bytes gravados (comprimidos, se for o caso). */
  size: number
}

export const canCompress = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && typeof Blob !== 'undefined' && typeof Response !== 'undefined'

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
  return new Uint8Array(await new Response(source).arrayBuffer())
}

/** Comprime o texto (ou o devolve puro, se o navegador não sabe comprimir). */
export async function pack(text: string, compress: boolean = canCompress()): Promise<Packed> {
  if (!compress) return { enc: 'json', data: text, size: text.length }
  const data = await pipe(new TextEncoder().encode(text), new CompressionStream('gzip'))
  return { enc: 'gzip', data, size: data.byteLength }
}

/** Devolve o texto de um pedaço gravado por `pack`. */
export async function unpack(enc: Encoding, data: Uint8Array | string): Promise<string> {
  if (enc === 'json') return String(data)
  if (!canCompress()) throw new Error('Este navegador não consegue abrir o save comprimido.')
  return new TextDecoder().decode(await pipe(data as Uint8Array, new DecompressionStream('gzip')))
}
