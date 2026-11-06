import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, createLeague, defaultLeagueConfig, leagueView, pauseLeague, replanForPace, resumeLeague, setPlayerReady, processLeague, shouldStart } from '../src/engine/league'
import { MS_DAY, MS_MINUTE, ROOM_OPENS_BEFORE_MS } from '../src/engine/league/pace'
import { createLeagueWorld } from '../src/store/leagueWorld'
import { turnRunner } from '../src/store/game'

const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const world = createLeagueWorld(6, undefined, { cups: false })
const comp = world.season.competitions[0]!
const config = defaultLeagueConfig(DEFAULT_CONFIG('liga-view'), false)
const joined = () => T0
const make = () => createLeague(config, world, [{ teamId: comp.teamIds[0]!, playerId: 'ana' }, { teamId: comp.teamIds[1]!, playerId: 'beto' }], T0)

describe('visão da liga (B8.4)', () => {
  it('mostra só os eventos com partidas, o próximo com a sala e quem precisa dar Pronto', () => {
    const v = leagueView(make(), world, T0, joined)
    expect(v.events.length).toBeGreaterThan(0)
    expect(v.events.every((e) => e.kind === 'match')).toBe(true)
    expect(v.next?.roomOpensAt).toBe((v.next?.startAt ?? 0) - ROOM_OPENS_BEFORE_MS)
    expect(v.paused).toBe(false)
    expect(v.seats.map((s) => s.playerId)).toEqual(['ana', 'beto'])
    for (const id of v.next?.required ?? []) expect(v.next?.notReady).toContain(id)
  })

  it('Pronto marca o técnico e o tira da lista de quem falta; tirar o Pronto desfaz', () => {
    const l = make()
    const before = leagueView(l, world, T0, joined)
    const who = before.next?.required[0]
    expect(who).toBeDefined()
    const ready = setPlayerReady(l, who!, true, T0 + 1000)
    const v = leagueView(ready, world, T0, joined)
    expect(v.seats.find((s) => s.playerId === who)?.ready).toBe(true)
    expect(v.next?.notReady).not.toContain(who)
    expect(leagueView(setPlayerReady(ready, who!, false, T0 + 2000), world, T0, joined).next?.notReady).toContain(who)
  })

  it('dar Pronto conta como presença: ausente volta a ativo e zera as faltas', () => {
    const l = make()
    const absent = { ...l, seats: l.seats.map((s) => (s.playerId === 'ana' ? { ...s, status: 'absent' as const, missed: 2 } : s)) }
    const back = setPlayerReady(absent, 'ana', true, T0)
    expect(back.seats.find((s) => s.playerId === 'ana')).toMatchObject({ status: 'active', missed: 0, ready: true })
  })

  it('com todos prontos e a sala aberta, o evento começa antes do horário', () => {
    let l = make()
    const ev = l.clock.events.find((e) => e.kind === 'match')!
    const t = ev.startAt - 2 * MS_MINUTE
    const stepped0 = processLeague(l, world, t, { turn: turnRunner })
    l = stepped0.league
    if (l.clock.events[0]?.kind !== 'match') return
    const need = leagueView(l, world, t, joined).next?.required ?? []
    for (const id of need) l = setPlayerReady(l, id, true, t)
    if (need.length > 0) expect(shouldStart(l, world, t)).toBe('all-ready')
  })

  it('pausa aparece na visão com o limite de 30 dias; retomar tira', () => {
    const paused = pauseLeague(make(), T0 + 1000, 'ana')
    const v = leagueView(paused, world, T0 + 5000, joined)
    expect(v.paused).toBe(true)
    expect(v.autoResumeAt).toBe(T0 + 1000 + 30 * MS_DAY)
    const back = resumeLeague(paused, world, T0 + 9000, 'ana')
    expect(leagueView(back, world, T0 + 9000, joined).paused).toBe(false)
  })

  it('mudar o ritmo refaz os horários futuros: ritmo mais rápido aproxima os eventos', () => {
    const slow = make()
    const fast = replanForPace(slow, world, 'very-fast')
    expect(fast.config.clock.pace).toBe('very-fast')
    const lastSlow = slow.clock.events.at(-1)!.startAt
    const lastFast = fast.clock.events.at(-1)!.startAt
    expect(lastFast).toBeLessThan(lastSlow)
    expect(replanForPace(fast, world, 'very-fast')).toBe(fast)
  })

  it('não muda o ritmo no meio de um evento', () => {
    const l = make()
    const mid = { ...l, current: { date: '2026-01-01', startedAt: T0, pending: ['x'], all: ['x'], reason: 'time' as const } }
    expect(replanForPace(mid, world, 'calm')).toBe(mid)
  })

  it('durante o evento, só quem tem partida nele aparece em "playing" (quem não joga não tem o que ver ao vivo)', () => {
    const l = make()
    const ana = l.seats[0]!
    const mine = world.matches.find((m) => m.homeTeamId === ana.teamId || m.awayTeamId === ana.teamId)!
    const other = world.matches.find((m) => ![m.homeTeamId, m.awayTeamId].includes(l.seats[0]!.teamId) && ![m.homeTeamId, m.awayTeamId].includes(l.seats[1]!.teamId))!
    const during = (ids: string[]) => ({ ...l, current: { date: mine.date, startedAt: T0, pending: ids, all: ids, reason: 'time' as const } })
    expect(leagueView(during([mine.id]), world, T0, joined).current?.playing).toContain('ana')
    expect(leagueView(during([other.id]), world, T0, joined).current?.playing).toEqual([])
  })

  it('sugestões de ausência aparecem na visão (a API só as entrega ao ADM)', () => {
    const l = make()
    const stale = { ...l, seats: l.seats.map((s) => (s.playerId === 'ana' ? { ...s, missed: 9 } : s)) }
    expect(leagueView(stale, world, T0, joined).suggestions.map((s) => s.playerId)).toEqual(['ana'])
  })
})
