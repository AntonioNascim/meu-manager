/**
 * Memória ao longo de várias temporadas no mundo de 282 clubes com os calendários reais (Europa atravessando o ano): joga ano a ano com o
 * relógio único e imprime o uso de memória, o tamanho do estado (jogos, histórico do mercado, arquivo) e o tempo de cada ano.
 * Uso: node tools/run.mjs memRun [--years 6]
 */
import { createYouth } from '../src/data/generateYouth'
import { FULL_WORLD, buildScaleWorld } from '../src/diagnostics/scaleWorld'
import { advanceSeason } from '../src/engine/offseason'
import { advanceUntil, createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'

const args = process.argv.slice(2)
const years = Number(args.includes('--years') ? args[args.indexOf('--years') + 1] : 6)
const world = buildScaleWorld(FULL_WORLD, 7)
const competitions = world.competitions.map((c) => (c.region === 'EU' ? { ...c, split: true, start: [8, 8] as [number, number] } : c))
let state: SeasonState = createSeason({ year: 2026, seed: 'mem', teams: world.teams, players: world.players, academy: world.academy, competitions, focus: 'br' })
const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
const mb = (x: number) => `${Math.round(x / 1048576)} MB`
for (let y = 1; y <= years; y++) {
  const t = performance.now()
  state = advanceUntil(state, `${2026 + y}-06-30`, { market: true, turn }).state
  const m = process.memoryUsage()
  console.log(
    `${y}: ${((performance.now() - t) / 1000).toFixed(0)} s · heap ${mb(m.heapUsed)} · rss ${mb(m.rss)} · jogos ${state.matches.length} · histórico ${state.market.history.length} · jogadores ${state.players.length} · base ${state.academy.length} · ofertas ${state.market.offers.length} · anúncios ${state.market.listings.length} · pré ${state.market.preContracts.length} · copas ${state.cups?.length ?? 0}`,
  )
}
