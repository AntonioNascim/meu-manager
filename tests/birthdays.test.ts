import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { createYouth } from '../src/data/generateYouth'
import { advanceSeason, growOlder, startNewSeason } from '../src/engine/offseason'
import { createRng } from '../src/engine/rng'
import { advanceToMatchday, createGame, playPendingAuto, startNextSeason } from '../src/store/game'
import { MIGRATIONS, SAVE_VERSION, makeEnvelope, migrateSave, validateGame } from '../src/store/saveFormat'
import { advanceToNextEvent, ageOn, applyBirthdays, birthDateFor, birthdaysBetween, createSeason, simulateToSeasonEnd } from '../src/engine/season'

const world = generateWorld({ seed: 31 })

describe('datas de nascimento', () => {
  it('ageOn conta anos completos', () => {
    expect(ageOn('2000-06-15', '2026-06-14')).toBe(25)
    expect(ageOn('2000-06-15', '2026-06-15')).toBe(26)
    expect(ageOn('2000-12-31', '2026-01-01')).toBe(25)
  })

  it('o mundo gerado tem datas coerentes com a idade no primeiro dia do jogo', () => {
    for (const p of [...world.players, ...world.academy]) {
      expect(p.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(ageOn(p.birthDate, `${world.startYear}-01-01`)).toBe(p.age)
      expect(p.birthDate.endsWith('-02-29')).toBe(false)
    }
    // As datas se espalham pelo ano todo.
    const months = new Set(world.players.map((p) => p.birthDate.slice(5, 7)))
    expect(months.size).toBe(12)
  })

  it('birthDateFor é estável e não usa sorteio', () => {
    expect(birthDateFor('a|b', 25, '2026-01-01')).toBe(birthDateFor('a|b', 25, '2026-01-01'))
    expect(birthDateFor('a|b', 25, '2026-01-01')).not.toBe(birthDateFor('a|c', 25, '2026-01-01'))
    for (const age of [16, 25, 38]) expect(ageOn(birthDateFor(`k${age}`, age, '2026-04-11'), '2026-04-11')).toBe(age)
  })

  it('mesma semente, mesmo mundo, com as mesmas datas', () => {
    expect(generateWorld({ seed: 31 }).players.map((p) => p.birthDate)).toEqual(world.players.map((p) => p.birthDate))
  })
})

describe('birthdaysBetween', () => {
  it('conta o aniversário no intervalo (de, até]', () => {
    expect(birthdaysBetween('1999-05-10', '2026-05-09', '2026-05-10')).toBe(1)
    expect(birthdaysBetween('1999-05-10', '2026-05-10', '2026-05-11')).toBe(0)
    expect(birthdaysBetween('1999-05-10', '2026-01-01', '2026-12-31')).toBe(1)
    expect(birthdaysBetween('1999-05-10', '2026-12-20', '2027-05-10')).toBe(1)
    expect(birthdaysBetween('1999-05-10', '2026-12-20', '2027-05-09')).toBe(0)
  })

  it('29 de fevereiro vira 1º de março nos anos comuns', () => {
    expect(birthdaysBetween('2000-02-29', '2027-02-28', '2027-03-01')).toBe(1)
    expect(birthdaysBetween('2000-02-29', '2028-02-28', '2028-02-29')).toBe(1)
    expect(birthdaysBetween('2000-02-29', '2028-02-29', '2028-03-01')).toBe(0)
  })

  it('um ano inteiro tem exatamente um aniversário, qualquer que seja o recorte em avanços', () => {
    for (const birth of ['1990-01-01', '1995-07-04', '2001-12-31', '2003-02-28']) {
      for (const step of [1, 7, 30, 120]) {
        let total = 0
        let from = new Date(Date.UTC(2026, 0, 1))
        const end = new Date(Date.UTC(2027, 0, 1))
        while (from < end) {
          const to = new Date(Math.min(from.getTime() + step * 86_400_000, end.getTime()))
          total += birthdaysBetween(birth, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10))
          from = to
        }
        expect(total).toBe(1)
      }
    }
  })
})

describe('envelhecer no aniversário', () => {
  it('growOlder muda idade e atributos, mas mantém condição e estatísticas', () => {
    const p = { ...world.players.find((x) => x.age >= 31)!, condition: { ...world.players[0]!.condition, fitness: 77 } }
    const older = growOlder(createRng(1), p)
    expect(older.age).toBe(p.age + 1)
    expect(older.condition.fitness).toBe(77)
    expect(older.attributes).not.toEqual(p.attributes)
    expect(startNewSeason(older).condition.fitness).toBe(100)
  })

  it('applyBirthdays envelhece só quem faz anos e é o mesmo resultado em qualquer ordem de dias', () => {
    const players = world.players.slice(0, 400)
    const once = applyBirthdays(players, '2026-01-01', '2026-12-31', 'x')
    expect(once.every((p, i) => p.age === (players[i]!.age + (birthdaysBetween(p.birthDate, '2026-01-01', '2026-12-31') > 0 ? 1 : 0)))).toBe(true)
    expect(once.filter((p, i) => p.age !== players[i]!.age).length).toBeGreaterThan(300)
    // Em vários avanços curtos dá exatamente o mesmo.
    let steps: readonly (typeof players)[number][] = players
    let day = new Date(Date.UTC(2026, 0, 1))
    for (let i = 0; i < 53; i++) {
      const next = new Date(Math.min(day.getTime() + 7 * 86_400_000, Date.UTC(2026, 11, 31)))
      steps = applyBirthdays(steps, day.toISOString().slice(0, 10), next.toISOString().slice(0, 10), 'x')
      day = next
    }
    expect(steps).toEqual(once)
    // Sem aniversário no intervalo devolve a mesma lista.
    expect(applyBirthdays(players, '2026-01-01', '2026-01-01', 'x')).toBe(players)
  })

  it('durante a temporada a idade sobe no aniversário e, na virada, todos têm um ano a mais', () => {
    const start = createSeason({ year: 2026, seed: 31, teams: world.teams, players: world.players, academy: world.academy })
    const first = advanceToNextEvent(start).state
    const sample = first.players.filter((p) => birthdaysBetween(p.birthDate, '2026-01-01', first.season.currentDate) > 0)
    expect(sample.length).toBeGreaterThan(100)
    const ages = new Map(world.players.map((p) => [p.id, p.age]))
    for (const p of sample) expect(p.age).toBe(ages.get(p.id)! + 1)

    const ended = simulateToSeasonEnd(start)
    const { state } = advanceSeason(ended, { createYouth })
    const stayed = state.players.filter((p) => ages.has(p.id))
    expect(stayed.length).toBeGreaterThan(900)
    for (const p of stayed) expect(p.age).toBe(ages.get(p.id)! + 1)
    for (const p of stayed) expect(ageOn(p.birthDate, '2027-01-01')).toBe(p.age)
  }, 120_000)
})

describe('save versão 10', () => {
  it('a migração 9→10 gera as datas de nascimento coerentes com a idade e o save continua jogável', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(10)
    expect(MIGRATIONS[9]).toBeTypeOf('function')
    let g = createGame(5, 'team-imp')
    for (let i = 0; i < 12; i++) g = playPendingAuto(advanceToMatchday(g))
    const old = JSON.parse(JSON.stringify(makeEnvelope(g, '2026-01-01T00:00:00Z')))
    for (const p of [...old.game.season.players, ...old.game.season.academy]) delete p.birthDate
    old.game.season.players[3].contract.endDate = 'sem data'
    old.version = 9
    expect(validateGame(old.game)).toContain('jogadores sem data de nascimento')
    const migrated = migrateSave(old)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(validateGame(migrated.game)).toEqual([])
    const today = migrated.game.season.season.currentDate
    for (const p of migrated.game.season.players) expect(ageOn(p.birthDate, today)).toBe(p.age)
    for (const p of migrated.game.season.academy) expect(ageOn(p.birthDate, `${migrated.game.season.season.year}-01-01`)).toBe(p.age)
    expect(migrated.game.season.players[3]!.contract.endDate).toBe('2027-12-31')
    // O mesmo save migrado duas vezes dá as mesmas datas (nada é sorteado).
    const again = migrateSave(JSON.parse(JSON.stringify({ ...old, version: 9, game: { ...old.game } })))
    expect(again.game.season.players.map((p) => p.birthDate)).toEqual(migrated.game.season.players.map((p) => p.birthDate))

    // Continua jogando até o fim da temporada e vira o ano: a idade segue a data de nascimento.
    let next = migrated.game
    // O técnico automático pode ser demitido pelo caminho; aqui só interessa a virada, então a demissão é ignorada.
    for (let guard = 0; next.season.season.phase !== 'end-of-season'; guard++) {
      expect(guard).toBeLessThan(200)
      next = playPendingAuto(advanceToMatchday({ ...next, dismissal: undefined }))
    }
    next = { ...next, dismissal: undefined }
    next = startNextSeason(next)
    expect(next.season.season.year).toBe(migrated.game.season.season.year + 1)
    for (const p of next.season.players) expect(ageOn(p.birthDate, `${next.season.season.year}-01-01`)).toBe(p.age)
  }, 240_000)
})
