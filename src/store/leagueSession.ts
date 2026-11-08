/**
 * A liga online aberta neste aparelho (Fase 6C): cria o espelho, sincroniza de tempos em tempos e entrega o `Game` às telas pelo mesmo `gameStore` do jogo
 * solo. Só uma liga fica aberta por vez. Sair fecha a sessão e limpa o jogo. C6: o espelho fica guardado no aparelho (abre sem baixar tudo e lê sem
 * internet), favoritos e escalações guardadas são da conta (vão ao servidor), o detalhe de clubes vem ao tocar e a demissão leva à escolha de outro clube.
 */
import { useSyncExternalStore } from 'react'
import type { FreeClubRow, Prefs } from '../engine/league/career'
import { EMPTY_PREFS } from '../engine/league/career'
import type { SavedLineup } from '../engine/types'
import { ONLINE_CONFIG } from '../online/config'
import type { Identity } from '../online/identity'
import type { IdentityClientDeps } from '../online/identityClient'
import { leagueDetail, leagueDismissal, leagueRechoose, leaguePrefsGet, leaguePrefsSet, mirrorFetch, sendCommand, type DismissalRow } from '../online/leagueClient'
import { LeagueMirror, type MirrorTransport } from './leagueMirror'
import { leagueGame } from './leagueGame'
import { getGame, setGame, subscribeGame } from './gameStore'
import { getAccount } from './onlineAccount'
import { closeOnlineMatch } from './onlineMatch'
import { mirrorCache, type MirrorCache } from './mirrorCache'

const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n))
const deps = (): IdentityClientDeps => ({ base: ONLINE_CONFIG.apiBase, fetchFn: (...args) => fetch(...args), now: Date.now, randomBytes })

/** Quanto espera entre uma consulta e a seguinte enquanto a tela está aberta (o aviso por WebSocket entra com a partida ao vivo). */
export const POLL_MS = 5_000

let mirror: LeagueMirror | undefined
let leagueId = ''
let timer: ReturnType<typeof setInterval> | undefined
let identityOf: Identity | undefined
let cache: MirrorCache = mirrorCache
let prefs: Prefs = EMPTY_PREFS
let prefsTimer: ReturnType<typeof setTimeout> | undefined
let offGame: (() => void) | undefined

export const activeMirror = (): LeagueMirror | undefined => mirror

export function transportFor(identity: Identity, id: string, d: IdentityClientDeps = deps()): MirrorTransport {
  return {
    async fetch(since, page) {
      const r = await mirrorFetch(d, identity, id, since, page)
      return r.ok ? { ok: true, payload: r.payload } : { ok: false, error: r.error }
    },
    async command(command, since) {
      const r = await sendCommand(d, identity, id, command, since)
      if (r.ok) return { ok: true, payload: r.payload, ...(r.info ? { info: r.info as Record<string, unknown> } : {}) }
      const detail = (r.detail ?? {}) as { reason?: unknown; minimumSalary?: unknown }
      return { ok: false, error: r.error, ...(typeof detail.reason === 'string' ? { reason: detail.reason } : {}), ...(typeof detail.minimumSalary === 'number' ? { minimumSalary: detail.minimumSalary } : {}) }
    },
    async detail(teamId) {
      const r = await leagueDetail(d, identity, id, teamId)
      if (!r.ok) return { ok: false, error: r.error }
      const { ok: _ok, ...detail } = r
      return { ok: true, detail }
    },
  }
}

// ---------------------------------------------------------------------------
// Demissão: o técnico perdeu o clube e escolhe outro livre da mesma liga
// ---------------------------------------------------------------------------

export interface DismissedState {
  leagueId: string
  dismissal: DismissalRow
  options: FreeClubRow[]
}

let dismissed: DismissedState | null = null
const dismissedListeners = new Set<() => void>()
const setDismissed = (d: DismissedState | null) => {
  dismissed = d
  dismissedListeners.forEach((l) => l())
}
export const clearDismissed = (): void => setDismissed(null)
export const useDismissed = (): DismissedState | null =>
  useSyncExternalStore(
    (l) => (dismissedListeners.add(l), () => dismissedListeners.delete(l)),
    () => dismissed,
    () => dismissed,
  )

/** O servidor diz que o técnico foi demitido? Então fecha o jogo e mostra a escolha de outro clube. Devolve `true` se for o caso. */
async function checkDismissed(id: string, identity: Identity): Promise<boolean> {
  const r = await leagueDismissal(deps(), identity, id)
  if (!r.ok || !r.dismissal) return false
  stopSession()
  setDismissed({ leagueId: id, dismissal: r.dismissal, options: r.options ?? [] })
  return true
}

/** O técnico escolheu outro clube: assume a vaga e abre o jogo. */
export async function chooseNewClub(teamId: string): Promise<'ok' | 'refused' | 'failed'> {
  const account = getAccount().account
  const state = dismissed
  if (!account || !state) return 'failed'
  const r = await leagueRechoose(deps(), account.identity, state.leagueId, teamId)
  if (!r.ok) return r.error === 'club-refused' ? 'refused' : 'failed'
  setDismissed(null)
  await cache.clear(state.leagueId)
  return (await openLeague(state.leagueId, account.identity)) === 'ok' ? 'ok' : 'failed'
}

// ---------------------------------------------------------------------------
// Preferências da conta (favoritos e escalações guardadas)
// ---------------------------------------------------------------------------

function sendPrefsSoon(): void {
  if (prefsTimer !== undefined) clearTimeout(prefsTimer)
  prefsTimer = setTimeout(() => {
    if (identityOf && leagueId) void leaguePrefsSet(deps(), identityOf, leagueId, prefs)
  }, 1500)
}

/** O jogo mudou: se foram os favoritos ou as escalações guardadas, guarda na conta (o resto do jogo é do servidor). */
function watchPrefs(): void {
  offGame?.()
  offGame = subscribeGame(() => {
    const g = getGame()
    if (!g?.online || g.online.leagueId !== leagueId) return
    const favorites = g.favorites ?? []
    const lineups = Array.from({ length: 3 }, (_, i) => g.savedLineups?.[i] ?? null) as (SavedLineup | null)[]
    if (JSON.stringify(favorites) === JSON.stringify(prefs.favorites) && JSON.stringify(lineups) === JSON.stringify(prefs.lineups)) return
    prefs = { favorites: [...favorites], lineups }
    sendPrefsSoon()
  })
}

function publish(): void {
  const season = mirror?.season()
  const teamId = mirror?.teamId
  if (!mirror || !season || !teamId) return
  const base = leagueGame(season, teamId, { leagueId, rev: mirror.rev, connection: mirror.connection, ...(mirror.humans ? { humans: mirror.humans } : {}) })
  setGame({ ...base, favorites: prefs.favorites, savedLineups: prefs.lineups })
}

export type OpenResult = 'ok' | 'dismissed' | 'failed'

/**
 * Abre a liga: mostra já o espelho guardado no aparelho (se houver) e baixa a atualização. Sem internet, abre só com o guardado (só leitura).
 * Demitido: devolve `dismissed` e a tela de escolha de outro clube aparece.
 */
export async function openLeague(id: string, identity: Identity, transport: MirrorTransport = transportFor(identity, id), store: MirrorCache = mirrorCache): Promise<OpenResult> {
  stopSession()
  setDismissed(null)
  leagueId = id
  identityOf = identity
  cache = store
  prefs = EMPTY_PREFS
  mirror = new LeagueMirror(transport, publish)
  mirror.persist = (state) => cache.schedule(id, state)
  const saved = await cache.load(id)
  if (saved) mirror.restore(saved)
  const ok = await mirror.sync()
  if (!ok) {
    if (mirror.lastError === 'not-seated') {
      if (await checkDismissed(id, identity)) return 'dismissed'
    }
    // Sem internet (ou servidor fora): com o espelho guardado dá para ler; sem ele não há o que mostrar.
    if (!saved || !mirror.season()) {
      mirror = undefined
      return 'failed'
    }
    mirror.connection = 'offline'
  }
  const p = await leaguePrefsGet(deps(), identity, id)
  if (p.ok) prefs = { favorites: p.favorites, lineups: p.lineups }
  publish()
  watchPrefs()
  timer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    void mirror?.sync().then(async (synced) => {
      if (!synced && mirror?.lastError === 'not-seated' && identityOf && (await checkDismissed(leagueId, identityOf))) return
      if (synced) publish()
    })
  }, POLL_MS)
  return 'ok'
}

/** Abre o jogo da liga com a conta deste aparelho (a tela da sala usa isto). */
export async function openLeagueGame(id: string): Promise<'ok' | 'no-account' | 'failed' | 'dismissed'> {
  const account = getAccount().account
  if (!account) return 'no-account'
  return openLeague(id, account.identity)
}

/** Para a sincronização e guarda o espelho (sem tocar no jogo mostrado). */
function stopSession(): void {
  closeOnlineMatch()
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
  if (prefsTimer !== undefined) {
    clearTimeout(prefsTimer)
    prefsTimer = undefined
    if (identityOf && leagueId) void leaguePrefsSet(deps(), identityOf, leagueId, prefs)
  }
  offGame?.()
  offGame = undefined
  if (mirror && leagueId) void cache.flush(leagueId, mirror.snapshotState())
  if (mirror) setGame(null)
  mirror = undefined
}

export function closeLeague(): void {
  stopSession()
  leagueId = ''
}
