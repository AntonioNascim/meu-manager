/**
 * Medição da B5 no Cloudflare real: um Durable Object com SQLite que guarda o mundo pelo `SqliteWorldStore` do projeto (o mesmo código do jogo).
 * Tudo exige o cabeçalho `x-lab-key` igual ao segredo LAB_KEY (sem ele, nada responde). Worker de laboratório: apagado depois do teste.
 * Rotas (no Durable Object "lab5"): /load, /advance?n=, /info, /reload, /crash, /hash, /ballast?mb=, /wipe
 *
 * O objeto NÃO guarda o mundo entre pedidos como verdade: se `this.state` está vazio (o objeto foi reiniciado pela plataforma ou por /crash), o
 * próximo pedido recarrega tudo do SQLite antes de continuar. É o comportamento que o servidor de ligas terá.
 */
import pkg from '../../../data/pacote-real.json'
import { loadWorld } from '../../../src/data/package/defaultPackage'
import { advanceToNextEvent } from '../../../src/engine/season'
import type { SeasonState } from '../../../src/engine/season'
import { createGame, turnRunner } from '../../../src/store/game'
import { SqliteWorldStore, type WorldSql } from '../../../src/store/worldStore'
import type { DataPackage } from '../../../src/data/package/types'

/** Texto com as chaves em ordem: dois mundos iguais dão o mesmo texto, não importa a ordem em que as chaves nasceram. */
function stable(value: unknown): string {
  return JSON.stringify(JSON.parse(JSON.stringify(value)), (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  )
}

/** Hash de 53 bits (cyrb53) do texto: serve para comparar o mundo antes e depois de um reinício. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

const OPTIONS = { market: true } as const

export class LabWorld5 {
  state: SeasonState | undefined
  store: SqliteWorldStore
  ballast: unknown[][] = []
  private sql: any
  private wsql: WorldSql
  /** Quantas vezes este objeto foi (re)criado: sobe a cada reinício, o que prova que a plataforma ou o /crash reiniciou. */
  boot: number

  constructor(
    private ctx: any,
    _env: any,
  ) {
    this.sql = ctx.storage.sql
    this.wsql = {
      exec: (query: string, ...bindings: unknown[]) => this.sql.exec(query, ...bindings),
      transaction: <T>(fn: () => T): T => ctx.storage.transactionSync(fn),
    }
    this.store = new SqliteWorldStore(this.wsql)
    this.sql.exec('CREATE TABLE IF NOT EXISTS lab_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID')
    const row = this.sql.exec("SELECT v FROM lab_meta WHERE k = 'boot'").toArray()[0]
    this.boot = (row ? Number(row.v) : 0) + 1
    this.sql.exec("INSERT OR REPLACE INTO lab_meta (k, v) VALUES ('boot', ?)", String(this.boot))
  }

  private info() {
    const s = this.state
    return { boot: this.boot, inMemory: !!s, date: s?.season.currentDate, year: s?.season.year, matches: s?.matches.length, finished: s?.matches.filter((m) => m.status === 'finished').length, players: s?.players.length, teams: s?.teams.length, dbMB: this.sql.databaseSize / 1e6, ballastMB: this.ballast.length }
  }

  /** O que a plataforma faz quando reinicia: tudo em memória some. Aqui, quem precisa do mundo o recarrega do SQLite. */
  private ensure(): { reloadedFromSql: boolean; loadChars?: number } {
    if (this.state) return { reloadedFromSql: false }
    const loaded = this.store.load()
    if (!loaded) throw new Error('Nada guardado: use /load primeiro.')
    this.state = loaded
    return { reloadedFromSql: true }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    try {
      if (url.pathname === '/load') {
        const raw = pkg as unknown as DataPackage
        const world = loadWorld(7, raw)
        this.state = createGame(7, world.teams[0]!.id, { world, dataPackage: raw, dataPackageId: 'mundo-real' }).season
        const stats = this.store.save(this.state)
        return Response.json({ ...this.info(), save: stats })
      }
      if (url.pathname === '/advance') {
        const n = Number(url.searchParams.get('n') ?? 1)
        const before = this.ensure()
        let turned = 0
        for (let i = 0; i < n; i++) {
          const step = advanceToNextEvent(this.state!, { ...OPTIONS, turn: turnRunner })
          this.state = step.state
          turned += step.turned?.length ?? 0
        }
        const save = this.store.save(this.state!)
        return Response.json({ ...this.info(), ...before, turned, save })
      }
      if (url.pathname === '/info') return Response.json(this.info())
      if (url.pathname === '/hash') {
        // Hash do mundo (em memória, ou recarregado do SQLite se o objeto reiniciou) e do que está no SQLite agora.
        const reloaded = this.ensure()
        const mem = hash53(stable(this.state))
        const fresh = new SqliteWorldStore(this.wsql)
        const disk = hash53(stable(fresh.load()))
        return Response.json({ ...this.info(), ...reloaded, memHash: mem, diskHash: disk, same: mem === disk })
      }
      if (url.pathname === '/reload') {
        // Reinício simulado: esquece tudo da memória e recarrega do SQLite, medindo.
        this.state = undefined
        this.store = new SqliteWorldStore(this.wsql)
        const r = this.ensure()
        return Response.json({ ...this.info(), ...r, ...(url.searchParams.get('hash') === '0' ? {} : { hash: hash53(stable(this.state)) }) })
      }
      if (url.pathname === '/crash') {
        // Reinício de verdade: derruba o objeto. O próximo pedido cai num objeto novo (boot + 1).
        this.ctx.abort('lab: reinicio de teste')
        return new Response('abortado', { status: 500 })
      }
      if (url.pathname === '/ballast') {
        const mb = Number(url.searchParams.get('mb') ?? 10)
        for (let i = 0; i < mb; i++) this.ballast.push(Array.from({ length: 16000 }, (_, j) => ({ a: j, b: i })))
        return Response.json({ ballastMB: this.ballast.length })
      }
      if (url.pathname === '/wipe') {
        await this.ctx.storage.deleteAll()
        this.sql.exec('CREATE TABLE IF NOT EXISTS lab_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID')
        this.store = new SqliteWorldStore(this.wsql)
        this.sql.exec("INSERT OR REPLACE INTO lab_meta (k, v) VALUES ('boot', ?)", String(this.boot))
        this.state = undefined
        this.ballast = []
        return Response.json({ wiped: true })
      }
      return new Response('rotas: /load /advance /info /hash /reload /crash /ballast /wipe', { status: 404 })
    } catch (e) {
      return new Response(String((e as Error)?.stack ?? e), { status: 500 })
    }
  }
}

export default {
  async fetch(req: Request, env: any): Promise<Response> {
    if (!env.LAB_KEY || req.headers.get('x-lab-key') !== env.LAB_KEY) return new Response('not found', { status: 404 })
    return env.WORLD.get(env.WORLD.idFromName('lab5')).fetch(req)
  },
}
