/**
 * Busca de táticas "apelonas" no posicionamento livre. Mede, com os mesmos elencos e adversários, quanto rende cada
 * formação pronta e cada distribuição de jogadores na grade (sorteadas e algumas extremas), em pontos por jogo.
 * Usado por `npm run analyze -- grid` e por `tests/balance/gridTactics.test.ts`.
 */
import { generateWorld } from '../src/data/generateWorld'
import { FORMATION_IDS } from '../src/engine/formations'
import { GRID_LANES, allGridPoints, shapeOf } from '../src/engine/grid'
import { buildTactic } from '../src/engine/lineup'
import { simulateMatch } from '../src/engine/match'
import { createRng } from '../src/engine/rng'
import type { GridPoint, Player, Team } from '../src/engine/types'

export interface Candidate {
  name: string
  /** Formação pronta (atalho) ou, com `grid`, a distribuição livre. */
  formationId: string
  grid?: GridPoint[]
}

export interface Rating extends Candidate {
  points: number
  matches: number
  /** Pontos por jogo. */
  ppg: number
  /** Erro padrão (aproximado) do ppg. */
  se: number
}

const pt = (row: number, lane: number): GridPoint => ({ row, lane })
const gk = pt(0, 2)

/** Distribuições que tentam abusar: cada uma enche uma linha, esvazia outra ou ignora uma faixa. */
export function extremeGrids(): Candidate[] {
  const row = (r: number, lanes: number[]) => lanes.map((l) => pt(r, l))
  const make = (name: string, outfield: GridPoint[]): Candidate => ({ name, formationId: 'custom', grid: [gk, ...outfield] })
  const all = [0, 1, 2, 3, 4]
  return [
    make('2-2-6 (ataque total)', [...row(1, [1, 3]), ...row(3, [1, 3]), ...row(5, all), ...row(4, [0])]),
    make('0-5-5 (sem defesa)', [...row(3, all), ...row(5, all)]),
    make('1-6-3', [...row(1, [2]), ...row(3, all), ...row(2, [2]), ...row(5, [1, 2, 3])]),
    make('3-6-1', [...row(1, [1, 2, 3]), ...row(3, all), ...row(2, [2]), ...row(5, [2])]),
    make('2-7-1', [...row(1, [1, 3]), ...row(3, all), ...row(2, [1, 3]), ...row(5, [2])]),
    make('muro 7-2-1 (retranca)', [...row(1, all), ...row(2, [1, 3]), ...row(3, [2]), ...row(2, [0, 4]), ...row(5, [2])].slice(0, 10)),
    make('só pelo meio', [...row(1, [1, 2, 3]), ...row(2, [1, 2, 3]), ...row(3, [1, 2, 3]), ...row(4, [2])]),
    make('todos no lado esquerdo', [...row(1, [0, 1]), ...row(2, [0, 1]), ...row(3, [0, 1]), ...row(4, [0, 1]), ...row(5, [0, 1])]),
    make('sem ninguém pela direita', [...row(1, [0, 1, 2]), ...row(2, [0, 1, 2]), ...row(3, [0, 1]), ...row(5, [0, 1, 2])].slice(0, 10)),
    make('losango (4-4-2 em losango)', [...row(1, [0, 1, 3, 4]), ...row(2, [2]), ...row(3, [1, 3]), ...row(4, [2]), ...row(5, [1, 3])]),
    make('ataque em linha de 5', [...row(1, [0, 1, 3, 4]), ...row(2, [2]), ...row(3, [1, 3]), ...row(5, [0, 1, 3, 4]).slice(0, 3)]),
    make('três zagueiros + 3 volantes + 4 ataque', [...row(1, [1, 2, 3]), ...row(2, [1, 2, 3]), ...row(5, [0, 1, 3, 4])]),
  ]
}

/** Distribuição sorteada: o goleiro e 10 pontos diferentes da grade (sem o ponto do gol). */
export function randomGrid(seed: number): Candidate {
  const rng = createRng(`grade:${seed}`)
  const free = allGridPoints().filter((p) => p.row > 0)
  const picked = rng.shuffle(free).slice(0, 10)
  return { name: `sorteada ${seed} (${shapeOf([gk, ...picked])})`, formationId: 'custom', grid: [gk, ...picked] }
}

/** Distribuição sorteada com linhas plausíveis (3 a 5 na defesa) para testar o miolo do espaço de táticas. */
export function plausibleGrid(seed: number): Candidate {
  const rng = createRng(`plausivel:${seed}`)
  const defenders = rng.int(3, 5)
  const attackers = rng.int(1, 4)
  const middle = 10 - defenders - attackers
  const take = (rows: number[], n: number, taken: Set<string>): GridPoint[] => {
    const pool = rng.shuffle(rows.flatMap((r) => Array.from({ length: GRID_LANES }, (_, l) => pt(r, l)))).filter((p) => !taken.has(`${p.row}.${p.lane}`))
    const chosen = pool.slice(0, n)
    for (const p of chosen) taken.add(`${p.row}.${p.lane}`)
    return chosen
  }
  const taken = new Set<string>()
  const grid = [gk, ...take([1], defenders, taken), ...take([2, 3, 4], middle, taken), ...take([5], attackers, taken)]
  return { name: `plausível ${seed} (${shapeOf(grid)})`, formationId: 'custom', grid }
}

export interface Protocol {
  worlds: number[]
  /** Quantos times da Série A de cada mundo testam (espaçados); todos enfrentam todos os outros 19. */
  teams: number
}

/** Mede cada candidato nos mesmos elencos e contra os mesmos adversários (que jogam com a tática de sempre). */
export function rate(candidates: readonly Candidate[], protocol: Protocol): Rating[] {
  const totals = candidates.map(() => ({ points: 0, squares: 0, matches: 0 }))
  for (const worldSeed of protocol.worlds) {
    const world = generateWorld({ seed: worldSeed })
    const squads = new Map<string, Player[]>(world.teams.map((t) => [t.id, world.players.filter((p) => p.teamId === t.id)]))
    const league = world.teams.filter((t) => t.tier === 1)
    const step = Math.max(1, Math.floor(league.length / protocol.teams))
    const tested = league.filter((_, i) => i % step === 0).slice(0, protocol.teams)
    let n = 0
    for (const team of tested) {
      const tactics = candidates.map((c) => buildTactic(squads.get(team.id) as Player[], { formationId: c.formationId, grid: c.grid, style: team.tactic.style, mentality: team.tactic.mentality }))
      for (const opponent of league) {
        if (opponent === team) continue
        for (const home of [true, false]) {
          const seed = ++n + worldSeed * 100_000
          candidates.forEach((_, k) => {
            const side: Team = { ...team, tactic: tactics[k]! }
            const r = simulateMatch({
              home: { team: home ? side : opponent, players: squads.get(home ? team.id : opponent.id) as Player[] },
              away: { team: home ? opponent : side, players: squads.get(home ? opponent.id : team.id) as Player[] },
              seed,
            })
            const goalsFor = home ? r.homeGoals : r.awayGoals
            const goalsAgainst = home ? r.awayGoals : r.homeGoals
            const points = goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0
            const t = totals[k]!
            t.points += points
            t.squares += points * points
            t.matches++
          })
        }
      }
    }
  }
  return candidates.map((c, k) => {
    const t = totals[k]!
    const ppg = t.points / t.matches
    const variance = Math.max(0, t.squares / t.matches - ppg * ppg)
    return { ...c, points: t.points, matches: t.matches, ppg, se: Math.sqrt(variance / t.matches) }
  })
}

/** Desenho da grade em texto, do ataque para o gol: cada linha mostra as faixas ocupadas (esquerda a direita). */
export function describeGrid(grid: readonly GridPoint[]): string {
  return [5, 4, 3, 2, 1]
    .map((row) => `${['', 'DEF', 'VOL', 'MEI', 'MAO', 'ATA'][row]}:${Array.from({ length: GRID_LANES }, (_, l) => (grid.some((p) => p.row === row && p.lane === l) ? 'X' : '.')).join('')}`)
    .join(' ')
}

export const readyCandidates = (): Candidate[] => FORMATION_IDS.map((id) => ({ name: id, formationId: id }))

/** Busca em dois passos: tria todas com poucas partidas e mede de novo, com muitas, as que mais renderam. */
export function search(options: { random: number; plausible: number; screen: Protocol; confirm: Protocol; finalists: number }) {
  const customs: Candidate[] = [...extremeGrids(), ...Array.from({ length: options.random }, (_, i) => randomGrid(i + 1)), ...Array.from({ length: options.plausible }, (_, i) => plausibleGrid(i + 1))]
  const screened = rate(customs, options.screen).sort((a, b) => b.ppg - a.ppg)
  const finalists = screened.slice(0, options.finalists)
  const confirmed = rate([...readyCandidates(), ...finalists.map(({ name, formationId, grid }) => ({ name, formationId, ...(grid ? { grid } : {}) }))], options.confirm)
  const ready = confirmed.slice(0, FORMATION_IDS.length)
  return { screened, ready, finalists: confirmed.slice(FORMATION_IDS.length).sort((a, b) => b.ppg - a.ppg) }
}

if (process.argv[1] === 'gridSearch') {
  const args = process.argv.slice(2)
  const num = (flag: string, fallback: number) => Number(args[args.indexOf(flag) + 1] ?? fallback) || fallback
  const result = search({
    random: num('--random', 30),
    plausible: num('--plausible', 30),
    screen: { worlds: [601], teams: num('--screen-teams', 7) },
    confirm: { worlds: Array.from({ length: num('--confirm-worlds', 2) }, (_, i) => 611 + i), teams: num('--confirm-teams', 10) },
    finalists: num('--finalists', 6),
  })
  const line = (r: Rating) => `${r.name.padEnd(40)} ${r.ppg.toFixed(3)} ±${r.se.toFixed(3)}  (${r.matches} jogos)  ${r.grid ? describeGrid(r.grid) : ''}`
  console.log('Formações prontas (medição final)\n' + result.ready.map(line).join('\n'))
  console.log('\nFinalistas livres (medição final)\n' + result.finalists.map(line).join('\n'))
  console.log('\nTriagem (as 10 que mais renderam)\n' + result.screened.slice(0, 10).map(line).join('\n'))
  console.log('\nTriagem (as 5 que menos renderam)\n' + result.screened.slice(-5).map(line).join('\n'))
}
