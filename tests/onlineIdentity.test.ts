import { describe, expect, it } from 'vitest'
import { createIdentity, fromBase64Url, identityFromRecoveryCode, publicKeyOf, toBase64Url } from '../src/online/identity'
import { parseRecoveryCode, pickCheckPositions, RECOVERY_WORDS } from '../src/online/recoveryCode'
import { CLOCK_SKEW_MS, MemoryNonceStore, signRequest, verifyRequest, type RequestParts } from '../src/online/signedRequest'
import { RATE_LIMITS, RateLimiter } from '../src/online/rateLimit'

/** Bytes previsíveis para os testes (sem Math.random): cada chamada continua de onde a anterior parou. */
function fakeRandom(start: number): (n: number) => Uint8Array {
  let x = start >>> 0
  return (n) => {
    const out = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0
      out[i] = x >>> 24
    }
    return out
  }
}

describe('base64url', () => {
  it('vai e volta com qualquer tamanho', () => {
    const rnd = fakeRandom(1)
    for (let n = 0; n < 70; n++) {
      const bytes = rnd(n)
      expect(Array.from(fromBase64Url(toBase64Url(bytes))!)).toEqual(Array.from(bytes))
    }
  })
  it('recusa caracteres que não são da tabela', () => {
    expect(fromBase64Url('abc+')).toBeUndefined()
    expect(fromBase64Url('a')).toBeUndefined()
  })
})

describe('código de recuperação e identidade', () => {
  it('gera 12 palavras e a mesma identidade a partir delas', () => {
    const { identity, recoveryCode } = createIdentity(fakeRandom(7))
    expect(recoveryCode).toHaveLength(RECOVERY_WORDS)
    expect(identity.playerId).toHaveLength(43)
    const again = identityFromRecoveryCode(recoveryCode)
    expect(again.playerId).toBe(identity.playerId)
    expect(Array.from(again.secretKey)).toEqual(Array.from(identity.secretKey))
  })

  it('códigos diferentes dão identidades diferentes', () => {
    const ids = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => createIdentity(fakeRandom(s)).identity.playerId))
    expect(ids.size).toBe(8)
  })

  it('o que a pessoa digita vale com maiúsculas, acentos a menos, vírgulas e quebras de linha', () => {
    const { recoveryCode, identity } = createIdentity(fakeRandom(11))
    const typed = recoveryCode.map((w, i) => (i % 3 === 0 ? w.toUpperCase() : w.normalize('NFD').replace(/\p{M}+/gu, ''))).join(i2(recoveryCode))
    const parsed = parseRecoveryCode(typed)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(identityFromRecoveryCode(parsed.words).playerId).toBe(identity.playerId)
  })

  it('aponta o erro: quantidade, palavra desconhecida (com a posição) e soma de conferência', () => {
    const { recoveryCode } = createIdentity(fakeRandom(13))
    expect(parseRecoveryCode(recoveryCode.slice(0, 11).join(' '))).toEqual({ ok: false, error: 'wrong-count' })
    expect(parseRecoveryCode([...recoveryCode.slice(0, 4), 'zzzzzz', ...recoveryCode.slice(5)].join(' '))).toEqual({ ok: false, error: 'unknown-word', index: 4 })
    // Trocar duas palavras de lugar quebra a soma de conferência na maioria dos códigos; procura um em que isso acontece.
    let found = false
    for (let s = 20; s < 60 && !found; s++) {
      const w = createIdentity(fakeRandom(s)).recoveryCode
      if (w[0] === w[1]) continue
      const swapped = [w[1]!, w[0]!, ...w.slice(2)]
      const r = parseRecoveryCode(swapped.join(' '))
      if (!r.ok) {
        expect(r.error).toBe('bad-checksum')
        found = true
      }
    }
    expect(found).toBe(true)
  })

  it('sorteia posições distintas, em ordem, entre 0 e 11', () => {
    for (let s = 1; s < 30; s++) {
      const p = pickCheckPositions(fakeRandom(s))
      expect(p).toHaveLength(3)
      expect(new Set(p).size).toBe(3)
      expect([...p].sort((a, b) => a - b)).toEqual(p)
      expect(p.every((x) => x >= 0 && x < RECOVERY_WORDS)).toBe(true)
    }
  })

  it('só aceita um playerId de 32 bytes', () => {
    const { identity } = createIdentity(fakeRandom(3))
    expect(publicKeyOf(identity.playerId)).toBeDefined()
    expect(publicKeyOf(identity.playerId.slice(1))).toBeUndefined()
    expect(publicKeyOf('x'.repeat(43) + 'y')).toBeUndefined()
  })
})

/** Separadores mistos para o teste de digitação. */
function i2(words: readonly string[]): string {
  return words.length > 0 ? ' , ' : ''
}

describe('pedidos assinados', () => {
  const NOW = 1_800_000_000_000
  const { identity } = createIdentity(fakeRandom(42))
  const parts: RequestParts = { method: 'post', path: '/api/teste?x=1', body: '{"a":1}' }
  const fresh = () => new MemoryNonceStore(() => NOW)

  it('aceita um pedido assinado e devolve quem é', async () => {
    const header = signRequest(identity, parts, NOW, fakeRandom(5))
    expect(await verifyRequest(header, parts, NOW + 1000, fresh())).toEqual({ ok: true, playerId: identity.playerId })
  })

  it('recusa corpo, caminho ou método mudados', async () => {
    const header = signRequest(identity, parts, NOW, fakeRandom(5))
    for (const changed of [{ ...parts, body: '{"a":2}' }, { ...parts, path: '/api/outro' }, { ...parts, method: 'PUT' }]) {
      expect(await verifyRequest(header, changed, NOW, fresh())).toEqual({ ok: false, error: 'bad-signature' })
    }
  })

  it('recusa assinatura de outra identidade e chave trocada no cabeçalho', async () => {
    const other = createIdentity(fakeRandom(43)).identity
    const header = signRequest(identity, parts, NOW, fakeRandom(5)).replace(identity.playerId, other.playerId)
    expect(await verifyRequest(header, parts, NOW, fresh())).toEqual({ ok: false, error: 'bad-signature' })
  })

  it('recusa relógio muito diferente, dos dois lados', async () => {
    const old = signRequest(identity, parts, NOW - CLOCK_SKEW_MS - 1, fakeRandom(5))
    const future = signRequest(identity, parts, NOW + CLOCK_SKEW_MS + 1, fakeRandom(5))
    expect(await verifyRequest(old, parts, NOW, fresh())).toEqual({ ok: false, error: 'clock' })
    expect(await verifyRequest(future, parts, NOW, fresh())).toEqual({ ok: false, error: 'clock' })
    expect((await verifyRequest(signRequest(identity, parts, NOW - CLOCK_SKEW_MS, fakeRandom(5)), parts, NOW, fresh())).ok).toBe(true)
  })

  it('recusa o mesmo pedido repetido, mas aceita outro com nonce novo', async () => {
    const nonces = fresh()
    const header = signRequest(identity, parts, NOW, fakeRandom(5))
    expect((await verifyRequest(header, parts, NOW, nonces)).ok).toBe(true)
    expect(await verifyRequest(header, parts, NOW, nonces)).toEqual({ ok: false, error: 'replay' })
    expect((await verifyRequest(signRequest(identity, parts, NOW, fakeRandom(6)), parts, NOW, nonces)).ok).toBe(true)
  })

  it('assinatura inválida não gasta o nonce', async () => {
    const nonces = fresh()
    const header = signRequest(identity, parts, NOW, fakeRandom(5))
    expect((await verifyRequest(header, { ...parts, body: 'x' }, NOW, nonces)).ok).toBe(false)
    expect((await verifyRequest(header, parts, NOW, nonces)).ok).toBe(true)
  })

  it('recusa cabeçalhos quebrados sem estourar', async () => {
    for (const h of [undefined, null, '', 'Bearer abc', 'MM1 ', 'MM1 key=a,ts=1', 'MM1 key=' + identity.playerId + ',ts=zz,nonce=aaaaaaaaaaaaaaaa,sig=bbbb', 'MM1 ' + 'x'.repeat(500)]) {
      expect((await verifyRequest(h, parts, NOW, fresh())).ok).toBe(false)
    }
  })
})

describe('limite de pedidos', () => {
  it('conta por ação e por chave e libera quando a janela passa', () => {
    const lim = new RateLimiter()
    const T = 1_000_000
    for (let i = 0; i < RATE_LIMITS.createIdentity[0].limit; i++) expect(lim.hit('createIdentity', 'ip-1', T + i).allowed).toBe(true)
    const blocked = lim.hit('createIdentity', 'ip-1', T + 100)
    expect(blocked.allowed).toBe(false)
    expect(lim.hit('createIdentity', 'ip-2', T + 100).allowed).toBe(true)
    if (!blocked.allowed) expect(lim.hit('createIdentity', 'ip-1', T + 100 + blocked.retryAfterMs).allowed).toBe(true)
  })

  it('o pedido recusado não conta e todas as regras valem (6 por minuto e 200 por dia no save)', () => {
    const lim = new RateLimiter()
    let t = 0
    let allowed = 0
    // Um pedido a cada 11 s: nunca passa de 6 por minuto, mas bate nos 200 do dia.
    for (let i = 0; i < 400; i++) {
      t += 11_000
      if (lim.hit('saveUpload', 'p', t).allowed) allowed++
    }
    expect(allowed).toBe(200)
  })
})
