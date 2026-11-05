import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  dayOf,
  effectiveNow,
  gameDay,
  gameDate,
  newClock,
  nextEvent,
  nextTickAt,
  pauseClock,
  replanClock,
  resumeClock,
  scheduleEvents,
  slotTimes,
  startEvent,
  type ClockConfig,
} from '../src/engine/league/clock'
import { BANDS, MAX_DELAY_MS, MS_DAY, MS_HOUR, MS_MINUTE, PACES, bandOf, customBandProblem } from '../src/engine/league/pace'

// Sábado, 7 de novembro de 2026, 12h em São Paulo (UTC-3) = 15h UTC.
const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const START = '2026-02-01' as const
const day0 = dayOf(START)
/** Datas de jogo de um calendário de teste: um evento a cada 6 dias de jogo (sábado, domingo e quarta de um humano cobrem ~3 por semana de jogo). */
const everyThree = (n = 40) => Array.from({ length: n }, (_, i) => ({ day: day0 + 6 * (i + 1), kind: 'match' as const }))
const every = (step: number, n = 40) => Array.from({ length: n }, (_, i) => ({ day: day0 + step * (i + 1), kind: 'match' as const }))
const localMinuteOfDay = (t: number, cfg: ClockConfig) => (((t + cfg.tzOffsetMin * MS_MINUTE) % MS_DAY) + MS_DAY) % MS_DAY / MS_MINUTE
const localDow = (t: number, cfg: ClockConfig) => new Date(t + cfg.tzOffsetMin * MS_MINUTE).getUTCDay()

describe('faixas de horário', () => {
  it('os horários do futebol clássico caem nos instantes certos no fuso de São Paulo', () => {
    const cfg = DEFAULT_CONFIG('x')
    // De sábado 7/11 00:00 a domingo 8/11 23:59 (hora de SP).
    const from = Date.UTC(2026, 10, 7, 3, 0, 0)
    const to = Date.UTC(2026, 10, 9, 2, 59, 0)
    const times = slotTimes(from, to, cfg)
    // Sábado 16h, 18h30, 21h e domingo 11h, 16h, 18h30, 20h30 (hora de SP) = 19:00, 21:30, 00:00(+1), 14:00, 19:00, 21:30, 23:30 UTC.
    expect(times.map((t) => new Date(t).toISOString().slice(0, 16))).toEqual([
      '2026-11-07T19:00',
      '2026-11-07T21:30',
      '2026-11-08T00:00',
      '2026-11-08T14:00',
      '2026-11-08T19:00',
      '2026-11-08T21:30',
      '2026-11-08T23:30',
    ])
  })

  it('o fuso muda os instantes, não os horários locais', () => {
    const cfg: ClockConfig = { ...DEFAULT_CONFIG('x'), tzOffsetMin: 60 } // Europa central
    const times = slotTimes(Date.UTC(2026, 10, 6, 12), Date.UTC(2026, 10, 9, 12), cfg)
    expect(times.length).toBeGreaterThan(5)
    for (const t of times) {
      const mins = localMinuteOfDay(t, cfg)
      const dow = localDow(t, cfg)
      expect(BANDS.classic.some((s) => s.dow === dow && s.minute === mins)).toBe(true)
    }
  })

  it('faixa personalizada: no máximo 12 horários e 3 h entre dois no mesmo dia', () => {
    expect(customBandProblem([])).toBe('empty')
    expect(customBandProblem(Array.from({ length: 13 }, (_, i) => ({ dow: i % 7, minute: 600 + i * 200 })))).toBe('too-many')
    expect(customBandProblem([{ dow: 6, minute: 600 }, { dow: 6, minute: 700 }])).toBe('too-close')
    expect(customBandProblem([{ dow: 6, minute: 600 }, { dow: 6, minute: 780 }, { dow: 0, minute: 600 }])).toBeUndefined()
    expect(customBandProblem([{ dow: 9, minute: 600 }])).toBe('invalid')
  })
})

describe('agendamento dos eventos', () => {
  const cfg = DEFAULT_CONFIG('liga-a')

  it('todo evento cai num horário da faixa, respeita o mínimo entre eventos e o atraso máximo, e a ordem se mantém', () => {
    const { events } = scheduleEvents(cfg, day0, T0, everyThree())
    expect(events).toHaveLength(40)
    let prev = -Infinity
    for (const e of events) {
      const ideal = T0 + ((e.day - day0) / PACES.normal.daysPerDay) * MS_DAY
      expect(BANDS.classic.some((s) => s.dow === localDow(e.startAt, cfg) && s.minute === localMinuteOfDay(e.startAt, cfg))).toBe(true)
      expect(e.startAt - prev).toBeGreaterThanOrEqual(PACES.normal.minGapMs)
      // Sem a cascata, o atraso sobre o ideal fica em 36 h; com ela pode passar, mas nunca adianta.
      expect(e.startAt).toBeGreaterThanOrEqual(ideal)
      prev = e.startAt
    }
    // No ritmo normal (3 dias de jogo por dia real), 40 eventos de 6 em 6 dias levam ~80 dias reais.
    expect((events[39]!.startAt - T0) / MS_DAY).toBeGreaterThan(78)
    expect((events[39]!.startAt - T0) / MS_DAY).toBeLessThan(84)
    // A maior parte dos eventos fica dentro das 36 h de atraso sobre o ideal.
    const within = events.filter((e) => e.startAt - (T0 + ((e.day - day0) / PACES.normal.daysPerDay) * MS_DAY) <= MAX_DELAY_MS).length
    expect(within / events.length).toBeGreaterThan(0.9)
  })

  it('nunca repete o horário do evento anterior quando há outra opção', () => {
    const { events } = scheduleEvents(cfg, day0, T0, everyThree(60))
    let repeats = 0
    for (let i = 1; i < events.length; i++) {
      const a = events[i - 1]!
      const b = events[i]!
      if (localDow(a.startAt, cfg) === localDow(b.startAt, cfg) && localMinuteOfDay(a.startAt, cfg) === localMinuteOfDay(b.startAt, cfg)) repeats++
    }
    expect(repeats).toBe(0)
  })

  it('o sorteio é fixo para a mesma semente e muda com outra', () => {
    const a = scheduleEvents(cfg, day0, T0, everyThree()).events.map((e) => e.startAt)
    const again = scheduleEvents(cfg, day0, T0, everyThree()).events.map((e) => e.startAt)
    const other = scheduleEvents(DEFAULT_CONFIG('liga-b'), day0, T0, everyThree()).events.map((e) => e.startAt)
    expect(again).toEqual(a)
    expect(other).not.toEqual(a)
  })

  it('os ritmos escalam a duração: Rápido leva ~2,3 vezes menos tempo real que o Normal', () => {
    const normal = scheduleEvents(cfg, day0, T0, every(14)).events
    const fast = scheduleEvents({ ...cfg, pace: 'fast' }, day0, T0, every(14)).events
    const veryFast = scheduleEvents({ ...cfg, pace: 'very-fast' }, day0, T0, every(14)).events
    const span = (e: { startAt: number }[]) => e[e.length - 1]!.startAt - T0
    expect(span(normal) / span(fast)).toBeGreaterThan(2)
    expect(span(normal) / span(fast)).toBeLessThan(2.6)
    expect(span(fast)).toBeGreaterThan(span(veryFast))
    // O mínimo de 6 h do Bem rápido vale.
    for (let i = 1; i < veryFast.length; i++) expect(veryFast[i]!.startAt - veryFast[i - 1]!.startAt).toBeGreaterThanOrEqual(6 * MS_HOUR)
  })

  it('o mínimo entre eventos empurra os seguintes em cascata, e âncoras só fixam D sem ocupar horário', () => {
    // Eventos de jogo a cada dia no ritmo Bem rápido (14 dias por dia real): o ideal é a cada ~1,7 h, o mínimo (6 h) manda.
    const dense = Array.from({ length: 12 }, (_, i) => ({ day: day0 + i + 1, kind: 'match' as const }))
    const { events } = scheduleEvents({ ...cfg, pace: 'very-fast', band: bandOf('night') }, day0, T0, dense)
    for (let i = 1; i < events.length; i++) expect(events[i]!.startAt - events[i - 1]!.startAt).toBeGreaterThanOrEqual(6 * MS_HOUR)
    const mixed = scheduleEvents(cfg, day0, T0, [{ day: day0 + 3, kind: 'match' }, { day: day0 + 4, kind: 'anchor' }, { day: day0 + 6, kind: 'match' }])
    expect(mixed.events.map((e) => e.kind)).toEqual(['match', 'anchor', 'match'])
    expect(mixed.events[1]!.startAt).toBeGreaterThan(mixed.events[0]!.startAt)
  })
})

describe('a data do jogo D', () => {
  const cfg = DEFAULT_CONFIG('liga-d')

  it('vale a data do evento no horário dele, anda para frente e nunca passa da data do próximo evento antes do início', () => {
    const clock = newClock(cfg, T0, START, everyThree(10))
    expect(gameDay(clock, T0, cfg)).toBeCloseTo(day0, 6)
    let prev = -Infinity
    for (let t = T0; t < T0 + 12 * MS_DAY; t += 37 * MS_MINUTE) {
      const d = gameDay(clock, t, cfg)
      expect(d).toBeGreaterThanOrEqual(prev)
      prev = d
      const upcoming = clock.events.find((e) => e.startAt > t)
      if (upcoming) expect(d).toBeLessThan(upcoming.day + 1e-9)
    }
    // Cada evento, ao começar no horário, fixa D na data dele.
    let running = clock
    for (const e of clock.events.slice(0, 4)) {
      expect(gameDay(running, e.startAt, cfg)).toBeCloseTo(e.day, 6)
      running = startEvent(running, e.startAt).clock
    }
  })

  it('começar um evento fixa D na data dele e a anda dali em diante', () => {
    let clock = newClock(cfg, T0, START, everyThree(10))
    const first = nextEvent(clock)!
    const started = startEvent(clock, first.startAt)
    clock = started.clock
    expect(started.event.day).toBe(first.day)
    expect(gameDay(clock, first.startAt, cfg)).toBeCloseTo(first.day, 6)
    expect(gameDate(clock, first.startAt + 1, cfg)).toBe('2026-02-07')
    expect(nextEvent(clock)!.day).toBe(day0 + 12)
  })

  it('Avançar: o evento começa na hora, D salta e os horários dos eventos seguintes não mudam', () => {
    const clock = newClock(cfg, T0, START, everyThree(10))
    const before = clock.events.map((e) => e.startAt)
    const now = T0 + 3 * MS_HOUR // bem antes do primeiro horário
    expect(clock.events[0]!.startAt).toBeGreaterThan(now)
    const started = startEvent(clock, now)
    expect(gameDay(started.clock, now, cfg)).toBeCloseTo(day0 + 6, 6)
    expect(started.clock.events.map((e) => e.startAt)).toEqual(before.slice(1))
    // A interpolação até o seguinte continua válida, só mais rápida.
    const next = started.clock.events[0]!
    expect(gameDay(started.clock, next.startAt, cfg)).toBeCloseTo(next.day, 6)
  })
})

describe('pausar e retomar', () => {
  const cfg: ClockConfig = { ...DEFAULT_CONFIG('liga-p'), band: bandOf('night') }

  it('D e o relógio dos prazos congelam na pausa e continuam dali na retomada', () => {
    let clock = newClock(cfg, T0, START, everyThree(10))
    const pauseAt = T0 + 2 * MS_DAY
    const dPause = gameDay(clock, pauseAt, cfg)
    const effPause = effectiveNow(clock, pauseAt)
    clock = pauseClock(clock, pauseAt)
    for (const dt of [MS_HOUR, MS_DAY, 3 * MS_DAY]) {
      expect(gameDay(clock, pauseAt + dt, cfg)).toBeCloseTo(dPause, 9)
      expect(effectiveNow(clock, pauseAt + dt)).toBe(effPause)
    }
    const resumeAt = pauseAt + 3 * MS_DAY
    const resumed = resumeClock(clock, resumeAt, cfg, everyThree(10).filter((e) => e.day > dPause))
    expect(resumed.pausedAt).toBeUndefined()
    expect(gameDay(resumed, resumeAt, cfg)).toBeCloseTo(dPause, 9)
    // O relógio dos prazos descontou os 3 dias parados.
    expect(effectiveNow(resumed, resumeAt + MS_HOUR)).toBe(effPause + MS_HOUR)
    expect(resumed.pausedTotalMs).toBe(3 * MS_DAY)
  })

  it('os horários futuros são refeitos a partir de agora, dentro da faixa (nada às 4h numa liga "só à noite")', () => {
    let clock = newClock(cfg, T0, START, everyThree(10))
    // Pausa que atravessa vários horários agendados e é retomada de madrugada (3h30 local).
    const pauseAt = T0 + MS_HOUR
    clock = pauseClock(clock, pauseAt)
    const resumeAt = Date.UTC(2026, 10, 12, 6, 30) // 03h30 em São Paulo
    const day = gameDay(clock, resumeAt, cfg)
    const resumed = resumeClock(clock, resumeAt, cfg, everyThree(10).filter((e) => e.day > day))
    expect(resumed.events.length).toBeGreaterThan(0)
    for (const e of resumed.events) {
      expect(e.startAt).toBeGreaterThanOrEqual(resumeAt)
      const mins = localMinuteOfDay(e.startAt, cfg)
      expect([19 * 60, 20 * 60 + 30, 21 * 60 + 30, 22 * 60 + 30]).toContain(mins)
    }
  })

  it('pausar duas vezes seguidas não zera a primeira pausa, e retomar sem pausa não faz nada', () => {
    const clock = newClock(cfg, T0, START, everyThree(5))
    const paused = pauseClock(clock, T0 + 1000)
    expect(pauseClock(paused, T0 + 5000).pausedAt).toBe(T0 + 1000)
    expect(resumeClock(clock, T0 + 9000, cfg, [])).toBe(clock)
  })

  it('replanClock mantém a âncora e troca a lista de eventos (por exemplo, um sorteio de copa criou jogos novos)', () => {
    const clock = newClock(cfg, T0, START, everyThree(5))
    const replanned = replanClock(clock, cfg, [...everyThree(5), { day: day0 + 4, kind: 'match' }])
    expect(replanned.anchorAt).toBe(clock.anchorAt)
    expect(replanned.events.length).toBe(6)
    expect(replanned.events.map((e) => e.day)).toEqual([...replanned.events.map((e) => e.day)].sort((a, b) => a - b))
  })
})

describe('passagem diária', () => {
  it('o próximo tick é sempre às 4h locais, depois do instante dado', () => {
    const cfg = DEFAULT_CONFIG('t')
    const t = nextTickAt(Date.UTC(2026, 10, 7, 15, 0), cfg, 4) // sábado 12h em SP
    expect(new Date(t).toISOString()).toBe('2026-11-08T07:00:00.000Z') // domingo 04h em SP
    expect(nextTickAt(t, cfg, 4)).toBe(t + MS_DAY)
    // Exatamente na hora do tick, o próximo é o do dia seguinte.
    expect(nextTickAt(t - 1, cfg, 4)).toBe(t)
  })
})
