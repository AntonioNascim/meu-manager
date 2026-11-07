/**
 * Painel de moderação (Fase 6, B9): uma página só e uma API pequena, ambas em `/admin`, protegidas pelo segredo `ADMIN_TOKEN` do Worker (guardado no painel do
 * Cloudflare, nunca no repositório). Sem o segredo, `/admin` não existe (404). Quem tenta adivinhar o segredo esbarra no limite por IP (`adminIp`).
 */
import { DECIDED_REPORT_RETENTION_MS, adminAuthorized, parseAdminAction, runAdminAction, type ModerationDeps, type ReportStatus } from '../src/online/moderation'
import type { RateLimit } from '../src/online/rateLimit'
import type { D1Like } from './d1Store'
import { ADMIN_PAGE } from './adminPage'
import { PROBLEM_RETENTION_MS, type ProblemStatus, type ProblemStore } from '../src/online/problemApi'

/**
 * Estimativa do mês pelo modelo da B9 (`tools/loadLeague.ts`): uma liga cheia de 20 técnicos em resultado direto custou ~5.000 passos de alarme e ~35 mil linhas em 420 dias
 * de mundo; cada técnico, ~51 sessões de 150 pedidos. É um modelo, não a conta: o número de verdade está no painel de cobrança do Cloudflare.
 */
export function estimateMonth(leagues: number, humans: number): { requests: number; gbSeconds: number; rowsWritten: number; usd: number } {
  const MONTH = 420 / 30
  const requests = (leagues * 5040 + humans * 51 * 150) / MONTH
  const gbSeconds = (leagues * (171 + 5040) * 0.125 + humans * 51 * 600 * 0.15 * 0.125) / MONTH
  const rowsWritten = (leagues * 34807) / MONTH
  // Plano de US$ 5 inclui 1 M de pedidos de objeto, 400 mil GB-s e 50 M de linhas por mês.
  const usd = 5 + Math.max(0, requests - 1_000_000) * (0.15 / 1e6) + Math.max(0, gbSeconds - 400_000) * (12.5 / 1e6) + Math.max(0, rowsWritten - 50_000_000) * (1 / 1e6)
  return { requests: Math.round(requests), gbSeconds: Math.round(gbSeconds), rowsWritten: Math.round(rowsWritten), usd: Math.round(usd * 100) / 100 }
}

export interface AdminEnv {
  DB: D1Like
  ADMIN_TOKEN?: string
}

const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

/** Rotas do painel. Devolve `undefined` se o caminho não é de `/admin`. */
export async function serveAdmin(req: Request, url: URL, env: AdminEnv, limiter: RateLimit, mkDeps: () => ModerationDeps, problems: ProblemStore): Promise<Response | undefined> {
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
    await deps.mod.purgeDecided(Date.now() - DECIDED_REPORT_RETENTION_MS)
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
  if (route === 'usage' && req.method === 'GET') {
    const now = Date.now()
    const DAY = 86_400_000
    const one = async (sql: string, ...v: unknown[]) => (await env.DB.prepare(sql).bind(...v).first<{ n: number }>())?.n ?? 0
    const perDay = async (table: string, col: string) => {
      const res = await env.DB.prepare(`SELECT CAST(${col} / 86400000 AS INTEGER) AS d, COUNT(*) AS n FROM ${table} WHERE ${col} >= ? GROUP BY d ORDER BY d`).bind(now - 14 * DAY).all<{ d: number; n: number }>()
      return res.results.map((r) => ({ day: new Date(r.d * DAY).toISOString().slice(0, 10), n: r.n }))
    }
    const running = await one("SELECT COUNT(*) AS n FROM leagues WHERE status = 'running'")
    const humansRunning = await one("SELECT COUNT(*) AS n FROM league_members m JOIN leagues l ON l.id = m.league_id WHERE l.status = 'running'")
    return json({
      active: { day: await one('SELECT COUNT(*) AS n FROM identities WHERE last_seen >= ?', now - DAY), week: await one('SELECT COUNT(*) AS n FROM identities WHERE last_seen >= ?', now - 7 * DAY), month: await one('SELECT COUNT(*) AS n FROM identities WHERE last_seen >= ?', now - 30 * DAY) },
      newAccounts: await perDay('identities', 'created_at'),
      newLeagues: await perDay('leagues', 'created_at'),
      newProblems: await perDay('problem_reports', 'created_at'),
      leaguesRunning: running,
      humansInRunningLeagues: humansRunning,
      openProblems: await one("SELECT COUNT(*) AS n FROM problem_reports WHERE status = 'open'"),
      estimate: estimateMonth(running, humansRunning),
    })
  }
  if (route === 'problems' && req.method === 'GET') {
    await problems.purgeBefore(Date.now() - PROBLEM_RETENTION_MS)
    const status: ProblemStatus = url.searchParams.get('status') === 'done' ? 'done' : 'open'
    return json({ status, problems: (await problems.list(status, 100)).map((p) => ({ id: p.id, createdAt: p.createdAt, category: p.category, text: p.text.slice(0, 160), hasImage: p.hasImage })) })
  }
  if (route === 'problem' && req.method === 'GET') {
    const found = await problems.get(url.searchParams.get('id') ?? '')
    if (!found) return json({ error: 'not-found' }, 404)
    let image: string | undefined
    if (found.image) {
      let bin = ''
      for (let i = 0; i < found.image.length; i += 0x8000) bin += String.fromCharCode(...found.image.subarray(i, i + 0x8000))
      image = 'data:image/jpeg;base64,' + btoa(bin)
    }
    return json({ ...found.row, ...(image ? { image } : {}) })
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
    const pr = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined
    if (pr?.type === 'problem-status' && typeof pr.id === 'string' && (pr.status === 'open' || pr.status === 'done')) return (await problems.setStatus(pr.id, pr.status)) ? json({ ok: true }) : json({ error: 'not-found' }, 404)
    if (pr?.type === 'problem-delete' && typeof pr.id === 'string') return (await problems.remove(pr.id)) ? json({ ok: true }) : json({ error: 'not-found' }, 404)
    const action = parseAdminAction(raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined)
    if (!action) return json({ error: 'bad-body' }, 400)
    const result = await runAdminAction(deps, action)
    return result.ok ? json({ ok: true }) : json({ error: result.error }, result.error === 'not-found' ? 404 : 400)
  }
  return json({ error: 'not-found' }, 404)
}
