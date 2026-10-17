/**
 * Joga uma temporada do mundo padrão e imprime o que as copas fizeram (fases, datas, campeão) e quanto tempo custaram.
 * Uso: node tools/run.mjs cupSeason [--seed 5] [--team team-imp] [--years 1]
 */
import { stageList, tiesOfStage } from '../src/engine/cups'
import { advanceToMatchday, createGame, nextEventOf, playPendingAuto, startNextSeason, teamById } from '../src/store/game'
import type { Game } from '../src/store/game'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const seed = Number(opt('seed', '5'))
const team = opt('team', 'team-imp')
const years = Number(opt('years', '1'))

let game: Game = createGame(seed, team)
for (let y = 0; y < years; y++) {
  const t = performance.now()
  while (nextEventOf(game).type !== 'season-end') {
    game = playPendingAuto(advanceToMatchday(game))
    if (game.dismissal) break
  }
  const ms = performance.now() - t
  if (game.dismissal) console.log('DEMITIDO', game.dismissal.reason)
  const s = game.season
  console.log(`\n${s.season.year}: ${s.matches.length} jogos (${s.matches.filter((m) => m.cup).length} de copa), ${(ms / 1000).toFixed(1)} s`)
  for (const cup of s.cups ?? []) {
    console.log(`${cup.name}: ${cup.entrants.length} clubes, campeão ${cup.winnerId ? teamById(game, cup.winnerId).name : '–'}, vice ${cup.runnerUpId ? teamById(game, cup.runnerUpId).name : '–'}`)
    stageList(cup.spec).forEach((st, i) => {
      const matches = s.matches.filter((m) => m.competitionId === cup.id && m.cup?.stage === i)
      const dates = [...new Set(matches.map((m) => m.date))]
      const ties = tiesOfStage(matches, cup.spec, i)
      const decided = ties.reduce<Record<string, number>>((acc, t) => ((acc[t.decidedBy ?? '?'] = (acc[t.decidedBy ?? '?'] ?? 0) + 1), acc), {})
      console.log(`  ${i} ${st.name}: ${ties.length} confrontos, ${matches.length} jogos, datas ${dates[0]}..${dates[dates.length - 1]} ${JSON.stringify(decided)}`)
    })
  }
  if (y < years - 1) game = startNextSeason(game)
}
