/**
 * Pedidos assinados (Fase 6, B2; proposta 6.1): cada pedido leva o `playerId`, um carimbo de tempo, um `nonce` e a assinatura de
 * método + caminho + carimbo + nonce + hash do corpo. O servidor confere assinatura, relógio (±2 min) e se o nonce já foi usado (repetição).
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { fromBase64Url, publicKeyOf, signBytes, toBase64Url, verifyBytes, type Identity } from './identity'

export const SIGNATURE_SCHEME = 'MM1'
/** Quanto o relógio do aparelho pode diferir do servidor. */
export const CLOCK_SKEW_MS = 120_000

export interface RequestParts {
  method: string
  /** Caminho com a consulta, do jeito que o servidor vê (`/api/saves?slot=1`). */
  path: string
  /** Corpo exato enviado (vazio se não houver). */
  body: Uint8Array | string
}

const enc = new TextEncoder()
const bodyBytes = (b: Uint8Array | string): Uint8Array => (typeof b === 'string' ? enc.encode(b) : b)

export function canonicalString(parts: RequestParts, timestamp: number, nonce: string): string {
  return [SIGNATURE_SCHEME, parts.method.toUpperCase(), parts.path, String(timestamp), nonce, bytesToHex(sha256(bodyBytes(parts.body)))].join('\n')
}

/** Cabeçalho `Authorization` de um pedido. O nonce vem de `randomBytes` (16 bytes). */
export function signRequest(identity: Identity, parts: RequestParts, now: number, randomBytes: (n: number) => Uint8Array): string {
  const nonce = toBase64Url(randomBytes(16))
  const sig = signBytes(identity.secretKey, enc.encode(canonicalString(parts, now, nonce)))
  return `${SIGNATURE_SCHEME} key=${identity.playerId},ts=${now},nonce=${nonce},sig=${toBase64Url(sig)}`
}

export type VerifyError = 'malformed' | 'bad-key' | 'clock' | 'bad-signature' | 'replay'

export type VerifyResult = { ok: true; playerId: string } | { ok: false; error: VerifyError }

/** Onde o servidor lembra dos nonces já vistos (no Cloudflare: o Durable Object ou o D1; aqui só a interface). */
export interface NonceStore {
  /** `true` se é a primeira vez que este nonce aparece para esta identidade (e passa a lembrar dele por `ttlMs`). */
  claim(playerId: string, nonce: string, ttlMs: number): boolean | Promise<boolean>
}

export async function verifyRequest(header: string | null | undefined, parts: RequestParts, now: number, nonces: NonceStore): Promise<VerifyResult> {
  if (!header || !header.startsWith(`${SIGNATURE_SCHEME} `) || header.length > 400) return { ok: false, error: 'malformed' }
  const fields = new Map<string, string>()
  for (const piece of header.slice(SIGNATURE_SCHEME.length + 1).split(',')) {
    const i = piece.indexOf('=')
    if (i > 0) fields.set(piece.slice(0, i), piece.slice(i + 1))
  }
  const key = fields.get('key')
  const ts = Number(fields.get('ts'))
  const nonce = fields.get('nonce')
  const sig = fields.get('sig')
  if (!key || !nonce || !sig || !Number.isSafeInteger(ts) || !/^[A-Za-z0-9_-]{16,32}$/.test(nonce)) return { ok: false, error: 'malformed' }
  const publicKey = publicKeyOf(key)
  const signature = fromBase64Url(sig)
  if (!publicKey) return { ok: false, error: 'bad-key' }
  if (!signature || signature.length !== 64) return { ok: false, error: 'malformed' }
  if (Math.abs(now - ts) > CLOCK_SKEW_MS) return { ok: false, error: 'clock' }
  if (!verifyBytes(publicKey, enc.encode(canonicalString(parts, ts, nonce)), signature)) return { ok: false, error: 'bad-signature' }
  // O nonce só é gasto depois de a assinatura valer: quem não tem a chave não consegue encher a memória do servidor.
  if (!(await nonces.claim(key, nonce, CLOCK_SKEW_MS * 2))) return { ok: false, error: 'replay' }
  return { ok: true, playerId: key }
}

/** Memória simples, para testes e para um Durable Object. */
export class MemoryNonceStore implements NonceStore {
  private seen = new Map<string, number>()
  constructor(private now: () => number) {}
  claim(playerId: string, nonce: string, ttlMs: number): boolean {
    const t = this.now()
    for (const [k, until] of this.seen) if (until <= t) this.seen.delete(k)
    const k = `${playerId}:${nonce}`
    if (this.seen.has(k)) return false
    this.seen.set(k, t + ttlMs)
    return true
  }
}
