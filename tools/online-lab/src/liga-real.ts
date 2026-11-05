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
        for (let i = 0; i < 2; i++) out.push(await (await this.internal('/internal/seat/add', { playerId: `lab-${i}`, teamId: ids[i]! })).json())
        return Response.json(out)
      }
      if (url.pathname === '/start') return this.internal('/internal/start', {})
      if (url.pathname === '/info') {
        const loaded = this.ensureWorld()
        const w = this.world as { teams: unknown[]; players: unknown[]; season: { competitions: unknown[]; currentDate?: unknown }; matches?: unknown[] } | undefined
        return Response.json({ boot: this.boot, loaded, teams: w?.teams.length, players: w?.players.length, competitions: w?.season.competitions.length, running: this.league !== undefined, events: this.league?.clock.events.length, dbBytes: this.sql.databaseSize })
      }
      if (url.pathname === '/crash') {
        ;(this.ctx as unknown as { abort(r: string): void }).abort('lab: reinicio de teste')
        return new Response('abortado', { status: 500 })
      }
      return new Response('rotas: /wipe /ballast /init /seats /start /info /crash', { status: 404 })
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
