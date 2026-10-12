/**
 * Nenhum estilo de jogo pode ser claramente pior que os outros.
 * Cada time da Série A joga as 38 partidas da liga com cada estilo, com o mesmo elenco, a mesma
 * formação e a mesma mentalidade; só o estilo muda. Os adversários seguem com a tática deles.
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import { buildTactic } from '../../src/engine/lineup'
import { simulateMatch } from '../../src/engine/match'
import type { Player, PlayStyle, Team } from '../../src/engine/types'

const STYLES: PlayStyle[] = ['possession', 'counter-attack', 'high-press']
const WORLDS = [101, 102, 103, 104, 105]

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('estilos de jogo com elencos equivalentes', () => {
  const points: Record<PlayStyle, number[]> = { possession: [], 'counter-attack': [], 'high-press': [] }
  const goalDiff: Record<PlayStyle, number[]> = { possession: [], 'counter-attack': [], 'high-press': [] }

  for (const seed of WORLDS) {
    const world = generateWorld({ seed })
    const squads = new Map<string, Player[]>(world.teams.map((t) => [t.id, world.players.filter((p) => p.teamId === t.id)]))
    const teams = world.teams.filter((t) => t.tier === 1)
    let n = 0
    for (const team of teams) {
      for (const style of STYLES) {
        const tactic = buildTactic(squads.get(team.id) as Player[], { formationId: team.tactic.formationId, style, mentality: team.tactic.mentality })
        const tested: Team = { ...team, tactic }
        for (const opponent of teams) {
          if (opponent === team) continue
          for (const home of [true, false]) {
            const r = simulateMatch({
              home: { team: home ? tested : opponent, players: squads.get(home ? team.id : opponent.id) as Player[] },
              away: { team: home ? opponent : tested, players: squads.get(home ? opponent.id : team.id) as Player[] },
              seed: ++n + seed * 100_000,
            })
            const goalsFor = home ? r.homeGoals : r.awayGoals
            const goalsAgainst = home ? r.awayGoals : r.homeGoals
            points[style].push(goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0)
            goalDiff[style].push(goalsFor - goalsAgainst)
          }
        }
      }
    }
  }

  const ppg = Object.fromEntries(STYLES.map((s) => [s, mean(points[s])])) as Record<PlayStyle, number>
  const gd = Object.fromEntries(STYLES.map((s) => [s, mean(goalDiff[s])])) as Record<PlayStyle, number>
  console.log(
    ['estilo           pts/jogo   saldo/jogo', ...STYLES.map((s) => `${s.padEnd(16)} ${ppg[s].toFixed(3).padStart(7)}   ${gd[s].toFixed(3).padStart(9)}`)].join('\n'),
  )

  it('os três estilos rendem quase o mesmo em pontos por jogo', () => {
    const values = STYLES.map((s) => ppg[s])
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.06)
  })

  it('nenhum estilo é claramente pior em saldo de gols', () => {
    const values = STYLES.map((s) => gd[s])
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.12)
    for (const s of STYLES) expect(gd[s]).toBeGreaterThan(mean(values) - 0.08)
  })
})
