import { beforeEach, describe, expect, it, vi } from 'vitest'

// Conta quantas partidas passaram pelo caminho completo (lance a lance) e pelo simplificado, sem mudar o que eles fazem.
const calls = vi.hoisted(() => ({ full: 0, quick: 0 }))
vi.mock('../src/engine/season/fidelity', async () => {
  const actual = await vi.importActual<typeof import('../src/engine/season/fidelity')>('../src/engine/season/fidelity')
  return {
    ...actual,
    playQuickMatch: (...args: Parameters<typeof actual.playQuickMatch>) => {
      calls.quick++
      return actual.playQuickMatch(...args)
    },
  }
})
vi.mock('../src/engine/match', async () => {
  const actual = await vi.importActual<typeof import('../src/engine/match')>('../src/engine/match')
  return {
    ...actual,
    simulateMatch: (...args: Parameters<typeof actual.simulateMatch>) => {
      calls.full++
      return actual.simulateMatch(...args)
    },
  }
})

import { simulateMatch } from '../src/engine/match'
import { advanceToNextEvent, completeMatch, humanMatchInput } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { createGame } from '../src/store/game'

const world = createGame(6, 'team-imp', { cups: false }).season
const firstDivision = world.season.competitions[0]!
const secondDivision = world.season.competitions[1]!
const HUMANS = [firstDivision.teamIds[0]!, secondDivision.teamIds[3]!]
const humanSet = new Set(HUMANS)

/** Joga as partidas dos humanos (lance a lance, no automático) e as registra, como a liga fará. */
function playHumans(state: SeasonState, pending: readonly { id: string }[]): SeasonState {
  let current = state
  for (const p of pending) {
    const match = current.matches.find((m) => m.id === p.id)!
    const result = simulateMatch(humanMatchInput(current, match, humanSet))
    current = completeMatch(current, { ...match, status: 'finished', result })
  }
  return current
}

beforeEach(() => {
  calls.full = 0
  calls.quick = 0
})

describe('fidelidade por partida (humanTeamIds)', () => {
  it('partida de clube humano fica pendente; todas as outras, em qualquer divisão, usam o resultado simplificado', () => {
    let state = world
    let humanMatches = 0
    let others = 0
    let fullInAdvance = 0
    for (let i = 0; i < 12; i++) {
      const before = calls.full
      const step = advanceToNextEvent(state, { humanTeamIds: HUMANS })
      fullInAdvance += calls.full - before
      state = step.state
      for (const m of step.pendingHumanMatches ?? []) {
        expect(humanSet.has(m.homeTeamId) || humanSet.has(m.awayTeamId)).toBe(true)
        expect(m.status).toBe('scheduled')
      }
      // Nenhuma partida de humano foi simulada pelo avanço.
      expect(step.played.every((m) => !humanSet.has(m.homeTeamId) && !humanSet.has(m.awayTeamId))).toBe(true)
      humanMatches += step.pendingHumanMatches?.length ?? 0
      others += step.played.length
      state = playHumans(state, step.pendingHumanMatches ?? [])
    }
    expect(humanMatches).toBeGreaterThan(0)
    expect(others).toBeGreaterThan(humanMatches)
    // Fidelidade: o caminho completo nunca foi usado pelo avanço (só o simplificado), em nenhuma das duas divisões.
    expect(fullInAdvance).toBe(0)
    expect(calls.quick).toBe(others)
  })

  it('sem humanTeamIds o avanço é o de sempre: caminho completo, nenhuma partida pendente de humano', () => {
    const step = advanceToNextEvent(world, {})
    expect(step.pendingHumanMatches).toBeUndefined()
    expect(calls.full).toBeGreaterThan(0)
  })

  it('o avanço não segue enquanto as partidas dos humanos não são registradas (o mesmo dia volta)', () => {
    const first = advanceToNextEvent(world, { humanTeamIds: HUMANS })
    expect(first.pendingHumanMatches?.length).toBeGreaterThan(0)
    const again = advanceToNextEvent(first.state, { humanTeamIds: HUMANS })
    expect(again.pendingHumanMatches?.map((m) => m.id)).toEqual(first.pendingHumanMatches?.map((m) => m.id))
    expect(again.state.season.currentDate).toBe(first.state.season.currentDate)
  })

  it('dois humanos que se enfrentam jogam uma partida só, com os dois lados sob controle humano', () => {
    const [a, b] = firstDivision.teamIds as [string, string]
    const humans = new Set([a, b])
    const match = world.matches.find((m) => (m.homeTeamId === a && m.awayTeamId === b) || (m.homeTeamId === b && m.awayTeamId === a))!
    const input = humanMatchInput(world, match, humans)
    expect(input.userControlled).toEqual({ home: true, away: true })
    // Quem não está conectado passa à IA completa.
    expect(humanMatchInput(world, match, humans, new Set([a])).userControlled).toEqual({ home: match.homeTeamId !== a, away: match.awayTeamId !== a })
    // Contra um clube de IA, só o humano fica sob controle.
    const vsAi = world.matches.find((m) => m.homeTeamId === a && m.awayTeamId !== b)!
    expect(humanMatchInput(world, vsAi, humans).userControlled).toEqual({ home: true, away: false })
  })
})

describe('a IA não mexe nos clubes humanos', () => {
  it('nenhuma compra, venda ou pré-contrato da IA envolve um clube humano numa janela de transferências inteira', () => {
    let state: SeasonState = world
    for (let i = 0; i < 60; i++) {
      const step = advanceToNextEvent(state, { humanTeamIds: HUMANS, market: true })
      state = playHumans(step.state, step.pendingHumanMatches ?? [])
      if (state.season.currentDate > '2026-03-15') break
    }
    const involved = state.market.history.filter((h) => humanSet.has(h.fromTeamId ?? '') || humanSet.has(h.toTeamId ?? ''))
    expect(state.market.history.length).toBeGreaterThan(0)
    expect(involved).toEqual([])
    expect(state.market.listings.filter((l) => humanSet.has(l.teamId) && l.by !== 'user')).toEqual([])
    // Os humanos guardam o elenco que tinham.
    for (const id of HUMANS) {
      const before = world.players.filter((p) => p.teamId === id).map((p) => p.id).sort()
      const after = state.players.filter((p) => p.teamId === id).map((p) => p.id).sort()
      expect(after).toEqual(before)
    }
  }, 300_000)
})
