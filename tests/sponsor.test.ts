import { describe, expect, it } from 'vitest'
import { annualSponsorship, expectedAnnualRevenue, settleMonth } from '../src/engine/finance'
import { applyCommand, applyPayload, buildFull, emptyMirror, parseCommand, toSeasonState } from '../src/engine/league'
import { SPONSOR, betOptions, betPrize, betWon, bonusPosition, chooseSponsor, placeBet, settleSeasonRewards, sponsorBonusAmount, sponsorShare } from '../src/engine/sponsor'
import type { SeasonState } from '../src/engine/season/calendar'
import type { StandingRow, Team } from '../src/engine/types'
import { createGame } from '../src/store/game'
import { createLeagueWorld } from '../src/store/leagueWorld'

const USER = 'team-imp'
const world = () => createGame(3, USER, { cups: false }).season
const teamOf = (s: SeasonState, id = USER) => s.teams.find((t) => t.id === id) as Team
const withTeam = (s: SeasonState, patch: Partial<Team>): SeasonState => ({ ...s, teams: s.teams.map((t) => (t.id === USER ? { ...t, ...patch } : t)) })
const row = (teamId: string, points: number, goalsAgainst: number): StandingRow => ({ teamId, played: 38, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst, goalDifference: 0, points, yellowCards: 0, redCards: 0 })

describe('patrocinador: três ofertas', () => {
  it('fixo 100%, 82% + 36% e 90% + 55%; a oferta 1 é o patrocínio de sempre', () => {
    const t = teamOf(world())
    expect(sponsorShare(t)).toBe(1)
    expect(sponsorShare({ sponsor: 1 })).toBe(1)
    expect(sponsorShare({ sponsor: 2 })).toBe(0.82)
    expect(sponsorShare({ sponsor: 3 })).toBe(0.9)
    const S = annualSponsorship(t)
    expect(sponsorBonusAmount(t, 1)).toBe(0)
    expect(Math.abs(sponsorBonusAmount(t, 2) - S * 0.36)).toBeLessThanOrEqual(500)
    expect(Math.abs(sponsorBonusAmount(t, 3) - S * 0.55)).toBeLessThanOrEqual(500)
  })

  it('a posição que paga o bônus: a meta (oferta 2) ou 3 melhor, no mínimo o 1º (oferta 3)', () => {
    expect(bonusPosition(1, 8)).toBeNull()
    expect(bonusPosition(2, 8)).toBe(8)
    expect(bonusPosition(3, 8)).toBe(5)
    expect(bonusPosition(3, 2)).toBe(1)
    expect(bonusPosition(3, 1)).toBe(1)
  })

  it('o fixo de 12 meses soma a parcela da oferta (receita parecida com a de hoje quando o bônus vem)', () => {
    const s = world()
    const players = s.players.filter((p) => p.teamId === USER)
    const year = (team: Team) => {
      let t = team
      let total = 0
      for (let m = 1; m <= 12; m++) {
        const before = t.finances.ledger.length
        t = settleMonth(t, players, `2027-${String(m).padStart(2, '0')}-01`, false)
        total += t.finances.ledger.slice(before).filter((e) => e.description === 'Patrocínio').reduce((a, e) => a + e.amount, 0)
      }
      return total
    }
    const base = year(teamOf(s))
    const o2 = year(teamOf(withTeam(s, { sponsor: 2 })))
    const o3 = year(teamOf(withTeam(s, { sponsor: 3 })))
    expect(Math.abs(base - annualSponsorship(teamOf(s)))).toBeLessThan(12)
    expect(Math.abs(o2 / base - 0.82)).toBeLessThan(0.001)
    expect(Math.abs(o3 / base - 0.9)).toBeLessThan(0.001)
    // com o bônus: oferta 2 = 0,82 + 0,36 = 1,18 de S; oferta 3 = 0,9 + 0,55 = 1,45 de S (esperado ~100% e ~99% pelas chances)
    expect(SPONSOR.offers[2].fixed + SPONSOR.offers[2].bonus * 0.5).toBeCloseTo(1, 2)
    expect(SPONSOR.offers[3].fixed + SPONSOR.offers[3].bonus * 0.17).toBeCloseTo(0.99, 2)
  })

  it('escolher vale até o primeiro jogo; a oferta 1 apaga a escolha; oferta inválida é recusada', () => {
    const s = world()
    const two = chooseSponsor(s, USER, 2)
    expect(teamOf(two).sponsor).toBe(2)
    expect(teamOf(chooseSponsor(two, USER, 1)).sponsor).toBeUndefined()
    expect(() => chooseSponsor(s, USER, 4)).toThrow(/inválida/)
    expect(() => chooseSponsor(s, 'x', 2)).toThrow()
    const played: SeasonState = { ...s, matches: s.matches.map((m, i) => (i === s.matches.findIndex((x) => x.homeTeamId === USER || x.awayTeamId === USER) ? { ...m, status: 'finished' as const } : m)) }
    expect(() => chooseSponsor(played, USER, 2)).toThrow(/primeiro jogo/)
  })
})

describe('aposta do ano', () => {
  it('as metas acompanham o tamanho do clube: o grande pede mais pontos e mais vitórias em casa e permite menos gols sofridos', () => {
    const s = world()
    const t = teamOf(s)
    const top = { ...t, objective: { targetPosition: 1, sackingPosition: 8 } }
    const low = { ...t, objective: { targetPosition: 16, sackingPosition: 19 } }
    const a = betOptions(s, top)
    const b = betOptions(s, low)
    expect(a.points).toBeGreaterThan(b.points)
    expect(a['home-wins']).toBeGreaterThan(b['home-wins'])
    expect(a['goals-against']).toBeLessThan(b['goals-against'])
    expect(Math.abs(betPrize(t) - expectedAnnualRevenue(t) / 24)).toBeLessThanOrEqual(500)
  })

  it('uma por temporada, só nas primeiras rodadas', () => {
    const s = world()
    const bet = placeBet(s, USER, 'points')
    expect(teamOf(bet).bet).toMatchObject({ kind: 'points', year: s.season.year })
    expect(teamOf(bet).bet!.target).toBe(betOptions(s, teamOf(s)).points)
    expect(() => placeBet(bet, USER, 'home-wins')).toThrow(/já fez/)
    expect(() => placeBet(s, USER, 'ouro')).toThrow(/inválida/)
    const mine = s.matches.filter((m) => m.homeTeamId === USER || m.awayTeamId === USER).slice(0, 6).map((m) => m.id)
    const late: SeasonState = { ...s, matches: s.matches.map((m) => (mine.includes(m.id) ? { ...m, status: 'finished' as const } : m)) }
    expect(() => placeBet(late, USER, 'points')).toThrow(/prazo/)
  })

  it('cumprida: pontos e vitórias são mínimos, gols sofridos é máximo', () => {
    expect(betWon({ kind: 'points', target: 60, year: 1 }, { points: 60, goalsAgainst: 40 }, 0)).toBe(true)
    expect(betWon({ kind: 'points', target: 60, year: 1 }, { points: 59, goalsAgainst: 40 }, 0)).toBe(false)
    expect(betWon({ kind: 'home-wins', target: 12, year: 1 }, { points: 0, goalsAgainst: 0 }, 12)).toBe(true)
    expect(betWon({ kind: 'goals-against', target: 35, year: 1 }, { points: 0, goalsAgainst: 35 }, 0)).toBe(true)
    expect(betWon({ kind: 'goals-against', target: 35, year: 1 }, { points: 0, goalsAgainst: 36 }, 0)).toBe(false)
  })
})

describe('virada de temporada: bônus e prêmio', () => {
  const settle = (patch: Partial<Team>, position: number, points: number, ga: number) => {
    const s = withTeam(world(), patch)
    const before = teamOf(s)
    const out = settleSeasonRewards(s, { [USER]: { tier: 1, position } }, new Map([[USER, row(USER, points, ga)]]), '2026-12-10')
    return { before, after: teamOf(out), out }
  }
  const target = teamOf(world()).objective.targetPosition

  it('oferta 2 paga o bônus na meta ou melhor; oferta 3 só 3 posições melhor; oferta 1 nada', () => {
    const t = teamOf(world())
    const bonus2 = sponsorBonusAmount(t, 2)
    const win2 = settle({ sponsor: 2 }, target, 0, 0)
    expect(win2.after.finances.balance - win2.before.finances.balance).toBe(bonus2)
    expect(win2.after.rewards).toMatchObject({ offer: 2, bonus: bonus2, position: target })
    const miss2 = settle({ sponsor: 2 }, target + 1, 0, 0)
    expect(miss2.after.finances.balance).toBe(miss2.before.finances.balance)
    expect(miss2.after.rewards?.bonus).toBe(0)
    const need3 = Math.max(1, target - 3)
    expect(settle({ sponsor: 3 }, need3, 0, 0).after.rewards?.bonus).toBe(sponsorBonusAmount(t, 3))
    expect(settle({ sponsor: 3 }, need3 + 1, 0, 0).after.rewards?.bonus).toBe(0)
    expect(settle({ sponsor: 1 }, 1, 0, 0).after.finances.balance).toBe(teamOf(world()).finances.balance)
  })

  it('a aposta cumprida paga o prêmio; a perdida, nada; e o contrato e a aposta saem para a temporada seguinte', () => {
    const s = world()
    const plan = { kind: 'points' as const, target: 50, year: s.season.year }
    const won = settle({ bet: plan, sponsor: 2 }, 20, 55, 40)
    expect(won.after.rewards).toMatchObject({ betWon: true, prize: betPrize(won.before) })
    expect(won.after.bet).toBeUndefined()
    expect(won.after.sponsor).toBeUndefined()
    expect(won.after.finances.balance - won.before.finances.balance).toBe(betPrize(won.before))
    const lost = settle({ bet: plan }, 20, 40, 40)
    expect(lost.after.rewards).toMatchObject({ betWon: false, prize: 0 })
    expect(lost.after.finances.balance).toBe(lost.before.finances.balance)
  })

  it('quem não escolheu nada não muda: o estado volta com a mesma referência', () => {
    const s = world()
    expect(settleSeasonRewards(s, { [USER]: { tier: 1, position: 1 } }, new Map([[USER, row(USER, 80, 20)]]), '2026-12-10')).toBe(s)
  })
})

describe('comandos e espelho (solo e online)', () => {
  it('confere o corpo e aplica no clube do técnico', () => {
    expect(parseCommand({ type: 'sponsor', offer: 2 })).toEqual({ type: 'sponsor', offer: 2 })
    expect(parseCommand({ type: 'sponsor', offer: 4 })).toBeUndefined()
    expect(parseCommand({ type: 'bet', kind: 'points' })).toEqual({ type: 'bet', kind: 'points' })
    expect(parseCommand({ type: 'bet', kind: 'sorte' })).toBeUndefined()
    expect(parseCommand({ type: 'bet', kind: 'points', x: 1 })).toBeUndefined()
    const w = createLeagueWorld(11, undefined, { cups: false })
    const my = w.season.competitions[0]!.teamIds[0]!
    const out = applyCommand(w, my, { type: 'sponsor', offer: 3 })
    expect(out.ok).toBe(true)
    if (out.ok) {
      const bet = applyCommand(out.world, my, { type: 'bet', kind: 'home-wins' })
      expect(bet.ok).toBe(true)
      if (bet.ok) {
        const first = buildFull(bet.world, my, 1, 0)
        let m = applyPayload(emptyMirror(), first)
        for (let page = 1; page < (first.pages ?? 1); page++) m = applyPayload(m, buildFull(bet.world, my, 1, page))
        const seen = toSeasonState(m)!.teams.find((t) => t.id === my)!
        expect(seen.sponsor).toBe(3)
        expect(seen.bet?.kind).toBe('home-wins')
        expect(applyCommand(bet.world, my, { type: 'bet', kind: 'points' })).toMatchObject({ ok: false, error: 'bet-done' })
      }
    }
    expect(applyCommand(w, my, { type: 'sponsor', offer: 9 as never })).toMatchObject({ ok: false })
  })
})
