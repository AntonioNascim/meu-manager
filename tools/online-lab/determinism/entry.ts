/** Mesmas partidas nos dois motores de JavaScript: devolve um hash (FNV-1a) do resultado completo de cada uma. */
import { generateWorld } from '../../../src/data/generateWorld'
import { simulateMatch, startMatch } from '../../../src/engine/match'
import type { MatchInput } from '../../../src/engine/match'
import type { Player, Team } from '../../../src/engine/types'

const fnv = (s: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}
export function compute(count: number): { hashes: string[]; exp: string[] } {
  const world = generateWorld({ seed: 11 })
  const squad = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
  const teams = world.teams
  const input = (i: number): MatchInput => {
    const home = teams[i % teams.length]!
    const away = teams[(i * 7 + 3) % teams.length] === home ? teams[(i + 1) % teams.length]! : teams[(i * 7 + 3) % teams.length]!
    return { home: { team: home, players: squad(home) }, away: { team: away, players: squad(away) }, seed: 1000 + i * 97, attendance: 20_000 + i * 500 }
  }
  const hashes: string[] = []
  for (let i = 0; i < count; i++) hashes.push(fnv(JSON.stringify(simulateMatch(input(i)))))
  for (let i = 0; i < 20; i++) {
    const m = startMatch({ ...input(i), userControlled: { home: true } })
    m.playUntil(45); m.setStyle('home', 'high-press'); m.playUntil(90)
    hashes.push(fnv(JSON.stringify(m.result())))
  }
  // As funções que o duelo usa, em pontos espalhados: diferença de bits entre motores aparece aqui primeiro.
  const exp: string[] = []
  for (let k = -12; k <= 12; k += 0.37) exp.push(Math.exp(k).toString() + '|' + Math.pow(1.0000001 + k * 0.01, 1.7).toString())
  return { hashes, exp }
}
