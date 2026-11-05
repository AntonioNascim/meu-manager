/**
 * A conta online deste aparelho e a nuvem dos saves (Fase 6, B8.1 e B8.2): junta a identidade guardada (`identityStore`), o cliente do servidor
 * (`identityClient`, `cloudClient`) e a sincronização (`cloudSync`) em um lugar só, com um estado que a interface escuta (`useAccount`).
 * Nada aqui toca no save local, a não ser pelas escolhas explícitas de `CloudSync` (usar a nuvem, guardar as duas).
 */
import { useSyncExternalStore } from 'react'
import { ONLINE_CONFIG } from '../online/config'
import { CloudClient } from '../online/cloudClient'
import { identityFromRecoveryCode, type Identity } from '../online/identity'
import { changeNickname as changeNicknameOnServer, registerIdentity, type IdentityClientDeps, type NicknameResult, type RegisterResult } from '../online/identityClient'
import { checkName } from '../online/nameFilter'
import { parseRecoveryCode, type RecoveryError } from '../online/recoveryCode'
import { createIdentity } from '../online/identity'
import { CloudScheduler, CloudSync } from './cloudSync'
import { CloudStateStore } from './cloudState'
import { mainIdentityStore, type StoredIdentity } from './identityStore'
import { mainSaveStore } from './saves'

const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n))
const randomText = (): string => Array.from(randomBytes(8), (b) => b.toString(16).padStart(2, '0')).join('')

export interface AccountState {
  loaded: boolean
  account?: StoredIdentity
}

let state: AccountState = { loaded: false }
const listeners = new Set<() => void>()
const set = (next: AccountState) => {
  state = next
  listeners.forEach((l) => l())
}

export const cloudState = new CloudStateStore()

const clientDeps = (): IdentityClientDeps => ({ base: ONLINE_CONFIG.apiBase, fetchFn: (...args) => fetch(...args), now: Date.now, randomBytes })

/** Lê a conta guardada no aparelho (chame uma vez ao abrir o jogo). */
export async function loadAccount(): Promise<AccountState> {
  let account: StoredIdentity | undefined
  try {
    account = await mainIdentityStore.load()
  } catch {
    account = undefined
  }
  set({ loaded: true, account })
  return state
}

export const useAccount = (): AccountState =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  )

export const getAccount = (): AccountState => state

// ------------------------------------------------------------------ conta

export type CreateResult = { ok: true; code: string } | Exclude<RegisterResult, { ok: true }>

/**
 * Cria a conta: confere o apelido aqui (o servidor confere de novo), sorteia o código no aparelho e registra no servidor. O código só é gravado
 * no aparelho depois de o servidor aceitar. Não mostra o código: a pessoa já sai jogando e o menu avisa para guardá-lo.
 */
export async function createAccount(nickname: string, turnstileToken: string): Promise<CreateResult> {
  const checked = checkName(nickname)
  if (!checked.ok) return { ok: false, reason: 'bad-nickname', issue: checked.issue }
  const made = createIdentity(randomBytes)
  const result = await registerIdentity(clientDeps(), made.identity, turnstileToken, checked.name)
  if (!result.ok) return result
  await mainIdentityStore.adopt(made, Date.now(), result.nickname ?? checked.name)
  await loadAccount()
  return { ok: true, code: made.recoveryCode }
}

export type RecoverResult = { ok: true; nickname?: string } | { ok: false; reason: 'format'; error: RecoveryError; index?: number } | { ok: false; reason: 'not-found' | 'offline' | 'rate-limited' | 'server' }

/** Entra com o código em outro aparelho. Conta que não existe no servidor (código errado) volta como `not-found`. */
export async function recoverAccount(text: string): Promise<RecoverResult> {
  const parsed = parseRecoveryCode(text)
  if (!parsed.ok) return { ok: false, reason: 'format', error: parsed.error, index: parsed.index }
  let identity: Identity
  try {
    identity = identityFromRecoveryCode(parsed.code)
  } catch {
    return { ok: false, reason: 'format', error: 'wrong-length' }
  }
  // O servidor só pede o desafio para contas novas: com um código que não existe, ele recusa, e isso aqui quer dizer "não encontrei".
  const result = await registerIdentity(clientDeps(), identity, 'recuperar')
  if (!result.ok) return { ok: false, reason: result.reason === 'turnstile-failed' || result.reason === 'bad-nickname' || result.reason === 'unauthorized' ? 'not-found' : result.reason }
  await mainIdentityStore.recover(parsed.code, Date.now())
  await mainIdentityStore.markRegistered(result.nickname)
  await loadAccount()
  return { ok: true, nickname: result.nickname }
}

export async function confirmRecoveryCode(): Promise<void> {
  await mainIdentityStore.confirmCode()
  await loadAccount()
}

export async function changeNickname(nickname: string): Promise<NicknameResult> {
  const account = state.account
  if (!account) return { ok: false, reason: 'unknown-identity' }
  const checked = checkName(nickname)
  if (!checked.ok) return { ok: false, reason: 'bad-nickname', issue: checked.issue }
  const result = await changeNicknameOnServer(clientDeps(), account.identity, checked.name)
  if (result.ok) {
    await mainIdentityStore.setNickname(result.nickname)
    await loadAccount()
  }
  return result
}

// ------------------------------------------------------------------ nuvem

export interface Cloud {
  sync: CloudSync
  scheduler: CloudScheduler
  client: CloudClient
}

let cloud: { playerId: string; value: Cloud } | undefined

/** A nuvem do aparelho (só existe com conta). Muda de instância se a conta mudar. */
export function getCloud(): Cloud | undefined {
  const account = state.account
  if (!account) return undefined
  if (cloud?.playerId === account.identity.playerId) return cloud.value
  const client = new CloudClient({ base: ONLINE_CONFIG.apiBase, identity: account.identity, fetchFn: (...args) => fetch(...args), now: Date.now, randomBytes })
  const sync = new CloudSync({ local: mainSaveStore, state: cloudState, client, now: Date.now, randomText })
  const scheduler = new CloudScheduler(sync, cloudState, Date.now)
  cloud = { playerId: account.identity.playerId, value: { sync, scheduler, client } }
  return cloud.value
}

/** Chamado a cada gravação local de um espaço (o salvamento automático): agenda o envio se o espaço está ligado à nuvem. */
export function onSlotSaved(slot: number): void {
  const c = getCloud()
  if (c) void c.scheduler.onSaved(slot)
}

/** Envia o que está pendente já (aba indo para segundo plano, internet voltando). */
export function flushCloud(): void {
  const c = getCloud()
  if (c) void c.scheduler.flush()
}

/** "Apagar minha conta": apaga no servidor, depois esquece a chave e o estado da nuvem neste aparelho. Os saves locais não são tocados. */
export async function deleteAccount(): Promise<void> {
  const c = getCloud()
  if (!c) return
  await c.sync.deleteAccount()
  c.scheduler.stop()
  await mainIdentityStore.clear()
  cloud = undefined
  await loadAccount()
}
