/**
 * Fase 6C, parte C1: quanto tráfego custa um "espelho" do mundo da liga no aparelho do técnico.
 * Joga uma temporada do mundo (liga com técnicos humanos, resultado direto, como em `loadLeague`) e, a cada ponto de sincronização,
 * compara com o que o aparelho já tinha e conta os bytes comprimidos (gzip) de cada estratégia:
 *
 *   A  espelho completo: os pedaços do save (`planSeasonParts`) que mudaram (hoje o jeito do save na nuvem e do SQLite);
 *   D1 índice completo sem ocultos: cada jogador sem `hidden`, só os jogadores que mudaram; times públicos e todas as partidas que mudaram;
 *   D2 índice resumido: só o que a busca e as listas mostram (sem atributos nem estatísticas);
 *   M  o clube do técnico em detalhe: o time inteiro, o elenco, a base, o treino (camada 1).
 *
 *   PACOTE_REAL=1 node --expose-gc tools/run.mjs mirrorTraffic [--humans 4] [--days 400] [--seed 7] [--sync 1,3,7]
 *
 * `--sync` são intervalos de sincronização em dias do mundo (1 = a cada dia; 3 ≈ um evento; 7 = semanal).
 */
import { gzipSync } from 'node:zlib'
import { loadWorld } from '../src/data/package/defaultPackage'
import { createYouth } from '../src/data/generateYouth'
import { validatePackage } from '../src/data/package/validate'
import { advanceSeason } from '../src/engine/offseason'
import { DEFAULT_CONFIG, createLeague, defaultLeagueConfig, processLeague } from '../src/engine/league'
import type { LeagueState } from '../src/engine/league'
import { MS_HOUR } from '../src/engine/league/pace'
import { createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { playerOverall } from '../src/engine/overall'
import { planSeasonParts, sameRefs } from '../src/store/saveParts'
import type { Player } from '../src/engine/types/player'
import { measurementPackage } from './worldPackage'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]!
}
const HUMANS = Number(arg('humans', '4'))
const DAYS = Number(arg('days', '400'))
const SEED = Number(arg('seed', '7'))
const SYNCS = arg('sync', '1,3,7').split(',').map(Number)

const gz = (text: string): number => gzipSync(text).byteLength
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`
const mb = (n: number) => `${(n / 1048576).toFixed(2)} MB`
const q = (xs: number[], p: number) => [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0
const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0)

// ------------------------------------------------------------------ o que o técnico veria de cada entidade
const publicPlayer = (p: Player): Omit<Player, 'hidden'> => {
  const { hidden: _hidden, ...rest } = p
  return rest
}
/** O que a busca e as listas mostram, sem atributos nem estatísticas (variante enxuta). */
const lite = (p: Player) => [p.id, p.name, p.nickname ?? '', p.age, p.nationality, p.position, p.secondaryPositions.join(), p.teamId, Math.round(playerOverall(p)), p.contract.salary, p.contract.endDate, p.condition.injuryDaysLeft, p.seasonStats.goals, p.seasonStats.assists]
/** Jogador de outro clube para o aparelho (D3): atributos inteiros (o que a tela mostra), condição reduzida a lesão e suspensão. */
const roundedPlayer = (p: Player) => ({
  ...publicPlayer(p),
  attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, Math.round(v as number)])),
  condition: { injuryDaysLeft: p.condition.injuryDaysLeft, suspensionGames: p.condition.suspensionGames, yellowCards: p.condition.yellowCards, redCards: p.condition.redCards },
})
/** D4: o jogador em grupos de campos; só os grupos que mudaram vão ao aparelho (em vez do registro inteiro). */
const groupsOf = (p: Player): Record<string, string> => {
  const r = roundedPlayer(p)
  const { attributes, seasonStats, condition, ...rest } = r
  return { a: JSON.stringify(attributes), s: JSON.stringify(seasonStats), c: JSON.stringify(condition), r: JSON.stringify(rest) }
}
const attrKey = (p: Player) => JSON.stringify(p.attributes)
const roundedAttrKey = (p: Player) => JSON.stringify(Object.values(p.attributes).map((v) => Math.round(v as number)))
const publicTeam = (t: SeasonState['teams'][number]) => ({ ...t, tactic: undefined, finances: undefined, objective: undefined })

interface Snapshot {
  full: Map<string, string>
  lite: Map<string, string>
  teams: Map<string, string>
  d3: Map<string, string>
  groups: Map<string, Record<string, string>>
  attrs: Map<string, string>
  rattrs: Map<string, string>
  cond: Map<string, string>
  matches: Map<string, string>
  own: Map<string, string>
  parts: Map<string, readonly unknown[]>
}

function snapshot(state: SeasonState, ownTeam: string, previous?: Snapshot): Snapshot {
  const full = new Map<string, string>()
  const liteMap = new Map<string, string>()
  for (const p of state.players) {
    full.set(p.id, JSON.stringify(publicPlayer(p)))
    liteMap.set(p.id, JSON.stringify(lite(p)))
  }
  const d3 = new Map(state.players.map((p) => [p.id, JSON.stringify(roundedPlayer(p))] as const))
  const groups = new Map(state.players.map((p) => [p.id, groupsOf(p)] as const))
  const attrs = new Map(state.players.map((p) => [p.id, attrKey(p)] as const))
  const rattrs = new Map(state.players.map((p) => [p.id, roundedAttrKey(p)] as const))
  const cond = new Map(state.players.map((p) => [p.id, JSON.stringify(p.condition)] as const))
  const teams = new Map(state.teams.map((t) => [t.id, JSON.stringify(publicTeam(t))] as const))
  const matches = new Map<string, string>()
  // Partidas: o texto muda só quando o jogo é decidido; reaproveita o texto anterior se a referência é a mesma.
  for (const m of state.matches) matches.set(m.id, JSON.stringify(m))
  const own = new Map<string, string>()
  const t = state.teams.find((x) => x.id === ownTeam)
  if (t) own.set('team', JSON.stringify(t))
  for (const p of state.players) if (p.teamId === ownTeam) own.set(p.id, JSON.stringify(p))
  for (const p of state.academy) if (p.teamId === ownTeam) own.set(`a-${p.id}`, JSON.stringify(p))
  own.set('training', JSON.stringify({ plan: state.training.plans[ownTeam], individual: state.training.individual[ownTeam] }))
  own.set('market', JSON.stringify(state.market))
  void previous
  const parts = new Map(planSeasonParts(state).map((pl) => [pl.name, pl.refs] as const))
  return { full, lite: liteMap, d3, groups, attrs, rattrs, cond, teams, matches, own, parts }
}

/** Entidades que mudaram entre dois instantâneos: lista de textos (a mensagem que iria ao aparelho). */
function changed(prev: Map<string, string>, next: Map<string, string>): string[] {
  const out: string[] = []
  for (const [k, v] of next) if (prev.get(k) !== v) out.push(v)
  return out
}

// ------------------------------------------------------------------ o mundo e a liga (como em loadLeague)
const { pkg } = validatePackage(JSON.parse(JSON.stringify(measurementPackage(SEED))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(SEED, pkg)
const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
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
const own = picks[0]!

let state: SeasonState = createSeason({ year: 2026, seed: 'espelho', teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, ...(world.cups ? { cupSpecs: world.cups } : {}) })
const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
let league: LeagueState = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('espelho'), true), state, seats, T0)
console.log(`mundo: ${state.teams.length} clubes, ${state.players.length} jogadores, ${state.matches.length} partidas; técnico medido: ${own}`)

// ------------------------------------------------------------------ download inicial
const t0 = snapshot(state, own)
const initial = {
  'A  pedaços do save (espelho completo)': gz(JSON.stringify(planSeasonParts(state).map((pl) => pl.build()))),
  'D1 jogadores sem ocultos': gz(JSON.stringify([...t0.full.values()])),
  'D3 jogadores, atributos inteiros, condição reduzida': gz(JSON.stringify([...t0.d3.values()])),
  'D2 jogadores resumidos': gz(JSON.stringify([...t0.lite.values()])),
  '   times públicos': gz(JSON.stringify([...t0.teams.values()])),
  '   partidas da temporada': gz(JSON.stringify([...t0.matches.values()])),
  'M  meu clube (time, elenco, base, treino, mercado)': gz(JSON.stringify([...t0.own.values()])),
}
console.log('\nDownload inicial (gzip):')
for (const [k, v] of Object.entries(initial)) console.log(`  ${k.padEnd(52)} ${mb(v)}`)
console.log(`  texto sem comprimir: jogadores sem ocultos ${mb(sum([...t0.full.values()].map((s) => s.length)))}, estado inteiro ${mb(JSON.stringify(state).length)}`)

// ------------------------------------------------------------------ a temporada, com vários intervalos de sincronização
interface Acc {
  A: number[]
  D1p: number[]
  D1t: number[]
  D1m: number[]
  D2: number[]
  D3: number[]
  D4: number[]
  nAttr: number[]
  nRound: number[]
  nCond: number[]
  M: number[]
  fullChanged: number[]
}
const accs = new Map<number, Acc>(SYNCS.map((s) => [s, { A: [], D1p: [], D1t: [], D1m: [], D2: [], D3: [], D4: [], nAttr: [], nRound: [], nCond: [], M: [], fullChanged: [] }]))
const last = new Map<number, Snapshot>(SYNCS.map((s) => [s, t0]))
const pyramids = [...new Set(seats.map((s) => state.teams.find((t) => t.id === s.teamId)?.country as string))]
const yearsAtStart = Object.fromEntries(Object.entries(state.cycles).map(([p, c]) => [p, c.year]))
const turned = (): boolean => pyramids.every((p) => (state.cycles[p]?.year ?? 0) > (yearsAtStart[p] ?? 0))

const deadline = T0 + DAYS * 24 * MS_HOUR
let lastDay = -1
let reason = 'limite de dias'
for (let t = T0; t < deadline; t += 2 * MS_HOUR) {
  const r = processLeague(JSON.parse(JSON.stringify(league)) as LeagueState, state, t, { turn })
  league = r.league
  state = r.world
  const day = Math.floor((t - T0) / (24 * MS_HOUR))
  if (day === lastDay) continue
  lastDay = day
  for (const s of SYNCS) {
    if (day === 0 || day % s !== 0) continue
    const prev = last.get(s)!
    const next = snapshot(state, own)
    const acc = accs.get(s)!
    // A: os pedaços cujas referências mudaram
    let a = 0
    const changedParts: unknown[] = []
    for (const pl of planSeasonParts(state)) if (!sameRefs(prev.parts.get(pl.name), pl.refs)) changedParts.push(pl.build())
    a = gz(JSON.stringify(changedParts))
    const dp = changed(prev.full, next.full)
    acc.A.push(a)
    acc.D1p.push(gz(JSON.stringify(dp)))
    acc.D1t.push(gz(JSON.stringify(changed(prev.teams, next.teams))))
    acc.D1m.push(gz(JSON.stringify(changed(prev.matches, next.matches))))
    const patches: string[] = []
    for (const [id, g] of next.groups) {
      const old = prev.groups.get(id)
      const diff: Record<string, string> = {}
      for (const k of Object.keys(g)) if (old?.[k] !== g[k]) diff[k] = g[k]!
      if (Object.keys(diff).length > 0) patches.push(JSON.stringify([id, diff]))
    }
    acc.D4.push(gz(JSON.stringify(patches)))
    acc.D3.push(gz(JSON.stringify(changed(prev.d3, next.d3))))
    acc.nAttr.push(changed(prev.attrs, next.attrs).length)
    acc.nRound.push(changed(prev.rattrs, next.rattrs).length)
    acc.nCond.push(changed(prev.cond, next.cond).length)
    acc.D2.push(gz(JSON.stringify(changed(prev.lite, next.lite))))
    acc.M.push(gz(JSON.stringify(changed(prev.own, next.own))))
    acc.fullChanged.push(dp.length)
    last.set(s, next)
  }
  if (turned()) {
    reason = 'todos os países dos técnicos viraram a temporada'
    break
  }
}
console.log(`\nSimulados ${lastDay + 1} dias do mundo (parou: ${reason}).`)

console.log('\nTráfego por sincronização (gzip). D1 = jogadores sem ocultos + times + partidas que mudaram; M já está dentro de D1 para o seu clube (o time completo e a base é que não).')
for (const s of SYNCS) {
  const a = accs.get(s)!
  const d1 = a.D1p.map((v, i) => v + a.D1t[i]! + a.D1m[i]!)
  const d2 = a.D2.map((v, i) => v + a.D1t[i]! + a.D1m[i]!)
  const perMonthFactor = 30 / s
  console.log(`\nSincronização a cada ${s} dia(s) do mundo (${a.A.length} sincronizações):`)
  const row = (label: string, xs: number[]) =>
    console.log(`  ${label.padEnd(36)} mediana ${kb(q(xs, 0.5)).padStart(8)}  p95 ${kb(q(xs, 0.95)).padStart(8)}  máx ${kb(Math.max(...xs)).padStart(8)}  por mês do mundo ${mb(sum(xs) / xs.length * perMonthFactor)}`)
  row('A  pedaços do save', a.A)
  row('D1 índice completo sem ocultos', d1)
  row('   jogadores', a.D1p)
  row('   times', a.D1t)
  row('   partidas', a.D1m)
  row('D3 sem ocultos, atributos inteiros', a.D3.map((v, i) => v + a.D1t[i]! + a.D1m[i]!))
  row('D4 como D3, só os grupos que mudaram', a.D4.map((v, i) => v + a.D1t[i]! + a.D1m[i]!))
  row('D2 índice resumido', d2)
  row('M  só o meu clube em detalhe', a.M)
  console.log(`  mudaram (mediana): atributos exatos ${q(a.nAttr, 0.5)}, atributos inteiros ${q(a.nRound, 0.5)}, condição ${q(a.nCond, 0.5)}`)
  console.log(`  jogadores que mudaram por sincronização (mediana/p95): ${q(a.fullChanged, 0.5)} / ${q(a.fullChanged, 0.95)} de ${state.players.length}`)
}
console.log('\nLeitura: "por mês do mundo" = média por sincronização x (30 / dias entre sincronizações). Um mês do mundo é ~10 a 15 dias reais no ritmo Normal (3 dias de jogo por dia real).')
