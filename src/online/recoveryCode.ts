/**
 * Código de recuperação (Fase 6, B2; proposta 4.1): 12 palavras (128 bits + 4 de conferência) que **derivam** a chave da identidade.
 * O servidor nunca vê o código nem guarda segredo. Lista de palavras: BIP39 em português (2048 palavras).
 */
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/portuguese.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

export const RECOVERY_WORDS = 12
const ENTROPY_BYTES = 16

/** Sem acento e em minúsculas: quem digita "coração" ou "CORACAO" chega à mesma palavra. */
const fold = (w: string): string => w.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

const byFolded: ReadonlyMap<string, string> = new Map(wordlist.map((w) => [fold(w), w]))

export type RecoveryError = 'wrong-count' | 'unknown-word' | 'bad-checksum'

export type RecoveryParse = { ok: true; words: string[] } | { ok: false; error: RecoveryError; index?: number }

/** Código novo a partir de bytes aleatórios (o chamador passa `crypto.getRandomValues`; aqui não há sorteio escondido). */
export function newRecoveryCode(randomBytes: (n: number) => Uint8Array): string[] {
  return entropyToMnemonic(randomBytes(ENTROPY_BYTES), wordlist).split(' ')
}

/** Lê o que a pessoa digitou: separa por espaço, vírgula ou quebra de linha, ignora acento e maiúsculas, confere palavras e soma de conferência. */
export function parseRecoveryCode(text: string): RecoveryParse {
  const typed = text.split(/[\s,;]+/).filter(Boolean)
  if (typed.length !== RECOVERY_WORDS) return { ok: false, error: 'wrong-count' }
  const words: string[] = []
  for (let i = 0; i < typed.length; i++) {
    const word = byFolded.get(fold(typed[i]!))
    if (!word) return { ok: false, error: 'unknown-word', index: i }
    words.push(word)
  }
  try {
    mnemonicToEntropy(words.join(' '), wordlist)
  } catch {
    return { ok: false, error: 'bad-checksum' }
  }
  return { ok: true, words }
}

/** A semente de 32 bytes da chave Ed25519, derivada do código (HKDF-SHA256 com contexto próprio: o mesmo código nunca vira outra coisa por engano). */
export function seedFromRecoveryCode(words: readonly string[]): Uint8Array {
  const entropy = mnemonicToEntropy(words.join(' '), wordlist)
  return hkdf(sha256, entropy, new TextEncoder().encode('meu-manager'), new TextEncoder().encode('ed25519-identity-v1'), 32)
}

/** Posições sorteadas (0 a 11, em ordem) para conferir que a pessoa anotou o código (proposta 4.5, passo 2: três palavras). */
export function pickCheckPositions(randomBytes: (n: number) => Uint8Array, count = 3): number[] {
  const out = new Set<number>()
  while (out.size < count) {
    const [b] = randomBytes(1)
    // 252 = maior múltiplo de 12 até 255: evita viés.
    if (b! < 252) out.add(b! % RECOVERY_WORDS)
  }
  return [...out].sort((a, b) => a - b)
}

/**
 * Confere as palavras que a pessoa digitou nas posições sorteadas (proposta 4.5, passo 2). Devolve uma resposta por posição,
 * na mesma ordem; ignora acento, maiúsculas e espaços nas pontas.
 */
export function checkConfirmation(words: readonly string[], positions: readonly number[], typed: readonly string[]): boolean[] {
  return positions.map((p, i) => {
    const expected = words[p]
    const given = typed[i]
    return expected !== undefined && given !== undefined && fold(given.trim()) === fold(expected)
  })
}
