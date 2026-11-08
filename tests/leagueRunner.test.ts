import { describe, expect, it } from 'vitest'
import { simulateMatch } from '../src/engine/match'
import {
  DEFAULT_CONFIG,
  advanceLeague,
  createLeague,
  dateOfDay,
  deadlineExpired,
  deadlineIn,
  deadlineLeft,
  defaultLeagueConfig,
  eventDaysOf,
  nextWakeup,
  notReady,
  pauseLeague,
  previewAdvance,
  processLeague,
  requiredSeats,
  resumeLeague,
  setReady,
  setSeatStatus,
  submitResult,
  worldDateAt,
} from '../src/engine/league'
import type { LeagueState, Stepped } from '../src/engine/league'
import { MAX_PAUSE_MS, MS_DAY, MS_HOUR, MS_MINUTE, READY_WAIT_MS, ROOM_OPENS_BEFORE_MS } from '../src/engine/league/pace'
import { humanMatchInput } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { createGame, turnRunner } from '../src/store/game'

// Sábado, 7 de novembro de 2026, 12h em São Paulo.
const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const base = createGame(6, 'team-imp', { cups: false }).season
const serieA = base.season.competitions[0]!
const serieB = base.season.competitions[1]!
const SEATS = [
  { teamId: serieA.teamIds[0]!, playerId: 'jogador-1' },
  { teamId: serieA.teamIds[7]!, playerId: 'jogador-2' },
]
const deps = { turn: turnRunner }

const make = (direct = true, seed = 'liga-teste') => {
  const league = createLeague(defaultLeagueConfig(DEFAULT_CONFIG(seed), direct), base, SEATS, T0)
  return { league, world: base }
}

/** Anda o tempo de `start` a `end` chamando a liga a cada `stepMs`, como faria o alarme. Cópia pelo JSON a cada passo: o estado da liga é só dado. */
function run(from: Stepped, start: number, end: number, stepMs = 30 * MS_MINUTE, onStep?: (now: number, s: Stepped) => void): Stepped {
  let s = from
  for (let t = start; t <= end; t += stepMs) {
    s = processLeague(JSON.parse(JSON.stringify(s.league)) as LeagueState, s.world, t, deps)
    onStep?.(t, s)
  }
  return s
}
const initial = (x: { league: LeagueState; world: SeasonState }): Stepped => ({ ...x, actions: [] })

describe('liga online: eventos e resultado direto', () => {
  it('cada evento começa no horário, as partidas humanas são jogadas uma vez cada e o mundo nunca passa do próximo evento antes dele', () => {
    const start = make()
    const final = run(initial(start), T0, T0 + 24 * MS_DAY, 30 * MS_MINUTE, (now, s) => {
      const ev = s.league.clock.events[0]
      // Antes do início do próximo evento de partidas, nenhuma partida dele foi jogada (nem as de IA contra IA da mesma liga).
      if (ev && ev.kind === 'match' && now < ev.startAt) {
        const date = dateOfDay(ev.day)
        expect(s.world.matches.filter((m) => m.date === date && m.status !== 'scheduled')).toEqual([])
        expect(s.world.season.currentDate < date).toBe(true)
      }
    })
    expect(final.world.season.currentDate > base.season.currentDate).toBe(true)
    // Toda partida de humano até a data atual do mundo foi jogada.
    const humans = new Set(SEATS.map((s) => s.teamId))
    const due = final.world.matches.filter((m) => m.date <= final.world.season.currentDate && (humans.has(m.homeTeamId) || humans.has(m.awayTeamId)))
    expect(due.length).toBeGreaterThan(2)
    expect(due.every((m) => m.status === 'finished')).toBe(true)
    // Houve partidas da divisão sem humanos em datas que não são evento: foram jogadas pela passagem diária, em modo rápido.
    const humanDates = new Set(final.world.matches.filter((m) => humans.has(m.homeTeamId) || humans.has(m.awayTeamId)).map((m) => m.date))
    expect(final.world.matches.filter((m) => m.competitionId === serieB.id && m.status === 'finished' && !humanDates.has(m.date)).length).toBeGreaterThan(0)
    // Os eventos começaram pelo horário (ninguém deu pronto).
    const started = final.league.log.filter((l) => l.type === 'event-started')
    expect(started.length).toBeGreaterThan(2)
    for (const l of started) expect(l.detail).toBe('time')
  }, 300_000)

  it('a divisão sem humanos anda pela passagem diária, em modo rápido, e a com humanos só nos eventos', () => {
    const start = make()
    // Passa 8 dias reais (o mundo começa em 1/1 e o primeiro jogo humano é só em 25/1): só a passagem diária anda, e a Série B (sem humanos) já jogou.
    const s = run(initial(start), T0, T0 + 8 * MS_DAY, 30 * MS_MINUTE)
    const date = s.world.season.currentDate
    const serieBMatches = s.world.matches.filter((m) => m.competitionId === serieB.id)
    expect(date > base.season.currentDate).toBe(true)
    // A passagem diária pôs o mundo na data devida de D (no máximo a data do próximo evento menos 1).
    expect(date <= worldDateAt(s.league, T0 + 8 * MS_DAY)).toBe(true)
    // O que a passagem diária jogou é exatamente o que cabe até a data do mundo, em modo rápido (sem humano, sem lance a lance): nem a mais, nem a menos.
    expect(serieBMatches.filter((m) => m.date <= date).every((m) => m.status === 'finished')).toBe(true)
    expect(serieBMatches.filter((m) => m.date > date).every((m) => m.status === 'scheduled')).toBe(true)
    expect(s.world.matches.filter((m) => m.competitionId === serieA.id && m.status === 'finished')).toEqual([])
    // As partidas de IA contra IA da Série A só saem junto com o evento humano da data.
    const humanIds = new Set(SEATS.map((st) => st.teamId))
    for (const m of s.world.matches.filter((x) => x.competitionId === serieA.id && x.status === 'finished')) {
      const sameDayHuman = s.world.matches.some((o) => o.date === m.date && o.competitionId === serieA.id && o.status === 'finished' && (humanIds.has(o.homeTeamId) || humanIds.has(o.awayTeamId)))
      expect(sameDayHuman).toBe(true)
    }
  }, 300_000)

  it('é determinístico e o estado da liga sobrevive a ser gravado e lido (JSON) a cada passo', () => {
    const a = run(initial(make()), T0, T0 + 6 * MS_DAY)
    const b = run(initial(make()), T0, T0 + 6 * MS_DAY)
    expect(JSON.stringify(a.league)).toBe(JSON.stringify(b.league))
    expect(a.world.season.currentDate).toBe(b.world.season.currentDate)
    const score = (s: Stepped) => s.world.matches.filter((m) => m.status === 'finished').map((m) => [m.id, m.result?.homeGoals, m.result?.awayGoals])
    expect(score(a)).toEqual(score(b))
    // Outra semente de liga muda os horários.
    const c = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('outra'), true), base, SEATS, T0)
    expect(c.clock.events.map((e) => e.startAt)).not.toEqual(make().league.clock.events.map((e) => e.startAt))
  }, 300_000)

  it('nextWakeup devolve o próximo alarme: o tick, a sala do próximo evento ou o horário dele', () => {
    const { league } = make()
    const wake = nextWakeup(league, T0)!
    const ev = league.clock.events[0]!
    expect(wake).toBeLessThanOrEqual(Math.min(league.nextTick, ev.startAt - ROOM_OPENS_BEFORE_MS))
    expect(wake).toBeGreaterThan(T0)
  })
})

describe('Pronto', () => {
  it('só quem tem partida no evento precisa dar pronto; com a sala aberta e todos prontos o evento começa antes do horário', () => {
    const { league, world } = make()
    const need = requiredSeats(league, world)
    expect(need.length).toBeGreaterThan(0)
    const ev = league.clock.events[0]!
    // Antes da sala abrir, nunca começa por "todos prontos".
    let l = league
    for (const s of need) l = setReady(l, s.playerId)
    expect(notReady(l, world)).toEqual([])
    const early = processLeague(l, world, ev.startAt - ROOM_OPENS_BEFORE_MS - MS_MINUTE, deps)
    expect(early.actions.find((a) => a.type === 'event-started')).toBeUndefined()
    // Com a sala aberta e todos prontos: começa na hora.
    const room = processLeague(l, world, ev.startAt - ROOM_OPENS_BEFORE_MS + MS_MINUTE, deps)
    expect(room.league.log.some((e) => e.type === 'event-started' && e.detail === 'all-ready')).toBe(true)
    // Faltando um, espera o horário.
    if (need.length > 1) {
      const partial = setReady(league, need[0]!.playerId)
      const wait = processLeague(partial, world, ev.startAt - ROOM_OPENS_BEFORE_MS + MS_MINUTE, deps)
      expect(wait.league.log.some((e) => e.type === 'event-started')).toBe(false)
      // No horário a sala abre e espera; a partida só começa sozinha quando o prazo do ritmo acaba, e quem faltou fica trancado (a IA joga por ele).
      const atTime = processLeague(partial, world, ev.startAt, deps)
      expect(atTime.league.current).toBeUndefined()
      expect(atTime.league.waiting).toBeDefined()
      expect(nextWakeup(atTime.league, ev.startAt)).toBe(ev.startAt + READY_WAIT_MS.normal)
      const late = processLeague(atTime.league, atTime.world, ev.startAt + READY_WAIT_MS.normal, deps)
      expect(late.league.log.some((e) => e.type === 'event-started' && e.detail === 'time')).toBe(true)
      expect(late.league.waiting).toBeUndefined()
    }
  }, 120_000)

  it('ausente e autopiloto contam como prontos, e a IA assume o time na partida', () => {
    const { league, world } = make()
    let l = league
    for (const s of requiredSeats(l, world)) l = setSeatStatus(l, s.playerId, s.playerId === 'jogador-1' ? 'absent' : 'autopilot')
    expect(notReady(l, world)).toEqual([])
    const ev = l.clock.events[0]!
    const s = processLeague(l, world, ev.startAt - ROOM_OPENS_BEFORE_MS + MS_MINUTE, deps)
    expect(s.league.log.some((e) => e.type === 'event-started' && e.detail === 'all-ready')).toBe(true)
  }, 120_000)
})

describe('Avançar (ADM)', () => {
  it('só pula a espera até o horário: a sala abre e a partida espera o Pronto; D salta e os horários seguintes ficam como estavam', () => {
    const { league, world } = make()
    const preview = previewAdvance(league, world)!
    expect(preview.date).toBe(dateOfDay(league.clock.events[0]!.day))
    expect(preview.notReady.length).toBeGreaterThan(0)
    const after = league.clock.events.slice(1).map((e) => e.startAt)
    const now = T0 + MS_HOUR
    const stepped = advanceLeague(league, world, now, deps, 'adm')
    expect(stepped.league.log.find((e) => e.type === 'advance')?.by).toBe('adm')
    // A partida não começou: a sala espera o Pronto até o prazo do ritmo.
    expect(stepped.league.current).toBeUndefined()
    expect(stepped.league.waiting).toEqual({ day: league.clock.events[0]!.day, openedAt: now, deadline: expect.any(Number) })
    expect(stepped.league.clock.events[0]!.startAt).toBe(now)
    // Avançar de novo com a sala esperando não faz nada.
    expect(advanceLeague(stepped.league, stepped.world, now + MS_MINUTE, deps, 'adm').league).toBe(stepped.league)
    // Os horários dos eventos seguintes não mudaram.
    expect(stepped.league.clock.events.slice(1, 1 + after.length).map((e) => e.startAt)).toEqual(after.slice(0, stepped.league.clock.events.length - 1))
    // Sem Pronto de ninguém, nada anda até o prazo; todos prontos começam juntos (nenhum trancado).
    expect(processLeague(stepped.league, stepped.world, now + READY_WAIT_MS.normal - MS_MINUTE, deps).league.current).toBeUndefined()
    const all = requiredSeats(stepped.league, stepped.world).reduce((l, s) => setReady(l, s.playerId), stepped.league)
    const go = processLeague(all, stepped.world, now + MS_MINUTE, deps)
    expect(go.league.log.some((e) => e.type === 'event-started' && e.detail === 'all-ready')).toBe(true)
    expect(go.world.season.currentDate >= preview.date).toBe(true)
    expect(go.league.current?.locked).toBeUndefined()
    // Pausada, a espera congela e volta de onde parou.
    const p = pauseLeague(stepped.league, now + 5 * MS_MINUTE)
    expect(nextWakeup(p, now + 6 * MS_MINUTE)).toBe(now + 5 * MS_MINUTE + MAX_PAUSE_MS)
    const r = resumeLeague(p, stepped.world, now + 2 * MS_HOUR)
    expect(r.waiting).toBeDefined()
    expect(r.clock.events[0]!.day).toBe(league.clock.events[0]!.day)
    expect(nextWakeup(r, now + 2 * MS_HOUR)).toBe(now + 2 * MS_HOUR + READY_WAIT_MS.normal - 5 * MS_MINUTE)
  }, 120_000)
})

describe('Pausar e retomar', () => {
  it('pausada, nada anda: nem o mundo, nem os eventos, nem os prazos; retomada, tudo recomeça de onde parou', () => {
    const start = run(initial(make()), T0, T0 + 2 * MS_DAY)
    const pausedAt = T0 + 2 * MS_DAY
    const deadline = deadlineIn(start.league, pausedAt, 48 * MS_HOUR)
    const paused = { ...start, league: pauseLeague(start.league, pausedAt, 'adm') }
    const before = JSON.stringify(paused.world)
    const left = deadlineLeft(paused.league, pausedAt, deadline)
    const later = run(paused, pausedAt + 30 * MS_MINUTE, pausedAt + 5 * MS_DAY, 3 * MS_HOUR)
    expect(JSON.stringify(later.world)).toBe(before)
    expect(later.actions).toEqual([])
    // Os prazos congelaram.
    expect(deadlineLeft(later.league, pausedAt + 5 * MS_DAY, deadline)).toBe(left)
    expect(deadlineExpired(later.league, pausedAt + 5 * MS_DAY, deadline)).toBe(false)
    expect(nextWakeup(later.league, pausedAt + MS_HOUR)).toBe(pausedAt + MAX_PAUSE_MS)
    // Retoma 5 dias depois: os horários futuros são refeitos a partir de agora, e os prazos voltam a correr.
    const resumeAt = pausedAt + 5 * MS_DAY
    const resumed = resumeLeague(later.league, later.world, resumeAt, 'adm')
    expect(resumed.clock.pausedAt).toBeUndefined()
    expect(resumed.clock.events[0]!.startAt).toBeGreaterThanOrEqual(resumeAt)
    expect(deadlineLeft(resumed, resumeAt + 10 * MS_HOUR, deadline)).toBe(left - 10 * MS_HOUR)
    expect(resumed.log.at(-1)?.type).toBe('resume')
    // O prazo só expira depois do tempo que sobrava, contado no relógio efetivo e não no de parede.
    expect(deadlineExpired(resumed, resumeAt + left + 1, deadline)).toBe(true)
    // Depois de retomar, a liga volta a andar.
    const go = run({ league: resumed, world: later.world, actions: [] }, resumeAt, resumeAt + 4 * MS_DAY)
    expect(go.world.season.currentDate > later.world.season.currentDate).toBe(true)
  }, 300_000)

  it('a pausa dura no máximo 30 dias: depois a liga volta sozinha', () => {
    const start = initial(make())
    const paused = { ...start, league: pauseLeague(start.league, T0, 'adm') }
    const auto = processLeague(paused.league, paused.world, T0 + MAX_PAUSE_MS + MS_HOUR, deps)
    expect(auto.league.clock.pausedAt).toBeUndefined()
    expect(auto.actions.some((a) => a.type === 'resumed' && a.auto)).toBe(true)
    expect(auto.league.log.some((l) => l.type === 'auto-resume')).toBe(true)
  }, 120_000)
})

describe('modo ao vivo (a B7 entrega os resultados)', () => {
  it('o evento fica aberto até todas as partidas humanas terem resultado; a liga não anda sozinha enquanto isso', () => {
    const { league, world } = make(false)
    const ev = league.clock.events[0]!
    const open = processLeague(league, world, ev.startAt, deps)
    expect(open.league.current).toBeUndefined()
    let s = processLeague({ ...open.league, seats: open.league.seats.map((x) => ({ ...x, ready: true })) }, open.world, ev.startAt, deps)
    expect(s.league.current).toBeDefined()
    const pending = [...s.league.current!.pending]
    expect(pending.length).toBeGreaterThan(0)
    expect(nextWakeup(s.league, ev.startAt)).toBeUndefined()
    // Passam horas e nada anda enquanto os resultados não chegam.
    const idle = processLeague(s.league, s.world, ev.startAt + 6 * MS_HOUR, deps)
    expect(idle.world).toBe(s.world)
    expect(idle.league.current?.pending).toEqual(pending)
    // Cada resultado registrado: o último fecha o evento.
    const humans = new Set(SEATS.map((x) => x.teamId))
    for (const id of pending) {
      const match = s.world.matches.find((m) => m.id === id)!
      s = submitResult(s, id, simulateMatch(humanMatchInput(s.world, match, humans)), ev.startAt + MS_HOUR)
    }
    expect(s.league.current).toBeUndefined()
    expect(s.actions.some((a) => a.type === 'event-ended')).toBe(true)
    expect(s.world.matches.filter((m) => pending.includes(m.id)).every((m) => m.status === 'finished')).toBe(true)
    // Um resultado repetido ou de partida que não está pendente é ignorado.
    const again = submitResult(s, pending[0]!, simulateMatch(humanMatchInput(s.world, s.world.matches.find((m) => m.id === pending[0])!, humans)), ev.startAt + 2 * MS_HOUR)
    expect(again).toBe(s)
  }, 120_000)
})

describe('calendário do mundo', () => {
  it('os eventos são as datas com partida de humano; a virada de cada país vira âncora', () => {
    const days = eventDaysOf(base, SEATS.map((s) => ({ ...s, status: 'active' as const, ready: false })))
    expect(days.some((d) => d.kind === 'match')).toBe(true)
    expect(days.some((d) => d.kind === 'anchor')).toBe(true)
    expect(days.map((d) => d.day)).toEqual([...days.map((d) => d.day)].sort((a, b) => a - b))
  })
})
