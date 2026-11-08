/**
 * Distribuição dos estilos escolhidos pela IA na virada de temporada (Fase 6D): joga N temporadas do mundo de teste e conta os estilos por liga.
 *   node tools/run.mjs styleDistribution [--anos 3]   (PACOTE_REAL=1 para o pacote real)
 */
import { advanceUntil } from '../src/engine/season'
import { PLAY_STYLES } from '../src/engine/types'
import { turnRunner } from '../src/store/game'
import { createLeagueWorld } from '../src/store/leagueWorld'
import { measurementPackage } from './worldPackage'

const i = process.argv.indexOf('--anos')
const years = i >= 0 ? Number(process.argv[i + 1]) : 2
let world = createLeagueWorld(7, measurementPackage(7), { shared: true })
const tally = (label: string) => {
  const by = new Map<string, Map<string, number>>()
  for (const c of world.season.competitions.filter((x) => x.tier === 1)) {
    const m = new Map<string, number>()
    for (const id of c.teamIds) {
      const style = world.teams.find((t) => t.id === id)?.tactic.style ?? '?'
      m.set(style, (m.get(style) ?? 0) + 1)
    }
    by.set(c.id, m)
  }
  const all = new Map<string, number>()
  for (const m of by.values()) for (const [s, n] of m) all.set(s, (all.get(s) ?? 0) + n)
  const total = [...all.values()].reduce((a, b) => a + b, 0)
  console.log(`\n${label}: ${PLAY_STYLES.map((s) => `${s} ${Math.round((100 * (all.get(s) ?? 0)) / total)}%`).join('  ')}`)
  let worst = 0
  for (const [id, m] of by) {
    const n = [...m.values()].reduce((a, b) => a + b, 0)
    const top = Math.max(...m.values())
    worst = Math.max(worst, top / n)
    if (n >= 16) console.log(`  ${id}: ${PLAY_STYLES.map((s) => m.get(s) ?? 0).join('/')}`)
  }
  console.log(`  maior fatia de um estilo numa liga: ${Math.round(worst * 100)}%`)
}
tally('começo (mundo novo)')
for (let y = 1; y <= years; y++) {
  world = advanceUntil(world, `${world.season.year + 1}-01-02`, { turn: turnRunner, market: false }).state
  tally(`depois de ${y} virada(s)`)
}
