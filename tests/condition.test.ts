import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { CONDITION } from '../src/engine/config'
import { buildTactic, isAvailable, restedFactor } from '../src/engine/lineup'
import {
  advanceToNextEvent,
  aiTactic,
  applyMatchToPlayers,
  createSeason,
  fitnessRecoveryPerDay,
  nextEvent,
  progressDays,
} from '../src/engine/season'
import type { Match, MatchEvent, MatchResult, Player, PlayerMatchResult, Team } from '../src/engine/types'

const world = generateWorld({ seed: 5 })
const squadOf = (team: Team) => world.players.filter((p) => p.teamId === team.id)
const [home, away] = world.teams.filter((t) => t.tier === 1) as [Team, Team]
const homeSquad = squadOf(home)
const awaySquad = squadOf(away)
const squads = new Map([[home.id, homeSquad], [away.id, awaySquad]])
const withCondition = (p: Player, c: Partial<Player['condition']>): Player => ({ ...p, condition: { ...p.condition, ...c } })

const stats = { possession: 50, shots: 5, shotsOnTarget: 2, corners: 3, fouls: 10, yellowCards: 0, redCards: 0, xg: 1 }

function fakeMatch(options: {
  homeGoals?: number
  awayGoals?: number
  events?: Partial<MatchEvent>[]
  results?: Partial<PlayerMatchResult>[]
}): Match {
  const events = (options.events ?? []).map((e) => ({ minute: 30, type: 'foul', teamId: home.id, playerId: '', text: '', ...e }) as MatchEvent)
  const playerResults = (options.results ?? []).map((r) => ({ teamId: home.id, minutesPlayed: 90, rating: 6, finalFitness: 70, ...r }) as PlayerMatchResult)
  const result: MatchResult = {
    homeGoals: options.homeGoals ?? 0, awayGoals: options.awayGoals ?? 0, events, playerResults, homeStats: stats, awayStats: stats,
  }
  return { id: 'm1', competitionId: 'serie-a', round: 1, date: '2026-04-11', homeTeamId: home.id, awayTeamId: away.id, status: 'finished', seed: 1, result }
}

const find = (updated: Player[], p: Player) => updated.find((u) => u.id === p.id) as Player

describe('recuperação por dias', () => {
  const tired = (p: Player, fitness: number) => withCondition(p, { fitness })
  const p0 = homeSquad[3] as Player

  it('recupera condição física por dia, sem passar de 100', () => {
    const [after] = progressDays([tired(p0, 40)], 2)
    expect(after?.condition.fitness).toBeCloseTo(40 + 2 * fitnessRecoveryPerDay(p0), 5)
    expect(progressDays([tired(p0, 95)], 5)[0]?.condition.fitness).toBe(100)
  })

  it('mais dias recuperam mais, e quem tem mais resistência recupera mais rápido', () => {
    expect(progressDays([tired(p0, 40)], 3)[0]?.condition.fitness).toBeGreaterThan(progressDays([tired(p0, 40)], 1)[0]?.condition.fitness as number)
    const strong = { ...p0, attributes: { ...p0.attributes, stamina: 90 } }
    const weak = { ...p0, attributes: { ...p0.attributes, stamina: 30 } }
    expect(fitnessRecoveryPerDay(strong)).toBeGreaterThan(fitnessRecoveryPerDay(weak))
  })

  it('a contagem de dias de lesão cai com o tempo e para em zero', () => {
    const injured = withCondition(p0, { injuryDaysLeft: 10 })
    expect(progressDays([injured], 4)[0]?.condition.injuryDaysLeft).toBe(6)
    expect(progressDays([injured], 30)[0]?.condition.injuryDaysLeft).toBe(0)
    expect(isAvailable(progressDays([injured], 10)[0] as Player)).toBe(true)
    expect(isAvailable(injured)).toBe(false)
  })

  it('a moral volta devagar para o neutro, de cima e de baixo', () => {
    const up = progressDays([withCondition(p0, { morale: 95 })], 7)[0]?.condition.morale as number
    const down = progressDays([withCondition(p0, { morale: 30 })], 7)[0]?.condition.morale as number
    expect(up).toBeLessThan(95)
    expect(up).toBeGreaterThan(70)
    expect(down).toBeGreaterThan(30)
    expect(down).toBeLessThan(70)
  })

  it('zero dia não muda nada e não altera a lista original', () => {
    const list = [tired(p0, 50)]
    const same = progressDays(list, 0)
    expect(same[0]).toBe(list[0])
    progressDays(list, 3)
    expect(list[0]?.condition.fitness).toBe(50)
  })
})

describe('suspensões', () => {
  const [a, b, c] = [homeSquad[5], homeSquad[6], homeSquad[7]] as [Player, Player, Player]

  it('cartão vermelho = 1 jogo de suspensão', () => {
    const m = fakeMatch({ events: [{ type: 'red-card', playerId: a.id }], results: [{ playerId: a.id }] })
    const updated = applyMatchToPlayers(squads, m)
    expect(find(updated, a).condition.suspensionGames).toBe(CONDITION.redCardGames)
    expect(find(updated, a).condition.redCards).toBe(1)
    expect(find(updated, b).condition.suspensionGames).toBe(0)
    expect(isAvailable(find(updated, a))).toBe(false)
  })

  it('3 amarelos acumulados = 1 jogo, e o contador recomeça', () => {
    const yellow = (p: Player) => fakeMatch({ events: [{ type: 'yellow-card', playerId: p.id }], results: [{ playerId: p.id }] })
    let squad = squads
    let player = a
    const suspensions: number[] = []
    for (let i = 0; i < 3; i++) {
      player = find(applyMatchToPlayers(squad, yellow(player)), player)
      suspensions.push(player.condition.suspensionGames)
      squad = new Map([[home.id, [player]], [away.id, awaySquad]])
    }
    expect(suspensions).toEqual([0, 0, 1])
    expect(player.condition.yellowCards).toBe(0)
  })

  it('expulsão por dois amarelos vale como um vermelho só (os amarelos do jogo não acumulam)', () => {
    const m = fakeMatch({
      events: [{ type: 'yellow-card', playerId: a.id }, { type: 'yellow-card', playerId: a.id }, { type: 'red-card', playerId: a.id }],
      results: [{ playerId: a.id }],
    })
    const p = find(applyMatchToPlayers(squads, m), a)
    expect(p.condition.suspensionGames).toBe(1)
    expect(p.condition.yellowCards).toBe(0)
  })

  it('quem já estava suspenso cumpre o jogo; a nova suspensão fica para o próximo', () => {
    const serving = withCondition(b, { suspensionGames: 1 })
    const m = fakeMatch({ events: [{ type: 'red-card', playerId: c.id }], results: [{ playerId: c.id }] })
    const updated = applyMatchToPlayers(new Map([[home.id, [serving, c]], [away.id, awaySquad]]), m)
    expect(find(updated, serving).condition.suspensionGames).toBe(0)
    expect(find(updated, c).condition.suspensionGames).toBe(1)
  })

  it('suspenso e lesionado não entram na escalação da IA', () => {
    const xi = home.tactic.startingXI
    const squad = homeSquad.map((p) =>
      p.id === xi[1] ? withCondition(p, { suspensionGames: 1 }) : p.id === xi[2] ? withCondition(p, { injuryDaysLeft: 12 }) : p,
    )
    const tactic = aiTactic(home, squad)
    expect(tactic.startingXI).not.toContain(xi[1])
    expect(tactic.startingXI).not.toContain(xi[2])
    expect(tactic.bench).not.toContain(xi[1])
    expect(new Set(tactic.startingXI).size).toBe(11)
  })
})

describe('efeitos da partida nos jogadores', () => {
  const starter = homeSquad.find((p) => p.id === home.tactic.startingXI[8]) as Player
  const benchwarmer = homeSquad.find((p) => !home.tactic.startingXI.includes(p.id) && !home.tactic.bench.includes(p.id)) as Player

  it('quem jogou fica com a condição final; quem não jogou mantém a sua', () => {
    const m = fakeMatch({ results: [{ playerId: starter.id, finalFitness: 64 }] })
    const updated = applyMatchToPlayers(squads, m)
    expect(find(updated, starter).condition.fitness).toBe(64)
    expect(find(updated, benchwarmer).condition.fitness).toBe(100)
    expect(find(updated, starter).seasonStats).toMatchObject({ appearances: 1, minutes: 90 })
    expect(find(updated, benchwarmer).seasonStats.appearances).toBe(0)
  })

  it('lesão sofrida vira dias de lesão', () => {
    const m = fakeMatch({ results: [{ playerId: starter.id, injuryDays: 21 }] })
    expect(find(applyMatchToPlayers(squads, m), starter).condition.injuryDaysLeft).toBe(21)
  })

  it('a forma é a média das últimas 5 notas, da mais recente para a mais antiga', () => {
    let player = starter
    const ratings = [7, 8, 6, 5, 9, 7.5]
    for (const rating of ratings) {
      const m = fakeMatch({ results: [{ playerId: player.id, rating }] })
      player = find(applyMatchToPlayers(new Map([[home.id, [player]], [away.id, awaySquad]]), m), player)
    }
    expect(player.condition.recentRatings).toEqual([7.5, 9, 5, 6, 8])
    expect(player.condition.form).toBeCloseTo((7.5 + 9 + 5 + 6 + 8) / 5, 10)
  })

  it('nota de quem jogou poucos minutos não entra na forma', () => {
    const m = fakeMatch({ results: [{ playerId: starter.id, minutesPlayed: 10, rating: 9.5 }] })
    const p = find(applyMatchToPlayers(squads, m), starter)
    expect(p.condition.recentRatings).toEqual([])
    expect(p.condition.form).toBe(0)
  })

  it('moral: vitória sobe, derrota desce, para todo o elenco; boa nota sobe mais', () => {
    const win = applyMatchToPlayers(squads, fakeMatch({ homeGoals: 2, awayGoals: 0 }))
    const loss = applyMatchToPlayers(squads, fakeMatch({ homeGoals: 0, awayGoals: 2 }))
    expect(find(win, benchwarmer).condition.morale).toBeGreaterThan(70)
    expect(find(loss, benchwarmer).condition.morale).toBeLessThan(70)
    expect(find(win, awaySquad[0] as Player).condition.morale).toBeLessThan(70) // o rival perdeu
    const great = fakeMatch({ homeGoals: 1, awayGoals: 1, results: [{ playerId: starter.id, rating: 9 }] })
    const bad = fakeMatch({ homeGoals: 1, awayGoals: 1, results: [{ playerId: starter.id, rating: 4 }] })
    expect(find(applyMatchToPlayers(squads, great), starter).condition.morale).toBeGreaterThan(
      find(applyMatchToPlayers(squads, bad), starter).condition.morale,
    )
  })

  it('moral fica entre 0 e 100', () => {
    const squad = homeSquad.map((p) => withCondition(p, { morale: 99 }))
    const win = applyMatchToPlayers(new Map([[home.id, squad], [away.id, awaySquad]]), fakeMatch({ homeGoals: 3, awayGoals: 0, results: [{ playerId: starter.id, rating: 10 }] }))
    expect(Math.max(...win.map((p) => p.condition.morale))).toBe(100)
    const low = homeSquad.map((p) => withCondition(p, { morale: 1 }))
    const lost = applyMatchToPlayers(new Map([[home.id, low], [away.id, awaySquad]]), fakeMatch({ homeGoals: 0, awayGoals: 3, results: [{ playerId: starter.id, rating: 1 }] }))
    expect(Math.min(...lost.map((p) => p.condition.morale))).toBe(0)
  })

  it('gols e assistências entram nas estatísticas da temporada', () => {
    const scorer = homeSquad[18] as Player
    const assist = homeSquad[19] as Player
    const m = fakeMatch({ homeGoals: 2, events: [{ type: 'goal', playerId: scorer.id, relatedPlayerId: assist.id }, { type: 'goal', playerId: scorer.id }], results: [{ playerId: scorer.id }, { playerId: assist.id }] })
    const updated = applyMatchToPlayers(squads, m)
    expect(find(updated, scorer).seasonStats.goals).toBe(2)
    expect(find(updated, assist).seasonStats.assists).toBe(1)
  })

  it('não altera os jogadores recebidos', () => {
    const before = JSON.stringify(starter)
    applyMatchToPlayers(squads, fakeMatch({ homeGoals: 1, results: [{ playerId: starter.id, finalFitness: 50, rating: 8 }] }))
    expect(JSON.stringify(starter)).toBe(before)
  })
})

describe('rodízio da IA com o elenco cansado', () => {
  const xiIds = home.tactic.startingXI
  const tiredSquad = (fitness: number, count = 11) =>
    homeSquad.map((p) => (xiIds.slice(0, count).includes(p.id) ? withCondition(p, { fitness }) : p))
  const rotated = (squad: Player[]) => aiTactic(home, squad).startingXI.filter((id) => !xiIds.includes(id)).length

  it('elenco descansado: mesma escalação do time', () => {
    expect(aiTactic(home, homeSquad).startingXI).toEqual(home.tactic.startingXI)
    expect(rotated(tiredSquad(100))).toBe(0)
  })

  it('titulares muito cansados saem para quem está descansado', () => {
    expect(rotated(tiredSquad(35))).toBeGreaterThanOrEqual(3)
  })

  it('quanto mais cansados, mais trocas; levemente cansados continuam jogando', () => {
    expect(rotated(tiredSquad(35))).toBeGreaterThanOrEqual(rotated(tiredSquad(60)))
    expect(rotated(tiredSquad(60))).toBeGreaterThanOrEqual(rotated(tiredSquad(90)))
    expect(rotated(tiredSquad(97))).toBe(0)
  })

  it('o fator de descanso só cai com o cansaço, e fica entre 0 e 1', () => {
    expect(restedFactor(100)).toBe(1)
    expect(restedFactor(70)).toBeLessThan(restedFactor(90))
    expect(restedFactor(0)).toBeGreaterThan(0)
  })

  it('só roda quando pedido: sem `rested` a condição física é ignorada', () => {
    const squad = tiredSquad(30)
    const plain = buildTactic(squad, { formationId: home.tactic.formationId, style: home.tactic.style, mentality: home.tactic.mentality })
    expect(plain.startingXI).toEqual(home.tactic.startingXI)
  })
})

describe('condição ao longo dos dias de jogos', () => {
  const start = createSeason({ year: 2026, seed: 'cond', teams: world.teams, players: world.players })

  it('depois de jogar o time fica cansado; quem não jogou continua inteiro', () => {
    const step = advanceToNextEvent(start)
    const playedIds = new Set(step.played.flatMap((m) => (m.result?.playerResults ?? []).filter((r) => r.minutesPlayed >= 60).map((r) => r.playerId)))
    expect(playedIds.size).toBeGreaterThan(100)
    for (const p of step.state.players) {
      if (playedIds.has(p.id)) expect(p.condition.fitness).toBeLessThan(100)
      else if (step.played.some((m) => m.result?.playerResults.some((r) => r.playerId === p.id))) continue
      else if (!step.played.some((m) => m.homeTeamId === p.teamId || m.awayTeamId === p.teamId)) expect(p.condition.fitness).toBe(100)
    }
  })

  it('forma e moral passam a se mexer depois da primeira rodada', () => {
    const step = advanceToNextEvent(start)
    expect(step.state.players.some((p) => p.condition.form > 0)).toBe(true)
    expect(new Set(step.state.players.map((p) => Math.round(p.condition.morale))).size).toBeGreaterThan(2)
  })

  it('o estado de entrada nunca é alterado', () => {
    advanceToNextEvent(start)
    expect(start.players.every((p) => p.condition.fitness === 100 && p.condition.form === 0 && p.seasonStats.appearances === 0)).toBe(true)
  })

  it('jogador suspenso desfalca o time no jogo seguinte e volta depois', () => {
    // Suspende um titular do primeiro time a jogar e confere os dois jogos seguintes dele.
    const first = nextEvent(start)
    if (first.type !== 'matchday') throw new Error('sem jogos')
    const firstMatch = start.matches.find((m) => m.date === first.date) as Match
    const team = start.teams.find((t) => t.id === firstMatch.homeTeamId) as Team
    const star = team.tactic.startingXI[9] as string
    const suspended: typeof start = { ...start, players: start.players.map((p) => (p.id === star ? withCondition(p, { suspensionGames: 1 }) : p)) }

    const step1 = advanceToNextEvent(suspended)
    const played1 = step1.played.find((m) => m.id === firstMatch.id)?.result?.playerResults.map((r) => r.playerId) ?? []
    expect(played1).not.toContain(star)
    expect(step1.state.players.find((p) => p.id === star)?.condition.suspensionGames).toBe(0)

    let state = step1.state
    let playedAgain = false
    for (let i = 0; i < 12 && !playedAgain; i++) {
      const step = advanceToNextEvent(state)
      state = step.state
      for (const m of step.played) {
        if (m.result?.playerResults.some((r) => r.playerId === star && r.minutesPlayed > 0)) playedAgain = true
      }
    }
    expect(playedAgain).toBe(true)
  })
})
