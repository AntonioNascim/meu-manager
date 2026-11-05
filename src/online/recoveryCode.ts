/**
 * Código de recuperação (Fase 6, B2; trocado na B8.1 a pedido dos sócios): um código só, como `K7QP-9X2M-HT4R-8WZC`, que **deriva** a chave da identidade.
 * O servidor nunca vê o código nem guarda segredo.
 *
 * Tamanho: 20 símbolos de um alfabeto de 31 (log2 31 ≈ 4,95 bits cada) = ~99 bits. Como o `playerId` (chave pública) aparece para os outros
 * técnicos, quem quiser descobrir o código pode testar palpites sem falar com o servidor; 2^99 palpites é inviável mesmo com milhões de placas de
 * vídeo, então 20 basta (o código antigo, de 12 palavras, tinha 128 bits, mais do que se precisa). Sem letras que se confundem: não há O, I, L, 0 nem 1.
 */
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

export const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const RECOVERY_LENGTH = 20
const GROUP = 4

export type RecoveryError = 'wrong-length' | 'bad-char'

export type RecoveryParse = { ok: true; code: string } | { ok: false; error: RecoveryError; index?: number }

/** Código novo a partir de bytes aleatórios (o chamador passa `crypto.getRandomValues`; aqui não há sorteio escondido). Devolve os 20 símbolos, sem hífens. */
export function newRecoveryCode(randomBytes: (n: number) => Uint8Array): string {
  const n = RECOVERY_ALPHABET.length
  const limit = 256 - (256 % n) // evita viés: descarta bytes acima do maior múltiplo de 31
  let out = ''
  while (out.length < RECOVERY_LENGTH) {
    for (const b of randomBytes(RECOVERY_LENGTH)) {
      if (b < limit && out.length < RECOVERY_LENGTH) out += RECOVERY_ALPHABET[b % n]
    }
  }
  return out
}

/** `K7QP9X2MHT4R8WZC3NFB` → `K7QP-9X2M-HT4R-8WZC-3NFB`. */
export function formatRecoveryCode(code: string): string {
  return (code.match(new RegExp(`.{1,${GROUP}}`, 'g')) ?? []).join('-')
}

/** Lê o que a pessoa digitou: ignora espaço, hífen, ponto e maiúsculas. Devolve o código limpo (20 símbolos) ou o erro, com a posição do símbolo que não existe. */
export function parseRecoveryCode(text: string): RecoveryParse {
  const clean = text.replace(/[\s\-–—._,;]+/g, '').toUpperCase()
  for (let i = 0; i < clean.length; i++) {
    if (!RECOVERY_ALPHABET.includes(clean[i]!)) return { ok: false, error: 'bad-char', index: i }
  }
  if (clean.length !== RECOVERY_LENGTH) return { ok: false, error: 'wrong-length' }
  return { ok: true, code: clean }
}

/** Quantos símbolos válidos a pessoa já digitou (para o contador da tela). */
export const typedSymbols = (text: string): number => text.replace(/[\s\-–—._,;]+/g, '').length

/** A semente de 32 bytes da chave Ed25519, derivada do código (HKDF-SHA256 com contexto próprio: o mesmo código nunca vira outra coisa por engano). */
export function seedFromRecoveryCode(code: string): Uint8Array {
  return hkdf(sha256, new TextEncoder().encode(code), new TextEncoder().encode('meu-manager'), new TextEncoder().encode('ed25519-identity-v2'), 32)
}
