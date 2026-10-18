import { describe, expect, it } from 'vitest'
import { createYouth } from '../src/data/generateYouth'
import { FULL_WORLD, buildScaleWorld } from '../src/diagnostics/scaleWorld'
import { windowOf, windowsFor } from '../src/engine/market'
import { advanceSeason } from '../src/engine/offseason'
import {
  advanceUntil,
  contractEndAfter,
  createSeason,
  cycleOfPyramid,
  cycleOfTeam,
  firstCycle,
  makeCycle,
  pyramidFinished,
  seasonLabel,
  simulateToSeasonEnd,
} from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { MIGRATIONS, makeEnvelope, migrateSave } from '../src/store/saveFormat'
import { advanceToMatchday, createGame, nextEventOf, playPendingAuto, startNextSeason } from '../src/store/game'
import type { Game } from '../src/store/game'

const built = buildScaleWorld(FULL_WORLD.filter((l) => ['br-1', 'uy-1', 'en-1'].includes(l.id)), 4)
/** Brasil e Uruguai no ano civil, Inglaterra atravessando o ano. */
const competitions = built.competitions.map((c) => (c.id === 'en-1' ? { ...c, split: true, start: [8, 8] as [number, number] } : c))
const base = { seed: 4, teams: built.teams, players: built.players, academy: built.academy, competitions }
const brazil = built.competitions[0]!.teams[0]!.id
const england = built.competitions[2]!.teams[0]!.id

describe('ciclos de temporada', () => {
  it('ano civil de 1º/1 a 31/12; a temporada que atravessa o ano vai de 1º/7 a 30/6 e se escreve 2026/27', () => {
    const calendar = makeCycle(2026, false)
    expect([calendar.start, calendar.end, seasonLabel(calendar)]).toEqual(['2026-01-01', '2026-12-31', '2026'])
    const split = makeCycle(2026, true)
    expect([split.start, split.end, seasonLabel(split)]).toEqual(['2026-07-01', '2027-06-30', '2026/27'])
    expect(seasonLabel(makeCycle(2099, true))).toBe('2099/00')
    expect(contractEndAfter(split, 2)).toBe('2029-06-30')
    expect(contractEndAfter(calendar, 3)).toBe('2029-12-31')
  })

  it('cada país joga a primeira temporada que começa na data inicial do relógio', () => {
    expect(firstCycle(false, '2026-01-01').year).toBe(2026)
    expect(firstCycle(true, '2026-01-01').year).toBe(2026)
    expect(firstCycle(false, '2026-07-01').year).toBe(2027)
    expect(firstCycle(true, '2026-07-01').year).toBe(2026)
  })

  it('createSeason dá a cada pirâmide o seu ciclo e põe os jogos dentro dele', () => {
    const s = createSeason({ ...base, year: 2026 })
    expect(Object.fromEntries(Object.entries(s.cycles).map(([k, c]) => [k, seasonLabel(c)]))).toEqual({ br: '2026', uy: '2026', en: '2026/27' })
    for (const c of s.season.competitions) {
      const cycle = cycleOfPyramid(s, c.pyramid!)
      const dates = s.matches.filter((m) => m.competitionId === c.id).map((m) => m.date).sort()
      expect(dates[0]! >= cycle.start && dates[dates.length - 1]! <= cycle.end).toBe(true)
    }
    const england = s.matches.filter((m) => m.competitionId === 'en-1').map((m) => m.date).sort()
    expect(england[0]).toBe('2026-08-08')
    expect(england[england.length - 1]!.startsWith('2027-0')).toBe(true)
    expect(s.season.currentDate).toBe('2026-01-01')
    // Quem abre o jogo em 1º de julho (técnico europeu) encontra o Brasil na temporada seguinte.
    const july = createSeason({ ...base, year: 2026, startDate: '2026-07-01' })
    expect(Object.fromEntries(Object.entries(july.cycles).map(([k, c]) => [k, c.year]))).toEqual({ br: 2027, uy: 2027, en: 2026 })
  })

  it('a janela de verão europeia cai no meio da temporada brasileira e cada clube segue a janela da região dele', () => {
    const s = createSeason({ ...base, year: 2026 })
    expect(windowOf(s, '2026-08-15', 'EU')?.name).toBe('pre-season')
    expect(windowOf(s, '2026-08-15', 'BR')).toBeNull()
    expect(windowOf(s, '2027-01-15', 'EU')?.name).toBe('mid-year')
    expect(windowOf(s, '2027-01-15', 'BR')?.name).toBe('pre-season')
    expect(windowsFor(s, 'EU', '2026-08-15').some((w) => w.start === '2026-07-01' && w.end === '2026-08-31')).toBe(true)
  })

  it('o contrato novo termina no último dia da temporada do clube (30/6 na Europa, 31/12 no Brasil)', () => {
    const s = createSeason({ ...base, year: 2026 })
    expect(cycleOfTeam(s, england).end).toBe('2027-06-30')
    expect(cycleOfTeam(s, brazil).end).toBe('2026-12-31')
  })
})

describe('virada por país', () => {
  const start = createSeason({ ...base, year: 2026 })
  const brazilEnd = advanceUntil(start, '2026-12-31', {}).state

  it('o relógio do mundo é um só: quando o Brasil acaba, a Inglaterra segue no meio da temporada', () => {
    expect(pyramidFinished(brazilEnd, 'br')).toBe(true)
    expect(pyramidFinished(brazilEnd, 'uy')).toBe(true)
    expect(pyramidFinished(brazilEnd, 'en')).toBe(false)
    expect(brazilEnd.matches.some((m) => m.competitionId === 'en-1' && m.status === 'finished')).toBe(true)
    expect(brazilEnd.season.currentDate).toBe('2026-12-31')
  })

  it('advanceSeason de um país só mexe nele: os outros clubes, jogadores e jogos ficam como estavam', () => {
    const { state: next, report } = advanceSeason(brazilEnd, { createYouth, pyramid: 'br' })
    expect(report.pyramid).toBe('br')
    expect(report.label).toBe('2026')
    expect(seasonLabel(next.cycles.br!)).toBe('2027')
    expect(seasonLabel(next.cycles.en!)).toBe('2026/27')
    expect(next.cycles.uy!.year).toBe(2026)
    const englishTeams = new Set(brazilEnd.season.competitions.find((c) => c.id === 'en-1')!.teamIds)
    for (const t of brazilEnd.teams) if (englishTeams.has(t.id)) expect(next.teams.find((x) => x.id === t.id)).toBe(t)
    expect(next.matches.filter((m) => m.competitionId === 'en-1')).toEqual(brazilEnd.matches.filter((m) => m.competitionId === 'en-1'))
    expect(next.matches.filter((m) => m.competitionId === 'br-1').every((m) => m.date.startsWith('2027') && m.status === 'scheduled')).toBe(true)
    for (const t of next.teams.filter((x) => !englishTeams.has(x.id) && x.history.length > 0)) expect(t.history[t.history.length - 1]!.year).toBe(2026)
    expect(next.season.currentDate).toBe('2026-12-31')
  })

  it('não vira um país que ainda joga', () => {
    expect(() => advanceSeason(brazilEnd, { createYouth, pyramid: 'en' })).toThrow()
  })

  it('a Inglaterra vira em 30 de junho do ano seguinte, com contratos novos terminando em 30/6', () => {
    const end = advanceUntil(brazilEnd, '2027-06-30', {}).state
    expect(pyramidFinished(end, 'en')).toBe(true)
    const { state: next } = advanceSeason(end, { createYouth, pyramid: 'en' })
    expect(seasonLabel(next.cycles.en!)).toBe('2027/28')
    const squad = next.players.filter((p) => p.teamId === england)
    expect(squad.every((p) => p.contract.endDate > '2027-06-30')).toBe(true)
    // Os contratos renovados e os jovens que chegam terminam em 30/6 (os do mundo de teste, gerados em 31/12, ainda não foram renovados).
    expect(squad.some((p) => p.contract.endDate.endsWith('-06-30'))).toBe(true)
    expect(squad.filter((p) => p.contract.endDate.endsWith('-06-30')).every((p) => p.contract.endDate >= '2028-06-30')).toBe(true)
    expect(next.matches.filter((m) => m.competitionId === 'en-1').every((m) => m.date >= '2027-08-01')).toBe(true)
  }, 120_000)

  it('sem pirâmide, advanceSeason vira todos os países e o relatório traz as ligas de todos', () => {
    const all = simulateToSeasonEnd(createSeason({ ...base, year: 2026 }))
    const { state: next, report } = advanceSeason(all, { createYouth })
    expect(Object.keys(report.championsByCompetition ?? {}).sort()).toEqual(['br-1', 'en-1', 'uy-1'])
    expect(Object.values(next.cycles).map((c) => c.year)).toEqual([2027, 2027, 2027])
  }, 120_000)
})

describe('o jogo com várias temporadas', () => {
  const world = { seed: 4, startYear: 2026, teams: built.teams, players: built.players, academy: built.academy, competitions }
  const easy = (g: Game): Game => ({ ...g, dismissal: undefined, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === g.userTeamId ? { ...t, objective: { targetPosition: 20, sackingPosition: 20 } } : t)) } })
  const playSeason = (g: Game): Game => {
    for (let i = 0; i < 400 && nextEventOf(g).type !== 'season-end'; i++) g = easy(playPendingAuto(advanceToMatchday(g)))
    return g
  }

  it('o técnico brasileiro termina em dezembro: o Uruguai vira sozinho e a Inglaterra segue na temporada 2026/27', () => {
    let game = easy(createGame(4, brazil, { world, cups: false }))
    expect(game.season.season.currentDate).toBe('2026-01-01')
    expect(game.season.focus).toBe('br')
    game = playSeason(game)
    expect(nextEventOf(game).type).toBe('season-end')
    expect(game.season.season.phase).toBe('end-of-season')
    game = startNextSeason(game)
    expect(game.season.season.currentDate).toBe('2026-12-31')
    expect(game.season.season.year).toBe(2027)
    expect(game.season.season.phase).toBe('pre-season')
    expect(seasonLabel(game.season.cycles.br!)).toBe('2027')
    expect(seasonLabel(game.season.cycles.uy!)).toBe('2027')
    expect(seasonLabel(game.season.cycles.en!)).toBe('2026/27')
    expect(game.seasonLog).toHaveLength(1)
    // O arquivo guarda a classificação final de cada país que virou (o do técnico e o do Uruguai), com o nome da temporada.
    expect(game.archive.map((a) => `${a.pyramid}:${a.label}`).sort()).toEqual(['br:2026', 'uy:2026'])
    expect(game.archive.find((a) => a.pyramid === 'uy')!.competitions).toEqual(['uy-1'])
  }, 240_000)

  it('o técnico europeu abre o jogo em 1º de julho e a virada dele é em 30 de junho', () => {
    let game = easy(createGame(4, england, { world, cups: false }))
    expect(game.season.season.currentDate).toBe('2026-07-01')
    expect(seasonLabel(game.season.cycles.en!)).toBe('2026/27')
    expect(seasonLabel(game.season.cycles.br!)).toBe('2027')
    game = playSeason(game)
    game = startNextSeason(game)
    expect(game.season.season.currentDate).toBe('2027-06-30')
    expect(seasonLabel(game.season.cycles.en!)).toBe('2027/28')
    // Enquanto isso o Brasil jogou a metade da temporada 2027 (começou em janeiro) e segue nela.
    expect(seasonLabel(game.season.cycles.br!)).toBe('2027')
    expect(game.season.matches.some((m) => m.competitionId === 'br-1' && m.status === 'finished')).toBe(true)
    expect(game.seasonLog[0]!.label).toBe('2026/27')
  }, 360_000)
})

describe('save versão 11', () => {
  it('a migração 10→11 põe os ciclos de ano civil e a pirâmide das copas num save antigo', () => {
    expect(MIGRATIONS[10]).toBeTypeOf('function')
    const game = createGame(4, brazil, { world: { seed: 4, startYear: 2026, teams: built.teams, players: built.players, academy: built.academy, competitions }, cups: false })
    const old = JSON.parse(JSON.stringify(makeEnvelope(game, '2026-01-01T00:00:00Z')))
    delete old.game.season.cycles
    old.version = 10
    const migrated = migrateSave(old)
    const state = migrated.game.season as SeasonState
    expect(Object.keys(state.cycles).sort()).toEqual(['br', 'en', 'uy'])
    expect(state.cycles.br).toEqual({ year: 2026, start: '2026-01-01', end: '2026-12-31', split: false })
  })
})
