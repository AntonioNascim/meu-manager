import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, advanceLeague, createLeague, cupsBody, defaultLeagueConfig, fixturesOn, leagueView, processLeague, startGame, type LeagueState, type Stepped } from '../src/engine/league'
import { MS_DAY } from '../src/engine/league/pace'
import { humanMatchInput } from '../src/engine/season'
import { cycleOfPyramid } from '../src/engine/season/cycles'
import { pyramidOf } from '../src/engine/season/fidelity'
import { turnRunner } from '../src/store/game'
import { createLeagueWorld } from '../src/store/leagueWorld'

// Sábado, 7 de novembro de 2026, 12h em São Paulo. O mundo da liga traz as copas do mundo padrão (nacional e supercopa do Brasil).
const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const base = createLeagueWorld(6)
const serieA = base.season.competitions[0]!
const SEATS = [
  { teamId: serieA.teamIds[0]!, playerId: 'jogador-1' },
  { teamId: serieA.teamIds[7]!, playerId: 'jogador-2' },
]
const humans = new Set(SEATS.map((s) => s.teamId))
const pyramid = pyramidOf(serieA)
const deps = { turn: turnRunner }
const fresh = (): LeagueState => createLeague(defaultLeagueConfig(DEFAULT_CONFIG('liga-copas'), true), base, SEATS, T0)

/** Uma temporada inteira da liga (resultado direto), guardando o estado do último passo antes da virada. */
function playSeason(): { before: Stepped; after: Stepped; views: ReturnType<typeof leagueView>[] } {
  let s: Stepped = { league: fresh(), world: base, actions: [] }
  const start = cycleOfPyramid(s.world, pyramid).year
  let before = s
  let now = T0
  const views: ReturnType<typeof leagueView>[] = []
  for (let i = 0; i < 500 && cycleOfPyramid(s.world, pyramid).year === start; i++) {
    before = s
    views.push(leagueView(s.league, s.world, now, () => T0))
    now += MS_DAY
    s = advanceLeague(JSON.parse(JSON.stringify(s.league)) as LeagueState, s.world, now, deps, 'adm')
    s = processLeague(s.league, s.world, now, deps)
  }
  return { before, after: s, views }
}

describe('copas numa liga online (B8.8)', () => {
  const { before, after, views } = playSeason()
  const humanCup = before.world.matches.filter((m) => m.cup !== undefined && (humans.has(m.homeTeamId) || humans.has(m.awayTeamId)))

  it('os clubes humanos jogam as partidas de copa como qualquer partida humana, todas decididas', () => {
    expect(humanCup.length).toBeGreaterThan(4)
    expect(humanCup.every((m) => m.status === 'finished' && m.result !== undefined)).toBe(true)
    // Mata-mata de jogo único: nunca termina empatado sem pênaltis.
    const stages = new Set(humanCup.map((m) => m.cup!.stage))
    expect(stages.size).toBeGreaterThan(1)
  })

  it('as copas terminam com campeão e vice e entram no histórico (que alimenta as edições seguintes)', () => {
    const history = after.world.cupHistory ?? {}
    expect(Object.keys(history).length).toBeGreaterThanOrEqual(2)
    for (const list of Object.values(history)) {
      expect(list.at(-1)!.winnerId).toBeTruthy()
    }
    const body = cupsBody(after.world, SEATS[0]!.teamId)
    expect(body.history.length).toBeGreaterThanOrEqual(2)
    expect(body.history.every((h) => h.name.length > 0)).toBe(true)
  })

  it('o resumo das copas mostra o caminho do clube (fases, resultado e se segue vivo) antes da virada', () => {
    const mine = cupsBody(before.world, SEATS[0]!.teamId)
    expect(mine.mine.length).toBeGreaterThan(0)
    for (const c of mine.mine) {
      expect(c.steps.length).toBeGreaterThan(0)
      for (const s of c.steps) expect(['passed', 'out', 'playing', 'bye']).toContain(s.state)
    }
    // O campeão da copa nacional tem todos os passos "passou".
    const winnerTeam = before.world.cups?.find((c) => c.id === 'cup-br')?.winnerId
    if (winnerTeam && humans.has(winnerTeam)) {
      const card = cupsBody(before.world, winnerTeam).mine.find((c) => c.id === 'cup-br')!
      expect(card.finished).toBe(true)
      expect(card.steps.every((s) => s.state === 'passed' || s.state === 'bye')).toBe(true)
    }
  })

  it('a visão da liga diz, em cada data, os jogos dos técnicos (liga ou copa, com a fase)', () => {
    const withCup = views.filter((v) => v.events.some((e) => (e.fixtures ?? []).some((f) => f.cup)))
    expect(withCup.length).toBeGreaterThan(0)
    for (const v of views) {
      for (const e of v.events) {
        for (const f of e.fixtures ?? []) {
          expect(f.competition.length).toBeGreaterThan(0)
          expect(humans.has(f.homeTeamId) || humans.has(f.awayTeamId)).toBe(true)
        }
      }
    }
    const league = views.flatMap((v) => v.events.flatMap((e) => e.fixtures ?? [])).filter((f) => !f.cup)
    expect(league.length).toBeGreaterThan(0)
    expect(league[0]!.detail).toMatch(/^Rodada \d+/)
    const cup = views.flatMap((v) => v.events.flatMap((e) => e.fixtures ?? [])).find((f) => f.cup)!
    expect(cup.competition).toMatch(/Copa|Supercopa/)
  })

  it('fixturesOn só traz jogos de clubes humanos e respeita a lista de datas', () => {
    const date = humanCup[0]!.date
    const one = fixturesOn(before.world, humans, new Set([date]), true)
    expect([...one.keys()]).toEqual([date])
    expect(fixturesOn(before.world, humans, new Set(['1999-01-01']), true).size).toBe(0)
  })

  it('ao vivo, um jogo de mata-mata de copa sempre termina com vencedor (prorrogação e pênaltis)', () => {
    const tie = humanCup.find((m) => m.cup!.kind === 'knockout')!
    const input = humanMatchInput(before.world, tie, humans)
    expect(input.knockout).toBeDefined()
    let extra = 0
    let penalties = 0
    for (let seed = 1; seed <= 60; seed++) {
      const game = startGame(tie.id, { ...input, seed })
      game.live.playUntil(120)
      const r = game.live.result()
      expect(game.live.finished).toBe(true)
      if (!input.knockout?.priorLeg) expect(r.homeGoals !== r.awayGoals || r.shootout !== undefined).toBe(true)
      if (game.live.snapshot().extraTime) extra++
      if (r.shootout) penalties++
    }
    // Em 60 jogos aparece prorrogação e aparece decisão nos pênaltis (sanidade: o caminho é exercitado).
    expect(extra).toBeGreaterThan(0)
    expect(penalties).toBeGreaterThan(0)
  })
}, 600_000)
