/**
 * Teste de carga da liga online (Fase 6, B9): uma liga CHEIA (20 técnicos humanos em clubes de ligas diferentes) com o mundo real inteiro, resultado direto,
 * passando pela virada de temporada de todos os países dos humanos, gravando cada mudança do mundo no SqliteWorldStore (o mesmo formato do Durable Object).
 * Mede, por passo do alarme: CPU, linhas gravadas, tamanho; e no fim: memória, tempo de recarga, e projeta custo e carga para N ligas (premissas no código).
 *
 *   PACOTE_REAL=1 node --expose-gc tools/run.mjs loadLeague [--humans 20] [--days 420] [--seed 7] [--leagues 500]
 *
 * Mundo de 370 clubes e 10 mil jogadores: leva alguns minutos e ~1 GB; para os números do Cloudflare use o workflow `Medições pesadas`.
 */
import { DatabaseSync } from 'node:sqlite'
import { loadWorld } from '../src/data/package/defaultPackage'
import { createYouth } from '../src/data/generateYouth'
import { validatePackage } from '../src/data/package/validate'
import { advanceSeason } from '../src/engine/offseason'
import { DEFAULT_CONFIG, createLeague, defaultLeagueConfig, processLeague } from '../src/engine/league'
import type { LeagueState } from '../src/engine/league'
import { MS_HOUR } from '../src/engine/league/pace'
import { createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { SqliteWorldStore, type WorldSql } from '../src/store/worldStore'
import { measurementPackage } from './worldPackage'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]!
}
const HUMANS = Number(arg('humans', '20'))
const DAYS = Number(arg('days', '420'))
const SEED = Number(arg('seed', '7'))
const LEAGUES = Number(arg('leagues', '500'))

const mb = (x: number) => `${Math.round(x / 1048576)} MB`
const gc = () => (globalThis as { gc?: () => void }).gc?.()
const q = (xs: number[], p: number) => [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0

const db = new DatabaseSync(':memory:')
const sql: WorldSql = {
  exec(query, ...bindings) {
    const stmt = db.prepare(query)
    const rows = /^\s*select/i.test(query) ? (stmt.all(...(bindings as never[])) as Record<string, unknown>[]) : (stmt.run(...(bindings as never[])), [])
    return { toArray: () => rows }
  },
  transaction(fn) {
    db.exec('BEGIN')
    try {
      const out = fn()
      db.exec('COMMIT')
      return out
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  },
}

const { pkg } = validatePackage(JSON.parse(JSON.stringify(measurementPackage(SEED))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(SEED, pkg)
const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })

// Os melhores clubes de primeiras divisões diferentes; se faltar divisão, o segundo melhor das maiores.
const firsts = (world.competitions ?? []).filter((c) => c.tier === 1)
const byRep = (ids: readonly string[]) => [...world.teams].filter((t) => ids.includes(t.id)).sort((a, b) => b.reputation - a.reputation)
const picks: string[] = []
for (let round = 0; picks.length < HUMANS && round < 4; round++) {
  for (const c of firsts) {
    const t = byRep(c.teams.map((x) => x.id))[round]
    if (t && picks.length < HUMANS && !picks.includes(t.id)) picks.push(t.id)
  }
}
const seats = picks.map((teamId, i) => ({ teamId, playerId: `humano-${i + 1}` }))

let state: SeasonState = createSeason({ year: 2026, seed: 'carga', teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, ...(world.cups ? { cupSpecs: world.cups } : {}) })
const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
let league: LeagueState = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('carga'), true), state, seats, T0)
console.log(`mundo: ${state.teams.length} clubes, ${state.players.length} jogadores, ${state.matches.length} partidas; liga com ${seats.length} técnicos em ${new Set(seats.map((s) => state.teams.find((t) => t.id === s.teamId)?.country)).size} países`)

const pyramids = [...new Set(seats.map((s) => state.teams.find((t) => t.id === s.teamId)?.country as string))]
const yearsAtStart = Object.fromEntries(Object.entries(state.cycles).map(([p, c]) => [p, c.year]))
const turned = (): boolean => pyramids.every((p) => (state.cycles[p]?.year ?? 0) > (yearsAtStart[p] ?? 0))

const store = new SqliteWorldStore(sql)
gc()
const heap0 = process.memoryUsage().heapUsed
let peak = heap0
let peakLive = heap0
const cpuMs: number[] = []
const rows: number[] = []
const saveMs: number[] = []
const turnSteps: { day: number; cpu: number; rows: number }[] = []
let steps = 0
let saves = 0
let events = 0
let largest = 0
let turnsSeen = 0
const wall0 = performance.now()
const first = store.save(state)
console.log(`primeira gravação: ${first.parts} pedaços, ${first.rowsWritten} linhas, maior pedaço ${(first.largestChars / 1024).toFixed(0)} K`)

const deadline = T0 + DAYS * 24 * MS_HOUR
for (let t = T0; t < deadline && !turned(); t += 2 * MS_HOUR, steps++) {
  const cycleBefore = JSON.stringify(Object.values(state.cycles).map((c) => c.year))
  const before = state
  const c0 = process.cpuUsage()
  const r = processLeague(JSON.parse(JSON.stringify(league)) as LeagueState, state, t, { turn })
  const cpu = (process.cpuUsage(c0).user + process.cpuUsage(c0).system) / 1000
  league = r.league
  state = r.world
  events += r.actions.filter((a) => a.type === 'event-started').length
  const isTurn = cycleBefore !== JSON.stringify(Object.values(state.cycles).map((c) => c.year))
  cpuMs.push(cpu)
  let wrote = 0
  if (state !== before) {
    const s0 = performance.now()
    const saved = store.save(state)
    saveMs.push(performance.now() - s0)
    wrote = saved.rowsWritten
    rows.push(wrote)
    largest = Math.max(largest, saved.largestChars)
    saves++
  }
  if (isTurn) {
    turnsSeen++
    turnSteps.push({ day: Math.round((t - T0) / (24 * MS_HOUR)), cpu, rows: wrote })
  }
  peak = Math.max(peak, process.memoryUsage().heapUsed)
  if (steps % 150 === 0) {
    gc()
    peakLive = Math.max(peakLive, process.memoryUsage().heapUsed)
  }
}
const days = steps / 12
gc()
const wall = (performance.now() - wall0) / 1000

// Recarga como depois de um reinício do objeto.
const r0 = performance.now()
const reloaded = new SqliteWorldStore(sql).load()
const loadMs = performance.now() - r0
gc()
const heapLoaded = process.memoryUsage().heapUsed

const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0)
const dbSize = db.prepare('SELECT SUM(LENGTH(data)) AS n, COUNT(*) AS r FROM world_part').get() as { n: number; r: number }
console.log(`\n${steps} passos de 2 h = ${days.toFixed(0)} dias do mundo até a virada de todos os países dos humanos (${turned() ? 'virou' : 'LIMITE DE DIAS sem virar'}); eventos com partida humana: ${events}`)
console.log(`CPU por passo: mediana ${q(cpuMs, 0.5).toFixed(1)} ms, p95 ${q(cpuMs, 0.95).toFixed(0)} ms, p99 ${q(cpuMs, 0.99).toFixed(0)} ms, pior ${Math.max(...cpuMs).toFixed(0)} ms; total ${(sum(cpuMs) / 1000).toFixed(1)} s`)
console.log(`gravações: ${saves}, linhas ${sum(rows)} (mediana ${q(rows, 0.5)}, p95 ${q(rows, 0.95)}, máx ${Math.max(...rows)}), tempo de gravar: mediana ${q(saveMs, 0.5).toFixed(0)} ms, pior ${Math.max(...saveMs).toFixed(0)} ms; maior pedaço ${(largest / 1024).toFixed(0)} K`)
for (const t of turnSteps) console.log(`  virada no dia ${t.day}: ${t.cpu.toFixed(0)} ms de CPU, ${t.rows} linhas`)
console.log(`memória: heap no começo ${mb(heap0)}, maior heap vivo ${mb(peakLive)}, pico com lixo ${mb(peak)}, depois de recarregar do SQLite ${mb(heapLoaded)} (carga ${loadMs.toFixed(0)} ms)`)
console.log(`banco: ${dbSize.r} linhas, ${(dbSize.n / 1048576).toFixed(1)} M caracteres; liga ${(JSON.stringify(league).length / 1024).toFixed(0)} K; recarga ${reloaded ? 'ok' : 'FALHOU'}; tempo total desta medição ${wall.toFixed(0)} s`)

// ---------------------------------------------------------------- projeção de custo (premissas explícitas; preços do Cloudflare como eu os conheço, a confirmar na B1)
const P = { workersBase: 5, doReqIncluded: 1_000_000, doReqPerM: 0.15, gbsIncluded: 400_000, gbsPerM: 12.5, rowsIncluded: 50_000_000, rowsPerM: 1.0, storageIncludedGb: 5, storagePerGb: 0.2, doMemGb: 0.125, cpuIncludedMs: 30_000_000, cpuPerMMs: 0.02 }
const cpuS = sum(cpuMs) / 1000
// O objeto fica ativo só durante cada passo (CPU) + 1 s de acordar/gravar; fora disso dorme. Conexões e leituras dos técnicos entram à parte (premissa abaixo).
const activeS = cpuS + steps * 1
const sessionsPerHuman = 3 * 17 // 3 por semana durante a temporada de ~4 meses
const requestsPerSession = 150 // abrir, 5 s de consulta por ~10 min, comandos
const apiReqs = HUMANS * sessionsPerHuman * requestsPerSession
const sessionActiveS = HUMANS * sessionsPerHuman * 10 * 60 * 0.15 // o objeto trabalha ~15% do tempo de uma sessão de 10 min
const perLeague = { cpuMs: sum(cpuMs), reqs: steps + apiReqs, gbs: (activeS + sessionActiveS) * P.doMemGb, rows: sum(rows) + first.rowsWritten, gb: dbSize.n / 1073741824 }
console.log(`\nPor liga cheia e temporada (≈${days.toFixed(0)} dias do mundo; premissas: ${HUMANS} técnicos, ${sessionsPerHuman} sessões de 10 min cada, ${requestsPerSession} pedidos por sessão, objeto de ${P.doMemGb * 1024} MB):`)
console.log(`  pedidos ao objeto ${Math.round(perLeague.reqs)}, GB-s ${perLeague.gbs.toFixed(0)}, linhas gravadas ${perLeague.rows}, armazenamento ${(perLeague.gb * 1024).toFixed(0)} MB`)
for (const n of [1, 10, 100, LEAGUES]) {
  const reqs = perLeague.reqs * n * (12 / (days / 30))
  const gbs = perLeague.gbs * n * (12 / (days / 30))
  const wr = perLeague.rows * n * (12 / (days / 30))
  const cpu = perLeague.cpuMs * n * (12 / (days / 30))
  // Por mês: divide a temporada em meses de 30 dias.
  const perMonth = (v: number) => v / 12
  const cost =
    P.workersBase +
    Math.max(0, perMonth(reqs) - P.doReqIncluded) * (P.doReqPerM / 1e6) +
    Math.max(0, perMonth(gbs) - P.gbsIncluded) * (P.gbsPerM / 1e6) +
    Math.max(0, perMonth(wr) - P.rowsIncluded) * (P.rowsPerM / 1e6) +
    Math.max(0, perMonth(cpu) - P.cpuIncludedMs) * (P.cpuPerMMs / 1e6) +
    Math.max(0, perLeague.gb * n - P.storageIncludedGb) * P.storagePerGb
  console.log(`  ${String(n).padStart(4)} ligas cheias: ${Math.round(perMonth(reqs)).toLocaleString('pt-BR')} pedidos/mês, ${Math.round(perMonth(gbs)).toLocaleString('pt-BR')} GB-s/mês, ${Math.round(perMonth(wr)).toLocaleString('pt-BR')} linhas/mês, ${Math.round(perMonth(cpu) / 1000).toLocaleString('pt-BR')} s de CPU/mês, ${(perLeague.gb * n).toFixed(1)} GB → ~US$ ${cost.toFixed(2)}/mês`)
}
