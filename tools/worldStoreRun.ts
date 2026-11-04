// Mede o mundo em blocos no SQLite (Fase 6, B5): joga uma temporada do mundo real (ou do mundo de teste) gravando cada avanço no SqliteWorldStore
// (em cima do node:sqlite, com o mesmo formato do SQLite do Durable Object) e mostra linhas gravadas, tamanho das linhas e tempos.
// Uso: PACOTE_REAL=1 node --expose-gc tools/run.mjs worldStoreRun [--steps N] [--reload-every K] [--seed S]
// Confere também, a cada reinício simulado, que o mundo recarregado é idêntico ao que estava em memória.
import { DatabaseSync } from 'node:sqlite'
import { loadWorld } from '../src/data/package/defaultPackage'
import { advanceToNextEvent } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { createGame, turnRunner } from '../src/store/game'
import { SqliteWorldStore, type WorldSql } from '../src/store/worldStore'
import { measurementPackage } from './worldPackage'

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(process.argv[i + 1])
}
const STEPS = arg('steps', 400)
const RELOAD_EVERY = arg('reload-every', 40)
const SEED = arg('seed', 7)

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

function stable(value: unknown): string {
  return JSON.stringify(JSON.parse(JSON.stringify(value)), (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  )
}

const raw = measurementPackage(SEED)
const world = loadWorld(SEED, raw)
let state: SeasonState = createGame(SEED, world.teams[0]!.id, { world, dataPackage: raw, dataPackageId: 'mundo-real' }).season
const startYear = state.season.year
console.log(`mundo: ${state.teams.length} clubes, ${state.players.length} jogadores, ${state.matches.length} partidas`)

let store = new SqliteWorldStore(sql)
const t0 = performance.now()
const first = store.save(state)
console.log(`primeira gravação: ${first.parts} pedaços, ${first.rowsWritten} linhas, ${(first.chars / 1048576).toFixed(1)} M caracteres, maior pedaço ${(first.largestChars / 1024).toFixed(0)} K, ${Math.round(performance.now() - t0)} ms`)

const rows: number[] = []
const saveMs: number[] = []
const stepMs: number[] = []
let largest = first.largestChars
let steps = 0
let mismatches = 0
for (; steps < STEPS && state.season.year === startYear; steps++) {
  const a = performance.now()
  state = advanceToNextEvent(state, { market: true, turn: turnRunner }).state
  const b = performance.now()
  const saved = store.save(state)
  stepMs.push(b - a)
  saveMs.push(performance.now() - b)
  rows.push(saved.rowsWritten)
  largest = Math.max(largest, saved.largestChars)
  if ((steps + 1) % RELOAD_EVERY === 0) {
    const r0 = performance.now()
    store = new SqliteWorldStore(sql)
    const loaded = store.load()!
    const loadMs = Math.round(performance.now() - r0)
    const same = stable(loaded) === stable(state)
    if (!same) mismatches++
    console.log(`  avanço ${steps + 1} (${state.season.currentDate}): reinício simulado, carga ${loadMs} ms, ${same ? 'idêntico' : 'DIFERENTE'}`)
    state = loaded
  }
}
const sorted = (xs: number[]) => [...xs].sort((x, y) => x - y)
const q = (xs: number[], p: number) => sorted(xs)[Math.min(xs.length - 1, Math.floor(xs.length * p))]!
const dbSize = (db.prepare('SELECT SUM(LENGTH(data)) AS n, COUNT(*) AS r FROM world_part').get() as { n: number; r: number })
console.log(`\n${steps} avanços até ${state.season.currentDate} (${steps < STEPS ? 'a temporada virou' : 'limite de avanços'})`)
console.log(`linhas gravadas: total ${rows.reduce((n, x) => n + x, 0)}, mediana por avanço ${q(rows, 0.5)}, p95 ${q(rows, 0.95)}, máximo ${Math.max(...rows)}`)
console.log(`gravar: mediana ${q(saveMs, 0.5).toFixed(0)} ms, p95 ${q(saveMs, 0.95).toFixed(0)} ms, pior ${Math.max(...saveMs).toFixed(0)} ms; avançar o motor: mediana ${q(stepMs, 0.5).toFixed(0)} ms, pior ${Math.max(...stepMs).toFixed(0)} ms`)
console.log(`banco: ${dbSize.r} linhas, ${(dbSize.n / 1048576).toFixed(1)} M caracteres; maior pedaço ${(largest / 1024).toFixed(0)} K (limite de uma linha: 2 MB)`)
console.log(mismatches === 0 ? 'Mundo recarregado sempre idêntico.' : `${mismatches} recarga(s) DIFERENTE(S).`)
process.exit(mismatches === 0 ? 0 : 1)
