/**
 * Medição de escala (Fase 2, parte A): um mundo fictício do tamanho do plano (Brasil A/B/C, seis ligas da América do
 * Sul, seis da Europa) jogado lance a lance pelo mesmo caminho do jogo (`advanceToMatchday` + `playPendingAuto`).
 * Mede tempo por avanço e por temporada, memória, tamanho e tempo do save. Não altera o jogo.
 *
 * Uso: node --expose-gc tools/run.mjs worldScale [--world full|base|brazil] [--seed 7] [--offseason]
 */
import os from 'node:os'
import { gzipSync } from 'node:zlib'
import { playerOverall } from '../src/engine/overall'
import { BRAZIL_ONLY, FULL_WORLD, buildScaleGame } from '../src/diagnostics/scaleWorld'
import type { LeagueSpec } from '../src/diagnostics/scaleWorld'
import { simulateMatch } from '../src/engine/match'
import { createRng } from '../src/engine/rng'
import type { Player, Team } from '../src/engine/types'
import { advanceToMatchday, createGame, nextEventOf, playPendingAuto, startNextSeason } from '../src/store/game'
import type { Game } from '../src/store/game'
import { makeEnvelope } from '../src/store/saveFormat'

const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
const gc = () => (globalThis as { gc?: () => void }).gc?.()
const heap = () => {
  gc()
  return process.memoryUsage().heapUsed
}
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] as number

function saveCost(game: Game) {
  const t0 = performance.now()
  const envelope = makeEnvelope(game, 'x')
  const t1 = performance.now()
  const json = JSON.stringify(envelope)
  const t2 = performance.now()
  structuredClone(envelope)
  const t3 = performance.now()
  return { bytes: json.length, compactMs: t1 - t0, stringifyMs: t2 - t1, cloneMs: t3 - t2 }
}

/** Custo de uma partida simulada lance a lance (média de uma amostra). */
function matchCost(game: Game, sample = 200): number {
  const s = game.season
  const squads = new Map<string, Player[]>()
  for (const p of s.players) {
    if (!p.teamId) continue
    const list = squads.get(p.teamId)
    if (list) list.push(p)
    else squads.set(p.teamId, [p])
  }
  const scheduled = s.matches.filter((m) => m.status === 'scheduled').slice(0, sample)
  const teams = new Map(s.teams.map((t) => [t.id, t]))
  const t0 = performance.now()
  for (const m of scheduled) {
    simulateMatch({
      home: { team: teams.get(m.homeTeamId) as Team, players: squads.get(m.homeTeamId) ?? [] },
      away: { team: teams.get(m.awayTeamId) as Team, players: squads.get(m.awayTeamId) ?? [] },
      seed: m.seed,
      attendance: 20000,
    })
  }
  return (performance.now() - t0) / scheduled.length
}


/** Valores sem os nomes dos campos (arrays), para medir quanto do save são só chaves repetidas. */
function packed(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(packed)
  if (v && typeof v === 'object') return Object.values(v).map(packed)
  return v
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`

/** Estudo do save no fim da temporada: compressão, chaves repetidas e o que cada parte pesaria se simplificada. */
function saveStudy(game: Game, userLeagueId: string) {
  const env = makeEnvelope(game, 'x')
  const json = JSON.stringify(env)
  let t = performance.now()
  const gz = gzipSync(json, { level: 6 })
  const gzMs = performance.now() - t
  console.log(`-- estudo do save no fim da temporada --`)
  console.log(`JSON ${kb(json.length)}; gzip ${kb(gz.length)} (${(json.length / gz.length).toFixed(1)}x, ${gzMs.toFixed(0)} ms para comprimir)`)
  const g = env.game.season
  const size = (v: unknown) => JSON.stringify(v).length
  const players = size(g.players)
  console.log(`jogadores: ${kb(players)} em JSON; só os valores (sem nomes de campos): ${kb(size(packed(g.players)))}; ${(players / g.players.length).toFixed(0)} bytes por jogador`)
  const userTeams = new Set(g.season.competitions.find((c) => c.id === userLeagueId)?.teamIds ?? [])
  const inFocus = (id: string | null) => id !== null && userTeams.has(id)
  const focusPlayers = g.players.filter((p) => inFocus(p.teamId))
  const restPlayers = g.players.filter((p) => !inFocus(p.teamId))
  console.log(`jogadores da liga do técnico (${focusPlayers.length}): ${kb(size(focusPlayers))}; das outras ligas (${restPlayers.length}): ${kb(size(restPlayers))} em JSON, ${kb(size(packed(restPlayers)))} só valores`)
  const focusMatches = g.matches.filter((m) => m.competitionId === userLeagueId)
  const restMatches = g.matches.filter((m) => m.competitionId !== userLeagueId)
  const tuples = restMatches.map((m) => [m.homeTeamId, m.awayTeamId, m.result?.homeGoals, m.result?.awayGoals, m.result?.homeStats.yellowCards, m.result?.awayStats.yellowCards, m.result?.homeStats.redCards, m.result?.awayStats.redCards, m.round])
  console.log(`partidas: liga do técnico ${focusMatches.length} = ${kb(size(focusMatches))}; outras ${restMatches.length} = ${kb(size(restMatches))} em JSON, ${kb(size(tuples))} só com placar e cartões`)
  const academyRest = g.academy.filter((p) => !inFocus(p.teamId))
  console.log(`base: ${g.academy.length} jovens = ${kb(size(g.academy))}; fora da liga do técnico ${academyRest.length} = ${kb(size(academyRest))}`)
  console.log(`times: ${kb(size(g.teams))}; livro-caixa dos clubes: ${kb(size(g.teams.map((tm) => tm.finances.ledger)))}, temporadas passadas: ${kb(size(g.teams.map((tm) => tm.finances.pastSeasons)))}`)
  const simplified = focusPlayers.length ? size(focusPlayers) + size(packed(restPlayers)) + size(focusMatches) + size(tuples) + size(g.academy.filter((p) => inFocus(p.teamId))) + size(g.teams) + size(g.market) : 0
  const teamsLean = g.teams.map((tm) => (inFocus(tm.id) ? tm : { ...tm, finances: { ...tm.finances, ledger: [] } }))
  const scenario = { focusPlayers, rest: packed(restPlayers), focusMatches, tuples, academy: g.academy.filter((p) => inFocus(p.teamId)), teams: teamsLean, market: g.market, season: g.season }
  const scenarioJson = JSON.stringify(scenario)
  console.log(`cenário B (igual ao anterior, mas sem o livro-caixa dos clubes da IA): ${kb(scenarioJson.length)} em JSON, ${kb(gzipSync(scenarioJson, { level: 6 }).length)} com gzip`)
  console.log(`cenário: só a liga do técnico completa, o resto em valores sem chaves + partidas só com placar + base só da liga do técnico: ${kb(simplified)}`)
}

/** Custo de um resultado simplificado (força dos 11 melhores + Poisson), para comparar com a partida lance a lance. */
function quickSimBench(game: Game): void {
  const squads = new Map<string, number[]>()
  for (const p of game.season.players) {
    if (!p.teamId) continue
    const list = squads.get(p.teamId) ?? squads.set(p.teamId, []).get(p.teamId)!
    list.push(playerOverall(p))
  }
  const rng = createRng('bench')
  const strength = (id: string) => (squads.get(id) ?? []).sort((a, b) => b - a).slice(0, 11).reduce((a, b) => a + b, 0) / 11
  const poisson = (mean: number) => {
    const limit = Math.exp(-mean)
    let k = 0
    let prod = rng.next()
    while (prod > limit) {
      k++
      prod *= rng.next()
    }
    return k
  }
  const matches = game.season.matches
  const t0 = performance.now()
  let goals = 0
  for (const m of matches) {
    const diff = (strength(m.homeTeamId) - strength(m.awayTeamId)) / 100
    goals += poisson(1.45 * Math.exp(0.6 * diff + 0.1)) + poisson(1.15 * Math.exp(-0.6 * diff))
  }
  const ms = (performance.now() - t0) / matches.length
  console.log(`resultado simplificado: ${(ms * 1000).toFixed(0)} µs por partida (com a força recalculada a cada jogo), ${(goals / matches.length).toFixed(2)} gols por jogo`)
}

function run(label: string, specs: LeagueSpec[] | null, seed: number, offseason: boolean) {
  const heapBase = heap()
  const built = specs ? buildScaleGame(specs, seed) : { game: createGame(seed, 'team-imp'), genMs: NaN, seasonMs: NaN }
  let game = built.game
  // A diretoria não demite (no mundo sintético isso já foi feito na criação).
  game = { ...game, season: { ...game.season, teams: game.season.teams.map((t) => (t.id === game.userTeamId ? { ...t, objective: { targetPosition: 20, sackingPosition: 20 } } : t)) } }
  const s = game.season
  console.log(`\n=== ${label} ===`)
  console.log(`clubes ${s.teams.length}, jogadores ${s.players.length} (+${s.academy.length} na base), partidas ${s.matches.length}, ligas ${s.season.competitions.length}`)
  console.log(`geração do mundo ${built.genMs.toFixed(0)} ms, tabela da temporada ${built.seasonMs.toFixed(0)} ms`)
  const heap0 = heap()
  const msPerMatch = matchCost(game)
  const save0 = saveCost(game)
  console.log(`memória do jogo no início: ${mb(heap0 - heapBase)} MB líquidos (heap após coleta, sem o código do programa); uma partida lance a lance: ${msPerMatch.toFixed(2)} ms`)
  console.log(`save no início: ${(save0.bytes / 1024).toFixed(0)} KB (compactar ${save0.compactMs.toFixed(0)} ms, JSON ${save0.stringifyMs.toFixed(0)} ms, clone p/ IndexedDB ${save0.cloneMs.toFixed(0)} ms)`)

  const clicks: number[] = []
  const dates: string[] = []
  const perDayMatches: number[] = []
  let peak = 0
  let live = 0
  const trackLive = process.argv.includes('--live')
  let midSave: ReturnType<typeof saveCost> | undefined
  const total = s.matches.length
  const wall = performance.now()
  for (let i = 0; i < 600 && nextEventOf(game).type !== 'season-end'; i++) {
    const t = performance.now()
    game = playPendingAuto(advanceToMatchday(game))
    if (game.dismissal) {
      console.log(`(demitido no avanço ${i}: ${game.dismissal})`)
      break
    }
    clicks.push(performance.now() - t)
    dates.push(game.season.season.currentDate)
    perDayMatches.push(game.lastDay.length)
    peak = Math.max(peak, process.memoryUsage().heapUsed)
    if (trackLive) live = Math.max(live, heap() - heapBase)
    if (!midSave && game.season.matches.filter((m) => m.status === 'finished').length >= total / 2) midSave = saveCost(game)
  }
  game = advanceToMatchday(game)
  const seasonMs = performance.now() - wall
  const sum = clicks.reduce((a, b) => a + b, 0)
  console.log(`temporada inteira: ${(seasonMs / 1000).toFixed(1)} s em ${clicks.length} avanços (um avanço = até o próximo dia de jogos do técnico)`)
  console.log(`por avanço: mediana ${pct(clicks, 0.5).toFixed(0)} ms, p95 ${pct(clicks, 0.95).toFixed(0)} ms, máximo ${Math.max(...clicks).toFixed(0)} ms; partidas por avanço: mediana ${pct(perDayMatches, 0.5)}, máx ${Math.max(...perDayMatches)}`)
  const slow = clicks.map((ms, i) => ({ ms, date: dates[i] })).sort((a, b) => b.ms - a.ms).slice(0, 4)
  console.log(`avanços mais lentos: ${slow.map((x) => `${x.date} ${x.ms.toFixed(0)} ms`).join('; ')}`)
  console.log(`soma dos avanços ${(sum / 1000).toFixed(1)} s; simulação pura estimada ${((total * msPerMatch) / 1000).toFixed(1)} s (${total} partidas)`)
  if (trackLive) console.log(`memória viva (depois de coletar o lixo a cada avanço): pico ${mb(live)} MB líquidos`)
  console.log(`memória: pico durante a temporada ${mb(peak)} MB (com lixo), no fim da temporada ${mb(heap())} MB depois da coleta`)
  if (midSave) console.log(`save no meio: ${(midSave.bytes / 1024).toFixed(0)} KB (compactar ${midSave.compactMs.toFixed(0)} ms, JSON ${midSave.stringifyMs.toFixed(0)} ms, clone ${midSave.cloneMs.toFixed(0)} ms)`)
  const end = saveCost(game)
  const raw = JSON.stringify(game).length
  console.log(`save no fim: ${(end.bytes / 1024).toFixed(0)} KB (sem compactar ${(raw / 1024).toFixed(0)} KB; compactar ${end.compactMs.toFixed(0)} ms, JSON ${end.stringifyMs.toFixed(0)} ms, clone ${end.cloneMs.toFixed(0)} ms)`)
  const part = (name: string, v: unknown) => `${name} ${(JSON.stringify(v).length / 1024).toFixed(0)} KB`
  const env = makeEnvelope(game, 'x').game
  console.log(`composição do save no fim: ${[part('jogadores', env.season.players), part('base', env.season.academy), part('partidas', env.season.matches), part('times', env.season.teams), part('mercado', env.season.market), part('treino', env.season.training)].join(', ')}`)
  if (specs) saveStudy(game, specs[0]?.id ?? 'br-1')
  else saveStudy(game, 'serie-a')
  quickSimBench(game)
  if (offseason) {
    const t = performance.now()
    try {
      const next = startNextSeason(game)
      console.log(`virada de temporada: ${(performance.now() - t).toFixed(0)} ms (${next.season.matches.length} partidas na temporada nova)`)
    } catch (e) {
      console.log(`virada de temporada falhou (o motor ainda assume 2 séries): ${(e as Error).message}`)
    }
  }
}

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const seed = Number(opt('seed', '7'))
const which = opt('world', 'full')
console.log(`Máquina de medição: ${os.cpus()[0]?.model}, ${os.cpus().length} núcleos, ${(os.totalmem() / 1e9).toFixed(1)} GB, Node ${process.version}`)
const offseason = args.includes('--offseason')
if (which === 'base') run('Mundo atual (Série A + B, 40 clubes)', null, seed, offseason)
else if (which === 'brazil') run('Brasil A + B + C (60 clubes)', BRAZIL_ONLY, seed, offseason)
else run('Mundo do plano (15 ligas)', FULL_WORLD, seed, offseason)
