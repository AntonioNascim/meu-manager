/**
 * O pacote real embutido (`data/pacote-real.json`, Fase 5D): é um pacote válido, vira o mesmo `World` do resto do jogo, e o calendário e as
 * copas fecham com o número real de clubes de cada liga (Argentina com 30 clubes e MLS em turno único).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { stageList } from '../src/engine/cups'
import { createSeason } from '../src/engine/season'
import type { CupSpec } from '../src/engine/types'

const raw = JSON.parse(readFileSync('data/pacote-real.json', 'utf8')) as unknown
const { pkg, report } = validatePackage(raw)

describe('pacote real', () => {
  it('é válido e traz os créditos da licença', () => {
    expect(report.errors, report.errors.slice(0, 5).map((e) => `${e.code} ${e.path}`).join('; ')).toHaveLength(0)
    expect(pkg).toBeDefined()
    expect(pkg!.credits).toMatch(/Creative Commons|CC BY-SA/i)
    expect(pkg!.clubs.length).toBe(370)
    expect(pkg!.leagues.length).toBe(21)
    expect(pkg!.players.length).toBeGreaterThan(10_000)
  })

  it('tem o número real de clubes: Argentina 30 e MLS 30 em turno único', () => {
    const league = (id: string) => pkg!.leagues.find((l) => l.id === id)!
    for (const l of pkg!.leagues) expect(pkg!.clubs.filter((c) => c.league === l.id).length, l.id).toBe(l.teams)
    expect(league('ar-1').teams).toBe(30)
    expect(league('ar-1').rounds).toBe(1)
    expect(league('us-1').teams).toBe(30)
    expect(league('us-1').rounds).toBe(1)
  })

  it('vira um mundo: clubes com 18 a 30 jogadores e prestígio igual à reputação do pacote', () => {
    const world = loadWorld(7, pkg!)
    expect(world.teams).toHaveLength(370)
    for (const t of world.teams) {
      expect(t.squad.length, t.name).toBeGreaterThanOrEqual(18)
      expect(t.squad.length, t.name).toBeLessThanOrEqual(30)
      expect(t.prestige, t.name).toBe(t.reputation)
    }
  })

  const world = loadWorld(7, pkg!)
  const season = createSeason({ year: 2026, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: world.cups as CupSpec[] })

  it('o calendário de cada liga tem as rodadas certas e termina dentro da temporada', () => {
    for (const c of season.season.competitions) {
      if (c.tier !== 1 && !c.id.startsWith('br')) continue
      const n = c.teamIds.length
      const rounds = c.rounds === 1 ? n - 1 : 2 * (n - 1)
      const games = season.matches.filter((m) => m.competitionId === c.id)
      expect(games, c.id).toHaveLength((rounds * n) / 2)
      // Cada clube joga uma vez por rodada, nunca duas vezes no mesmo dia.
      const perTeam = new Map<string, Set<string>>()
      for (const m of games) for (const id of [m.homeTeamId, m.awayTeamId]) {
        const days = perTeam.get(id) ?? new Set<string>()
        expect(days.has(m.date), `${c.id} ${id} duas vezes em ${m.date}`).toBe(false)
        days.add(m.date)
        perTeam.set(id, days)
      }
      expect(perTeam.get(c.teamIds[0]!)!.size, c.id).toBe(rounds)
    }
  })

  it('as copas têm clubes suficientes nas ligas de 30 clubes e nenhuma vaga fica sem dono', () => {
    const cups = season.cups ?? []
    expect(cups.length).toBeGreaterThanOrEqual(15)
    for (const cup of cups) {
      const first = stageList(cup.spec)[0]!
      expect(first, cup.id).toBeDefined()
      // As copas que já nascem na pré-temporada têm os participantes definidos e sem repetição.
      const ids = cup.entrants.map((e) => e.teamId)
      expect(new Set(ids).size, `${cup.id} repete clube`).toBe(ids.length)
    }
    // A Copa da Argentina reúne os 30 clubes da liga de 30 times.
    const ar = season.season.competitions.find((c) => c.id === 'ar-1')!
    const arCup = cups.find((c) => c.id === 'cup-ar')!
    expect(arCup.entrants).toHaveLength(30)
    for (const e of arCup.entrants) expect(ar.teamIds.includes(e.teamId)).toBe(true)
  })
})
