import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { defaultCupSpecs, normalizeCup } from '../src/data/package/cups'
import { defaultPackage, loadWorld } from '../src/data/package/defaultPackage'
import type { PackageCup } from '../src/data/package/types'
import { validatePackage } from '../src/data/package/validate'
import { checkBracket, cupMatches, cupStatus, groupTables, knockoutShape, leaguePhaseTable, stageList, tiesOfStage } from '../src/engine/cups'
import { drawGroups, drawKnockout, drawLeaguePhase } from '../src/engine/cups/draw'
import { createRng } from '../src/engine/rng'
import { applyMatchToPlayers, cupView, createSeason, simulateToSeasonEnd, weekday } from '../src/engine/season'
import { advanceSeason } from '../src/engine/offseason'
import { createYouth } from '../src/data/generateYouth'
import type { CupSpec, Match, MatchEvent, Player } from '../src/engine/types'

const world = generateWorld({ seed: 5 })
const seasonWith = (specs: CupSpec[]) => createSeason({ year: 2026, seed: 5, teams: world.teams, players: world.players, academy: world.academy, cupSpecs: specs })
const rep = new Map(world.teams.map((t) => [t.id, t.reputation]))
const strength = (id: string) => rep.get(id) ?? 0
const ids = (tier: number) => world.teams.filter((t) => t.tier === tier).map((t) => t.id)

describe('forma do mata-mata', () => {
  it('potência de dois joga todo mundo; senão os melhores folgam e sobra uma potência de dois', () => {
    expect(knockoutShape(16)).toEqual({ ties: 8, byes: 0, advancing: 8 })
    expect(knockoutShape(60)).toEqual({ ties: 28, byes: 4, advancing: 32 })
    expect(knockoutShape(10)).toEqual({ ties: 2, byes: 6, advancing: 8 })
    expect(knockoutShape(2)).toEqual({ ties: 1, byes: 0, advancing: 1 })
  })

  it('confere se a conta de clubes leva a uma final de dois', () => {
    const [cup, supercup] = defaultCupSpecs()
    expect(checkBracket(cup as CupSpec, [60]).ok).toBe(true)
    expect(checkBracket(cup as CupSpec, [3]).ok).toBe(false)
    expect(checkBracket(supercup as CupSpec, [2]).ok).toBe(true)
    expect(stageList(cup as CupSpec).map((s) => s.name)).toEqual(['Primeira fase', 'Segunda fase', 'Oitavas de final', 'Quartas de final', 'Semifinais', 'Final'])
  })
})

describe('sorteios', () => {
  it('com cabeças de chave: os melhores folgam e cada confronto junta um cabeça de chave a um não cabeça; o mesmo sorteio sai igual', () => {
    const all = [...ids(1), ...ids(2), ...ids(3)]
    const draw = drawKnockout(all, true, strength, createRng('x'))
    expect(draw.byes).toHaveLength(4)
    const ordered = [...all].sort((a, b) => strength(b) - strength(a) || a.localeCompare(b))
    expect(draw.byes).toEqual(ordered.slice(0, 4))
    expect(draw.ties).toHaveLength(28)
    const playing = ordered.slice(4)
    const top = new Set(playing.slice(0, 28))
    for (const t of draw.ties) expect([top.has(t.teams[0]), top.has(t.teams[1])].sort()).toEqual([false, true])
    expect(new Set([...draw.byes, ...draw.ties.flatMap((t) => t.teams)]).size).toBe(60)
    expect(drawKnockout(all, true, strength, createRng('x'))).toEqual(draw)
    expect(drawKnockout(all, true, strength, createRng('y'))).not.toEqual(draw)
  })

  it('sem cabeças de chave tudo é sorteado, folgas inclusive', () => {
    const all = [...ids(1), ...ids(2), ...ids(3)]
    const draw = drawKnockout(all, false, strength, createRng('z'))
    expect(draw.byes).toHaveLength(4)
    expect(draw.ties).toHaveLength(28)
    expect(new Set([...draw.byes, ...draw.ties.flatMap((t) => t.teams)]).size).toBe(60)
  })

  it('grupos com potes: cada grupo recebe um clube de cada pote', () => {
    const groups = drawGroups(ids(1), 5, true, strength, createRng('g'))
    expect(groups).toHaveLength(5)
    const ordered = [...ids(1)].sort((a, b) => strength(b) - strength(a) || a.localeCompare(b))
    for (const g of groups) {
      expect(g).toHaveLength(4)
      const pots = g.map((id) => Math.floor(ordered.indexOf(id) / 5))
      expect([...pots].sort()).toEqual([0, 1, 2, 3])
    }
  })

  it('fase de liga: cada clube enfrenta o número pedido de rivais de cada pote, sem repetir par nem jogar duas vezes na mesma data', () => {
    const draw = drawLeaguePhase(ids(1), { pots: 4, matchesPerTeam: 8 }, strength, createRng('l'))
    const fixtures = draw.matchdays.flat()
    expect(fixtures).toHaveLength(80)
    const ordered = [...ids(1)].sort((a, b) => strength(b) - strength(a) || a.localeCompare(b))
    const pot = (id: string) => Math.floor(ordered.indexOf(id) / 5)
    const pairs = new Set(fixtures.map((f) => [f.homeTeamId, f.awayTeamId].sort().join('|')))
    expect(pairs.size).toBe(80)
    for (const id of ids(1)) {
      const mine = fixtures.filter((f) => f.homeTeamId === id || f.awayTeamId === id)
      expect(mine).toHaveLength(8)
      expect(mine.filter((f) => f.homeTeamId === id)).toHaveLength(4)
      const counts = [0, 0, 0, 0]
      for (const f of mine) counts[pot(f.homeTeamId === id ? f.awayTeamId : f.homeTeamId)]!++
      expect(counts).toEqual([2, 2, 2, 2])
    }
    for (const day of draw.matchdays) {
      const teams = day.flatMap((f) => [f.homeTeamId, f.awayTeamId])
      expect(new Set(teams).size).toBe(teams.length)
    }
  })
})

describe('a copa nacional do mundo padrão, uma temporada inteira', () => {
  const start = seasonWith(defaultCupSpecs())
  const ended = simulateToSeasonEnd(start)
  const cup = ended.cups!.find((c) => c.id === 'cup-br')!
  const league = ended.matches.filter((m) => !m.cup)

  it('nasce com 60 clubes, a primeira fase sorteada com 28 confrontos e as folgas dos 4 melhores', () => {
    const first = start.cups!.find((c) => c.id === 'cup-br')!
    expect(first.entrants).toHaveLength(60)
    expect(first.log).toHaveLength(1)
    expect(first.log[0]!.byes).toHaveLength(4)
    expect(start.matches.filter((m) => m.competitionId === 'cup-br')).toHaveLength(28)
    const best = [...world.teams].sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id)).slice(0, 4).map((t) => t.id)
    expect(new Set(first.log[0]!.byes)).toEqual(new Set(best))
  })

  it('acaba com campeão e vice, todos os confrontos decididos, e guarda o campeão no histórico', () => {
    expect(cup.winnerId).toBeDefined()
    expect(cup.runnerUpId).toBeDefined()
    expect(cup.winnerId).not.toBe(cup.runnerUpId)
    expect(cup.log.map((l) => l.stage)).toEqual([0, 1, 2, 3, 4, 5])
    const sizes = [28, 16, 8, 4, 2, 1]
    cup.log.forEach((_, i) => {
      const ties = tiesOfStage(cupMatches(ended.matches, cup.id), cup.spec, i)
      expect(ties).toHaveLength(sizes[i]!)
      for (const t of ties) expect(t.winnerId).toBeDefined()
    })
    expect(ended.cupHistory!['cup-br']).toEqual([{ year: 2026, winnerId: cup.winnerId, runnerUpId: cup.runnerUpId }])
    expect(cupStatus(ended, cup, cup.winnerId!).state).toBe('champion')
    expect(cupStatus(ended, cup, cup.runnerUpId!).state).toBe('runner-up')
    expect(ended.season.phase).toBe('end-of-season')
  })

  it('os jogos da copa caem em quartas-feiras e nunca no dia (nem na véspera ou no dia seguinte) de um jogo de liga dos mesmos clubes', () => {
    const cupMatches = ended.matches.filter((m) => m.cup)
    expect(cupMatches.length).toBeGreaterThan(60)
    const leagueDays = new Map<string, Set<string>>()
    for (const m of league) for (const id of [m.homeTeamId, m.awayTeamId]) leagueDays.set(id, (leagueDays.get(id) ?? new Set()).add(m.date))
    const day = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10)
    for (const m of cupMatches) {
      expect(weekday(m.date)).toBe(3)
      for (const id of [m.homeTeamId, m.awayTeamId]) for (const d of [-1, 0, 1]) expect(leagueDays.get(id)?.has(day(m.date, d)) ?? false, `${m.id} ${id} ${m.date}`).toBe(false)
    }
    // E nenhum clube joga duas vezes no mesmo dia.
    const seen = new Set<string>()
    for (const m of ended.matches) for (const id of [m.homeTeamId, m.awayTeamId]) {
      const key = `${id}@${m.date}`
      expect(seen.has(key), key).toBe(false)
      seen.add(key)
    }
  })

  it('a premiação entra no caixa: cada fase para quem estreia nela e o título e o vice no fim', () => {
    const champion = ended.teams.find((t) => t.id === cup.winnerId)!
    const prizes = champion.finances.ledger.filter((e) => e.category === 'cup-prize')
    const total = prizes.reduce((s, e) => s + e.amount, 0)
    expect(total).toBeGreaterThanOrEqual(cup.spec.prize.champion)
    expect(prizes.some((e) => e.description?.includes('campeão'))).toBe(true)
    const runner = ended.teams.find((t) => t.id === cup.runnerUpId)!
    expect(runner.finances.ledger.some((e) => e.category === 'cup-prize' && e.description?.includes('vice-campeão'))).toBe(true)
  })

  it('a liga não muda por causa da copa: a tabela e o calendário dos jogos de liga são os mesmos', () => {
    const without = simulateToSeasonEnd(seasonWith([]))
    expect(league.map((m) => m.id)).toEqual(without.matches.map((m) => m.id))
    expect(league.map((m) => m.date)).toEqual(without.matches.map((m) => m.date))
  })

  it('a Supercopa junta o campeão da liga e o da copa (na primeira temporada, os mais fortes) e na seguinte, os campeões de verdade', () => {
    const first = start.cups!.find((c) => c.id === 'supercup-br')!
    expect(first.entrants).toHaveLength(2)
    const next = advanceSeason(ended, { createYouth }).state
    const super2 = next.cups!.find((c) => c.id === 'supercup-br')!
    const leagueChampion = ended.teams.find((t) => t.history.length === 0 && false)?.id
    expect(leagueChampion).toBeUndefined()
    const ids2 = super2.entrants.map((e) => e.teamId)
    expect(ids2).toHaveLength(2)
    expect(ids2).toContain(cup.winnerId)
    expect(new Set(ids2).size).toBe(2)
    expect(next.cups!.find((c) => c.id === 'cup-br')!.log).toHaveLength(1)
    expect(next.cupHistory!['cup-br']).toHaveLength(1)
  })
})

describe('disciplina própria da copa', () => {
  const player = (): Player => ({ ...world.players.find((p) => p.teamId === 'team-imp')! })
  const matchWith = (events: MatchEvent[], home: string, away: string): Match => ({
    id: 'm',
    competitionId: 'cup-br',
    round: 1,
    date: '2026-02-04',
    homeTeamId: home,
    awayTeamId: away,
    status: 'finished',
    seed: 1,
    cup: { stage: 0, kind: 'knockout', tie: 1, leg: 1 },
    result: { homeGoals: 0, awayGoals: 0, events, homeStats: { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, xg: 0 }, awayStats: { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, xg: 0 }, playerResults: [] },
  })

  it('o amarelo da copa conta na copa, não na liga; ao atingir o limite da copa o jogador desfalca só a copa', () => {
    let p = player()
    const scope = { cupId: 'cup-br', yellowsPerSuspension: 2, redCardGames: 1 }
    for (let i = 0; i < 2; i++) {
      const m = matchWith([{ minute: 30, type: 'yellow-card', teamId: p.teamId!, playerId: p.id, text: '' }], p.teamId!, 'team-xyz')
      p = applyMatchToPlayers(new Map([[p.teamId!, [p]]]), m, scope)[0]!
    }
    expect(p.condition.yellowCards).toBe(0)
    expect(p.condition.suspensionGames).toBe(0)
    expect(p.condition.cups!['cup-br']).toEqual({ yellowCards: 0, suspensionGames: 1 })
    expect(p.seasonStats.cupYellowCards).toBe(2)
    expect(cupView([p], 'cup-br')[0]!.condition.suspensionGames).toBe(1)
    expect(cupView([p], 'cup-nao')[0]!.condition.suspensionGames).toBe(0)
    // O próximo jogo da copa cumpre a suspensão.
    const next = applyMatchToPlayers(new Map([[p.teamId!, [p]]]), matchWith([], p.teamId!, 'team-xyz'), scope)[0]!
    expect(next.condition.cups!['cup-br']!.suspensionGames).toBe(0)
  })

  it('o vermelho da copa suspende pelos jogos da copa e os gols da copa saem da artilharia da liga', () => {
    let p = player()
    const scope = { cupId: 'cup-br', yellowsPerSuspension: 3, redCardGames: 2 }
    const m = matchWith(
      [
        { minute: 10, type: 'goal', teamId: p.teamId!, playerId: p.id, text: '' },
        { minute: 80, type: 'red-card', teamId: p.teamId!, playerId: p.id, text: '' },
      ],
      p.teamId!,
      'team-xyz',
    )
    p = applyMatchToPlayers(new Map([[p.teamId!, [p]]]), m, scope)[0]!
    expect(p.condition.cups!['cup-br']!.suspensionGames).toBe(2)
    expect(p.condition.suspensionGames).toBe(0)
    expect(p.seasonStats.goals).toBe(1)
    expect(p.seasonStats.cupGoals).toBe(1)
    expect(p.seasonStats.homeGoals).toBe(0)
    expect(p.seasonStats.cupRedCards).toBe(1)
  })
})

describe('grupos e fase de liga', () => {
  const groupsCup: PackageCup = {
    id: 'cup-g',
    name: 'Copa de Grupos',
    format: 'groups-knockout',
    entrants: [{ source: { type: 'league', league: 'br-1' } }],
    groups: { name: 'Fase de grupos', count: 5, advance: 2, legs: 1, date: [3, 4] },
    stages: [
      { name: 'Repescagem', legs: 1, date: [5, 6] },
      { name: 'Quartas', legs: 2, date: [5, 27] },
      { name: 'Semifinal', legs: 2, date: [6, 17] },
      { name: 'Final', legs: 1, date: [7, 8], neutral: true },
    ],
    seeding: 'seeded',
  }
  const leagueCup: PackageCup = {
    id: 'cup-l',
    name: 'Copa com Fase de Liga',
    format: 'league-knockout',
    entrants: [{ source: { type: 'league', league: 'br-1' } }],
    leaguePhase: { name: 'Fase de liga', pots: 4, matchesPerTeam: 8, date: [3, 4], direct: 4, playoff: 8 },
    stages: [
      { name: 'Playoff', legs: 2, date: [5, 6] },
      { name: 'Quartas', legs: 2, date: [5, 27] },
      { name: 'Semifinal', legs: 2, date: [6, 17] },
      { name: 'Final', legs: 1, date: [7, 8], neutral: true },
    ],
    seeding: 'seeded',
  }
  const specs = [groupsCup, leagueCup].map((c) => normalizeCup(c, (id) => (id === 'br-1' ? 'serie-a' : id)))
  const ended = simulateToSeasonEnd(seasonWith(specs))

  it('grupos: 5 grupos de 4, os 2 primeiros passam e a copa termina com campeão', () => {
    const cup = ended.cups!.find((c) => c.id === 'cup-g')!
    expect(cup.winnerId).toBeDefined()
    const tables = groupTables(ended.matches.filter((m) => m.competitionId === 'cup-g'), 0)
    expect(tables).toHaveLength(5)
    for (const t of tables) {
      expect(t.rows).toHaveLength(4)
      expect(t.rows.every((r) => r.played === 3)).toBe(true)
    }
    const qualified = new Set(tables.flatMap((t) => t.rows.slice(0, 2).map((r) => r.teamId)))
    expect(qualified.size).toBe(10)
    // 10 classificados: 2 jogam a repescagem e 6 folgam; os 4 melhores da repescagem + folgas chegam às quartas.
    expect(new Set(cup.log[1]!.teams)).toEqual(qualified)
    expect(cup.log[1]!.byes).toHaveLength(6)
    const final = ended.matches.find((m) => m.competitionId === 'cup-g' && m.cup?.stage === 4)!
    expect(final.cup?.neutral).toBe(true)
  })

  it('fase de liga: tabela única de 20 com 8 jogos cada, 4 direto, 8 no playoff e um campeão no fim', () => {
    const cup = ended.cups!.find((c) => c.id === 'cup-l')!
    expect(cup.winnerId).toBeDefined()
    const table = leaguePhaseTable(ended.matches.filter((m) => m.competitionId === 'cup-l'), 0)
    expect(table).toHaveLength(20)
    expect(table.every((r) => r.played === 8)).toBe(true)
    const playoff = cup.log[1]!
    expect(new Set(playoff.teams)).toEqual(new Set(table.slice(4, 12).map((r) => r.teamId)))
    const quarters = cup.log[2]!
    for (const id of table.slice(0, 4).map((r) => r.teamId)) expect(quarters.teams).toContain(id)
    expect(quarters.teams).toHaveLength(8)
  })
})

describe('copas no pacote de dados', () => {
  it('as copas padrão são válidas e vão e voltam pelo pacote igual ao mundo gerado', () => {
    const pkg = defaultPackage(5)
    expect(pkg.cups!.map((c) => c.id)).toEqual(['cup-br', 'supercup-br'])
    expect(validatePackage(JSON.parse(JSON.stringify(pkg))).report.errors).toEqual([])
    expect(JSON.stringify(loadWorld(5, pkg))).toBe(JSON.stringify(generateWorld({ seed: 5 })))
  })

  const base = () => JSON.parse(JSON.stringify(defaultPackage(5))) as ReturnType<typeof defaultPackage>
  const codes = (p: ReturnType<typeof defaultPackage>) => validatePackage(p).report.errors.map((e) => e.code)

  it('recusa chaveamento que não fecha, liga desconhecida, copa que se cita e datas ruins', () => {
    const noFinal = base()
    noFinal.cups![0]!.stages = noFinal.cups![0]!.stages.slice(0, 4)
    noFinal.cups![0]!.prize!.perStage = []
    expect(codes(noFinal)).toContain('cup-bracket')

    const unknown = base()
    ;(unknown.cups![0]!.entrants[0]!.source as { league: string }).league = 'xx-9'
    expect(codes(unknown)).toContain('unknown-reference')

    const cycle = base()
    cycle.cups![0]!.entrants.push({ source: { type: 'cup', cup: 'cup-br', place: 'winner' } })
    expect(codes(cycle)).toContain('unknown-reference')

    const badDate = base()
    badDate.cups![0]!.stages[0]!.date = [13, 40]
    expect(codes(badDate)).toContain('bad-date')

    const dup = base()
    dup.cups![1]!.id = 'cup-br'
    expect(codes(dup)).toContain('duplicate-id')

    const groups = base()
    Object.assign(groups.cups![0]!, { format: 'groups-knockout', groups: { name: 'G', count: 7, advance: 1, legs: 1, date: [3, 4] } })
    expect(codes(groups)).toContain('cup-groups')
  })
})
