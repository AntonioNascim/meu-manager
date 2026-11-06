/**
 * Laboratório B8 (nuvem, temporário): a sala de liga de verdade (`server/leagueRoom.ts`) com o mundo real inteiro lido do bucket de pacotes.
 * Mede criação, início e recarga depois de reiniciar. Tudo exige `x-lab-key`. Rotas: /wipe /ballast?mb= /init /seats /start /info /crash
 */
import { LeagueRoom } from '../../../server/leagueRoom'

export class LabLeague extends LeagueRoom {
  private ballast: unknown[] = []
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    try {
      if (url.pathname === '/wipe') {
        await this.ctx.storage.deleteAll()
        this.league = undefined
        this.world = undefined
        this.meta = undefined
        this.ballast = []
        // As tabelas foram junto: reinicia o objeto para ele recriá-las.
        ;(this.ctx as unknown as { abort(r: string): void }).abort('lab: limpeza')
        return Response.json({ wiped: true })
      }
      if (url.pathname === '/ballast') {
        const mb = Number(url.searchParams.get('mb') ?? 10)
        for (let i = 0; i < mb; i++) this.ballast.push(Array.from({ length: 16000 }, (_, j) => ({ a: j, b: i })))
        return Response.json({ ballastMB: this.ballast.length })
      }
      if (url.pathname === '/init') {
        const record = { id: 'lab-real', name: 'Teste mundo real', kind: 'open', adminId: 'lab', pace: 'normal', band: 'classic', tzOffsetMin: -180, world: { source: 'real', version: url.searchParams.get('v') ?? '2026.11' }, seed: 7, maxHumans: 20, status: 'lobby', entryClosed: false, hidden: false, directResult: true, createdAt: Date.now() }
        return this.internal('/internal/init', record)
      }
      if (url.pathname === '/seats') {
        if (!this.ensureWorld()) return Response.json({ error: 'sem mundo' }, { status: 409 })
        const ids = (this.world as { season: { competitions: { teamIds: string[] }[] } }).season.competitions[0]!.teamIds
        const out = []
        const n = Number(url.searchParams.get('n') ?? 2)
        if (n <= 2) {
          for (let i = 0; i < n; i++) out.push(await (await this.internal('/internal/seat/add', { playerId: `lab-${i}`, teamId: ids[i]! })).json())
          return Response.json(out)
        }
        // B9: liga cheia, os melhores clubes de primeiras divisões diferentes (um por país primeiro).
        const w = this.world as unknown as { teams: { id: string; reputation: number }[]; season: { competitions: { tier: number; teamIds: string[] }[] } }
        const picks: string[] = []
        for (let round = 0; picks.length < n && round < 4; round++) {
          for (const c of w.season.competitions.filter((x) => x.tier === 1)) {
            const t = c.teamIds.map((id) => w.teams.find((x) => x.id === id)!).sort((a, b) => b.reputation - a.reputation)[round]
            if (t && picks.length < n && !picks.includes(t.id)) picks.push(t.id)
          }
        }
        for (const [i, teamId] of picks.entries()) out.push(await (await this.internal('/internal/seat/add', { playerId: `lab-${i}`, teamId })).json())
        return Response.json({ seats: out.length, ok: out.filter((x: { ok?: boolean }) => x.ok).length, errors: [...new Set(out.map((x: { error?: string }) => x.error))], sample: picks.slice(0, 3) })
      }
      if (url.pathname === '/start') return this.internal('/internal/start', {})
      if (url.pathname === '/info') {
        const loaded = this.ensureWorld()
        const w = this.world as { teams: unknown[]; players: unknown[]; season: { competitions: unknown[]; currentDate?: unknown }; matches?: unknown[] } | undefined
        return Response.json({ ballastMB: this.ballast.length, boot: this.boot, loaded, teams: w?.teams.length, players: w?.players.length, competitions: w?.season.competitions.length, running: this.league !== undefined, events: this.league?.clock.events.length, dbBytes: this.sql.databaseSize })
      }
      if (url.pathname === '/adv') {
        // Avança o ADM n eventos (cada um é a passagem até o próximo evento da liga) e devolve data, anos dos ciclos e tempos.
        const n = Number(url.searchParams.get('n') ?? 10)
        const t0 = Date.now()
        let worst = 0
        for (let i = 0; i < n; i++) {
          const a = Date.now()
          const r = await this.admin('/admin/advance', {})
          worst = Math.max(worst, Date.now() - a)
          if (r.status !== 200) return new Response(`advance falhou ${r.status}: ${await r.text()}`, { status: 500 })
        }
        const w = this.world as unknown as { season: { currentDate: string }; cycles: Record<string, { year: number }> }
        const years = Object.values(w.cycles).map((c) => c.year)
        return Response.json({ boot: this.boot, date: w.season.currentDate, minYear: Math.min(...years), maxYear: Math.max(...years), ms: Date.now() - t0, worstMs: worst, dbBytes: this.sql.databaseSize })
      }
      if (url.pathname === '/reload') {
        // Reinício simulado: esquece tudo da memória e recarrega do SQLite (o momento mais pesado).
        const a = Date.now()
        this.world = undefined
        this.league = undefined
        this.live = undefined
        this.meta = undefined
        const ok = this.ensureLoaded()
        return Response.json({ ok, ms: Date.now() - a, boot: this.boot })
      }
      if (url.pathname === '/crash') {
        ;(this.ctx as unknown as { abort(r: string): void }).abort('lab: reinicio de teste')
        return new Response('abortado', { status: 500 })
      }
      return new Response('rotas: /wipe /ballast /init /seats?n= /start /adv?n= /reload /info /crash', { status: 404 })
    } catch (e) {
      return new Response(String((e as Error)?.stack ?? e), { status: 500 })
    }
  }
}

export default {
  async fetch(req: Request, env: { LAB_KEY?: string; LAB: { idFromName(n: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } } }): Promise<Response> {
    if (!env.LAB_KEY || req.headers.get('x-lab-key') !== env.LAB_KEY) return new Response('not found', { status: 404 })
    return env.LAB.get(env.LAB.idFromName(new URL(req.url).searchParams.get('room') ?? 'lab')).fetch(req)
  },
}
