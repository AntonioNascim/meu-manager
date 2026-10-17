import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { FULL_WORLD, buildScaleWorld } from '../src/diagnostics/scaleWorld'
import { CAREER } from '../src/engine/config'
import { dismissedReputation, jobOpenings, perceivedReputation, prestige, seasonReputation, startingCoach } from '../src/engine/career'
import { createSeason } from '../src/engine/season'
import { DEFAULT_PLAN } from '../src/engine/training'
import { advanceToMatchday, boardOf, coachOf, createGame, playPendingAuto, takeUserJob, userCompetition, userJobOpenings, userTeam } from '../src/store/game'
import type { Game } from '../src/store/game'
import { Career } from '../src/ui/screens/Career'
import { Dismissed } from '../src/ui/screens/Dismissed'

const world = generateWorld({ seed: 5 })
const weakest = [...world.teams].filter((t) => t.tier === 1).sort((a, b) => a.reputation - b.reputation)[0]!
const dismiss = (g: Game): Game => ({ ...g, coach: { ...coachOf(g), reputation: 7 }, dismissal: { date: g.season.season.currentDate, reason: 'results', confidence: 3, position: 19 } })

describe('reputação do técnico', () => {
  const coach = { reputation: 10 }
  it('começa no prestígio do clube e o nível da liga pesa', () => {
    expect(startingCoach({ reputation: 12 }).reputation).toBe(12)
    expect(prestige({ reputation: 12, economy: { revenue: 5, level: 8 } })).toBeGreaterThan(prestige({ reputation: 12 }))
    expect(prestige({ reputation: 12, economy: { revenue: 0.25, level: -5 } })).toBeLessThan(prestige({ reputation: 12 }))
  })

  it('sobe quando o time passa da meta, mais ainda com o título, e cai quando fica abaixo', () => {
    const at = (position: number) => seasonReputation(coach, { position, targetPosition: 8, teamCount: 20 })
    expect(at(8)).toBe(10)
    expect(at(4)).toBeGreaterThan(10)
    expect(at(1)).toBeGreaterThan(at(2) + CAREER.titleBonus - 0.5)
    expect(at(16)).toBeLessThan(10)
    expect(seasonReputation({ reputation: 19.8 }, { position: 1, targetPosition: 1, teamCount: 20 })).toBe(20)
    expect(seasonReputation({ reputation: 1.2 }, { position: 20, targetPosition: 1, teamCount: 20 })).toBe(1)
  })

  it('a demissão custa reputação e a confiança da diretoria muda o que os outros clubes enxergam', () => {
    expect(dismissedReputation(coach)).toBe(10 - CAREER.dismissalPenalty)
    expect(perceivedReputation(coach, 100)).toBeCloseTo(10 + CAREER.confidenceSwing)
    expect(perceivedReputation(coach, 0)).toBeLessThan(10)
    expect(perceivedReputation(coach, 70)).toBe(10)
  })
})

describe('propostas e vagas', () => {
  const g = createGame(5, weakest.id)
  const base = { userTeamId: weakest.id, coach: { reputation: 12 } }

  it('são as mesmas em qualquer consulta, sem o próprio clube e dentro do que a reputação alcança', () => {
    const a = jobOpenings(g.season, { ...base, employed: true })
    expect(jobOpenings(g.season, { ...base, employed: true })).toEqual(a)
    expect(a.length).toBeLessThanOrEqual(CAREER.offer.max)
    for (const o of a) {
      expect(o.teamId).not.toBe(weakest.id)
      expect(o.prestige).toBeLessThanOrEqual(12 + CAREER.offer.above)
      expect(o.kind).toBe('offer')
    }
  })

  it('um técnico de reputação maior recebe propostas de clubes maiores', () => {
    const best = (rep: number) => Math.max(0, ...jobOpenings(g.season, { ...base, coach: { reputation: rep }, employed: true }).map((o) => o.prestige))
    const months = ['2026-02-10', '2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10', '2026-09-10']
    const sample = (rep: number) => months.map((d) => jobOpenings({ ...g.season, season: { ...g.season.season, currentDate: d } }, { ...base, coach: { reputation: rep }, employed: true }).length)
    expect(best(18)).toBeGreaterThanOrEqual(best(9))
    expect(sample(14).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })

  it('quem está sem clube sempre encontra vagas, e mesmo com reputação baixíssima', () => {
    for (const rep of [1, 5, 12, 20]) {
      const list = jobOpenings(g.season, { ...base, coach: { reputation: rep }, employed: false })
      expect(list.length).toBeGreaterThanOrEqual(CAREER.search.minListed)
      expect(list.every((o) => o.kind === 'vacancy' && o.teamId !== weakest.id)).toBe(true)
    }
    const low = jobOpenings(g.season, { ...base, coach: { reputation: 5 }, employed: false })
    const high = jobOpenings(g.season, { ...base, coach: { reputation: 16 }, employed: false })
    expect(Math.max(...high.map((o) => o.prestige))).toBeGreaterThan(Math.max(...low.map((o) => o.prestige)))
  })
})

describe('trocar de clube', () => {
  const fired = (): Game => dismiss(createGame(5, weakest.id))

  it('o demitido assume uma vaga: o jogo volta a andar com o clube novo, o treino vai junto e a reputação fica', () => {
    const g = fired()
    const pick = userJobOpenings(g)[0]!
    const next = takeUserJob(g, pick.teamId)
    expect(next.userTeamId).toBe(pick.teamId)
    expect(next.dismissal).toBeUndefined()
    expect(next.coach?.reputation).toBe(7)
    expect(next.coach?.arrivedOn).toBe(g.season.season.currentDate)
    expect(next.season.training.plans[pick.teamId]).toEqual(g.season.training.plans[weakest.id] ?? DEFAULT_PLAN)
    expect(next.season.training.plans[weakest.id]).toBeUndefined()
    expect(next.season.market.listings.some((l) => l.teamId === pick.teamId)).toBe(false)
    expect(userTeam(next).id).toBe(pick.teamId)
  })

  it('só aceita clubes da lista e nunca com partida por jogar', () => {
    const g = fired()
    expect(() => takeUserJob(g, 'clube-que-nao-existe')).toThrow()
    const listed = new Set(userJobOpenings(g).map((o) => o.teamId))
    const outside = g.season.teams.find((t) => t.id !== g.userTeamId && !listed.has(t.id))!
    expect(() => takeUserJob(g, outside.id)).toThrow()
    const m = g.season.matches.find((x) => x.status === 'scheduled')!
    expect(() => takeUserJob({ ...g, pendingUserMatch: m }, [...listed][0]!)).toThrow()
  })

  it('o clube novo não julga o técnico pela campanha de antes da chegada', () => {
    let g = createGame(5, weakest.id)
    for (let i = 0; i < 20; i++) g = playPendingAuto(advanceToMatchday(g))
    g = dismiss(g)
    const next = takeUserJob(g, userJobOpenings(g)[0]!.teamId)
    expect(boardOf(next).dismissal).toBeUndefined()
    expect(boardOf(next).confidence).toBeGreaterThan(55)
    let after = next
    for (let i = 0; i < 3; i++) after = playPendingAuto(advanceToMatchday(after))
    expect(after.dismissal).toBeUndefined()
  })

  it('a tela de demissão lista as vagas e a de carreira mostra a reputação', () => {
    const g = fired()
    const html = renderToStaticMarkup(createElement(Dismissed, { game: g }))
    expect(html).toContain('Procurar emprego')
    expect(html).toContain('Assumir')
    expect(renderToStaticMarkup(createElement(Career, { game: createGame(5, weakest.id), onTaken: () => {} }))).toContain('Reputação como técnico')
  })

  it('ao aceitar um clube de outra liga, a liga nova passa a ser jogada lance a lance e a antiga, simplificada', () => {
    const built = buildScaleWorld(FULL_WORLD.filter((l) => ['br-1', 'br-2', 'br-3', 'en-1'].includes(l.id)), 3)
    const season = createSeason({ year: 2026, seed: 'carreira', teams: built.teams, players: built.players, academy: built.academy, competitions: built.competitions, focus: 'br' })
    const brazil = built.teams.find((t) => t.tier === 1 && !t.economy)!
    const at = (date: string): Game => ({ seed: 3, userTeamId: brazil.id, season: { ...season, season: { ...season.season, currentDate: date } }, lastDay: [], notices: [], seasonLog: [], archive: [], coach: { reputation: 20 } })
    expect(season.focus).toBe('br')
    // Os convites mudam a cada mês: procura o primeiro mês em que um clube inglês tem vaga.
    const dates = Array.from({ length: 12 }, (_, k) => `2026-${String(k + 1).padStart(2, '0')}-10`)
    const found = dates.map(at).find((game) => userJobOpenings(game).some((o) => game.season.teams.find((t) => t.id === o.teamId)?.economy))
    expect(found, 'com reputação máxima algum mês traz uma vaga fora do Brasil').toBeDefined()
    const g = found as Game
    const target = userJobOpenings(g).find((o) => g.season.teams.find((t) => t.id === o.teamId)?.economy) as { teamId: string }
    const next = takeUserJob(g, target.teamId)
    expect(next.season.focus).not.toBe('br')
    expect(userCompetition(next).id).toContain('en')
  })
})
