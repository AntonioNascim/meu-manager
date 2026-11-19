import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, advanceLeague, createLeague, defaultLeagueConfig, leagueView, pauseLeague, processLeague, weekPending } from '../src/engine/league'
import { MS_DAY, MS_HOUR, READY_WAIT_MS, WEEK_GRACE_MS } from '../src/engine/league/pace'
import { setSession, trainingWindow, weekStatus } from '../src/engine/training'
import { createLeagueWorld } from '../src/store/leagueWorld'
import { turnRunner } from '../src/store/game'

const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const world = createLeagueWorld(6, undefined, { cups: false })
const comp = world.season.competitions[0]!
const ANA = comp.teamIds[0]!
const BETO = comp.teamIds[1]!
const config = defaultLeagueConfig(DEFAULT_CONFIG('liga-week'), false)
const joined = () => T0
const make = () => createLeague(config, world, [{ teamId: ANA, playerId: 'ana' }, { teamId: BETO, playerId: 'beto' }], T0)
const deps = { turn: turnRunner }

describe('semana de treino na liga online', () => {
  it('no começo da liga os dois técnicos têm dias de treino por montar e a visão mostra isso só para quem consulta', () => {
    expect(trainingWindow(world, ANA).length).toBeGreaterThan(0)
    expect(weekPending(make(), world).sort()).toEqual([ANA, BETO].sort())
    const v = leagueView(make(), world, T0, joined, ANA)
    expect(v.week).toMatchObject({ ready: false, delegateAlways: false })
    expect(v.week?.missing.length).toBeGreaterThan(0)
    expect(leagueView(make(), world, T0, joined).week).toBeUndefined()
  })

  it('o Avançar do ADM só pula a espera: ninguém tem a semana montada por isso', () => {
    const l = make()
    const ev = l.clock.events.find((e) => e.kind === 'match')!
    const adv = advanceLeague(l, world, ev.startAt - 3 * MS_DAY, deps, 'ana')
    expect(adv.league.waiting).toBeDefined()
    expect(weekPending(adv.league, adv.world).length).toBe(2)
  })

  it('o tempo passa: quem não montou fica com a semana da comissão e quem montou mantém a sua', () => {
    const day = trainingWindow(world, ANA)[0]!
    const mine = { drill: 'finishing-box', intensity: 'intense' } as const
    const w = setSession(world, ANA, day, mine)
    const l = createLeague(config, w, [{ teamId: ANA, playerId: 'ana' }, { teamId: BETO, playerId: 'beto' }], T0)
    // alguns dias depois, a passagem diária leva o mundo adiante
    const stepped = processLeague(l, w, T0 + 3 * MS_DAY, deps)
    expect(stepped.world.season.currentDate > w.season.currentDate).toBe(true)
    // a semana de quem estava pendente foi completada (e depois seguiu o treino dos dias que passaram)
    expect(stepped.league.weekDeadline).toBeUndefined()
  })

  it('enquanto dura a folga depois de um evento, a passagem diária espera quem ainda não montou; passada a folga, a comissão monta e o mundo anda', () => {
    const l0 = make()
    const dueAt = T0 + 3 * MS_DAY
    const held = { ...l0, weekDeadline: dueAt + WEEK_GRACE_MS }
    const a = processLeague(held, world, dueAt, deps)
    expect(a.world.season.currentDate).toBe(world.season.currentDate)
    expect(a.league.nextTick).toBe(dueAt + WEEK_GRACE_MS)
    expect(weekPending(a.league, a.world).length).toBe(2)
    const b = processLeague(a.league, a.world, dueAt + WEEK_GRACE_MS + 1, deps)
    expect(b.world.season.currentDate > world.season.currentDate).toBe(true)
    expect(b.league.weekDeadline).toBeUndefined()
  })

  it('quem montou a semana não faz a liga esperar', () => {
    let w = world
    for (const team of [ANA, BETO]) for (const d of trainingWindow(world, team)) w = setSession(w, team, d, { drill: 'rondo', intensity: 'normal' })
    expect(weekPending(make(), w)).toEqual([])
    const dueAt = T0 + 3 * MS_DAY
    const l = { ...createLeague(config, w, [{ teamId: ANA, playerId: 'ana' }, { teamId: BETO, playerId: 'beto' }], T0), weekDeadline: dueAt + WEEK_GRACE_MS }
    expect(processLeague(l, w, dueAt, deps).world.season.currentDate > w.season.currentDate).toBe(true)
  })

  it('o jogo começa com as semanas completas (a partida não trava por treino)', () => {
    const l = make()
    const ev = l.clock.events.find((e) => e.kind === 'match')!
    let s = processLeague(l, world, ev.startAt + 1, deps)
    expect(s.league.waiting).toBeDefined()
    s = processLeague(s.league, s.world, ev.startAt + 1 + READY_WAIT_MS[config.clock.pace] + MS_HOUR, deps)
    expect(weekPending(s.league, s.world)).toEqual([])
  })

  it('na pausa o prazo da folga não corre e a visão não mostra horário', () => {
    const l = { ...make(), weekDeadline: T0 + WEEK_GRACE_MS }
    const paused = pauseLeague(l, T0 + MS_HOUR, 'ana')
    expect(leagueView(paused, world, T0 + MS_HOUR, joined, ANA).week?.deadlineAt).toBeUndefined()
    const running = leagueView(l, world, T0 + MS_HOUR, joined, ANA).week
    expect(running?.deadlineAt).toBe(T0 + WEEK_GRACE_MS)
  })

  it('"Delegar sempre" aparece na visão', () => {
    const w = { ...world, training: { ...world.training, delegateAlways: { [ANA]: true as const } } }
    expect(weekStatus(w, ANA).delegateAlways).toBe(true)
    expect(leagueView(make(), w, T0, joined, ANA).week?.delegateAlways).toBe(true)
  })
})
