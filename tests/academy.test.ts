import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createAcademy } from '../src/data/generateAcademy'
import { createYouth } from '../src/data/generateYouth'
import { generateWorld } from '../src/data/generateWorld'
import {
  AcademyError,
  academyOf,
  pendingDecisions,
  potentialStars,
  promoteYouth,
  releaseYouth,
  turnAcademy,
  worthPromoting,
  youthSalary,
} from '../src/engine/academy'
import { ACADEMY } from '../src/engine/config'
import { evolvePlayer } from '../src/engine/offseason'
import { playerOverall } from '../src/engine/overall'
import { createRng } from '../src/engine/rng'
import { createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { SQUAD_MAX } from '../src/engine/types'
import type { Player } from '../src/engine/types'
import { academyAlert, createGame, pendingAcademy, promoteUserYouth, releaseUserYouth, squadOf, userAcademy } from '../src/store/game'
import type { Game } from '../src/store/game'
import { MIGRATIONS, SAVE_VERSION, makeEnvelope, migrateSave, validateGame } from '../src/store/saveFormat'
import { Dashboard } from '../src/ui/screens/Dashboard'
import { Squad } from '../src/ui/screens/Squad'

const USER = 'team-imp'
const world = generateWorld({ seed: 9 })
/** Dois jogadores a menos no elenco do jogador (o time inicial já vem com 30), para sobrar vaga para promoções. */
const withRoom = world.players.filter((p) => p.id !== world.players.filter((q) => q.teamId === 'team-imp')[5]?.id && p.id !== world.players.filter((q) => q.teamId === 'team-imp')[7]?.id)
const fresh = (): SeasonState => createSeason({ year: 2026, seed: 9, teams: world.teams, players: withRoom, academy: world.academy })

const turn = (state: SeasonState, userTeamId?: string, seed = 't') =>
  turnAcademy({
    teams: state.teams,
    players: state.players,
    academy: state.academy,
    rng: createRng(seed),
    year: 2026,
    ...(userTeamId ? { userTeamId } : {}),
    createYouth,
    taken: new Set([...state.players, ...state.academy].map((p) => p.name)),
    counter: state.playerCounter,
  })

describe('base inicial do mundo', () => {
  it('cada clube tem de 7 a 12 jovens de 15 a 19 anos, separados do elenco profissional', () => {
    for (const team of world.teams) {
      const youths = world.academy.filter((p) => p.teamId === team.id)
      expect(youths.length, team.name).toBeGreaterThanOrEqual(ACADEMY.initialSize.min)
      expect(youths.length, team.name).toBeLessThanOrEqual(ACADEMY.initialSize.max)
      for (const p of youths) {
        expect(p.age).toBeGreaterThanOrEqual(ACADEMY.minAge)
        expect(p.age).toBeLessThan(ACADEMY.graduationAge)
      }
    }
    const ids = [...world.players, ...world.academy].map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    const names = [...world.players, ...world.academy].map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
    expect(world.players.some((p) => p.age < 16)).toBe(false)
  })

  it('o mesmo mundo gera a mesma base, e o contador de ids continua depois dela', () => {
    expect(generateWorld({ seed: 9 }).academy.map((p) => p.id)).toEqual(world.academy.map((p) => p.id))
    expect(fresh().playerCounter).toBe(Math.max(...[...world.players, ...world.academy].map((p) => Number(p.id.replace(/\D/g, '')))))
  })

  it('a base da Série A é melhor que a da Série B', () => {
    const mean = (tier: number) => {
      const ids = new Set(world.teams.filter((t) => t.tier === tier).map((t) => t.id))
      const list = world.academy.filter((p) => ids.has(p.teamId as string))
      return list.reduce((s, p) => s + p.hidden.potential, 0) / list.length
    }
    expect(mean(1)).toBeGreaterThan(mean(2) + 3)
  })

  it('os jovens da base não entram nas partidas nem no mercado (não estão em `players`)', () => {
    const state = fresh()
    const inSquads = new Set(state.players.map((p) => p.id))
    for (const p of state.academy) expect(inSquads.has(p.id)).toBe(false)
    expect(squadOf({ season: state } as Game, USER).every((p) => p.age >= 16)).toBe(true)
  })
})

describe('estrelas de potencial', () => {
  const fake = (i: number, age: number, potential: number): Pick<Player, 'id' | 'age' | 'hidden'> => ({ id: `x-${i}`, age, hidden: { potential, consistency: 50, injuryProneness: 50, professionalism: 50 } })

  it('vão de 1 a 5, são estáveis e sobem com o potencial', () => {
    const avg = (potential: number) => Array.from({ length: 200 }, (_, i) => potentialStars(fake(i, 17, potential))).reduce((a, b) => a + b, 0) / 200
    expect(avg(50)).toBeLessThan(1.4)
    expect(avg(90)).toBeGreaterThan(4.6)
    expect(avg(70)).toBeGreaterThan(avg(60))
    expect(avg(80)).toBeGreaterThan(avg(70))
    for (let i = 0; i < 50; i++) {
      const s = potentialStars(fake(i, 16, 75))
      expect(s).toBeGreaterThanOrEqual(1)
      expect(s).toBeLessThanOrEqual(5)
      expect(potentialStars(fake(i, 16, 75))).toBe(s)
    }
  })

  it('têm incerteza (jovens iguais podem ter estrelas diferentes) e ela é maior aos 15 do que aos 19', () => {
    const spread = (age: number) => {
      const stars = Array.from({ length: 400 }, (_, i) => potentialStars(fake(i, age, 74)))
      const mean = stars.reduce((a, b) => a + b, 0) / stars.length
      return stars.reduce((s, x) => s + (x - mean) ** 2, 0) / stars.length
    }
    expect(spread(15)).toBeGreaterThan(spread(19))
    expect(new Set(Array.from({ length: 100 }, (_, i) => potentialStars(fake(i, 15, 74)))).size).toBeGreaterThan(1)
  })

  it('não revelam o número exato: o jogador de mesmo potencial pode cair em faixas vizinhas', () => {
    const stars = new Set(Array.from({ length: 300 }, (_, i) => potentialStars(fake(i, 15, ACADEMY.stars.thresholds[2] as number))))
    expect(stars.size).toBeGreaterThanOrEqual(3)
  })
})

describe('promover e dispensar', () => {
  const state = fresh()
  const team = state.teams.find((t) => t.id === USER)!
  const youth = academyOf(state, USER)[0] as Player

  it('promover cria contrato profissional de jovem, tira da base e põe no elenco', () => {
    const next = promoteYouth(state, youth.id)
    expect(next.academy.some((p) => p.id === youth.id)).toBe(false)
    const pro = next.players.find((p) => p.id === youth.id) as Player
    expect(pro.teamId).toBe(USER)
    expect(pro.contract.salary).toBe(youthSalary(youth))
    expect(pro.contract.salary).toBeGreaterThan(0)
    expect(pro.contract.endDate).toBe(`${2026 + ACADEMY.contractYears}-12-31`)
    expect(next.teams.find((t) => t.id === USER)!.squad).toContain(youth.id)
    expect(next.teams.find((t) => t.id === USER)!.squad.length).toBe(team.squad.length + 1)
  })

  it('com 30 no elenco não promove: erro claro e nada muda', () => {
    const squad = state.players.filter((p) => p.teamId === USER)
    const filler = world.players.filter((p) => p.teamId !== USER).slice(0, SQUAD_MAX - squad.length).map((p) => ({ ...p, id: `extra-${p.id}`, teamId: USER }))
    const full: SeasonState = { ...state, players: [...state.players, ...filler] }
    expect(full.players.filter((p) => p.teamId === USER)).toHaveLength(SQUAD_MAX)
    expect(() => promoteYouth(full, youth.id)).toThrowError(expect.objectContaining({ code: 'squad-full' }))
    expect(() => promoteYouth(state, 'inexistente')).toThrowError(AcademyError)
  })

  it('dispensar tira da base e o jogador sai do jogo', () => {
    const next = releaseYouth(state, youth.id)
    expect(next.academy.some((p) => p.id === youth.id)).toBe(false)
    expect(next.players.some((p) => p.id === youth.id)).toBe(false)
    expect(next.academy).toHaveLength(state.academy.length - 1)
  })

  it('no jogo só dá para mexer na própria base', () => {
    const base = createGame(9, USER)
    const game: Game = { ...base, season: { ...base.season, players: base.season.players.filter((p) => p.id !== squadOf(base, USER)[5]?.id) } }
    const other = game.season.academy.find((p) => p.teamId !== USER) as Player
    expect(() => promoteUserYouth(game, other.id)).toThrowError(AcademyError)
    expect(() => releaseUserYouth(game, other.id)).toThrowError(AcademyError)
    const mine = userAcademy(game)[0] as Player
    expect(userAcademy(releaseUserYouth(game, mine.id))).toHaveLength(userAcademy(game).length - 1)
    expect(squadOf(promoteUserYouth(game, mine.id), USER)).toHaveLength(squadOf(game, USER).length + 1)
  })
})

describe('virada de temporada da base', () => {
  const state = fresh()
  const result = turn(state, USER)

  it('todos ficam um ano mais velhos e chegam de 3 a 5 jovens por clube (a base nunca passa de 15)', () => {
    for (const team of state.teams) {
      const youths = result.academy.filter((p) => p.teamId === team.id)
      expect(youths.length, team.name).toBeLessThanOrEqual(ACADEMY.maxSize)
      const arrived = result.arrivals[team.id] ?? 0
      expect(arrived, team.name).toBeLessThanOrEqual(ACADEMY.arrivals[1])
      expect(arrived, team.name).toBeGreaterThanOrEqual(ACADEMY.arrivals[0])
    }
    const before = new Map(state.academy.map((p) => [p.id, p]))
    for (const p of result.academy) {
      const old = before.get(p.id)
      if (old) expect(p.age).toBe(old.age + 1)
      else {
        expect(p.age).toBeGreaterThanOrEqual(ACADEMY.arrivalAge[0])
        expect(p.age).toBeLessThanOrEqual(ACADEMY.arrivalAge[1])
        expect(Number(p.id.replace(/\D/g, ''))).toBeGreaterThan(state.playerCounter)
      }
    }
    expect(result.counter).toBeGreaterThan(state.playerCounter)
  })

  it('a IA decide sozinha sobre quem fez 20 anos: ninguém dela fica na base com 20; o jogador é consultado', () => {
    for (const p of result.academy) if (p.teamId !== USER) expect(p.age).toBeLessThan(ACADEMY.graduationAge)
    const mine = result.academy.filter((p) => p.teamId === USER)
    const were19 = state.academy.filter((p) => p.teamId === USER && p.age === 19).length
    expect(mine.filter((p) => p.age === ACADEMY.graduationAge)).toHaveLength(were19)
    expect(pendingDecisions({ academy: result.academy }, USER)).toHaveLength(were19)
    expect(Object.values(result.promoted).reduce((a, b) => a + b, 0) + Object.values(result.released).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })

  it('se o jogador deixa passar o prazo, na virada seguinte a regra da IA decide por ele', () => {
    const waiting = { ...state, academy: state.academy.map((p) => (p.teamId === USER ? { ...p, age: 20 } : p)) }
    const mineBefore = waiting.academy.filter((p) => p.teamId === USER).length
    const next = turn(waiting, USER)
    const left = next.academy.filter((p) => p.teamId === USER)
    expect(left.every((p) => p.age < ACADEMY.graduationAge + 1)).toBe(true)
    expect(left.filter((p) => waiting.academy.some((w) => w.id === p.id))).toHaveLength(0)
    expect((next.promoted[USER] ?? 0) + (next.released[USER] ?? 0)).toBe(mineBefore)
  })

  it('promovidos pela IA entram no elenco com contrato profissional, sem passar de 30', () => {
    // Elenco desfalcado (como depois de contratos vencidos): a IA tem vaga e posições a cobrir.
    const ai = state.teams.find((t) => t.id !== USER)!
    const dropped = new Set(state.players.filter((p) => p.teamId === ai.id).slice(0, 8).map((p) => p.id))
    const thin: SeasonState = { ...state, players: state.players.filter((p) => !dropped.has(p.id)) }
    const out = turn(thin, USER)
    const promoted = out.players.filter((p) => !thin.players.some((o) => o.id === p.id) && p.teamId !== null)
    expect(promoted.length).toBeGreaterThan(0)
    for (const p of promoted) {
      expect(p.contract.salary).toBeGreaterThan(0)
      expect(p.contract.endDate).toBe(`${2027 + ACADEMY.contractYears}-12-31`)
      expect(out.academy.some((y) => y.id === p.id)).toBe(false)
    }
    expect(out.promoted[ai.id] ?? 0).toBeGreaterThan(0)
    for (const team of state.teams) expect(out.players.filter((p) => p.teamId === team.id).length).toBeLessThanOrEqual(SQUAD_MAX)
  })

  it('o jogador com a base cheia fica sem as vagas que faltam; a IA abre espaço dispensando os mais fracos', () => {
    const userMine = state.academy.filter((p) => p.teamId === USER)
    const extra = createAcademy({ teams: state.teams.filter((t) => t.id === USER), seed: 'cheia', year: 2026, firstNumber: 90000, takenNames: [] })
    const padded = [...userMine, ...extra].slice(0, ACADEMY.maxSize).map((p) => ({ ...p, age: 16 }))
    const full: SeasonState = { ...state, academy: [...state.academy.filter((p) => p.teamId !== USER), ...padded] }
    expect(padded).toHaveLength(ACADEMY.maxSize)
    const next = turn(full, USER)
    expect(next.arrivals[USER] ?? 0).toBe(0)
    expect(next.academy.filter((p) => p.teamId === USER)).toHaveLength(ACADEMY.maxSize)
    const ai = state.teams.find((t) => t.id !== USER)!
    const aiFull = { ...state, academy: [...state.academy.filter((p) => p.teamId !== ai.id), ...padded.map((p) => ({ ...p, id: `ai-${p.id}`, teamId: ai.id }))] }
    const aiNext = turn(aiFull, USER)
    expect(aiNext.academy.filter((p) => p.teamId === ai.id).length).toBeLessThanOrEqual(ACADEMY.maxSize)
    expect(aiNext.arrivals[ai.id] ?? 0).toBeGreaterThanOrEqual(ACADEMY.arrivals[0])
    expect(aiNext.released[ai.id] ?? 0).toBeGreaterThan(0)
  })

  it('é determinística: mesma semente, mesma virada', () => {
    expect(turn(state, USER).academy.map((p) => p.id)).toEqual(result.academy.map((p) => p.id))
  })

  it('a IA só promove por mérito a partir dos 18 anos e quando o jovem alcança o nível do elenco', () => {
    const team = state.teams.find((t) => t.id !== USER)!
    const squad = state.players.filter((p) => p.teamId === team.id)
    const weak = { ...(state.academy.find((p) => p.teamId === team.id) as Player) }
    expect(worthPromoting(weak, squad) && playerOverall(weak) < 30).toBe(false)
    const star = { ...weak, attributes: Object.fromEntries(Object.keys(weak.attributes).map((k) => [k, 95])) as Player['attributes'], hidden: { ...weak.hidden, potential: 99 } }
    expect(worthPromoting(star, squad)).toBe(true)
  })
})

describe('evolução da base', () => {
  it('evolui um pouco mais devagar do que quem joga o campeonato inteiro', () => {
    const youths = world.academy.filter((p) => p.age === 17).slice(0, 60)
    const gain = (share: number) => {
      const rng = createRng(`g${share}`)
      return youths.reduce((s, p) => s + playerOverall(evolvePlayer(rng, p, share)) - playerOverall(p), 0) / youths.length
    }
    const academy = gain(ACADEMY.evolutionShare)
    const playing = gain(1)
    expect(academy).toBeGreaterThan(0)
    expect(academy).toBeLessThan(playing)
    expect(academy).toBeGreaterThan(playing * 0.6)
  })
})

describe('base no jogo e no save', () => {
  it('um jogo novo já tem base, e os avisos refletem jovens esperando decisão', () => {
    const game = createGame(9, USER)
    expect(userAcademy(game).length).toBeGreaterThanOrEqual(ACADEMY.initialSize.min)
    expect(academyAlert(game)).toEqual({ arrivals: 0, pending: 0 })
    const waiting: Game = { ...game, season: { ...game.season, academy: game.season.academy.map((p, i) => (p.teamId === USER && i % 2 === 0 ? { ...p, age: 20 } : p)) } }
    expect(pendingAcademy(waiting).length).toBeGreaterThan(0)
    expect(academyAlert(waiting).pending).toBe(pendingAcademy(waiting).length)
  })

  it('o save versão 2 (sem base) abre na versão atual com uma base coerente para cada clube', () => {
    expect(SAVE_VERSION).toBe(3)
    expect(MIGRATIONS[2]).toBeTypeOf('function')
    const game = createGame(9, USER)
    const envelope = JSON.parse(JSON.stringify(makeEnvelope(game, '2026-01-01T00:00:00Z')))
    envelope.version = 2
    delete envelope.game.season.academy
    expect(validateGame(envelope.game)).toContain('temporada incompleta')
    const migrated = migrateSave(envelope)
    expect(migrated.version).toBe(3)
    const academy = migrated.game.season.academy
    for (const team of game.season.teams) {
      const n = academy.filter((p) => p.teamId === team.id).length
      expect(n, team.name).toBeGreaterThanOrEqual(ACADEMY.initialSize.min)
      expect(n, team.name).toBeLessThanOrEqual(ACADEMY.initialSize.max)
    }
    const ids = [...migrated.game.season.players, ...academy].map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(migrated.game.season.playerCounter).toBeGreaterThanOrEqual(Math.max(...ids.map((id) => Number(id.replace(/\D/g, '')))))
    // A migração é determinística.
    expect(migrateSave(JSON.parse(JSON.stringify(envelope))).game.season.academy.map((p) => p.id)).toEqual(academy.map((p) => p.id))
  })

  it('o save guarda a base (JSON ida e volta)', () => {
    const game = createGame(9, USER)
    const back = migrateSave(JSON.parse(JSON.stringify(makeEnvelope(game, '2026-01-01T00:00:00Z'))))
    expect(back.game.season.academy).toHaveLength(game.season.academy.length)
  })
})

describe('telas da base', () => {
  const game = createGame(9, USER)
  const html = (g: Game) => renderToStaticMarkup(createElement(Squad, { game: g, initialTab: 'academy' }))

  it('a aba Base explica as regras e lista os jovens com posição, idade, estrelas e força', () => {
    const out = html(game)
    for (const text of ['Categorias de base', 'de 3 a 5 garotos', 'até 15 jovens', 'Quem faz 20 anos', 'ZAG', 'potencial']) expect(out).toContain(text)
    expect(out.match(/<li/g)).toHaveLength(userAcademy(game).length)
    expect(out).toContain('Potencial estimado')
    expect(out.match(/role="tab"/g)).toHaveLength(4)
    expect(out).toContain('>Base<')
  })

  it('a bolinha da aba e o aviso do painel aparecem com jovens esperando decisão', () => {
    expect(renderToStaticMarkup(createElement(Dashboard, { game, onNavigate: () => {} }))).not.toContain('Categorias de base')
    const waiting: Game = { ...game, season: { ...game.season, academy: game.season.academy.map((p, i) => (p.teamId === USER && i % 3 === 0 ? { ...p, age: 20 } : p)) } }
    const dash = renderToStaticMarkup(createElement(Dashboard, { game: waiting, onNavigate: () => {} }))
    expect(dash).toContain('Categorias de base')
    expect(dash).toContain('Decidir sobre a base')
    expect(dash).toContain('promova ou dispense')
    expect(html(waiting)).toContain('Decidir')
    expect(html(waiting)).toContain('Há algo pendente')
    expect(html(game)).not.toContain('Há algo pendente')
  })

  it('jovens recém-chegados também acendem a bolinha e o aviso', () => {
    const arrived: Game = { ...game, lastReport: { year: 2026, champions: [world.teams[0]!.id, world.teams[25]!.id], promoted: [], relegated: [], finalPositions: { [USER]: { tier: 1, position: 5 } }, retired: [], released: [], renewed: 0, youth: {}, academyArrivals: { [USER]: 4 }, academyPromoted: {}, academyReleased: {}, academyPending: [], reputationChanges: {} } }
    expect(academyAlert(arrived).arrivals).toBe(4)
    expect(html(arrived)).toContain('Chegaram 4 jovens')
    expect(renderToStaticMarkup(createElement(Dashboard, { game: arrived, onNavigate: () => {} }))).toContain('4 jovens chegaram')
  })
})
