/**
 * Rotas dos saves na nuvem (Fase 6, B4). Puro: recebe o pedido já lido (`ApiRequest`) e devolve status e corpo; o Worker só liga isto ao
 * `Request`/`Response`. Toda rota confere limite, assinatura e cadastro (`requireIdentity`) antes de tocar no armazenamento, e o jogador
 * só enxerga o próprio prefixo (`u/<playerId>/...`): o `playerId` vem da assinatura, nunca do caminho.
 *
 *   GET    /api/saves                       os 3 espaços (manifesto e cópia) e quando a conta vence por falta de uso
 *   GET    /api/saves/<n>                   manifesto do espaço
 *   POST   /api/saves/<n>/missing           {hashes} → quais pedaços o servidor não tem
 *   PUT    /api/saves/<n>/blob/<hash>       envia um pedaço (corpo = bytes; o servidor confere o hash)
 *   GET    /api/saves/<n>/blob/<hash>       baixa um pedaço
 *   PUT    /api/saves/<n>/manifest          {expectedRev, manifest, force?} → compare-and-swap
 *   DELETE /api/saves/<n>                   apaga o espaço na nuvem
 *   GET    /api/account/export              "Exportar meus dados"
 *   DELETE /api/account                     "Apagar minha conta": saves e cadastro
 */
import { requireIdentity, type ApiDeps, type ApiRequest, type ApiResult } from './identityApi'
import type { LimitAction } from './rateLimit'
import {
  MAX_BLOB_BYTES,
  RETENTION_MS,
  commitManifest,
  deleteAccountData,
  deleteSlotData,
  exportAccount,
  getBlob,
  getManifest,
  listSaves,
  missingBlobs,
  putBlob,
  type CloudDeps,
  type CloudResult,
} from './cloudSave'

export type CloudApiDeps = ApiDeps & CloudDeps & { deleteIdentity(playerId: string): Promise<void> }

export type CloudResponse =
  | { status: number; json: unknown; headers?: Record<string, string> }
  | { status: 200; bytes: Uint8Array }

const MATCH = {
  list: /^\/api\/saves$/,
  slot: /^\/api\/saves\/([1-3])$/,
  missing: /^\/api\/saves\/([1-3])\/missing$/,
  blob: /^\/api\/saves\/([1-3])\/blob\/([0-9a-f]{64})$/,
  manifest: /^\/api\/saves\/([1-3])\/manifest$/,
  exportAccount: /^\/api\/account\/export$/,
  account: /^\/api\/account$/,
}

/** `true` se o caminho é de uma rota de save ou de conta (o Worker usa para decidir como ler o corpo). */
export const isCloudPath = (pathname: string): boolean => pathname.startsWith('/api/saves') || pathname.startsWith('/api/account')

/** Quantos bytes o corpo desta rota pode ter (o Worker lê com este teto). */
export function bodyLimitFor(method: string, pathname: string): number {
  if (method === 'PUT' && MATCH.blob.test(pathname)) return MAX_BLOB_BYTES
  if (method === 'PUT' || method === 'POST') return 80 * 1024
  return 0
}

const fromAuth = (r: ApiResult<never>): CloudResponse => ({
  status: r.status,
  json: r.body,
  headers: r.status === 429 && 'retryAfterMs' in r.body ? { 'Retry-After': String(Math.ceil(r.body.retryAfterMs / 1000)) } : undefined,
})

function fromCloud<T>(result: CloudResult<T>, wrap: (v: T) => unknown = (v) => v): CloudResponse {
  return result.ok ? { status: 200, json: wrap(result.value) } : { status: result.status, json: result.body }
}

const bodyText = (b: Uint8Array | string): string => (typeof b === 'string' ? b : new TextDecoder().decode(b))
const bodyBytes = (b: Uint8Array | string): Uint8Array => (typeof b === 'string' ? new TextEncoder().encode(b) : b)

export async function handleCloudRequest(req: ApiRequest, url: URL, deps: CloudApiDeps): Promise<CloudResponse | undefined> {
  const path = url.pathname
  const m = req.method
  const pick = <K extends keyof typeof MATCH>(key: K) => MATCH[key].exec(path)

  let action: LimitAction
  if (m === 'GET' && (pick('list') || pick('slot') || pick('blob') || pick('exportAccount'))) action = 'read'
  else if (m === 'POST' && pick('missing')) action = 'read'
  else if (m === 'PUT' && pick('blob')) action = 'saveBlob'
  else if (m === 'PUT' && pick('manifest')) action = 'saveUpload'
  else if (m === 'DELETE' && pick('slot')) action = 'write'
  else if (m === 'DELETE' && pick('account')) action = 'deleteAccount'
  else return undefined

  const ipAction: LimitAction = action === 'saveBlob' ? 'saveBlobIp' : action === 'saveUpload' ? 'saveUploadIp' : action
  const auth = await requireIdentity(req, action, deps, ipAction)
  if (!auth.ok) return fromAuth(auth.result)
  const { record } = auth
  const id = record.playerId

  let hit: RegExpExecArray | null
  if (action === 'read' && m === 'GET' && pick('list')) {
    const saves = await listSaves(deps, id)
    return { status: 200, json: { saves, expiresAt: record.lastSeen + RETENTION_MS } }
  }
  if ((hit = pick('slot')) && m === 'GET') return fromCloud(await getManifest(deps, id, Number(hit[1])), (manifest) => ({ manifest }))
  if ((hit = pick('missing'))) {
    let hashes: unknown
    try {
      hashes = (JSON.parse(bodyText(req.body)) as { hashes?: unknown }).hashes
    } catch {
      return { status: 400, json: { error: 'bad-request', detail: 'json' } }
    }
    return fromCloud(await missingBlobs(deps, id, Number(hit[1]), hashes), (missing) => ({ missing }))
  }
  if ((hit = pick('blob'))) {
    const slot = Number(hit[1])
    if (m === 'PUT') return fromCloud(await putBlob(deps, id, slot, hit[2]!, bodyBytes(req.body)))
    const blob = await getBlob(deps, id, slot, hit[2]!)
    return blob.ok ? { status: 200, bytes: blob.value } : fromCloud(blob)
  }
  if ((hit = pick('manifest'))) return fromCloud(await commitManifest(deps, id, Number(hit[1]), bodyText(req.body)))
  if ((hit = pick('slot')) && m === 'DELETE') return fromCloud(await deleteSlotData(deps, id, Number(hit[1])))
  if (pick('exportAccount')) return { status: 200, json: await exportAccount(deps, record) }
  if (pick('account') && m === 'DELETE') {
    const deleted = await deleteAccountData(deps, id)
    await deps.deleteIdentity(id)
    return { status: 200, json: { deleted } }
  }
  return undefined
}
