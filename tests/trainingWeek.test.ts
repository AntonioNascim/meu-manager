import { describe, expect, it } from 'vitest'
import { TRAINING } from '../src/engine/config'
import { advanceToMatchday, createGame, finishPendingMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import type { SeasonState } from '../src/engine/season/calendar'
import { addDays } from '../src/engine/season/dates'
import { DRILLS, agendaOf, applyTraining, clearAgenda, committeeAgenda, delegateAgenda, fitnessProfile, pruneAgenda, rehearsal, sessionEffect, setAgenda, setSession, setTrainingPlan, trainingWindow } from '../src/engine/training'
import type { AttributeName, TrainingIntensity } from '../src/engine/types'
import { DRILL_IDS, DRILL_THEMES, GOALKEEPER_ATTRIBUTES, MENTAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, TECHNICAL_ATTRIBUTES } from '../src/engine/types'

const ALL_ATTRIBUTES = [...TECHNICAL_ATTRIBUTES, ...PHYSICAL_ATTRIBUTES, ...MENTAL_ATTRIBUTES, ...GOALKEEPER_ATTRIBUTES] as const

const USER = 'team-imp'

/** Joga duas rodadas e para depois do 3º jogo: a temporada já corre (o treino rende) e há dias até o próximo jogo. */
function midSeason(): { game: Game; state: SeasonState } {
  let game = createGame(3, USER, { cups: false })
  for (let i = 0; i < 3; i++) {
    while (!game.pendingUserMatch) game = advanceToMatchday(game)
    const live = beginLive(game)
    live.match.playUntil(120)
    game = finishPendingMatch(game, live.match.result())
    clearLive()
  }
  return { game, state: game.season }
}

const squad = (s: SeasonState) => s.players.filter((p) => p.teamId === USER)
/** Soma de todos os atributos do elenco (quanto o treino acrescentou) e a parte dos físicos e dos técnicos. */
function totals(s: SeasonState) {
  let all = 0
  let physical = 0
  let technical = 0
  for (const p of squad(s)) {
    for (const n of ALL_ATTRIBUTES) {
      if (p.position !== 'GK' && (n === 'reflexes' || n === 'rushingOut')) continue
      all += p.attributes[n as AttributeName]
      if ((PHYSICAL_ATTRIBUTES as readonly string[]).includes(n)) physical += p.attributes[n as AttributeName]
      if ((TECHNICAL_ATTRIBUTES as readonly string[]).includes(n)) technical += p.attributes[n as AttributeName]
    }
  }
  return { all, physical, technical }
}

const week = (s: SeasonState) => trainingWindow(s, USER)

describe('janela da semana de treino', () => {
  it('vai de hoje até o dia anterior ao próximo jogo, no máximo 7 dias', () => {
    const { state } = midSeason()
    const w = week(state)
    expect(w.length).toBeGreaterThan(0)
    expect(w.length).toBeLessThanOrEqual(7)
    // o time jogou hoje: a janela começa amanhã
    expect(w[0]).toBe(addDays(state.season.currentDate, 1))
    // os dias são seguidos
    w.slice(1).forEach((d, i) => expect(d).toBe(addDays(w[i] as string, 1)))
  })

  it('só aceita dias da janela e exercícios do catálogo', () => {
    const { state } = midSeason()
    const w = week(state)
    expect(() => setSession(state, USER, '1999-01-01', { drill: 'rondo', intensity: 'normal' })).toThrow(/semana de treino/)
    expect(() => setSession(state, USER, w[0] as string, { drill: 'nao-existe' as never, intensity: 'normal' })).toThrow(/inválido/)
    expect(() => setSession(state, USER, w[0] as string, { drill: 'rondo', intensity: 'turbo' as never })).toThrow(/inválido/)
    const ok = setSession(state, USER, w[0] as string, { drill: 'rondo', intensity: 'light' })
    expect(agendaOf(ok.training, USER)[w[0] as string]).toEqual({ drill: 'rondo', intensity: 'light' })
    expect(agendaOf(setSession(ok, USER, w[0] as string, null).training, USER)).toEqual({})
  })

  it('setAgenda troca tudo de uma vez e recusa dia fora da janela', () => {
    const { state } = midSeason()
    const w = week(state)
    const next = setAgenda(state, USER, { [w[0] as string]: { drill: 'full-match', intensity: 'normal' }, [w[1] as string]: null })
    expect(Object.keys(agendaOf(next.training, USER))).toEqual([w[0]])
    expect(() => setAgenda(state, USER, { '2099-01-01': { drill: 'rondo', intensity: 'normal' } })).toThrow()
    expect(agendaOf(clearAgenda(next, USER).training, USER)).toEqual({})
  })
})

describe('a agenda só redistribui o ganho (não soma)', () => {
  const run = (state: SeasonState, fill: (date: string, i: number) => { drill: never; intensity: TrainingIntensity } | null, plan?: { intensity: TrainingIntensity; focus: 'balanced' | 'physical' }) => {
    let s = state
    if (plan) s = setTrainingPlan(s, USER, plan)
    const w = week(s)
    s = { ...s, training: { ...s.training, agenda: undefined } }
    w.forEach((d, i) => {
      const session = fill(d, i)
      if (session) s = setSession(s, USER, d, session)
    })
    const from = s.season.currentDate
    return applyTraining(s, from, addDays(from, w.length), USER)
  }

  it('sem agenda (ou agenda vazia) o resultado é exatamente o de antes', () => {
    const { state } = midSeason()
    const from = state.season.currentDate
    const to = addDays(from, 5)
    const a = applyTraining(state, from, to, USER)
    const b = applyTraining({ ...state, training: { ...state.training, agenda: {} } }, from, to, USER)
    expect(b.players).toEqual(a.players)
    expect(b.academy).toEqual(a.academy)
  })

  it('uma semana de exercícios "normais e equilibrados" rende o mesmo que o plano Normal/equilibrado', () => {
    const { state } = midSeason()
    const base = run(state, () => null, { intensity: 'normal', focus: 'balanced' })
    const agenda = run(state, () => ({ drill: 'full-match' as never, intensity: 'normal' }), { intensity: 'normal', focus: 'balanced' })
    const a = totals(base)
    const b = totals(agenda)
    expect(Math.abs(b.all - a.all)).toBeLessThanOrEqual(Math.max(6, a.all * 0.0005))
  })

  it('exercício físico leva o ganho para os atributos físicos sem aumentar o total', () => {
    const { state } = midSeason()
    const base = run(state, () => ({ drill: 'full-match' as never, intensity: 'normal' }), { intensity: 'normal', focus: 'balanced' })
    const phys = run(state, () => ({ drill: 'conditioning-circuit' as never, intensity: 'normal' }), { intensity: 'normal', focus: 'balanced' })
    const t0 = totals(state)
    const gainBase = totals(base)
    const gainPhys = totals(phys)
    // mais ganho físico (e menos técnico) do que o equilibrado
    expect(gainPhys.physical - t0.physical).toBeGreaterThan(gainBase.physical - t0.physical)
    expect(gainPhys.technical - t0.technical).toBeLessThanOrEqual(gainBase.technical - t0.technical)
    // o total muda pouco (redistribui, não soma)
    expect(Math.abs(gainPhys.all - gainBase.all)).toBeLessThanOrEqual(Math.max(12, (gainBase.all - t0.all) * 0.25))
  })

  it('a intensidade por dia vale como a do plano: Intensa evolui mais que Leve', () => {
    const { state } = midSeason()
    const light = totals(run(state, () => ({ drill: 'full-match' as never, intensity: 'light' })))
    const intense = totals(run(state, () => ({ drill: 'full-match' as never, intensity: 'intense' })))
    expect(intense.all).toBeGreaterThanOrEqual(light.all)
  })

  it('folga quase não evolui', () => {
    const { state } = midSeason()
    const rest = totals(run(state, () => ({ drill: 'rest' as never, intensity: 'normal' })))
    const normal = totals(run(state, () => ({ drill: 'full-match' as never, intensity: 'normal' })))
    expect(rest.all).toBeLessThanOrEqual(normal.all)
  })

  it('a agenda dos dias que passaram é descartada depois do avanço', () => {
    const { state } = midSeason()
    const w = week(state)
    let s = state
    w.forEach((d) => (s = setSession(s, USER, d, { drill: 'rondo', intensity: 'normal' })))
    const mid = addDays(w[0] as string, 2)
    const after = applyTraining(s, state.season.currentDate, mid, USER)
    expect(Object.keys(agendaOf(after.training, USER)).every((d) => d >= mid)).toBe(true)
    expect(pruneAgenda(after.training, '2999-01-01').agenda).toEqual({})
  })
})

describe('efeito de cada dia', () => {
  it('a carga do exercício sobe o risco de lesão e tira um pouco da recuperação', () => {
    const heavy = sessionEffect({ drill: 'three-a-side', intensity: 'normal' })
    const light = sessionEffect({ drill: 'rondo', intensity: 'normal' })
    expect(heavy.injury).toBeGreaterThan(light.injury)
    expect(heavy.recovery).toBeLessThan(light.recovery)
    expect(sessionEffect({ drill: 'rest', intensity: 'intense' }).injury).toBe(0)
  })

  it('todo exercício tem catálogo, e só os dias leves mexem no ganho', () => {
    for (const id of DRILL_IDS) {
      const d = DRILLS[id]
      expect(d.load).toBeGreaterThan(0)
      expect(d.growth).toBeGreaterThan(0)
      expect(d.growth).toBeLessThanOrEqual(1)
    }
    expect(DRILL_IDS.filter((id) => DRILLS[id].growth !== 1).sort()).toEqual(['recovery-session', 'video-session'])
  })

  it('a recuperação e o teto da condição seguem a agenda do intervalo', () => {
    const { state } = midSeason()
    const w = week(state)
    let rested = state
    w.forEach((d) => (rested = setSession(rested, USER, d, { drill: 'rest', intensity: 'light' })))
    const from = state.season.currentDate
    const base = fitnessProfile(state.training, USER, w.length, from)
    const withRest = fitnessProfile(rested.training, USER, w.length + 1, from)
    expect(withRest.recovery).toBeGreaterThan(base.recovery)
    // sem a data de início ou de outro time: o plano, como antes
    expect(fitnessProfile(rested.training, USER, w.length)).toEqual(fitnessProfile(state.training, USER, w.length))
    expect(fitnessProfile(rested.training, 'team-out', w.length, from)).toEqual(fitnessProfile(state.training, 'team-out', w.length, from))
    expect(base.ceiling).toBe(TRAINING.intensity.normal.fitnessCeiling)
  })
})

describe('comissão técnica e medidores', () => {
  it('delegar monta a semana inteira: véspera leve de bola parada, e folga só em semana longa', () => {
    const { state } = midSeason()
    const w = week(state)
    const plan = { intensity: 'intense' as const, focus: 'physical' as const }
    const out = committeeAgenda(plan, w)
    expect(Object.keys(out)).toEqual(w)
    expect(out[w[w.length - 1] as string]).toEqual({ drill: 'corners-for', intensity: 'light' })
    expect(w.length >= 6 ? Object.values(out).some((s) => s.drill === 'rest') : true).toBe(true)
    const delegated = delegateAgenda(state, USER, plan)
    expect(Object.keys(agendaOf(delegated.training, USER))).toEqual(w)
    // a semana longa (7 dias) tem um dia de folga
    const seven = Array.from({ length: 7 }, (_, i) => addDays('2027-03-01', i))
    expect(Object.values(committeeAgenda(plan, seven)).filter((s) => s.drill === 'rest')).toHaveLength(1)
  })

  it('os medidores de "ensaiado" contam os temas da semana', () => {
    expect(Object.values(rehearsal([])).every((v) => v === 0)).toBe(true)
    const one = rehearsal([{ drill: 'build-from-back', intensity: 'normal' }])
    expect(one['build-up']).toBe(1)
    const many = rehearsal([
      { drill: 'build-from-back', intensity: 'normal' },
      { drill: 'keeper-start', intensity: 'normal' },
      { drill: 'wide-exit', intensity: 'normal' },
    ])
    expect(many['build-up']).toBe(3)
    expect(many.attack).toBe(0)
    expect(rehearsal([{ drill: 'rest', intensity: 'normal' }])['set-piece']).toBe(0)
    expect(DRILL_THEMES).toHaveLength(6)
  })
})

describe('no jogo: delegar a semana e avançar até o próximo jogo', () => {
  it('a agenda dos dias que passaram some, o jogo segue e o resultado do elenco é coerente', () => {
    const { game } = midSeason()
    const delegated: Game = { ...game, season: delegateAgenda(game.season, USER, { intensity: 'normal', focus: 'balanced' }) }
    const days = Object.keys(agendaOf(delegated.season.training, USER))
    expect(days.length).toBeGreaterThan(0)
    const toMatchday = (g: Game) => {
      let x = g
      while (!x.pendingUserMatch) x = advanceToMatchday(x)
      return x
    }
    const after = toMatchday(delegated)
    expect(after.pendingUserMatch).toBeDefined()
    // chegou ao dia do jogo: nenhum dia anterior sobra na agenda
    const left = Object.keys(agendaOf(after.season.training, USER))
    expect(left.every((d) => d >= after.season.season.currentDate)).toBe(true)
    // o elenco chega inteiro e com condição válida
    for (const p of squad(after.season)) {
      expect(p.condition.fitness).toBeGreaterThanOrEqual(0)
      expect(p.condition.fitness).toBeLessThanOrEqual(100)
    }
    // sem agenda, o mesmo avanço dá um elenco com a mesma força total (a agenda "normal e equilibrada" só redistribui)
    const plain = toMatchday(game)
    expect(Math.abs(totals(after.season).all - totals(plain.season).all)).toBeLessThanOrEqual(Math.max(15, totals(plain.season).all * 0.001))
  })
})
