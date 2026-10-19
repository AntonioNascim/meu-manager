/**
 * A partida simplificada (ligas fora do foco) favorece algum país? Joga os mesmos confrontos entre os melhores clubes de cada par de países
 * com o motor completo e com o simplificado e compara os pontos do primeiro país (3 por vitória, 1 por empate). Se a diferença entre os dois
 * motores fosse maior para um país que para os outros, a copa continental favoreceria o país que é jogado lance a lance (ou o que não é).
 * Uso: node tools/run.mjs engineBias [--per-country 6] [--seeds 3]
 */
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { simulateMatch, simulateQuick } from '../src/engine/match'
import { aiTactic } from '../src/engine/season'
import type { Player, Team } from '../src/engine/types'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => (args.includes(`--${name}`) ? (args[args.indexOf(`--${name}`) + 1] as string) : fallback)
const perCountry = Number(opt('per-country', '6'))
const seeds = Number(opt('seeds', '3'))

const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(7))))
if (!pkg) throw new Error('pacote inválido')
const world = loadWorld(7, pkg)
const squads = new Map<string, Player[]>()
for (const p of world.players) if (p.teamId) squads.set(p.teamId, [...(squads.get(p.teamId) ?? []), p])
const sides = new Map(world.teams.map((t) => [t.id, t]))

const COUNTRIES = ['Brazil', 'Argentina', 'Chile', 'Colombia', 'England', 'Spain', 'Italy', 'Germany', 'France', 'Portugal']
const best = (country: string): Team[] => {
  const comp = world.competitions!.find((c) => c.pyramid === country && c.tier === 1)!
  return comp.teams.map((t) => sides.get(t.id) as Team).sort((a, b) => b.reputation - a.reputation).slice(0, perCountry)
}
const prepared = (team: Team) => ({ team: { ...team, tactic: aiTactic(team, squads.get(team.id) ?? []) }, players: squads.get(team.id) ?? [] })
const points = (home: number, away: number, forHome: boolean) => (home === away ? 1 : (home > away) === forHome ? 3 : 0)

interface Cell {
  full: number
  quick: number
  n: number
  goalFull: number
  goalQuick: number
}
const table = new Map<string, Cell>()
for (let i = 0; i < COUNTRIES.length; i++) {
  for (let j = i + 1; j < COUNTRIES.length; j++) {
    const cell: Cell = { full: 0, quick: 0, n: 0, goalFull: 0, goalQuick: 0 }
    for (const a of best(COUNTRIES[i] as string)) {
      for (const b of best(COUNTRIES[j] as string)) {
        for (const aHome of [true, false]) {
          for (let s = 0; s < seeds; s++) {
            const home = prepared(aHome ? a : b)
            const away = prepared(aHome ? b : a)
            const input = { home, away, seed: s * 7919 + a.id.length + (aHome ? 1 : 2) + Number(a.id.replace(/\D/g, '')) * 31 + Number(b.id.replace(/\D/g, '')), attendance: 30_000 }
            const full = simulateMatch(input)
            const quick = simulateQuick({ ...input, capacity: 40_000 })
            cell.full += points(full.homeGoals, full.awayGoals, aHome) * 1
            cell.quick += points(quick.homeGoals, quick.awayGoals, aHome) * 1
            cell.goalFull += aHome ? full.homeGoals - full.awayGoals : full.awayGoals - full.homeGoals
            cell.goalQuick += aHome ? quick.homeGoals - quick.awayGoals : quick.awayGoals - quick.homeGoals
            cell.n++
          }
        }
      }
    }
    table.set(`${COUNTRIES[i]} x ${COUNTRIES[j]}`, cell)
  }
}

console.log(`Pontos por jogo do primeiro país (completo / simplificado / diferença) e saldo de gols; ${perCountry} clubes por país, ${seeds} sementes por confronto`)
const diffs = new Map<string, number[]>()
for (const [pair, c] of table) {
  const [a, b] = pair.split(' x ') as [string, string]
  const d = (c.quick - c.full) / c.n
  for (const k of [a, b]) (diffs.get(k) ?? diffs.set(k, []).get(k))!.push(k === a ? d : -d)
  console.log(`${pair.padEnd(22)} ${(c.full / c.n).toFixed(2)} / ${(c.quick / c.n).toFixed(2)} / ${d >= 0 ? '+' : ''}${d.toFixed(2)}   saldo ${(c.goalFull / c.n).toFixed(2)} / ${(c.goalQuick / c.n).toFixed(2)}   (${c.n} jogos)`)
}
console.log('\nVantagem média do motor simplificado para cada país (pontos por jogo; 0 = igual ao completo):')
for (const [country, list] of diffs) console.log(`${country.padEnd(10)} ${(list.reduce((a, b) => a + b, 0) / list.length).toFixed(3)}`)
