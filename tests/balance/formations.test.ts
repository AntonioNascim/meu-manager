/**
 * Nenhuma formação pode ser melhor que as outras na média.
 * Cada time da Série A joga as 38 partidas da liga com cada formação (escalação automática para ela,
 * mesmo estilo e mentalidade). Com elencos de mesma força, as formações mudam o jeito de jogar,
 * não o nível: a diferença entre a melhor e a pior em pontos por jogo fica pequena.
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import { FORMATION_IDS } from '../../src/engine/formations'
import { buildTactic } from '../../src/engine/lineup'
import { simulateMatch } from '../../src/engine/match'
import type { Player, Team } from '../../src/engine/types'

const WORLDS = [501, 502, 503]
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('formações com elencos equivalentes', () => {
  const points: Record<string, number[]> = Object.fromEntries(FORMATION_IDS.map((id) => [id, []]))
  const possession: Record<string, number[]> = Object.fromEntries(FORMATION_IDS.map((id) => [id, []]))

  for (const seed of WORLDS) {
    const world = generateWorld({ seed })
    const squads = new Map<string, Player[]>(world.teams.map((t) => [t.id, world.players.filter((p) => p.teamId === t.id)]))
    const teams = world.teams.filter((t) => t.tier === 1)
    let n = 0
    for (const team of teams) {
      for (const id of FORMATION_IDS) {
        const tactic = buildTactic(squads.get(team.id) as Player[], { formationId: id, style: team.tactic.style, mentality: team.tactic.mentality })
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
            points[id]?.push(goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0)
            possession[id]?.push(home ? r.homeStats.possession : r.awayStats.possession)
          }
        }
      }
    }
  }

  const ppg = Object.fromEntries(FORMATION_IDS.map((id) => [id, mean(points[id] as number[])])) as Record<string, number>
  const poss = Object.fromEntries(FORMATION_IDS.map((id) => [id, mean(possession[id] as number[])])) as Record<string, number>
  console.log(['formação   pts/jogo  posse%', ...FORMATION_IDS.map((id) => `${id.padEnd(9)} ${ppg[id]?.toFixed(3).padStart(8)}  ${poss[id]?.toFixed(1).padStart(6)}`)].join('\n'))

  it('todas as formações rendem quase o mesmo em pontos por jogo', () => {
    const values = FORMATION_IDS.map((id) => ppg[id] as number)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.13)
  })

  it('mas as formações não são iguais: a posse de bola varia entre elas', () => {
    const values = FORMATION_IDS.map((id) => poss[id] as number)
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(1.5)
  })
})
