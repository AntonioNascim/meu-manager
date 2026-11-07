/**
 * Fase 6C, C2: custo no servidor do espelho do mundo (CPU de comparar os mundos, de montar a atualização e a carga completa) com o mundo real.
 * É a condição do plano B da C1: se o CPU por revisão for ruim, cai-se para o índice resumido.
 *
 *   PACOTE_REAL=1 node --expose-gc tools/run.mjs mirrorCpu [--days 90] [--seed 7]
 */
import { gzipSync } from 'node:zlib'
import { loadWorld } from '../src/data/package/defaultPackage'
import { createYouth } from '../src/data/generateYouth'
import { validatePackage } from '../src/data/package/validate'
import { advanceSeason } from '../src/engine/offseason'
import { DEFAULT_CONFIG, buildDelta, buildFull, createLeague, defaultLeagueConfig, diffWorlds, mergeChanges, processLeague } from '../src/engine/league'
import type { LeagueState, MirrorChange } from '../src/engine/league'
import { MS_HOUR } from '../src/engine/league/pace'
import { createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { measurementPackage } from './worldPackage'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]!
}
const DAYS = Number(arg('days', '90'))
const SEED = Number(arg('seed', '7'))
const q = (xs: number[], p: number) => [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`

const { pkg } = validatePackage(JSON.parse(JSON.stringify(measurementPackage(SEED))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(SEED, pkg)
const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
const firsts = (world.competitions ?? []).filter((c) => c.tier === 1)
const picks = firsts.slice(0, 4).map((c) => [...world.teams].filter((t) => c.teams.some((x) => x.id === t.id)).sort((a, b) => b.reputation - a.reputation)[0]!.id)
const seats = picks.map((teamId, i) => ({ teamId, playerId: `humano-${i + 1}` }))
const own = picks[0]!

let state: SeasonState = createSeason({ year: 2026, seed: 'cpu', teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, ...(world.cups ? { cupSpecs: world.cups } : {}) })
const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
let league: LeagueState = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('cpu'), true), state, seats, T0)
console.log(`mundo: ${state.teams.length} clubes, ${state.players.length} jogadores; técnico ${own}`)

const t0 = performance.now()
const fullPages: { ms: number; raw: number; gz: number }[] = []
for (let page = 0; page < 1 + Math.ceil(state.players.length / 2500); page++) {
  const s = performance.now()
  const text = JSON.stringify(buildFull(state, own, 0, page))
  fullPages.push({ ms: performance.now() - s, raw: text.length, gz: gzipSync(text).byteLength })
}
console.log(`carga completa: ${fullPages.length} páginas; tempo por página (mediana/máx) ${q(fullPages.map((p) => p.ms), 0.5).toFixed(0)}/${Math.max(...fullPages.map((p) => p.ms)).toFixed(0)} ms; tamanho bruto da maior ${kb(Math.max(...fullPages.map((p) => p.raw)))}; total comprimido ${kb(fullPages.reduce((n, p) => n + p.gz, 0))}`)

const diffMs: number[] = []
const buildMs: number[] = []
const changes: MirrorChange[] = []
const sizes: number[] = []
const gzs: number[] = []
let prev = state
let lastSync = state
let revs = 0
for (let t = T0; t < T0 + DAYS * 24 * MS_HOUR; t += 2 * MS_HOUR) {
  const r = processLeague(JSON.parse(JSON.stringify(league)) as LeagueState, state, t, { turn })
  league = r.league
  state = r.world
  if (state === prev) continue
  const s = performance.now()
  const change = diffWorlds(prev, state)
  diffMs.push(performance.now() - s)
  changes.push(change)
  prev = state
  revs++
  // O aparelho sincroniza a cada 3 revisões (≈ um evento): monta a atualização juntando as mudanças.
  if (changes.length === 3) {
    const b = performance.now()
    const text = JSON.stringify(buildDelta(state, own, revs, revs - 3, mergeChanges(changes)))
    buildMs.push(performance.now() - b)
    sizes.push(text.length)
    gzs.push(gzipSync(text).byteLength)
    changes.length = 0
    lastSync = state
  }
}
void lastSync
console.log(`${revs} revisões em ${DAYS} dias; comparar mundos (diffWorlds): mediana ${q(diffMs, 0.5).toFixed(1)} ms, p95 ${q(diffMs, 0.95).toFixed(1)} ms, pior ${Math.max(...diffMs).toFixed(0)} ms`)
console.log(`montar a atualização (3 revisões): mediana ${q(buildMs, 0.5).toFixed(1)} ms, p95 ${q(buildMs, 0.95).toFixed(1)} ms, pior ${Math.max(...buildMs).toFixed(0)} ms; tamanho bruto mediano ${kb(q(sizes, 0.5))}, comprimido mediano ${kb(q(gzs, 0.5))} (p95 ${kb(q(gzs, 0.95))})`)
console.log(`total desta medição ${((performance.now() - t0) / 1000).toFixed(0)} s`)
