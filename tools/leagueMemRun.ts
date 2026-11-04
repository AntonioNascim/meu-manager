/**
 * Memória e tempo da liga online com o mundo real (Fase 6, B6): joga um ano de calendário do mundo de 370 clubes em dois modos e imprime o heap vivo
 * (depois do coletor), o pico entre passos, o tamanho do estado e o tempo.
 *   solo   — como a carreira solo (foco no Brasil: o resto simplificado), a referência da B5;
 *   league — liga online com 4 técnicos humanos em 4 países, resultado direto, tempo simulado (passos de 2 h): fidelidade por partida, passagem diária,
 *            eventos, e a virada de temporada dos países.
 * Uso: PACOTE_REAL=1 node --expose-gc tools/run.mjs leagueMemRun [--mode solo|league] [--days 365]
 */
import { loadWorld } from '../src/data/package/defaultPackage'
import { createYouth } from '../src/data/generateYouth'
import { validatePackage } from '../src/data/package/validate'
import { advanceSeason } from '../src/engine/offseason'
import { DEFAULT_CONFIG, createLeague, defaultLeagueConfig, processLeague } from '../src/engine/league'
import type { LeagueState } from '../src/engine/league'
import { MS_HOUR } from '../src/engine/league/pace'
import { advanceUntil, createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { measurementPackage } from './worldPackage'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]!
}
const mode = arg('mode', 'league')
const days = Number(arg('days', '365'))

const { pkg } = validatePackage(JSON.parse(JSON.stringify(measurementPackage(7))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(7, pkg)
const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
const mb = (x: number) => `${Math.round(x / 1048576)} MB`
const gc = () => (globalThis as { gc?: () => void }).gc?.()

// Os 4 maiores clubes de 4 primeiras divisões diferentes.
const firsts = (world.competitions ?? []).filter((c) => c.tier === 1).slice(0, 4)
const seats = firsts.map((c, i) => {
  const best = [...world.teams].filter((t) => c.teams.some((x) => x.id === t.id)).sort((a, b) => b.reputation - a.reputation)[0]!
  return { teamId: best.id, playerId: `humano-${i + 1}` }
})

const base = createSeason({ year: 2026, seed: 'mem', teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, ...(mode === 'solo' ? { focus: 'Brazil' } : {}), ...(world.cups ? { cupSpecs: world.cups } : {}) })
let state: SeasonState = base
console.log(`modo ${mode}: ${state.teams.length} clubes, ${state.players.length} jogadores, ${state.matches.length} partidas${mode === 'league' ? `, ${seats.length} humanos (${seats.map((s) => s.teamId).join(', ')})` : ''}`)

gc()
const start = process.memoryUsage()
let peak = start.heapUsed
let peakLive = 0
const t0 = performance.now()
const startDate = state.season.currentDate

if (mode === 'solo') {
  const target = new Date(Date.parse(startDate) + days * 86_400_000).toISOString().slice(0, 10)
  for (let k = 1; k <= 12; k++) {
    const stop = new Date(Date.parse(startDate) + (days * k * 86_400_000) / 12).toISOString().slice(0, 10)
    state = advanceUntil(state, stop, { market: true, turn }).state
    peak = Math.max(peak, process.memoryUsage().heapUsed)
    gc()
    peakLive = Math.max(peakLive, process.memoryUsage().heapUsed)
  }
  console.log(`até ${target}`)
} else {
  const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
  const deps = { turn }
  let league: LeagueState = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('mem-liga'), true), state, seats, T0)
  const stopDate = new Date(Date.parse(startDate) + days * 86_400_000).toISOString().slice(0, 10)
  let steps = 0
  let events = 0
  for (let t = T0; state.season.currentDate < stopDate && steps < 20_000; t += 2 * MS_HOUR, steps++) {
    const r = processLeague(JSON.parse(JSON.stringify(league)) as LeagueState, state, t, deps)
    league = r.league
    state = r.world
    events += r.actions.filter((a) => a.type === 'event-started').length
    peak = Math.max(peak, process.memoryUsage().heapUsed)
    if (steps % 120 === 0) {
      gc()
      peakLive = Math.max(peakLive, process.memoryUsage().heapUsed)
    }
  }
  console.log(`passos de 2 h: ${steps} (${(steps / 12).toFixed(0)} dias reais) · eventos humanos: ${events} · data do mundo ${state.season.currentDate} · estado da liga ${JSON.stringify(league).length} bytes`)
}
const ms = performance.now() - t0
gc()
const end = process.memoryUsage()
console.log(`tempo ${(ms / 1000).toFixed(0)} s · heap no começo ${mb(start.heapUsed)} · heap vivo no fim ${mb(end.heapUsed)} · maior heap vivo medido ${mb(peakLive)} · pico com lixo ${mb(peak)} · rss ${mb(end.rss)}`)
console.log(`mundo no fim: jogos ${state.matches.length} · jogadores ${state.players.length} · histórico ${state.market.history.length} · texto do mundo ${mb(JSON.stringify(state).length)}`)
