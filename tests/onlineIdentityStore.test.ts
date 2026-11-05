import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { IdentityStore } from '../src/store/identityStore'
import { parseRecoveryCode } from '../src/online/recoveryCode'
import { Dexie } from 'dexie'

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

const NAME = 'meu-manager-teste-identidade'
const store = new IdentityStore(NAME)

beforeEach(async () => {
  await store.clear()
})
afterAll(() => store.close())

describe('IdentityStore', () => {
  it('adota uma identidade que o servidor já aceitou (B8.1): registrada, com apelido e o código ainda por confirmar', async () => {
    const { createIdentity } = await import('../src/online/identity')
    const made = createIdentity(fakeRandom(9))
    await store.adopt(made, 2000, 'Craque Ana')
    const loaded = await store.load()
    expect(loaded).toMatchObject({ nickname: 'Craque Ana', registered: true, codeConfirmed: false, createdAt: 2000 })
    expect(loaded?.recoveryWords).toEqual(made.recoveryCode)
    await store.confirmCode()
    expect((await store.load())?.codeConfirmed).toBe(true)
  })

  it('começa vazio', async () => {
    expect(await store.load()).toBeUndefined()
  })

  it('cria, guarda e relê a mesma identidade, ainda não registrada', async () => {
    const made = await store.create(fakeRandom(1), 1000)
    expect(made?.recoveryCode).toHaveLength(12)
    const loaded = await store.load()
    expect(loaded?.identity.playerId).toBe(made?.identity.playerId)
    expect(loaded).toMatchObject({ createdAt: 1000, registered: false })
  })

  it('não troca a identidade que já existe', async () => {
    const first = await store.create(fakeRandom(2), 1)
    expect(await store.create(fakeRandom(3), 2)).toBeUndefined()
    expect((await store.load())?.identity.playerId).toBe(first?.identity.playerId)
  })

  it('guarda as 12 palavras para ver de novo, sem confirmação até a pessoa confirmar', async () => {
    const made = await store.create(fakeRandom(4), 1)
    const loaded = await store.load()
    expect(loaded?.recoveryWords).toEqual(made?.recoveryCode)
    expect(loaded?.codeConfirmed).toBe(false)
    await store.confirmCode()
    expect((await store.load())?.codeConfirmed).toBe(true)
  })

  it('ao apagar a identidade (apagar conta), as palavras vão junto', async () => {
    await store.create(fakeRandom(8), 1)
    await store.clear()
    const raw = new Dexie(NAME)
    await raw.open()
    expect(await raw.table('identity').count()).toBe(0)
    raw.close()
  })

  it('recuperar com o código dá a mesma identidade de antes, também após limpar o aparelho', async () => {
    const made = await store.create(fakeRandom(5), 1)
    await store.clear()
    expect(await store.load()).toBeUndefined()
    const parsed = parseRecoveryCode(made!.recoveryCode.join(' '))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const back = await store.recover(parsed.words, 2)
      expect(back.playerId).toBe(made!.identity.playerId)
      expect((await store.load())?.identity.playerId).toBe(made!.identity.playerId)
      expect(await store.load()).toMatchObject({ codeConfirmed: true, recoveryWords: made!.recoveryCode })
    }
  })

  it('registrar e mudar o apelido ficam gravados', async () => {
    await store.create(fakeRandom(6), 1)
    await store.markRegistered('Mister Pedro')
    expect(await store.load()).toMatchObject({ registered: true, nickname: 'Mister Pedro' })
    await store.setNickname(undefined)
    expect((await store.load())?.nickname).toBeUndefined()
  })

  it('um registro adulterado (playerId que não é o da chave) é ignorado', async () => {
    await store.create(fakeRandom(7), 1)
    const raw = new Dexie(NAME)
    await raw.open()
    await raw.table('identity').update('me', { playerId: 'x'.repeat(43) })
    raw.close()
    expect(await store.load()).toBeUndefined()
  })
})
