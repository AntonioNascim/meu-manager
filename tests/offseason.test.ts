import { beforeAll, describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { createYouth } from '../src/data/generateYouth'
import { advanceSeason, evolvePlayer, positionDeficits, yearlyGain } from '../src/engine/offseason'
import { playerOverall } from '../src/engine/overall'
import { createRng } from '../src/engine/rng'
import { createSeason, simulateToSeasonEnd } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { SQUAD_MAX, SQUAD_MIN } from '../src/engine/types'
import type { OffseasonReport } from '../src/engine/types'

const world = generateWorld({ seed: 21 })
let ended: SeasonState
let next: SeasonState
let report: OffseasonReport
const userTeamId = world.teams.find((t) => t.abbreviation === 'IMP')!.id

beforeAll(() => {
  ended = simulateToSeasonEnd(createSeason({ year: 2026, seed: 21, teams: world.teams, players: world.players }), { market: true })
  const result = advanceSeason(ended, { createYouth, userTeamId })
  next = result.state
  report = result.report
}, 120_000)

describe('virada de temporada', () => {
  it('só roda com a temporada encerrada', () => {
    const fresh = createSeason({ year: 2026, seed: 21, teams: world.teams, players: world.players })
    expect(() => advanceSeason(fresh, { createYouth })).toThrow()
  })

  it('troca 4 times entre as séries e as duas continuam com 20', () => {
    expect(report.promoted).toHaveLength(4)
    expect(report.relegated).toHaveLength(4)
    for (const id of report.promoted) expect(next.teams.find((t) => t.id === id)!.tier).toBe(1)
    for (const id of report.relegated) expect(next.teams.find((t) => t.id === id)!.tier).toBe(2)
    expect(next.teams.filter((t) => t.tier === 1)).toHaveLength(20)
    expect(next.teams.filter((t) => t.tier === 2)).toHaveLength(20)
  })

  it('registra campeões e posições no histórico dos times', () => {
    expect(report.champions).toHaveLength(2)
    for (const t of next.teams) {
      const record = t.history[t.history.length - 1]!
      expect(record.year).toBe(2026)
      expect(record.finalPosition).toBe(report.finalPositions[t.id]!.position)
      expect(record.champion).toBe(report.champions.includes(t.id))
    }
    expect(next.teams.filter((t) => t.history.some((h) => h.champion))).toHaveLength(2)
  })

  it('cria a temporada seguinte: ano, fase, 380 jogos por série e calendário novo', () => {
    expect(next.season.year).toBe(2027)
    expect(next.season.phase).toBe('pre-season')
    expect(next.matches.filter((m) => m.competitionId === 'serie-a')).toHaveLength(380)
    expect(next.matches.filter((m) => m.competitionId === 'serie-b')).toHaveLength(380)
    expect(next.matches.every((m) => m.status === 'scheduled' && m.date.startsWith('2027'))).toBe(true)
    const serieA = next.season.competitions.find((c) => c.id === 'serie-a')!
    expect([...serieA.teamIds].sort()).toEqual(next.teams.filter((t) => t.tier === 1).map((t) => t.id).sort())
  })

  it('mantém elencos válidos, ids únicos e táticas consistentes', () => {
    expect(new Set(next.players.map((p) => p.id)).size).toBe(next.players.length)
    for (const t of next.teams) {
      const squad = next.players.filter((p) => p.teamId === t.id)
      expect(squad.length).toBeGreaterThanOrEqual(SQUAD_MIN)
      expect(squad.length).toBeLessThanOrEqual(SQUAD_MAX)
      expect([...t.squad].sort()).toEqual(squad.map((p) => p.id).sort())
      expect(positionDeficits(squad)).toEqual([])
      for (const id of t.tactic.startingXI) expect(squad.some((p) => p.id === id)).toBe(true)
      expect(new Set(t.tactic.startingXI).size).toBe(11)
    }
    expect(Object.values(report.youth).every((n) => n >= 1)).toBe(true)
  })

  it('envelhece todos, zera estatísticas e condição, e aposenta só veteranos', () => {
    const before = new Map(ended.players.map((p) => [p.id, p]))
    for (const p of next.players.filter((x) => before.has(x.id))) {
      expect(p.age).toBe(before.get(p.id)!.age + 1)
      expect(p.seasonStats.appearances).toBe(0)
      expect(p.condition.fitness).toBe(100)
    }
    expect(report.retired.length).toBeGreaterThan(0)
    expect(report.retired.every((r) => r.age >= 34)).toBe(true)
    expect(next.players.every((p) => p.age < 40)).toBe(true)
  })

  it('contratos vencidos viram jogador livre, a IA renova outros e ninguém fica com contrato vencido', () => {
    expect(report.renewed).toBeGreaterThan(0)
    expect(report.released.length).toBeGreaterThan(0)
    for (const r of report.released) {
      const p = next.players.find((x) => x.id === r.playerId)
      if (p && p.teamId === r.teamId) throw new Error('jogador com contrato vencido continuou no clube')
    }
    expect(next.players.filter((p) => p.teamId && p.contract.endDate < '2027-01-01')).toHaveLength(0)
  })

  it('refaz a meta da diretoria e fecha as finanças do ano', () => {
    for (const t of next.teams) {
      expect(t.objective.targetPosition).toBeGreaterThanOrEqual(1)
      expect(t.objective.targetPosition).toBeLessThanOrEqual(16)
      expect(t.finances.ledger).toHaveLength(0)
      expect(t.finances.pastSeasons[t.finances.pastSeasons.length - 1]!.year).toBe(2026)
    }
    const champ = report.reputationChanges[report.champions[0]!]!
    // O campeão sobe de reputação, a menos que já esteja bem acima do patamar da divisão (a reputação volta devagar para ele, até 2 pontos).
    expect(champ.to).toBeGreaterThanOrEqual(champ.from - 2)
  })

  it('é determinística', () => {
    const again = advanceSeason(ended, { createYouth, userTeamId }).state
    expect(again.players.map((p) => p.id)).toEqual(next.players.map((p) => p.id))
    expect(again.players.map((p) => playerOverall(p))).toEqual(next.players.map((p) => playerOverall(p)))
  })
})

describe('evolução do jogador', () => {
  const sample = (age: number, potentialBonus: number) => {
    const p = { ...world.players.find((x) => x.position === 'CM')!, age }
    return { ...p, hidden: { ...p.hidden, potential: Math.round(playerOverall(p)) + potentialBonus } }
  }
  const mean = (age: number, bonus: number, n = 300) => {
    const rng = createRng(`evo:${age}:${bonus}`)
    const p = sample(age, bonus)
    let total = 0
    for (let i = 0; i < n; i++) total += playerOverall(evolvePlayer(rng, p, 1)) - playerOverall(p)
    return total / n
  }

  it('jovem com potencial alto cresce mais do que o de potencial baixo; depois dos 26 não há bônus', () => {
    expect(mean(18, 25)).toBeGreaterThan(mean(18, 5) + 1)
    expect(mean(18, 25)).toBeGreaterThan(1)
    expect(yearlyGain(26, 60, 90)).toBe(0)
  })

  it('o potencial nunca fica abaixo da força atual', () => {
    const rng = createRng('cap')
    const p = sample(19, 3)
    for (let i = 0; i < 50; i++) {
      const next = evolvePlayer(rng, p, 1)
      expect(next.hidden.potential).toBeGreaterThanOrEqual(Math.round(playerOverall(next)))
    }
  })

  it('veterano perde velocidade; quem joga mais evolui mais', () => {
    const rng = createRng('old')
    const p = sample(33, 0)
    expect(evolvePlayer(rng, p, 1).attributes.pace).toBeLessThan(p.attributes.pace)
    const young = sample(19, 20)
    let played = 0
    let benched = 0
    for (let i = 0; i < 200; i++) {
      played += playerOverall(evolvePlayer(createRng(`m:${i}`), young, 1))
      benched += playerOverall(evolvePlayer(createRng(`m:${i}`), young, 0))
    }
    expect(played).toBeGreaterThan(benched)
  })
})

describe('virada de temporada no jogo', () => {
  it('uma temporada inteira jogada pelo store vira o ano, guarda o resumo e some o relatório ao avançar', async () => {
    const { advanceToMatchday, createGame, playPendingAuto, startNextSeason, nextEventOf } = await import('../src/store/game')
    let g = createGame(8, world.teams.find((t) => t.abbreviation === 'IMP')!.id)
    g = { ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === g.userTeamId ? { ...t, objective: { targetPosition: 20, sackingPosition: 20 } } : t)) } }
    expect(startNextSeason(g)).toBe(g)
    for (let i = 0; i < 400 && nextEventOf(g).type !== 'season-end'; i++) g = playPendingAuto(advanceToMatchday(g))
    g = advanceToMatchday(g)
    expect(g.season.season.phase).toBe('end-of-season')
    const turned = startNextSeason(g)
    expect(turned.season.season.year).toBe(2027)
    expect(turned.seasonLog).toHaveLength(1)
    expect(turned.lastReport?.year).toBe(2026)
    expect(turned.dismissal).toBeUndefined()
    const moved = advanceToMatchday(turned)
    expect(moved.lastReport).toBeUndefined()
  }, 200_000)
})

describe('potencial, craques e divisões', () => {
  const cm = world.players.filter((x) => x.position === 'CM').sort((a, b) => playerOverall(a) - playerOverall(b))[0]!
  const cohort = (age: number, gap: number, share: number, years: number, start = cm) => {
    const rng = createRng(`cohort:${age}:${gap}:${share}`)
    const base = { ...start, age }
    const overall = playerOverall(base)
    const finals: number[] = []
    for (let i = 0; i < 80; i++) {
      let p = { ...base, hidden: { ...base.hidden, potential: Math.round(overall) + gap } }
      for (let y = 0; y < years; y++) p = evolvePlayer(rng, p, share)
      finals.push(playerOverall(p))
    }
    return { overall, mean: finals.reduce((a, b) => a + b, 0) / finals.length }
  }

  const prospect = world.players.filter((x) => x.position === 'CM').sort((a, b) => Math.abs(playerOverall(a) - 55) - Math.abs(playerOverall(b) - 55))[0]!

  it('jovem de potencial alto que joga regularmente chega perto do potencial; sem jogar, chega menos', () => {
    const gap = 96 - Math.round(playerOverall(prospect))
    const plays = cohort(18, gap, 1, 8, prospect)
    expect(plays.mean).toBeGreaterThan(96 - 7)
    // No caminho (5 anos) quem joga está à frente de quem fica no banco.
    expect(cohort(18, gap, 1, 5, prospect).mean).toBeGreaterThan(cohort(18, gap, 0, 5, prospect).mean + 1)
  })

  it('jogador de potencial médio não infla: continua perto do que seria (sem bônus de potencial)', () => {
    // 19 anos com o potencial médio da idade (12 + 2 × 3): ganha só a curva de juventude, sem bônus.
    const average = cohort(19, 12 + 2 * 3, 0.8, 7)
    expect(average.mean - average.overall).toBeLessThan(10)
    expect(average.mean - average.overall).toBeGreaterThan(4)
  })

  it('a reputação volta para o patamar da divisão', () => {
    const skewed = {
      ...ended,
      teams: ended.teams.map((t) => ({ ...t, reputation: t.tier === 1 ? 18 : 1 })),
    }
    const { state } = advanceSeason(skewed, { createYouth })
    const tierMean = (tier: number) => {
      const teams = state.teams.filter((t) => t.tier === tier)
      return teams.reduce((s, t) => s + t.reputation, 0) / teams.length
    }
    // Promovidos e rebaixados mudam de série, mas a média da A cai do 18 e a da B sobe do 1.
    expect(tierMean(1)).toBeLessThan(17.5)
    expect(tierMean(2)).toBeGreaterThan(1.5)
  })
})
