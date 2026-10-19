/**
 * Calendário e término das copas no mundo de 358 clubes (3D): toda copa tem datas para todas as fases e termina; as copas com clubes de vários
 * países não esbarram em nenhum outro jogo do clube; o Mundial de Clubes tira as ligas de ano civil do caminho.
 */
import { describe, expect, it } from 'vitest'
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { progressCups, stageList } from '../src/engine/cups'
import { advanceUntil, createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { addDays } from '../src/engine/season/dates'
import { roundSlots } from '../src/engine/season/calendar'
import type { CupSpec } from '../src/engine/types'

const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(7))))
const world = loadWorld(7, pkg)
const specs = world.cups as CupSpec[]
const seasonOf = (year: number) => createSeason({ year, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: specs })

describe('todas as copas têm datas para todas as fases e terminam (temporada 2026)', () => {
  const season = advanceUntil(seasonOf(2026), '2027-07-15', { market: true }).state

  it('cada copa tem campeão, e cada fase tem jogos com data, todos jogados', () => {
    expect(season.cups!.length).toBeGreaterThanOrEqual(23)
    for (const cup of season.cups!) {
      expect(cup.winnerId, `${cup.id} sem campeão`).toBeDefined()
      const list = stageList(cup.spec)
      expect(cup.log, `${cup.id} fases sorteadas`).toHaveLength(list.length)
      list.forEach((stage, i) => {
        const matches = season.matches.filter((m) => m.competitionId === cup.id && m.cup?.stage === i)
        expect(matches.length, `${cup.id} / ${stage.name} sem jogos`).toBeGreaterThan(0)
        expect(matches.every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date) && m.status === 'finished'), `${cup.id} / ${stage.name} sem data ou por jogar`).toBe(true)
      })
    }
  })

  it('nenhum clube joga a copa continental ou mundial na véspera ou no dia seguinte de outro jogo, nem duas vezes no mesmo dia', () => {
    const multi = new Set(season.cups!.filter((c) => c.pyramid === undefined).map((c) => c.id))
    const days = new Map<string, Map<string, number>>()
    for (const m of season.matches) for (const id of [m.homeTeamId, m.awayTeamId]) {
      const mine = days.get(id) ?? new Map<string, number>()
      mine.set(m.date, (mine.get(m.date) ?? 0) + 1)
      days.set(id, mine)
    }
    let glued = 0
    for (const m of season.matches.filter((x) => multi.has(x.competitionId))) {
      for (const id of [m.homeTeamId, m.awayTeamId]) {
        const mine = days.get(id)!
        expect(mine.get(m.date)).toBe(1)
        if (mine.has(addDays(m.date, -1)) || mine.has(addDays(m.date, 1))) glued++
      }
    }
    expect(glued).toBe(0)
  })
})

describe('o Mundial de Clubes tira as ligas de ano civil do caminho (2029)', () => {
  const mundialYear = seasonOf(2029)
  const normalYear = seasonOf(2028)
  const inWindow = (s: SeasonState, year: number, id: string) => s.matches.filter((m) => m.competitionId === id && m.date >= `${year}-06-03` && m.date <= `${year}-07-22`)

  it('a Série A não tem rodadas de 3/6 a 22/7 no ano do Mundial, termina antes do fim do ano e tem todas as rodadas; no ano normal tem jogos nesse período', () => {
    expect(inWindow(mundialYear, 2029, 'br-1')).toHaveLength(0)
    expect(inWindow(normalYear, 2028, 'br-1').length).toBeGreaterThan(0)
    const dates = mundialYear.matches.filter((m) => m.competitionId === 'br-1').map((m) => m.date).sort()
    expect(dates.at(-1)! <= '2029-12-31').toBe(true)
    expect(dates).toHaveLength(380)
  })

  it('as ligas de temporada que atravessa o ano não mudam', () => {
    const count = (s: SeasonState) => s.matches.filter((m) => m.competitionId === 'en-1').length
    expect(count(mundialYear)).toBe(count(normalYear))
  })

  it('roundSlots pula o período e mantém as rodadas em ordem', () => {
    const slots = roundSlots(2029, 38, [1, 24], 3, [['2029-06-03', '2029-07-22']])
    const days = slots.flatMap((s) => s.days)
    expect(days.some((d) => d >= '2029-06-03' && d <= '2029-07-22')).toBe(false)
    expect(days).toEqual([...days].sort())
    expect(slots).toHaveLength(38)
  })

  it('o sorteio do Mundial não esbarra em nenhum jogo de liga', () => {
    const created = progressCups({ ...mundialYear, season: { ...mundialYear.season, currentDate: '2029-06-02' } })
    const cup = created.cups!.find((c) => c.id === 'world-2')!
    const entrants = new Set(cup.entrants.map((e) => e.teamId))
    const group = created.matches.filter((m) => m.competitionId === 'world-2')
    const others = created.matches.filter((m) => m.competitionId !== 'world-2' && (entrants.has(m.homeTeamId) || entrants.has(m.awayTeamId)))
    const busy = new Set(others.flatMap((m) => [m.homeTeamId, m.awayTeamId].map((id) => `${id}:${m.date}`)))
    let glued = 0
    for (const m of group) for (const id of [m.homeTeamId, m.awayTeamId]) for (const d of [m.date, addDays(m.date, -1), addDays(m.date, 1)]) if (busy.has(`${id}:${d}`)) glued++
    expect(glued).toBe(0)
    expect(group.every((m) => m.date >= '2029-06-03' && m.date <= '2029-06-27')).toBe(true)
  })
})
