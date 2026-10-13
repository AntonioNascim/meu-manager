/**
 * Posicionamento livre: nenhuma tática "apelona".
 * Sorteia muitas distribuições de jogadores na grade (mais algumas extremas: sem defesa, ataque total, todos de um
 * lado...), tria com poucas partidas e mede de novo as melhores, em mundos diferentes, ao lado das formações prontas
 * (mesmos elencos e adversários). Nenhuma distribuição pode render claramente mais que as melhores formações prontas.
 * Depois confere que deixar uma faixa sem ninguém custa gols sofridos.
 */
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import { MATCH } from '../../src/engine/config'
import { buildTactic } from '../../src/engine/lineup'
import { simulateMatch } from '../../src/engine/match'
import type { Player, Team } from '../../src/engine/types'
import { describeGrid, extremeGrids, search } from '../../tools/gridSearch'

describe('táticas apelonas na grade livre', () => {
  const result = search({
    random: 16,
    plausible: 16,
    screen: { worlds: [601], teams: 7 },
    confirm: { worlds: [611, 612], teams: 20 },
    finalists: 5,
  })
  const line = (r: { name: string; ppg: number; se: number; matches: number; grid?: Parameters<typeof describeGrid>[0] | undefined }) => `${r.name.padEnd(40)} ${r.ppg.toFixed(3)} ±${r.se.toFixed(3)} (${r.matches} jogos) ${r.grid ? describeGrid(r.grid) : ''}`
  console.log(['formações prontas', ...result.ready.map(line), 'melhores distribuições livres', ...result.finalists.map(line)].join('\n'))

  const bestReady = Math.max(...result.ready.map((r) => r.ppg))
  const bestFree = Math.max(...result.finalists.map((r) => r.ppg))

  it('as formações prontas seguem equilibradas entre si', () => {
    const values = result.ready.map((r) => r.ppg)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.15)
  })

  it('nenhuma distribuição livre rende claramente mais que as melhores formações prontas', () => {
    // O erro padrão de cada medida é ~0,034 pontos por jogo; uma distribuição apelona passaria de 0,1 (como a 3-6-1 antes do imposto).
    expect(bestFree).toBeLessThan(bestReady + 0.07)
  })

  it('a triagem testou muitas distribuições diferentes, e as ruins existem (a grade livre não é de graça)', () => {
    expect(result.screened.length).toBeGreaterThanOrEqual(extremeGrids().length + 32)
    const worst = Math.min(...result.screened.map((r) => r.ppg))
    expect(worst).toBeLessThan(bestReady - 0.3)
  })

  it('deixar uma faixa sem ninguém custa: o rival progride mais por ali e o time sofre mais gols', () => {
    const world = generateWorld({ seed: 701 })
    const squads = new Map<string, Player[]>(world.teams.map((t) => [t.id, world.players.filter((p) => p.teamId === t.id)]))
    const league = world.teams.filter((t) => t.tier === 1)
    const grid = extremeGrids().find((c) => c.name.startsWith('sem ninguém pela direita'))!.grid
    const conceded = (flankGap: number): number => {
      const g = MATCH.grid as { flankGap: number }
      const saved = g.flankGap
      g.flankGap = flankGap
      try {
        let goals = 0
        let n = 0
        for (const team of league) {
          const side: Team = { ...team, tactic: buildTactic(squads.get(team.id) as Player[], { formationId: 'custom', grid, style: team.tactic.style, mentality: team.tactic.mentality }) }
          for (const opponent of league) {
            if (opponent === team) continue
            for (const home of [true, false]) {
              const r = simulateMatch({
                home: { team: home ? side : opponent, players: squads.get(home ? team.id : opponent.id) as Player[] },
                away: { team: home ? opponent : side, players: squads.get(home ? opponent.id : team.id) as Player[] },
                seed: ++n,
              })
              goals += home ? r.awayGoals : r.homeGoals
            }
          }
        }
        return goals / n
      } finally {
        g.flankGap = saved
      }
    }
    expect(conceded(MATCH.grid.flankGap)).toBeGreaterThan(conceded(0) + 0.04)
  })
})
