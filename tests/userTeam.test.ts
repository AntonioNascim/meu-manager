import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { isAvailable, repairTactic } from '../src/engine/lineup'
import { simulateMatch } from '../src/engine/match'
import {
  advanceToNextEvent,
  completeMatch,
  createSeason,
  nextEvent,
  playUserMatchAuto,
  setTeamTactic,
  userMatchInput,
} from '../src/engine/season'
import type { Match, Player, Team } from '../src/engine/types'

const world = generateWorld({ seed: 7 })
const user = world.teams.find((t) => t.tier === 1) as Team
const fresh = () => createSeason({ year: 2026, seed: 'user', teams: world.teams, players: world.players })
const squadOf = (players: readonly Player[], teamId: string) => players.filter((p) => p.teamId === teamId)

describe('time do jogador no avanço da temporada', () => {
  it('a partida do jogador fica pendente e as outras do dia são jogadas', () => {
    const step = advanceToNextEvent(fresh(), { userTeamId: user.id })
    const pending = step.pendingUserMatch
    expect(pending).toBeDefined()
    expect([pending?.homeTeamId, pending?.awayTeamId]).toContain(user.id)
    expect(step.state.matches.find((m) => m.id === pending?.id)?.status).toBe('scheduled')
    expect(step.played.length).toBeGreaterThan(0)
    expect(step.played.every((m) => m.homeTeamId !== user.id && m.awayTeamId !== user.id)).toBe(true)
    expect(step.played.every((m) => m.date === pending?.date)).toBe(true)
  })

  it('avançar de novo sem jogar não repete nem pula a partida pendente', () => {
    const first = advanceToNextEvent(fresh(), { userTeamId: user.id })
    const again = advanceToNextEvent(first.state, { userTeamId: user.id })
    expect(again.pendingUserMatch?.id).toBe(first.pendingUserMatch?.id)
    expect(again.played).toHaveLength(0)
    expect(again.state.matches).toEqual(first.state.matches)
  })

  it('depois de registrar a partida, o avanço segue para o próximo dia de jogos', () => {
    const first = advanceToNextEvent(fresh(), { userTeamId: user.id })
    const match = first.pendingUserMatch as Match
    const state = completeMatch(first.state, playUserMatchAuto(first.state, match, user.id))
    expect(state.matches.find((m) => m.id === match.id)?.status).toBe('finished')
    expect(squadOf(state.players, user.id).filter((p) => p.seasonStats.appearances > 0).length).toBeGreaterThanOrEqual(11)
    const next = nextEvent(state)
    expect(next.type === 'matchday' && next.date > match.date).toBe(true)
  })

  it('sem time do jogador, tudo é simulado como antes', () => {
    expect(advanceToNextEvent(fresh()).pendingUserMatch).toBeUndefined()
  })

  it('ao longo da temporada o jogador joga uma partida por rodada, 38 no total', () => {
    let state = fresh()
    let playedByUser = 0
    for (let i = 0; i < 400 && nextEvent(state).type === 'matchday'; i++) {
      const step = advanceToNextEvent(state, { userTeamId: user.id })
      state = step.state
      if (step.pendingUserMatch) {
        state = completeMatch(state, playUserMatchAuto(state, step.pendingUserMatch, user.id))
        playedByUser++
      }
    }
    expect(playedByUser).toBe(38)
    expect(state.matches.every((m) => m.status === 'finished')).toBe(true)
    expect(state.season.phase).toBe('end-of-season')
  })
})

describe('a IA não mexe no time do jogador', () => {
  const tired = world.players.map((p) => ({ ...p, condition: { ...p.condition, fitness: 35 } }))
  const other = world.teams.filter((t) => t.tier === 1)[1] as Team
  const input = (seed: number, userControlled: boolean) => ({
    home: { team: user, players: squadOf(tired, user.id) },
    away: { team: other, players: squadOf(tired, other.id) },
    seed,
    userControlled: { home: userControlled },
  })

  it('sem controle do jogador, o time cansado faz substituições; com controle, só por lesão', () => {
    let aiSubs = 0
    let userSubs = 0
    let userInjuries = 0
    for (let seed = 1; seed <= 20; seed++) {
      const ai = simulateMatch(input(seed, false)).events.filter((e) => e.type === 'substitution' && e.teamId === user.id)
      const mine = simulateMatch(input(seed, true)).events.filter((e) => e.teamId === user.id)
      aiSubs += ai.length
      userSubs += mine.filter((e) => e.type === 'substitution').length
      userInjuries += mine.filter((e) => e.type === 'injury').length
    }
    expect(aiSubs).toBeGreaterThan(20)
    expect(userSubs).toBeLessThanOrEqual(userInjuries)
  })

  it('o time fraco e ofensivo do jogador não recua por ser azarão', () => {
    const weak = world.teams.filter((t) => t.tier === 2)[0] as Team
    const strong = world.teams.filter((t) => t.tier === 1)[0] as Team
    const attacking = { ...weak, tactic: { ...weak.tactic, mentality: 2 as const } }
    let shotsAi = 0
    let shotsUser = 0
    for (let seed = 1; seed <= 40; seed++) {
      const base = { home: { team: attacking, players: squadOf(world.players, weak.id) }, away: { team: strong, players: squadOf(world.players, strong.id) }, seed }
      shotsAi += simulateMatch(base).homeStats.shots
      shotsUser += simulateMatch({ ...base, userControlled: { home: true } }).homeStats.shots
    }
    expect(shotsUser).toBeGreaterThan(shotsAi)
  })
})

describe('escalação do jogador', () => {
  it('quem ficou indisponível é trocado; o resto fica como o jogador deixou', () => {
    const squad = squadOf(world.players, user.id)
    const out = user.tactic.startingXI[3] as string
    const hurt = squad.map((p) => (p.id === out ? { ...p, condition: { ...p.condition, injuryDaysLeft: 5 } } : p))
    const fixed = repairTactic(user.tactic, hurt)
    expect(fixed.startingXI).not.toContain(out)
    expect(fixed.startingXI.filter((_, i) => i !== 3)).toEqual(user.tactic.startingXI.filter((_, i) => i !== 3))
    expect(fixed.startingXI.every((id) => isAvailable(hurt.find((p) => p.id === id) as Player))).toBe(true)
    expect(new Set([...fixed.startingXI, ...fixed.bench]).size).toBe(fixed.startingXI.length + fixed.bench.length)
    expect(repairTactic(user.tactic, squad)).toBe(user.tactic)
  })

  it('o capitão indisponível também é substituído', () => {
    const squad = squadOf(world.players, user.id)
    const hurt = squad.map((p) => (p.id === user.tactic.captainId ? { ...p, condition: { ...p.condition, suspensionGames: 1 } } : p))
    const fixed = repairTactic(user.tactic, hurt)
    expect(fixed.captainId).not.toBe(user.tactic.captainId)
    expect(fixed.startingXI).toContain(fixed.captainId)
  })

  it('a partida do jogador usa a escalação reparada', () => {
    const state = fresh()
    const match = state.matches.find((m) => m.homeTeamId === user.id) as Match
    const out = user.tactic.startingXI[0] as string
    const hurt = { ...state, players: state.players.map((p) => (p.id === out ? { ...p, condition: { ...p.condition, injuryDaysLeft: 9 } } : p)) }
    const input = userMatchInput(hurt, match, user.id)
    expect(input.home.team.tactic.startingXI).not.toContain(out)
    expect(input.userControlled).toEqual({ home: true, away: false })
  })

  it('setTeamTactic aceita escalação válida e recusa jogador de outro time, repetido ou no banco e no campo', () => {
    const state = fresh()
    const tactic = { ...user.tactic, style: 'high-press' as const }
    expect(setTeamTactic(state, user.id, tactic).teams.find((t) => t.id === user.id)?.tactic.style).toBe('high-press')
    const foreign = world.players.find((p) => p.teamId !== user.id) as Player
    expect(() => setTeamTactic(state, user.id, { ...tactic, startingXI: [foreign.id, ...tactic.startingXI.slice(1)] })).toThrow()
    expect(() => setTeamTactic(state, user.id, { ...tactic, startingXI: [tactic.startingXI[1] as string, ...tactic.startingXI.slice(1)] })).toThrow()
    expect(() => setTeamTactic(state, user.id, { ...tactic, bench: [tactic.startingXI[0] as string] })).toThrow()
  })
})
