import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, addSeat, createLeague, defaultLeagueConfig, dropLeavingSeats, processLeague, removeSeat, startLeague } from '../src/engine/league'
import type { LeagueState, Stepped } from '../src/engine/league'
import { MS_MINUTE } from '../src/engine/league/pace'
import { createLeagueWorld } from '../src/store/leagueWorld'
import { turnRunner } from '../src/store/game'

const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const world = createLeagueWorld(6, undefined, { cups: false })
const comp = world.season.competitions[0]!
const config = defaultLeagueConfig(DEFAULT_CONFIG('liga-vagas'), false)

describe('mundo da liga online (B8.3)', () => {
  it('nasce sem técnico dono: sem pirâmide de foco e com todas as ligas', () => {
    expect(world.focus).toBeUndefined()
    expect(world.season.competitions.length).toBeGreaterThanOrEqual(2)
    expect(world.matches.length).toBeGreaterThan(0)
  })
})

describe('vagas dos técnicos (B8.3)', () => {
  it('iniciar a liga sem ninguém e depois entrar: o calendário passa a ter as partidas do novo técnico', () => {
    const empty = startLeague(config, world, [], T0)
    expect(empty.clock.events.every((e) => e.kind === 'anchor')).toBe(true)
    const joined = addSeat(empty, world, 'jogador-1', comp.teamIds[0]!, T0)
    expect(joined.ok).toBe(true)
    if (!joined.ok) return
    expect(joined.league.seats).toHaveLength(1)
    expect(joined.league.clock.events.some((e) => e.kind === 'match')).toBe(true)
  })

  it('recusa clube que não existe, clube ocupado e técnico que já tem clube', () => {
    const l = createLeague(config, world, [{ teamId: comp.teamIds[0]!, playerId: 'jogador-1' }], T0)
    expect(addSeat(l, world, 'jogador-2', 'time-que-nao-existe', T0)).toEqual({ ok: false, error: 'unknown-team' })
    expect(addSeat(l, world, 'jogador-2', comp.teamIds[0]!, T0)).toEqual({ ok: false, error: 'team-taken' })
    expect(addSeat(l, world, 'jogador-1', comp.teamIds[1]!, T0)).toEqual({ ok: false, error: 'already-seated' })
  })

  it('sair devolve o clube à IA e tira as partidas dele do calendário', () => {
    const l = createLeague(config, world, [{ teamId: comp.teamIds[0]!, playerId: 'jogador-1' }], T0)
    expect(l.clock.events.some((e) => e.kind === 'match')).toBe(true)
    const out = removeSeat(l, world, 'jogador-1')
    expect(out.ok && out.deferred).toBe(false)
    if (out.ok) {
      expect(out.league.seats).toHaveLength(0)
      expect(out.league.clock.events.every((e) => e.kind === 'anchor')).toBe(true)
    }
    expect(removeSeat(l, world, 'ninguem')).toEqual({ ok: false, error: 'not-seated' })
  })

  it('sair no meio de um evento: joga o resto com a IA e a vaga fecha só quando o evento acaba', () => {
    let s: Stepped = { league: createLeague(config, world, [{ teamId: comp.teamIds[0]!, playerId: 'jogador-1' }], T0), world, actions: [] }
    for (let i = 0; i < 24 * 40 && !s.league.current; i++) s = processLeague(JSON.parse(JSON.stringify(s.league)) as LeagueState, s.world, T0 + i * 30 * MS_MINUTE, { turn: turnRunner })
    expect(s.league.current).toBeDefined()
    const out = removeSeat(s.league, s.world, 'jogador-1')
    expect(out.ok && out.deferred).toBe(true)
    if (!out.ok) return
    expect(out.league.seats[0]).toMatchObject({ leaving: true, status: 'autopilot' })
    const closed = dropLeavingSeats({ ...out.league, current: undefined }, s.world)
    expect(closed.seats).toHaveLength(0)
  })
})
