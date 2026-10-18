/**
 * Temporadas por pirâmide no mundo de 282 clubes: joga N temporadas do técnico (Brasil ou outro país) e imprime, por país, o calendário de
 * cada temporada (primeiro e último jogo de liga, copas), os dias em que cada país virou e o custo de tempo.
 * Uso: node tools/run.mjs cycleRun [--team br-1|en-1|...] [--years 2] [--seed 7]
 */
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { cycleOfPyramid, pyramidOf, seasonLabel } from '../src/engine/season'
import { advanceToMatchday, createGame, nextEventOf, playPendingAuto, startNextSeason, userCompetition } from '../src/store/game'
import type { Game } from '../src/store/game'

const args = process.argv.slice(2)
const arg = (name: string, fallback: string) => (args.includes(`--${name}`) ? (args[args.indexOf(`--${name}`) + 1] as string) : fallback)
const seed = Number(arg('seed', '7'))
const years = Number(arg('years', '2'))
const leagueId = arg('team', 'br-1')

const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(seed))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(seed, pkg)
const user = world.competitions!.find((c) => c.id === leagueId)!.teams[0]!
let game: Game = createGame(seed, user.id, { world })
// Meta folgada: aqui só interessa o calendário.
const easy = (g: Game): Game => ({ ...g, dismissal: undefined, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === user.id ? { ...t, objective: { targetPosition: 20, sackingPosition: 20 } } : t)) } })

const describe = (g: Game, title: string) => {
  const s = g.season
  console.log(`\n== ${title} (relógio ${s.season.currentDate}) ==`)
  const pyramids = [...new Set(s.season.competitions.map((c) => pyramidOf(c)))]
  for (const p of pyramids) {
    const cycle = cycleOfPyramid(s, p)
    const ids = new Set(s.season.competitions.filter((c) => pyramidOf(c) === p && c.tier === 1).map((c) => c.id))
    const dates = s.matches.filter((m) => ids.has(m.competitionId)).map((m) => m.date).sort()
    const cups = (s.cups ?? []).filter((c) => c.pyramid === p).map((c) => {
      const d = s.matches.filter((m) => m.competitionId === c.id).map((m) => m.date).sort()
      return `${c.id} ${d[0]}..${d[d.length - 1]}`
    })
    console.log(`  ${p.padEnd(10)} ${seasonLabel(cycle).padEnd(8)} liga ${dates[0]}..${dates[dates.length - 1]}${cups.length ? ` · ${cups.join(' · ')}` : ''}`)
  }
}

describe(game, `início, técnico em ${userCompetition(game).name}`)
for (let y = 0; y < years; y++) {
  const t = performance.now()
  game = easy(game)
  for (let guard = 0; nextEventOf(game).type !== 'season-end' && guard < 600; guard++) game = easy(playPendingAuto(advanceToMatchday(game)))
  const played = performance.now() - t
  const turnT = performance.now()
  game = startNextSeason(easy(game))
  console.log(`\nTemporada ${y + 1}: jogada em ${(played / 1000).toFixed(1)} s, virada ${((performance.now() - turnT) / 1000).toFixed(1)} s`)
  describe(game, `depois da virada ${y + 1}`)
  console.log(`  arquivo: ${game.archive.length} tabelas guardadas (${[...new Set(game.archive.map((a) => `${a.pyramid ?? '?'}:${a.label ?? a.year}`))].slice(0, 6).join(', ')}...)`)
}
