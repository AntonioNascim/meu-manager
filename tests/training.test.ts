import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createYouth } from '../src/data/generateYouth'
import { generateWorld } from '../src/data/generateWorld'
import { TRAINING } from '../src/engine/config'
import { advanceSeason, annualGain } from '../src/engine/offseason'
import { overallAt, playerOverall } from '../src/engine/overall'
import { createRng } from '../src/engine/rng'
import { advanceToNextEvent, createSeason, simulateToSeasonEnd } from '../src/engine/season'
import { progressDays } from '../src/engine/season/condition'
import type { SeasonState } from '../src/engine/season'
import {
  DEFAULT_PLAN,
  TrainingError,
  applyTraining,
  cancelIndividualTraining,
  fitnessProfile,
  focusWeights,
  learnablePositions,
  planFor,
  potentialRange,
  projectedGrowth,
  seasonShare,
  setTrainingPlan,
  startIndividualTraining,
  strengthTrend,
  trainPlayer,
} from '../src/engine/training'
import { ATTRIBUTE_NAMES, TRAINING_FOCUSES, TRAINING_INTENSITIES, emptyTraining } from '../src/engine/types'
import type { Attributes, Player, TrainingIntensity } from '../src/engine/types'
import { advanceGame, advanceToMatchday, cancelUserIndividualTraining, createGame, setUserTrainingPlan, startNextSeason, startUserIndividualTraining, strengthChange, userTrainingPlan } from '../src/store/game'
import { MIGRATIONS, SAVE_VERSION, makeEnvelope, migrateSave, validateGame } from '../src/store/saveFormat'
import { Dashboard } from '../src/ui/screens/Dashboard'
import { Squad } from '../src/ui/screens/Squad'
import { Training } from '../src/ui/screens/squad/Training'

const world = generateWorld({ seed: 9 })
const fresh = (): SeasonState => createSeason({ year: 2026, seed: 9, teams: world.teams, players: world.players, academy: world.academy })
const USER = 'team-imp'

/** Jovem com bastante espaço para crescer: 19 anos, força perto de 60 e potencial 85. */
function prospect(i: number, over: Partial<Player> = {}): Player {
  const base = world.players.find((p) => p.age >= 18 && p.age <= 22 && p.position === 'CM') ?? (world.players[0] as Player)
  const attributes = { ...base.attributes } as Attributes
  for (const name of ATTRIBUTE_NAMES) attributes[name] = 55
  return { ...base, id: `p-${i}`, age: 19, attributes, hidden: { ...base.hidden, potential: 85, professionalism: 60, injuryProneness: 50 }, ...over }
}

/** Joga uma temporada de treino em fatias iguais (a soma das frações é 1) e devolve o jogador. */
function trainSeason(player: Player, intensity: TrainingIntensity, focus: 'balanced' | 'physical' | 'technical' | 'defensive' | 'offensive' = 'balanced', steps = 38): Player {
  const rng = createRng(`s:${player.id}`)
  const weights = focusWeights(focus, player.position === 'GK')
  let p = player
  for (let i = 0; i < steps; i++) p = trainPlayer(rng, p, { year: 2026, share: 1 / steps, minutesShare: 1, growth: TRAINING.intensity[intensity].growth, weights })
  return p
}

const meanOver = (n: number, fn: (i: number) => number) => Array.from({ length: n }, (_, i) => fn(i)).reduce((a, b) => a + b, 0) / n

describe('foco do treino', () => {
  it('a média dos pesos é 1: o foco muda para onde vai o ganho, não quanto', () => {
    for (const focus of TRAINING_FOCUSES) {
      for (const goalkeeper of [false, true]) {
        const w = focusWeights(focus, goalkeeper)
        const names = ATTRIBUTE_NAMES.filter((n) => goalkeeper || (n !== 'reflexes' && n !== 'rushingOut'))
        expect(names.reduce((s, n) => s + w[n], 0) / names.length, `${focus} ${goalkeeper}`).toBeCloseTo(1, 6)
        expect(Math.min(...names.map((n) => w[n]))).toBeGreaterThan(0)
      }
    }
  })

  it('o foco físico faz velocidade, resistência e força evoluírem mais que o resto', () => {
    const w = focusWeights('physical', false)
    expect(w.pace).toBeGreaterThan(1)
    expect(w.stamina).toBeGreaterThan(1)
    expect(w.strength).toBeGreaterThan(1)
    expect(w.passing).toBeLessThan(1)
  })

  it('com foco, o total de atributos ganhos fica igual ao do treino equilibrado (e o foco direciona)', () => {
    const sum = (p: Player) => ATTRIBUTE_NAMES.reduce((s, n) => s + p.attributes[n], 0)
    const total = (focus: 'balanced' | 'physical') => meanOver(120, (i) => sum(trainSeason(prospect(i), 'normal', focus)) - sum(prospect(i)))
    expect(total('physical')).toBeGreaterThan(total('balanced') * 0.9)
    expect(total('physical')).toBeLessThan(total('balanced') * 1.1)
    const pace = (focus: 'balanced' | 'physical') => meanOver(120, (i) => trainSeason(prospect(i), 'normal', focus).attributes.pace - 55)
    expect(pace('physical')).toBeGreaterThan(pace('balanced') * 1.4)
  })
})

describe('evolução ao longo da temporada', () => {
  it('no treino Normal o total da temporada é o mesmo da evolução de uma tacada só', () => {
    const rng = createRng('annual')
    const once = meanOver(300, (i) => playerOverall(prospect(i, { age: 19 })) + annualGain(rng, prospect(i), 1) - playerOverall(prospect(i)))
    const weekly = meanOver(300, (i) => playerOverall(trainSeason(prospect(i), 'normal')) - playerOverall(prospect(i)))
    expect(weekly).toBeGreaterThan(once * 0.85)
    expect(weekly).toBeLessThan(once * 1.15)
    expect(weekly).toBeGreaterThan(1.5)
  })

  it('Leve evolui menos e Intensa evolui mais que Normal', () => {
    const gain = (intensity: TrainingIntensity) => meanOver(200, (i) => playerOverall(trainSeason(prospect(i), intensity)) - playerOverall(prospect(i)))
    expect(gain('light')).toBeLessThan(gain('normal'))
    expect(gain('normal')).toBeLessThan(gain('intense'))
  })

  it('o ganho vem aos poucos: depois de um quarto da temporada o jogador ganhou cerca de um quarto', () => {
    const rng = createRng('quarter')
    const weights = focusWeights('balanced', false)
    const quarter = meanOver(200, (i) => {
      let p = prospect(i)
      for (let k = 0; k < 10; k++) p = trainPlayer(rng, p, { year: 2026, share: 0.025, minutesShare: 1, growth: 1, weights })
      return playerOverall(p) - playerOverall(prospect(i))
    })
    const full = meanOver(200, (i) => playerOverall(trainSeason(prospect(i), 'normal')) - playerOverall(prospect(i)))
    expect(quarter).toBeGreaterThan(full * 0.15)
    expect(quarter).toBeLessThan(full * 0.4)
  })

  it('quem já está no potencial não passa dele, e veterano não ganha', () => {
    const capped = trainSeason(prospect(1, { hidden: { ...prospect(1).hidden, potential: Math.round(playerOverall(prospect(1))) } }), 'intense')
    expect(playerOverall(capped)).toBeLessThanOrEqual(playerOverall(prospect(1)) + 0.6)
    const old = meanOver(100, (i) => playerOverall(trainSeason(prospect(i, { age: 32, hidden: { ...prospect(i).hidden, potential: 60 } }), 'normal')) - playerOverall(prospect(i)))
    expect(old).toBeLessThanOrEqual(0.2)
  })

  it('o ritmo projetado acompanha o ganho real', () => {
    const projected = meanOver(60, (i) => projectedGrowth(prospect(i), DEFAULT_PLAN, 1))
    expect(projected).toBeGreaterThan(1.5)
    expect(projectedGrowth(prospect(1), { intensity: 'intense', focus: 'balanced' }, 1)).toBeGreaterThan(projectedGrowth(prospect(1), { intensity: 'light', focus: 'balanced' }, 1))
    expect(projectedGrowth(prospect(1, { age: 33 }), DEFAULT_PLAN, 1)).toBe(0)
  })
})

describe('calendário do treino', () => {
  it('as frações da temporada somam 1 ao longo de todos os avanços e não há ganho antes da primeira rodada', () => {
    let state = fresh()
    expect(seasonShare(state, '2026-01-01', state.matches[0]?.date ?? '2026-04-11')).toBe(0)
    let total = 0
    for (let i = 0; i < 200 && state.season.phase !== 'end-of-season'; i++) {
      const before = state.season.currentDate
      state = advanceToNextEvent(state).state
      total += seasonShare(state, before, state.season.currentDate)
    }
    expect(total).toBeCloseTo(1, 6)
  })

  it('a IA treina Leve em intervalo curto (jogo no meio da semana) e Normal nos demais; o plano escolhido vale sempre', () => {
    const training = emptyTraining()
    expect(planFor(training, 'team-x', 3).intensity).toBe('light')
    expect(planFor(training, 'team-x', 7).intensity).toBe('normal')
    expect(planFor(training, 'team-x', 1).intensity).toBe('normal')
    const chosen = { plans: { 'team-x': { intensity: 'intense', focus: 'technical' } } } as const
    expect(planFor(chosen, 'team-x', 3).intensity).toBe('intense')
  })
})

describe('condição e lesões', () => {
  const tired = (): Player[] => world.players.slice(0, 40).map((p) => ({ ...p, teamId: 'a', condition: { ...p.condition, fitness: 50, injuryDaysLeft: 0 } }))

  it('Leve recupera mais a condição que Normal, e Intensa recupera menos e tem um teto', () => {
    const after = (intensity: TrainingIntensity) => {
      const training = { plans: { a: { intensity, focus: 'balanced' as const } } }
      const players = progressDays(tired(), 6, (teamId) => fitnessProfile(training, teamId, 6))
      return players.reduce((s, p) => s + p.condition.fitness, 0) / players.length
    }
    expect(after('light')).toBeGreaterThan(after('normal'))
    expect(after('normal')).toBeGreaterThan(after('intense'))
    const long = progressDays(tired(), 40, (teamId) => fitnessProfile({ plans: { a: { intensity: 'intense', focus: 'balanced' } } }, teamId, 40))
    expect(Math.max(...long.map((p) => p.condition.fitness))).toBeLessThanOrEqual(TRAINING.intensity.intense.fitnessCeiling + 1e-9)
  })

  it('a intensidade alta machuca mais no treino', () => {
    const injured = (intensity: TrainingIntensity) => {
      let count = 0
      for (let day = 0; day < 40; day++) {
        const state = setTrainingPlan({ ...fresh(), players: world.players.map((p) => ({ ...p, condition: { ...p.condition, injuryDaysLeft: 0 } })), market: { ...fresh().market, seed: `i${day}` } }, 'team-imp', { intensity, focus: 'balanced' })
        const next = applyTraining(state, '2026-06-01', '2026-06-08')
        count += next.players.filter((p) => p.teamId === 'team-imp' && p.condition.injuryDaysLeft > 0).length
      }
      return count
    }
    const [light, normal, intense] = [injured('light'), injured('normal'), injured('intense')]
    expect(light).toBeLessThan(normal)
    expect(normal).toBeLessThan(intense)
  })
})

describe('treino individual', () => {
  const squad = (state: SeasonState) => state.players.filter((p) => p.teamId === USER)

  it('uma vaga por vez: ocupada, dá erro; cancelar libera; jogador e escolha precisam ser válidos', () => {
    const state = fresh()
    const player = squad(state).find((p) => p.position !== 'GK') as Player
    const started = startIndividualTraining(state, USER, player.id, { type: 'group', group: 'physical' })
    expect(started.training.individual[USER]?.daysLeft).toBe(TRAINING.individual.days)
    expect(() => startIndividualTraining(started, USER, (squad(state)[1] as Player).id, { type: 'group', group: 'mental' })).toThrow(TrainingError)
    expect(cancelIndividualTraining(started, USER).training.individual[USER]).toBeUndefined()
    expect(() => startIndividualTraining(state, USER, 'nao-existe', { type: 'group', group: 'mental' })).toThrow(TrainingError)
    expect(() => startIndividualTraining(state, USER, player.id, { type: 'group', group: 'goalkeeper' })).toThrow(TrainingError)
    expect(() => startIndividualTraining(state, USER, player.id, { type: 'position', position: player.position })).toThrow(TrainingError)
  })

  it('acelera o grupo de atributos escolhido, sem passar do potencial', () => {
    const young = prospect(1, { teamId: USER })
    const base: SeasonState = { ...fresh(), players: [young] }
    const run = (state: SeasonState) => {
      let s = state
      for (const [from, to] of [['2026-05-01', '2026-05-11'], ['2026-05-11', '2026-05-21'], ['2026-05-21', '2026-06-03']] as const) s = applyTraining(s, from, to)
      return s.players[0] as Player
    }
    const alone = meanOver(40, (i) => {
      const p = prospect(i, { teamId: USER })
      return run({ ...base, players: [p], market: { ...base.market, seed: `g${i}` } }).attributes.pace - 55
    })
    const trained = meanOver(40, (i) => {
      const p = prospect(i, { teamId: USER })
      const state = startIndividualTraining({ ...base, players: [p], market: { ...base.market, seed: `g${i}` } }, USER, p.id, { type: 'group', group: 'physical' })
      return run({ ...state, season: { ...state.season, currentDate: '2026-05-01' } }).attributes.pace - 55
    })
    expect(trained).toBeGreaterThan(alone + 0.25)
    const capped = prospect(2, { teamId: USER, hidden: { ...prospect(2).hidden, potential: Math.round(playerOverall(prospect(2))) } })
    const s = startIndividualTraining({ ...base, players: [capped] }, USER, capped.id, { type: 'group', group: 'physical' })
    expect(playerOverall(run(s))).toBeLessThanOrEqual(playerOverall(capped) + 0.6)
  })

  it('termina em 30 dias: libera a vaga, avisa e ensina a posição secundária nova', () => {
    const p = prospect(3, { teamId: USER, secondaryPositions: [] })
    const target = learnablePositions(p).includes('DM') ? 'DM' : (learnablePositions(p)[0] as 'DM')
    let state = startIndividualTraining({ ...fresh(), players: [p] }, USER, p.id, { type: 'position', position: target })
    state = applyTraining({ ...state, season: { ...state.season, currentDate: '2026-05-01' } }, '2026-05-01', '2026-05-20')
    expect(state.training.individual[USER]?.daysLeft).toBe(11)
    expect((state.players[0] as Player).secondaryPositions).toEqual([])
    state = applyTraining(state, '2026-05-20', '2026-06-05')
    expect(state.training.individual[USER]).toBeUndefined()
    expect(state.training.finished[USER]?.playerId).toBe(p.id)
    expect((state.players[0] as Player).secondaryPositions).toEqual([target])
    expect(overallAt(state.players[0] as Player, target)).toBeGreaterThan(overallAt(p, target) - 0.01)
  })

  it('goleiro não aprende posição de linha, e quem tem duas secundárias não aprende mais', () => {
    const keeper = world.players.find((p) => p.position === 'GK') as Player
    expect(learnablePositions(keeper)).toEqual([])
    expect(learnablePositions(prospect(4, { secondaryPositions: ['DM', 'AM'] }))).toEqual([])
    expect(learnablePositions(prospect(5, { secondaryPositions: [] })).length).toBeGreaterThan(5)
  })

  it('se o jogador sai do elenco, a vaga é liberada sozinha', () => {
    const p = prospect(6, { teamId: USER })
    const state = startIndividualTraining({ ...fresh(), players: [p] }, USER, p.id, { type: 'group', group: 'mental' })
    const gone = applyTraining({ ...state, players: [{ ...p, teamId: 'outro' }] }, '2026-05-01', '2026-05-08')
    expect(gone.training.individual[USER]).toBeUndefined()
  })
})

describe('base e faixa de potencial', () => {
  it('a base também treina, num ritmo menor que o de quem joga', () => {
    const youth = world.academy.filter((p) => p.age <= 16).slice(0, 30)
    const state: SeasonState = { ...fresh(), academy: youth }
    let s = state
    for (const [from, to] of [['2026-04-11', '2026-07-11'], ['2026-07-11', '2026-10-11'], ['2026-10-11', '2026-12-20']] as const) s = applyTraining(s, from, to)
    const grew = s.academy.reduce((sum, p, i) => sum + playerOverall(p) - playerOverall(youth[i] as Player), 0) / youth.length
    expect(grew).toBeGreaterThan(0.3)
    const player = youth.reduce((best, p) => (p.hidden.potential > best.hidden.potential ? p : best))
    const asPro = { ...player, seasonStats: { ...player.seasonStats, minutes: 38 * 90 } }
    const proGain = meanOver(100, (i) => playerOverall(trainSeason({ ...asPro, id: `x${i}` }, 'normal')) - playerOverall(asPro))
    const youthGain = meanOver(100, (i) => {
      const rng = createRng(`y${i}`)
      let p = { ...player, id: `x${i}` }
      const w = focusWeights('balanced', false)
      for (let k = 0; k < 38; k++) p = trainPlayer(rng, p, { year: 2026, share: 1 / 38, minutesShare: 0.2, growth: 1, weights: w })
      return playerOverall(p) - playerOverall(player)
    })
    expect(youthGain).toBeLessThan(proGain)
  })

  it('a faixa de potencial é estável, nunca fica abaixo da força de hoje e estreita com a idade', () => {
    const p = prospect(7)
    expect(potentialRange(p)).toEqual(potentialRange(p))
    for (const q of world.players.slice(0, 200)) {
      const r = potentialRange(q)
      expect(r.low).toBeLessThanOrEqual(r.high)
      expect(r.low).toBeGreaterThanOrEqual(Math.ceil(playerOverall(q)))
    }
    const width = (age: number) => meanOver(80, (i) => { const r = potentialRange(prospect(i, { age })); return r.high - r.low })
    expect(width(16)).toBeGreaterThan(width(31))
  })
})

describe('treino no jogo', () => {
  it('o jogo começa com treino Normal e foco equilibrado, e a escolha vale a partir do próximo avanço', () => {
    const game = createGame(7, USER)
    expect(userTrainingPlan(game)).toEqual({ intensity: 'normal', focus: 'balanced' })
    const changed = setUserTrainingPlan(game, { intensity: 'intense', focus: 'offensive' })
    expect(userTrainingPlan(changed)).toEqual({ intensity: 'intense', focus: 'offensive' })
  })

  it('avançando, os jogadores evoluem aos poucos e o histórico mensal da força é guardado', () => {
    let game = createGame(7, USER)
    const before = new Map(game.season.players.map((p) => [p.id, playerOverall(p)]))
    for (let i = 0; i < 14; i++) game = advanceToMatchday(game.pendingUserMatch ? { ...game, pendingUserMatch: undefined } : game)
    const mine = game.season.players.filter((p) => p.teamId === USER)
    expect(mine.every((p) => (game.season.training.history[p.id]?.length ?? 0) >= 2)).toBe(true)
    const young = game.season.players.filter((p) => p.age <= 21 && p.hidden.potential > playerOverall(p) + 8)
    const gain = young.reduce((s, p) => s + playerOverall(p) - (before.get(p.id) ?? 0), 0) / young.length
    expect(gain).toBeGreaterThan(0)
    const history = game.season.training.history[(mine[0] as Player).id] as [string, number][]
    expect(history.every((h, i) => i === 0 || h[0] >= (history[i - 1] as [string, number])[0])).toBe(true)
  })

  it('a seta compara com o histórico de pelo menos 25 dias atrás', () => {
    const history: [string, number][] = [['2026-05-01', 60.2], ['2026-06-01', 60.4]]
    expect(strengthTrend(history, 62, '2026-06-20')).toBe(2)
    expect(strengthTrend(history, 60.3, '2026-06-20')).toBe(0)
    expect(strengthTrend(history, 58, '2026-06-20')).toBe(-2)
    expect(strengthTrend(history, 70, '2026-05-10')).toBe(0)
    expect(strengthTrend(undefined, 70, '2026-05-10')).toBe(0)
    const game = createGame(7, USER)
    expect(strengthChange(game, game.season.players[0] as Player)).toBe(0)
  })

  it('o plano e o aviso do treino individual terminado passam pela virada de temporada; a virada não faz mais o crescimento', () => {
    let game = createGame(7, USER)
    const p = game.season.players.find((x) => x.teamId === USER && x.position !== 'GK') as Player
    game = startUserIndividualTraining(setUserTrainingPlan(game, { intensity: 'light', focus: 'defensive' }), p.id, { type: 'group', group: 'technical' })
    expect(cancelUserIndividualTraining(game).season.training.individual[USER]).toBeUndefined()
    game = { ...game, season: simulateToSeasonEnd(game.season) }
    const next = startNextSeason(game)
    expect(userTrainingPlan(next)).toEqual({ intensity: 'light', focus: 'defensive' })
    expect(next.season.training.individual[USER]).toBeUndefined()
    expect(next.season.training.finished[USER]?.playerId).toBe(p.id)
    expect(Object.keys(next.season.training.history).every((id) => next.season.players.some((q) => q.id === id && q.teamId === USER))).toBe(true)
  })

  it('a virada só envelhece: sem treino na temporada, jovens não crescem na virada', () => {
    const state = { ...fresh(), season: { ...fresh().season, phase: 'end-of-season' as const } }
    const { state: next } = advanceSeason(state, { createYouth })
    const young = state.players.filter((p) => p.age <= 20 && p.teamId !== null)
    const after = new Map(next.players.map((p) => [p.id, p]))
    const delta = young.filter((p) => after.has(p.id)).reduce((s, p) => s + playerOverall(after.get(p.id) as Player) - playerOverall(p), 0) / young.length
    expect(delta).toBeLessThan(0.8)
  })
})

describe('save versão 4', () => {
  it('a versão atual é 4 e a migração 3→4 cria o treino do time do jogador', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(4)
    const game = createGame(3, USER)
    const old = JSON.parse(JSON.stringify(makeEnvelope(game, '2026-01-01T00:00:00Z')))
    delete old.game.season.training
    old.version = 3
    expect(validateGame(old.game)).not.toEqual([])
    const migrated = migrateSave(old)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.game.season.training.plans[USER]).toEqual({ intensity: 'normal', focus: 'balanced' })
    expect(migrated.game.season.training.individual).toEqual({})
    expect(MIGRATIONS[3]).toBeTypeOf('function')
  })
})

describe('telas', () => {
  it('a aba Treino mostra as três intensidades com os indicadores, o foco, a vaga individual e quem mais evolui', () => {
    const html = renderToStaticMarkup(createElement(Squad, { game: createGame(7, USER), initialTab: 'training' }))
    for (const text of ['Leve', 'Normal', 'Intensa', 'Evolução', 'Recuperação', 'Risco de lesão', 'Equilibrado', 'Defensivo', 'Treino individual', 'Quem mais evolui', 'potencial']) expect(html).toContain(text)
  })

  it('a aba Treino também abre sozinha, e o painel mostra o treino atual', () => {
    const game = createGame(7, USER)
    expect(renderToStaticMarkup(createElement(Training, { game }))).toContain('Quem mais evolui')
    const dash = renderToStaticMarkup(createElement(Dashboard, { game: setUserTrainingPlan(game, { intensity: 'intense', focus: 'technical' }), onNavigate: () => {} }))
    expect(dash).toContain('Intensa')
    expect(dash).toContain('Técnico')
  })

  it('a lista de jogadores mostra setinhas de quem subiu ou caiu desde o último mês', () => {
    let game = createGame(7, USER)
    const mine = game.season.players.filter((p) => p.teamId === USER)
    const history: Record<string, [string, number][]> = Object.fromEntries(mine.map((p, i) => [p.id, [['2026-01-01', playerOverall(p) + (i === 0 ? 3 : i === 1 ? -3 : 0)] as [string, number]]]))
    game = { ...game, season: { ...game.season, season: { ...game.season.season, currentDate: '2026-03-01' }, training: { ...game.season.training, history } } }
    const html = renderToStaticMarkup(createElement(Squad, { game }))
    expect(html).toContain('Caiu 3 desde')
    expect(html).toContain('Subiu 3 desde')
  })

  it('o avanço não quebra com a base nem com plano de outro time', () => {
    const game = advanceGame(createGame(7, USER))
    expect(game.season.academy.length).toBeGreaterThan(100)
    for (const id of TRAINING_INTENSITIES) expect(id).toBeTruthy()
  })
})
