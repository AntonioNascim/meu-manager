/**
 * Identidade anônima (Fase 6, B2; proposta 4.1): par de chaves Ed25519 derivado do código de recuperação. A chave pública vira o `playerId`.
 * Sem senha, sem e-mail. Tudo puro: o sorteio vem de `randomBytes` passado pelo chamador.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { newRecoveryCode, seedFromRecoveryCode } from './recoveryCode'

export interface Identity {
  /** Chave pública em base64url (43 letras): é o identificador da pessoa no servidor. */
  playerId: string
  publicKey: Uint8Array
  /** Semente secreta de 32 bytes. Fica só no aparelho (IndexedDB); nunca sobe. */
  secretKey: Uint8Array
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!
    if (i + 2 < bytes.length) out += B64[n & 63]!
  }
  return out
}

export function fromBase64Url(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return undefined
  const out: number[] = []
  let acc = 0
  let bits = 0
  for (const c of text) {
    acc = ((acc << 6) | B64.indexOf(c)) & 0xffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 255)
    }
  }
  return Uint8Array.from(out)
}

export function identityFromSeed(seed: Uint8Array): Identity {
  const publicKey = ed25519.getPublicKey(seed)
  return { playerId: toBase64Url(publicKey), publicKey, secretKey: seed }
}

/** Identidade e código novos: o código é mostrado uma vez e a chave deriva dele. */
export function createIdentity(randomBytes: (n: number) => Uint8Array): { identity: Identity; recoveryCode: string[] } {
  const recoveryCode = newRecoveryCode(randomBytes)
  return { identity: identityFromSeed(seedFromRecoveryCode(recoveryCode)), recoveryCode }
}

/** Trocar de aparelho: o mesmo código dá a mesma identidade. */
export function identityFromRecoveryCode(words: readonly string[]): Identity {
  return identityFromSeed(seedFromRecoveryCode(words))
}

export const signBytes = (secretKey: Uint8Array, message: Uint8Array): Uint8Array => ed25519.sign(message, secretKey)

export function verifyBytes(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey)
  } catch {
    return false
  }
}

/** Chave pública de um `playerId` válido (43 letras base64url de 32 bytes); `undefined` se o texto não for isso. */
export function publicKeyOf(playerId: string): Uint8Array | undefined {
  if (playerId.length !== 43) return undefined
  const bytes = fromBase64Url(playerId)
  return bytes && bytes.length === 32 ? bytes : undefined
}
