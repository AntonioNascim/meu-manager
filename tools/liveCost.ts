/**
 * Fase 6C, C5: custo no servidor da velocidade individual da partida ao vivo. Joga um evento ao vivo (técnicos humanos de ligas diferentes, todos conectados)
 * passo a passo, no ritmo do alarme da sala (segundos cheios), com cada técnico sorteando a velocidade (1x, 2x, 4x ou 8x), e conta: quanto dura o evento no
 * relógio real, quantos despertares do alarme, a CPU de cada passo e o tamanho dos quadros enviados.
 *
 *   PACOTE_REAL=1 node --expose-gc tools/run.mjs liveCost [--humans 10] [--seed 7] [--speeds mix|1|2|4|8]
 */
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { DEFAULT_CONFIG, createLeague, defaultLeagueConfig, nextWakeAt, processLeague, readyForSecondHalf, setSpeed, startLiveEvent, stepLiveEvent, viewOf, isFinished } from '../src/engine/league'
import type { LeagueState, LiveEvent } from '../src/engine/league'
import { MS_MINUTE } from '../src/engine/league/pace'
import { BASE_MINUTE_MS } from '../src/engine/match/timing'
import { createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { advanceSeason } from '../src/engine/offseason'
import { createYouth } from '../src/data/generateYouth'
import { frameSince } from '../src/online/liveProtocol'
import type { Cursor } from '../src/online/liveProtocol'
import { measurementPackage } from './worldPackage'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]!
}
const HUMANS = Number(arg('humans', '10'))
const SEED = Number(arg('seed', '7'))
const MODE = arg('speeds', 'mix')
const q = (xs: number[], p: number) => [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0

const { pkg } = validatePackage(JSON.parse(JSON.stringify(measurementPackage(SEED))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(SEED, pkg)
const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
const firsts = (world.competitions ?? []).filter((c) => c.tier === 1)
const picks: string[] = []
for (const c of firsts) {
  const t = [...world.teams].filter((x) => c.teams.some((y) => y.id === x.id)).sort((a, b) => b.reputation - a.reputation)[0]
  if (t && picks.length < HUMANS) picks.push(t.id)
}
const seats = picks.map((teamId, i) => ({ teamId, playerId: `humano-${i + 1}` }))
const state0 = createSeason({ year: 2026, seed: 'custo', teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, ...(world.cups ? { cupSpecs: world.cups } : {}) })
const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
let stepped = { league: createLeague(defaultLeagueConfig(DEFAULT_CONFIG('custo'), false), state0, seats, T0), world: state0, actions: [] as never[] }
let now = T0
for (let i = 0; i < 24 * 120 && !stepped.league.current; i++) {
  now = T0 + i * 30 * MS_MINUTE
  stepped = processLeague(JSON.parse(JSON.stringify(stepped.league)) as LeagueState, stepped.world, now, { turn }) as typeof stepped
}
if (!stepped.league.current) throw new Error('nenhum evento ao vivo achado')
const humanPlayers = stepped.league.seats.map((s) => s.playerId)
const event0: LiveEvent = startLiveEvent(stepped.league, stepped.world, now, BASE_MINUTE_MS, humanPlayers)
const playing = stepped.league.seats.filter((s) => event0.games.some((g) => g.homeTeamId === s.teamId || g.awayTeamId === s.teamId))
console.log(`mundo: ${world.teams.length} clubes; evento com ${event0.games.length} partidas e ${playing.length} técnicos jogando de ${seats.length}`)
const speeds = [1, 2, 4, 8]
for (const [i, s] of playing.entries()) setSpeed(event0, stepped.league.seats, s.playerId, MODE === 'mix' ? (speeds[i % 4] as number) : Number(MODE))

let ev = event0
let t = now
let wakeups = 0
const cpu: number[] = []
const sizes: number[] = []
let frames = 0
let cursor: Cursor = {}
let lastWake = now
let half = 0
while (!isFinished(ev) && t < now + 30 * 60_000) {
  const wake = nextWakeAt(ev, t)
  if (wake === undefined) break
  t = Math.max(t, wake)
  // Quem está no intervalo toca em Voltar ao jogo depois de 20 s (o técnico que ajusta o time).
  for (const g of ev.games) if (g.halftime && t - (g.halftime.until - 60_000) >= 20_000) for (const s of playing) readyForSecondHalf(ev, stepped.league.seats, s.playerId, t)
  const c0 = process.cpuUsage()
  ev = stepLiveEvent(ev, stepped.league.seats, t).event
  const { frame, cursor: next } = frameSince(ev, viewOf(ev, stepped.league.seats, t), cursor)
  cursor = next
  cpu.push((process.cpuUsage(c0).user + process.cpuUsage(c0).system) / 1000)
  if (frame) {
    frames++
    sizes.push(JSON.stringify(frame).length)
  }
  wakeups++
  lastWake = t
  half += ev.games.filter((g) => g.halftime).length > 0 ? 1 : 0
}
const total = (lastWake - now) / 1000
const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0)
console.log(`velocidades: ${MODE}; evento durou ${total.toFixed(0)} s de relógio real (${(total / 60).toFixed(1)} min); despertares do alarme: ${wakeups}; quadros enviados: ${frames} (${(sum(sizes) / 1024).toFixed(0)} KB no total, mediana ${(q(sizes, 0.5) / 1024).toFixed(1)} KB, p95 ${(q(sizes, 0.95) / 1024).toFixed(1)} KB)`)
console.log(`CPU por despertar: mediana ${q(cpu, 0.5).toFixed(1)} ms, p95 ${q(cpu, 0.95).toFixed(1)} ms, pior ${Math.max(...cpu).toFixed(0)} ms; CPU total ${(sum(cpu) / 1000).toFixed(1)} s; passos em intervalo: ${half}`)
