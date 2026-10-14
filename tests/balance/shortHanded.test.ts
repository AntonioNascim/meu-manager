/**
 * Time com menos de 11 (expulsão ou lesão sem troca): o lugar de quem saiu fica vazio e o custo dos buracos vale
 * desde o primeiro lance, mexa o técnico ou não. Reorganizar de forma sensata (cobrir a linha ou a faixa que ficou
 * vazia) nunca pode render menos do que não mexer. Mede com partidas simuladas: o mesmo time, o mesmo adversário e a
 * mesma semente, com 10 jogadores desde o minuto 0, sem mexer e depois reorganizado (`LiveMatch.reorganize`, a mesma
 * função que a IA usa sozinha).
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import { FORMATION_IDS } from '../../src/engine/formations'
import { buildTactic } from '../../src/engine/lineup'
import { startMatch } from '../../src/engine/match'
import type { MatchSide } from '../../src/engine/match'
import { formationFromGrid } from '../../src/engine/grid'
import { gapsOf } from '../../src/engine/match/formationProfile'
import type { GridPoint, Player, Team } from '../../src/engine/types'

const worlds = [701, 702].map((seed) => generateWorld({ seed }))
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

interface Pair {
  worldIndex: number
  home: Team
  away: Team
}
const pairs: Pair[] = worlds.flatMap((w, worldIndex) => {
  const teams = w.teams.filter((t) => t.tier === 1)
  return Array.from({ length: 6 }, (_, i) => ({ worldIndex, home: teams[(i * 3) % teams.length] as Team, away: teams[(i * 3 + 7) % teams.length] as Team }))
})

/** Pontos do time da casa jogando sem os `off` desde o início, reorganizado ou não. */
function points(pair: Pair, formationId: string, offIndexes: number[], reorganize: boolean, seed: number): number {
  const players = worlds[pair.worldIndex]!.players
  const squad = (t: Team): Player[] => players.filter((p) => p.teamId === t.id)
  const tactic = buildTactic(squad(pair.home), { formationId, style: 'possession', mentality: 0 })
  const off = offIndexes.map((i) => tactic.startingXI[i] as string)
  const m = startMatch({ home: { team: { ...pair.home, tactic }, players: squad(pair.home) }, away: { team: pair.away, players: squad(pair.away) }, seed, attendance: 30_000, userControlled: { home: true }, startedOff: { home: off } })
  if (reorganize) m.reorganize('home' as MatchSide)
  m.playUntil(90)
  const s = m.snapshot()
  return s.homeGoals > s.awayGoals ? 3 : s.homeGoals === s.awayGoals ? 1 : 0
}

/** Diferença média de pontos por jogo (reorganizado − sem mexer) nos jogos pareados. */
function delta(formationId: string, offIndexes: number[], seeds = 12): number {
  const diffs: number[] = []
  for (const pair of pairs) for (let s = 0; s < seeds; s++) diffs.push(points(pair, formationId, offIndexes, true, 5000 + s * 31) - points(pair, formationId, offIndexes, false, 5000 + s * 31))
  return mean(diffs)
}

const gapTotal = (grid: GridPoint[]) => {
  const g = gapsOf(formationFromGrid(grid, 'custom', true))
  return g.defense + g.midfield + g.flank.reduce((s, v) => s + v, 0)
}

describe('time com menos de 11', () => {
  it('reorganizar nunca aumenta os buracos: para toda formação e toda saída de 1 ou 2 jogadores', () => {
    const world = worlds[0]!
    const team = world.teams.filter((t) => t.tier === 1)[0] as Team
    const squad = world.players.filter((p) => p.teamId === team.id)
    let reduced = 0
    for (const id of FORMATION_IDS) {
      const tactic = buildTactic(squad, { formationId: id, style: 'possession', mentality: 0 })
      const subsets: number[][] = []
      for (let a = 1; a < 11; a++) {
        subsets.push([a])
        for (let c = a + 1; c < 11; c++) subsets.push([a, c])
      }
      for (const off of subsets) {
        const m = startMatch({ home: { team: { ...team, tactic }, players: squad }, away: { team: worlds[0]!.teams[3] as Team, players: world.players.filter((p) => p.teamId === (worlds[0]!.teams[3] as Team).id) }, seed: 1, attendance: 30_000, userControlled: { home: true }, startedOff: { home: off.map((i) => tactic.startingXI[i] as string) } })
        m.playUntil(1)
        const before = gapTotal(m.snapshot().home.grid)
        m.reorganize('home')
        const after = gapTotal(m.snapshot().home.grid)
        expect(after, `${id} sem ${off}`).toBeLessThanOrEqual(before + 1e-9)
        if (after < before - 1e-9) reduced++
        expect(m.snapshot().home.onPitch).toHaveLength(11 - off.length)
      }
    }
    expect(reduced).toBeGreaterThan(0)
  })

  const rows: { name: string; d: number }[] = []
  for (const id of FORMATION_IDS) for (const [label, index] of [['defensor', 1], ['meio', 6], ['atacante', 10]] as const) rows.push({ name: `${id} sem ${label}`, d: delta(id, [index]) })
  // Cenários em que sobra um buraco de verdade (defesa curta): onde reorganizar pode ajudar.
  const gapScenarios: [string, number[]][] = [['3-5-2', [1]], ['3-5-2', [1, 2]], ['3-5-2', [1, 2, 3]], ['4-3-3', [1, 2]], ['3-5-2', [1, 6]]]
  const gapRows = gapScenarios.map(([id, off]) => ({ name: `${id} sem ${off.join('+')}`, d: delta(id, off, 30) }))
  console.log([...rows, ...gapRows].map((r) => `${r.name.padEnd(28)} ${r.d >= 0 ? '+' : ''}${r.d.toFixed(3)} pontos por jogo`).join(String.fromCharCode(10)))

  it('reorganizado rende igual ou melhor que sem mexer (um a menos, em todas as formações)', () => {
    expect(mean(rows.map((r) => r.d))).toBeGreaterThanOrEqual(-0.005)
  })

  it('onde há buraco de verdade, reorganizar rende mais (10 e 9 jogadores)', () => {
    expect(mean(gapRows.map((r) => r.d))).toBeGreaterThan(0)
  })
})
