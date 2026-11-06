/**
 * Painel de moderação (Fase 6, B9): uma página só e uma API pequena, ambas em `/admin`, protegidas pelo segredo `ADMIN_TOKEN` do Worker (guardado no painel do
 * Cloudflare, nunca no repositório). Sem o segredo, `/admin` não existe (404). Quem tenta adivinhar o segredo esbarra no limite por IP (`adminIp`).
 */
import { adminAuthorized, parseAdminAction, runAdminAction, type ModerationDeps, type ReportStatus } from '../src/online/moderation'
import type { RateLimit } from '../src/online/rateLimit'
import type { D1Like } from './d1Store'
import { ADMIN_PAGE } from './adminPage'

export interface AdminEnv {
  DB: D1Like
  ADMIN_TOKEN?: string
}

const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

/** Rotas do painel. Devolve `undefined` se o caminho não é de `/admin`. */
export async function serveAdmin(req: Request, url: URL, env: AdminEnv, limiter: RateLimit, mkDeps: () => ModerationDeps): Promise<Response | undefined> {
  if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return undefined
  // Painel desligado: nem a página aparece.
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 16) return new Response('not found', { status: 404 })
  if (url.pathname === '/admin' && req.method === 'GET') {
    return new Response(ADMIN_PAGE, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    })
  }
  if (!url.pathname.startsWith('/admin/api/')) return json({ error: 'not-found' }, 404)
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  const hit = await limiter.hit('adminIp', ip, Date.now())
  if (!hit.allowed) return json({ error: 'rate-limited' }, 429)
  if (!adminAuthorized(req.headers.get('Authorization'), env.ADMIN_TOKEN)) return json({ error: 'unauthorized' }, 401)
  const deps = mkDeps()
  const route = url.pathname.slice('/admin/api/'.length)

  if (route === 'overview' && req.method === 'GET') {
    const one = async (sql: string) => (await env.DB.prepare(sql).bind().first<{ n: number }>())?.n ?? 0
    const leagues = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM leagues GROUP BY status').bind().all<{ status: string; n: number }>()
    return json({
      identities: await one('SELECT COUNT(*) AS n FROM identities'),
      leagues: Object.fromEntries(leagues.results.map((r) => [r.status, r.n])),
      hiddenLeagues: await one("SELECT COUNT(*) AS n FROM leagues WHERE hidden = 1 AND status != 'closed'"),
      members: await one('SELECT COUNT(*) AS n FROM league_members'),
      ...(await deps.mod.counts()),
    })
  }
  if (route === 'reports' && req.method === 'GET') {
    const status = (['open', 'actioned', 'dismissed'] as const).find((s) => s === url.searchParams.get('status')) ?? 'open'
    const rows = await deps.mod.list(status as ReportStatus, 200)
    // Agrupa por alvo: quantas pessoas e quais motivos, com o apelido ou o nome da liga de hoje.
    const groups = new Map<string, { kind: string; target: string; reporters: Set<string>; reasons: Record<string, number>; last: number }>()
    for (const r of rows) {
      const key = `${r.kind}:${r.target}`
      const g = groups.get(key) ?? { kind: r.kind, target: r.target, reporters: new Set<string>(), reasons: {}, last: 0 }
      g.reporters.add(r.reporter)
      g.reasons[r.reason] = (g.reasons[r.reason] ?? 0) + 1
      g.last = Math.max(g.last, r.createdAt)
      groups.set(key, g)
    }
    const out = []
    for (const g of groups.values()) {
      let label = g.target
      if (g.kind === 'nickname') label = (await deps.identities.get(g.target))?.nickname ?? '(sem apelido)'
      else label = (await deps.leagues.get(g.target))?.name ?? '(liga apagada)'
      out.push({ kind: g.kind, target: g.target, label, people: g.reporters.size, reasons: g.reasons, last: g.last })
    }
    return json({ status, groups: out.sort((a, b) => b.people - a.people || b.last - a.last) })
  }
  if (route === 'bans' && req.method === 'GET') return json({ bans: await deps.mod.listBans(200) })
  if (route === 'hidden-leagues' && req.method === 'GET') {
    const res = await env.DB.prepare("SELECT id, name, kind, status, created_at FROM leagues WHERE hidden = 1 AND status != 'closed' ORDER BY created_at DESC LIMIT 100").bind().all<{ id: string; name: string; kind: string; status: string; created_at: number }>()
    return json({ leagues: res.results })
  }
  if (route === 'action' && req.method === 'POST') {
    let raw: unknown
    try {
      const text = await req.text()
      raw = text.length > 2048 ? undefined : JSON.parse(text)
    } catch {
      raw = undefined
    }
    const action = parseAdminAction(raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined)
    if (!action) return json({ error: 'bad-body' }, 400)
    const result = await runAdminAction(deps, action)
    return result.ok ? json({ ok: true }) : json({ error: result.error }, result.error === 'not-found' ? 404 : 400)
  }
  return json({ error: 'not-found' }, 404)
}
