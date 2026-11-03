/**
 * Medição no Cloudflare real (B1, parte na nuvem). Worker de laboratório + um Durable Object com SQLite + R2.
 * Tudo exige o cabeçalho `x-lab-key` igual ao segredo LAB_KEY (sem ele, nada responde).
 * Rotas (todas rodam no Durable Object "lab"): /load, /advance?n=, /info, /mem, /ballast?mb=, /sqlprobe, /r2test?kb=, /wipe
 */
import pkg from '../../../data/pacote-real.json'
import { loadWorld } from '../../../src/data/package/defaultPackage'
import { advanceGame, createGame, finishPendingMatch } from '../../../src/store/game'
import { userMatchInput } from '../../../src/engine/season/advance'
import { simulateMatch } from '../../../src/engine/match'
import type { Game } from '../../../src/store/game'
import type { DataPackage } from '../../../src/data/package/types'

const fnv = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const info = (g: Game) => ({
  date: g.season.season.currentDate,
  year: g.season.season.year,
  matches: g.season.matches.length,
  finished: g.season.matches.filter((m) => m.status === 'finished').length,
  players: g.season.players.length,
  teams: g.season.teams.length,
  dismissed: !!g.dismissal,
})

const MATCH_CHUNK = 64

/** Divide o estado em blocos: um por clube (time + jogadores + base), um por 64 partidas e um por campo restante. */
function chunksOf(g: Game): Map<string, string> {
  const s = g.season as any
  const out = new Map<string, string>()
  const byTeam = new Map<string, any[]>()
  for (const p of s.players) (byTeam.get(p.teamId) ?? byTeam.set(p.teamId, []).get(p.teamId)!).push(p)
  const youth = new Map<string, any[]>()
  for (const p of s.academy) (youth.get(p.teamId) ?? youth.set(p.teamId, []).get(p.teamId)!).push(p)
  for (const t of s.teams) out.set(`club:${t.id}`, JSON.stringify([t, byTeam.get(t.id) ?? [], youth.get(t.id) ?? []]))
  for (let i = 0; i < s.matches.length; i += MATCH_CHUNK) out.set(`matches:${i / MATCH_CHUNK}`, JSON.stringify(s.matches.slice(i, i + MATCH_CHUNK)))
  for (const k of Object.keys(s)) {
    if (k === 'teams' || k === 'players' || k === 'academy' || k === 'matches') continue
    out.set(`state:${k}`, JSON.stringify(s[k]))
  }
  const { season: _drop, ...rest } = g as any
  out.set('game', JSON.stringify(rest))
  return out
}

export class LabWorld {
  game: Game | undefined
  hashes = new Map<string, number>()
  ballast: unknown[][] = []
  sql: any
  constructor(private ctx: any, private env: any) {
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS chunks (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID')
  }

  mem() {
    try {
      const m = (globalThis as any).process?.memoryUsage?.()
      return m ? { rssMB: m.rss / 1e6, heapUsedMB: m.heapUsed / 1e6, heapTotalMB: m.heapTotal / 1e6, externalMB: m.external / 1e6 } : { unavailable: true }
    } catch (e) {
      return { unavailable: String(e) }
    }
  }

  /** Grava só os blocos que mudaram. Devolve quantos mudaram, linhas gravadas e bytes. */
  persist() {
    this.sql.exec('CREATE TABLE IF NOT EXISTS chunks (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID')
    const chunks = chunksOf(this.game!)
    let changed = 0
    let rows = 0
    let bytes = 0
    let biggest = 0
    for (const [k, v] of chunks) {
      biggest = Math.max(biggest, v.length)
      const h = fnv(v)
      if (this.hashes.get(k) === h) continue
      this.hashes.set(k, h)
      const c = this.sql.exec('INSERT OR REPLACE INTO chunks (k, v) VALUES (?, ?)', k, v)
      c.toArray()
      rows += c.rowsWritten
      bytes += v.length
      changed++
    }
    return { total: chunks.size, changed, rowsWritten: rows, bytes, biggestChunkKB: Math.round(biggest / 1024) }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    try {
      if (url.pathname === '/load') {
        const world = loadWorld(5, pkg as unknown as DataPackage)
        this.game = createGame(5, [...world.teams].sort((a, b) => b.reputation - a.reputation)[0]!.id, { world, dataPackage: pkg as unknown as DataPackage, dataPackageId: 'mundo-real' })
        this.hashes.clear()
        const p = this.persist()
        return Response.json({ ...info(this.game), persist: p, mem: this.mem(), dbMB: this.sql.databaseSize / 1e6 })
      }
      if (url.pathname === '/advance') {
        if (!this.game) return new Response('carregue primeiro (/load)', { status: 409 })
        const n = Number(url.searchParams.get('n') ?? 1)
        const save = url.searchParams.get('save') !== '0'
        for (let i = 0; i < n; i++) {
          this.game = advanceGame(this.game)
          if (this.game.pendingUserMatch) this.game = finishPendingMatch(this.game, simulateMatch(userMatchInput(this.game.season, this.game.pendingUserMatch, this.game.userTeamId)))
        }
        const persist = save ? this.persist() : undefined
        return Response.json({ ...info(this.game), persist, mem: this.mem() })
      }
      if (url.pathname === '/info') return Response.json(this.game ? { ...info(this.game), mem: this.mem(), dbMB: this.sql.databaseSize / 1e6, ballastMB: this.ballast.length } : { loaded: false, mem: this.mem() })
      if (url.pathname === '/mem') return Response.json(this.mem())
      if (url.pathname === '/ballast') {
        // Segura objetos pequenos vivos no heap para achar até onde o isolate aguenta (cada bloco ~1 MB).
        const mb = Number(url.searchParams.get('mb') ?? 10)
        for (let i = 0; i < mb; i++) this.ballast.push(Array.from({ length: 16000 }, (_, j) => ({ a: j, b: i })))
        return Response.json({ ballastMB: this.ballast.length, mem: this.mem() })
      }
      if (url.pathname === '/sqlprobe') {
        // Quanto custa (em linhas gravadas) uma regravação: tabela com índice separado contra WITHOUT ROWID.
        this.sql.exec('DROP TABLE IF EXISTS probe_idx')
        this.sql.exec('DROP TABLE IF EXISTS probe_wr')
        this.sql.exec('CREATE TABLE probe_idx (k TEXT PRIMARY KEY, v TEXT NOT NULL)')
        this.sql.exec('CREATE TABLE probe_wr (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID')
        const rows = (sql: string, ...a: unknown[]) => {
          const c = this.sql.exec(sql, ...a)
          c.toArray()
          return c.rowsWritten as number
        }
        const v = 'x'.repeat(40000)
        const r: Record<string, number> = {}
        r.insertIdx = rows('INSERT INTO probe_idx VALUES (?, ?)', 'a', v)
        r.replaceIdx = rows('INSERT OR REPLACE INTO probe_idx VALUES (?, ?)', 'a', v + 'y')
        r.insertWithoutRowid = rows('INSERT INTO probe_wr VALUES (?, ?)', 'a', v)
        r.replaceWithoutRowid = rows('INSERT OR REPLACE INTO probe_wr VALUES (?, ?)', 'a', v + 'y')
        r.updateWithoutRowid = rows('UPDATE probe_wr SET v = ? WHERE k = ?', v, 'a')
        r.bigRow1_5MB = rows('INSERT OR REPLACE INTO probe_wr VALUES (?, ?)', 'big', 'z'.repeat(1_500_000))
        this.sql.exec('DROP TABLE probe_idx')
        this.sql.exec('DROP TABLE probe_wr')
        return Response.json(r)
      }
      if (url.pathname === '/r2test') {
        // Grava, lê e apaga um arquivo aleatório de N KB no R2 de teste.
        const kb = Number(url.searchParams.get('kb') ?? 1024)
        const body = new Uint8Array(kb * 1024)
        for (let i = 0; i < body.length; i += 65536) crypto.getRandomValues(body.subarray(i, Math.min(i + 65536, body.length)))
        await this.env.R2.put('lab/teste.bin', body)
        const got = await this.env.R2.get('lab/teste.bin')
        const size = (await got.arrayBuffer()).byteLength
        await this.env.R2.delete('lab/teste.bin')
        return Response.json({ wroteKB: kb, readKB: size / 1024 })
      }
      if (url.pathname === '/wipe') {
        await this.ctx.storage.deleteAll()
        this.game = undefined
        this.hashes.clear()
        this.ballast = []
        return Response.json({ wiped: true })
      }
      return new Response('rotas: /load /advance /info /mem /ballast /sqlprobe /r2test /wipe', { status: 404 })
    } catch (e) {
      return new Response(String((e as Error)?.stack ?? e), { status: 500 })
    }
  }
}

export default {
  async fetch(req: Request, env: any): Promise<Response> {
    if (!env.LAB_KEY || req.headers.get('x-lab-key') !== env.LAB_KEY) return new Response('not found', { status: 404 })
    return env.WORLD.get(env.WORLD.idFromName('lab')).fetch(req)
  },
}
