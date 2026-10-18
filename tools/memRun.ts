/**
 * Memória ao longo de várias temporadas no mundo de 282 clubes com os calendários reais (Europa atravessando o ano): joga ano a ano com o
 * relógio único e imprime o uso de memória, o tamanho do estado (jogos, histórico do mercado, arquivo) e o tempo de cada ano.
 * Uso: node --expose-gc tools/run.mjs memRun [--years 6]   (NO_CUPS=1 mede sem as copas)
 */
import { createYouth } from '../src/data/generateYouth'
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { advanceSeason } from '../src/engine/offseason'
import { advanceUntil, createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'

const args = process.argv.slice(2)
const years = Number(args.includes('--years') ? args[args.indexOf('--years') + 1] : 6)
// O mundo do jogo: pacote de 15 ligas importado como o jogo importa (calendários de cada país, copas padrão, contratos em 30/6 na Europa).
const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(7))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(7, pkg)
const cups = process.env.NO_CUPS ? undefined : world.cups
let state: SeasonState = createSeason({ year: 2026, seed: 'mem', teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', ...(cups ? { cupSpecs: cups } : {}) })
const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
const mb = (x: number) => `${Math.round(x / 1048576)} MB`
const gc = () => (globalThis as { gc?: () => void }).gc?.()
for (let y = 1; y <= years; y++) {
  const t = performance.now()
  state = advanceUntil(state, `${2026 + y}-06-30`, { market: true, turn }).state
  const raw = process.memoryUsage().heapUsed
  gc()
  const m = process.memoryUsage()
  console.log(
    `${y}: ${((performance.now() - t) / 1000).toFixed(0)} s · heap com lixo ${mb(raw)} · heap vivo ${mb(m.heapUsed)} · rss ${mb(m.rss)} · jogos ${state.matches.length} · histórico ${state.market.history.length} · jogadores ${state.players.length} · base ${state.academy.length} · ofertas ${state.market.offers.length} · anúncios ${state.market.listings.length} · pré ${state.market.preContracts.length} · copas ${state.cups?.length ?? 0}`,
  )
}
