/**
 * A liga online aberta neste aparelho (Fase 6C, C2): cria o espelho, sincroniza de tempos em tempos e entrega o `Game` às telas pelo mesmo
 * `gameStore` do jogo solo. Só uma liga fica aberta por vez. Sair fecha a sessão e limpa o jogo.
 */
import { ONLINE_CONFIG } from '../online/config'
import type { Identity } from '../online/identity'
import type { IdentityClientDeps } from '../online/identityClient'
import { mirrorFetch, sendCommand } from '../online/leagueClient'
import { LeagueMirror, type MirrorTransport } from './leagueMirror'
import { leagueGame } from './leagueGame'
import { setGame } from './gameStore'

const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n))
const deps = (): IdentityClientDeps => ({ base: ONLINE_CONFIG.apiBase, fetchFn: (...args) => fetch(...args), now: Date.now, randomBytes })

/** Quanto espera entre uma consulta e a seguinte enquanto a tela está aberta (o aviso por WebSocket entra na C5). */
export const POLL_MS = 5_000

let mirror: LeagueMirror | undefined
let leagueId = ''
let timer: ReturnType<typeof setInterval> | undefined

export const activeMirror = (): LeagueMirror | undefined => mirror

export function transportFor(identity: Identity, id: string, d: IdentityClientDeps = deps()): MirrorTransport {
  return {
    async fetch(since, page) {
      const r = await mirrorFetch(d, identity, id, since, page)
      return r.ok ? { ok: true, payload: r.payload } : { ok: false, error: r.error }
    },
    async command(command, since) {
      const r = await sendCommand(d, identity, id, command, since)
      if (r.ok) return { ok: true, payload: r.payload }
      const detail = (r.detail ?? {}) as { reason?: unknown; minimumSalary?: unknown }
      return { ok: false, error: r.error, ...(typeof detail.reason === 'string' ? { reason: detail.reason } : {}), ...(typeof detail.minimumSalary === 'number' ? { minimumSalary: detail.minimumSalary } : {}) }
    },
  }
}

function publish(): void {
  const season = mirror?.season()
  const teamId = mirror?.teamId
  if (!mirror || !season || !teamId) return
  setGame(leagueGame(season, teamId, { leagueId, rev: mirror.rev, connection: mirror.connection }))
}

/** Abre a liga: baixa o espelho e começa a acompanhá-lo. Devolve `false` se não conseguiu a primeira carga. */
export async function openLeague(id: string, identity: Identity, transport: MirrorTransport = transportFor(identity, id)): Promise<boolean> {
  closeLeague()
  leagueId = id
  mirror = new LeagueMirror(transport, publish)
  const ok = await mirror.sync()
  if (!ok) {
    mirror = undefined
    return false
  }
  publish()
  timer = setInterval(() => {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void mirror?.sync()
  }, POLL_MS)
  return true
}

export function closeLeague(): void {
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
  if (mirror) setGame(null)
  mirror = undefined
  leagueId = ''
}
