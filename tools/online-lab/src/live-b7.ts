/**
 * Laboratório da B7 (só local, `wrangler dev --local`, sem conta e sem custo): uma sala de liga de verdade (`server/leagueRoom.ts`) com um mundo
 * fictício e duas vagas de técnicos. Tudo exige o cabeçalho `x-lab-key` (ou `?key=` no WebSocket, que o navegador não deixa pôr cabeçalho).
 * Rotas: /lab/<sala>/init?minuteMs=, /lab/<sala>/admin/*, /lab/<sala>/ws?player=, /lab/<sala>/replays, /lab/<sala>/verify, /lab/<sala>/crash
 */
import { DEFAULT_CONFIG, createLeague, defaultLeagueConfig } from '../../../src/engine/league'
import { LeagueRoom } from '../../../server/leagueRoom'
import { verifyReplay, type StoredReplay } from '../../../src/online/liveProtocol'
import { createGame } from '../../../src/store/game'

export class LabRoom extends LeagueRoom {
  async fetch(req: Request): Promise<Response> {
    const full = new URL(req.url)
    const url = new URL(full.pathname.replace(/^\/lab\/[a-z0-9-]+/, '') || '/', full.origin)
    url.search = full.search
    if (url.pathname === '/init') {
      const world = createGame(6, 'team-imp', { cups: false }).season
      const comp = world.season.competitions[0]!
      const league = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('liga-b7'), false), world, [
        { teamId: comp.teamIds[0]!, playerId: 'jogador-1' },
        { teamId: comp.teamIds[7]!, playerId: 'jogador-2' },
      ], Date.now())
      const kind = url.searchParams.get('kind') === 'friends' ? 'friends' : 'open'
      this.create({ leagueId: 'lab', kind, minuteMs: Number(url.searchParams.get('minuteMs') ?? 10_000), createdAt: Date.now() }, league, world)
      return Response.json(this.info())
    }
    if (url.pathname === '/verify') {
      const out: { key: string; ok: boolean }[] = []
      for (const row of this.sql.exec('SELECT k, v FROM replays ORDER BY k').toArray()) out.push({ key: String(row.k), ok: verifyReplay(JSON.parse(String(row.v)) as StoredReplay).ok })
      return Response.json(out)
    }
    if (url.pathname === '/crash') {
      // Reinício de verdade: derruba o objeto; o alarme guardado o acorda de novo e ele se reconstrói do SQLite.
      ;(this.ctx as unknown as { abort(r: string): void }).abort('lab: reinicio de teste')
      return new Response('abortado', { status: 500 })
    }
    return super.fetch(new Request(url, req))
  }
}

export default {
  async fetch(req: Request, env: { LAB_KEY?: string; ROOM: { idFromName(n: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } } }): Promise<Response> {
    const url = new URL(req.url)
    const key = req.headers.get('x-lab-key') ?? url.searchParams.get('key')
    if (!env.LAB_KEY || key !== env.LAB_KEY) return new Response('not found', { status: 404 })
    const m = /^\/lab\/([a-z0-9-]+)(\/.*)$/.exec(url.pathname)
    if (!m) return new Response('not found', { status: 404 })
    const headers = new Headers(req.headers)
    const player = url.searchParams.get('player')
    if (player) headers.set('x-player-id', player)
    const stub = env.ROOM.get(env.ROOM.idFromName(m[1]!))
    return stub.fetch(new Request(req, { headers }))
  },
}
