import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { AcademyError, promoteYouth } from '../src/engine/academy'
import { startMatch } from '../src/engine/match'
import type { MatchInput } from '../src/engine/match'
import { createSeason } from '../src/engine/season'
import type { Nationality, Player } from '../src/engine/types'

const world = generateWorld({ seed: 4 })
const [home, away] = world.teams.filter((t) => t.tier === 1) as [(typeof world.teams)[number], (typeof world.teams)[number]]

/** O mandante limita os titulares a 3 estrangeiros; os 3 primeiros titulares e todo o banco são argentinos. */
function setup(extra: Partial<Record<'bench' | 'xi', Nationality>> = {}) {
  const tactic = home.tactic
  const foreignXI = new Set(tactic.startingXI.slice(0, 3))
  const players: Player[] = world.players
    .filter((p) => p.teamId === home.id)
    .map((p) => ({ ...p, nationality: foreignXI.has(p.id) || tactic.bench.includes(p.id) ? (extra.bench ?? ('Argentina' as const)) : ('Brazil' as const) }))
  const team = { ...home, foreignLimit: { lineup: 3 } }
  const input = (seed: number, userControlled = false): MatchInput => ({
    home: { team, players },
    away: { team: away, players: world.players.filter((p) => p.teamId === away.id) },
    seed,
    ...(userControlled ? { userControlled: { home: true } } : {}),
  })
  return { players, team, input, foreignXI }
}

describe('limite de estrangeiros em campo', () => {
  it('o técnico não pode trocar um jogador da casa por um estrangeiro acima do limite, mas pode trocar estrangeiro por estrangeiro', () => {
    const { input, foreignXI, team } = setup()
    const live = startMatch(input(3, true))
    live.playUntil(30)
    const homeKeeperOrOut = team.tactic.startingXI.find((id) => !foreignXI.has(id) && id !== team.tactic.startingXI[0])!
    const foreignBench = team.tactic.bench[1]!
    expect(() => live.substitute('home', homeKeeperOrOut, foreignBench)).toThrow(/Limite de estrangeiros da liga: no máximo 3 em campo/)
    const foreignOut = [...foreignXI].find((id) => id !== team.tactic.startingXI[0])!
    expect(() => live.substitute('home', foreignOut, foreignBench)).not.toThrow()
  })

  it('a IA (cansaço, lesão) nunca passa do limite de estrangeiros em campo', () => {
    const { input, players } = setup()
    const byId = new Map(players.map((p) => [p.id, p]))
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const live = startMatch(input(seed))
      for (let minute = 10; minute <= 90; minute += 10) {
        live.playUntil(minute)
        const foreign = live.snapshot().home.onPitch.filter((p) => byId.get(p.playerId)?.nationality !== 'Brazil').length
        expect(foreign, `semente ${seed} minuto ${minute}`).toBeLessThanOrEqual(3)
      }
    }
  })
})

describe('limite de estrangeiros na promoção da base', () => {
  const state = createSeason({ year: 2026, seed: 1, teams: world.teams, players: world.players, academy: world.academy })
  const club = state.teams.find((t) => t.id === home.id)!
  const youth = state.academy.find((p) => p.teamId === home.id)!

  it('promover um jovem estrangeiro com o elenco no limite é recusado com mensagem; o da casa e o estrangeiro com vaga entram', () => {
    const squad = state.players.filter((p) => p.teamId === home.id)
    const full = { ...state, teams: state.teams.map((t) => (t.id === club.id ? { ...t, foreignLimit: { squad: 2 } } : t)), players: state.players.map((p) => (p.teamId === home.id ? { ...p, nationality: squad.findIndex((q) => q.id === p.id) < 2 ? ('Argentina' as const) : ('Brazil' as const) } : p)) }
    const foreignYouth = { ...full, academy: full.academy.map((p) => (p.id === youth.id ? { ...p, nationality: 'Chile' as const } : p)) }
    expect(() => promoteYouth(foreignYouth, youth.id)).toThrowError(AcademyError)
    try {
      promoteYouth(foreignYouth, youth.id)
    } catch (e) {
      expect((e as AcademyError).code).toBe('foreign-limit')
      expect((e as Error).message).toContain('Limite de estrangeiros da liga')
    }
    const nativeYouth = { ...full, academy: full.academy.map((p) => (p.id === youth.id ? { ...p, nationality: 'Brazil' as const } : p)) }
    expect(promoteYouth(nativeYouth, youth.id).players.some((p) => p.id === youth.id)).toBe(true)
    const roomy = { ...foreignYouth, teams: foreignYouth.teams.map((t) => (t.id === club.id ? { ...t, foreignLimit: { squad: 3 } } : t)) }
    expect(promoteYouth(roomy, youth.id).players.some((p) => p.id === youth.id)).toBe(true)
  })
})
