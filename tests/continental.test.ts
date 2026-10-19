import { beforeAll, describe, expect, it } from 'vitest'
import { createYouth } from '../src/data/generateYouth'
import { allocateSlots } from '../src/data/package/continentalCups'
import type { ContinentalLeague } from '../src/data/package/continentalCups'
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { cupMatches, groupTables, leaguePhaseTable, stageList, tiesOfStage } from '../src/engine/cups'
import { spreadInDays } from '../src/engine/cups/draw'
import { advanceSeason } from '../src/engine/offseason'
import { createRng } from '../src/engine/rng'
import { advanceUntil, createSeason, pyramidFinished } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import type { Cup, CupSpec } from '../src/engine/types'

const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(7))))
const world = loadWorld(7, pkg)
const specs = world.cups as CupSpec[]
const spec = (id: string) => specs.find((s) => s.id === id) as CupSpec

describe('copas continentais padrão no pacote', () => {
  it('há cinco: duas sul-americanas e três europeias, com nomes genéricos', () => {
    const continental = specs.filter((s) => s.country === undefined)
    expect(continental.map((s) => s.id)).toEqual(['cont-sa-1', 'cont-sa-2', 'cont-eu-1', 'cont-eu-2', 'cont-eu-3'])
    for (const s of continental) for (const official of ['Libertadores', 'Sul-Americana', 'Champions', 'Europa League', 'Conference']) expect(s.name).not.toContain(official)
  })

  it('o formato segue o pedido: preliminares, grupos e mata-mata na principal da América do Sul; fase de liga na Europa; final em jogo único', () => {
    const main = spec('cont-sa-1')
    expect(stageList(main).map((s) => `${s.kind}:${s.legs}`)).toEqual(['knockout:2', 'knockout:2', 'groups:2', 'knockout:2', 'knockout:2', 'knockout:1'])
    expect(main.stages.at(-1)?.neutral).toBe(true)
    expect(main.preliminary).toHaveLength(2)
    const second = spec('cont-sa-2')
    expect(second.groups?.direct).toBe(1)
    expect(second.entrants.some((e) => e.source.type === 'cup-group-place' && e.source.cup === 'cont-sa-1' && e.source.place === 3)).toBe(true)
    for (const id of ['cont-eu-1', 'cont-eu-2', 'cont-eu-3']) {
      const cup = spec(id)
      expect(cup.format).toBe('league-knockout')
      expect(cup.stages.at(-1)?.legs).toBe(1)
      expect(cup.stages.at(-1)?.neutral).toBe(true)
    }
    expect(spec('cont-eu-2').excludeCups).toEqual(['cont-eu-1'])
    expect(spec('cont-eu-3').excludeCups).toEqual(['cont-eu-1', 'cont-eu-2'])
  })

  it('o tamanho é proporcional: menos da metade dos clubes de primeira divisão da região', () => {
    const start = createSeason({ year: 2026, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: specs })
    const size = (id: string) => start.cups!.find((c) => c.id === id)!.entrants.length
    expect([size('cont-sa-1'), size('cont-sa-2')]).toEqual([20, 16])
    expect([size('cont-eu-1'), size('cont-eu-2'), size('cont-eu-3')]).toEqual([24, 16, 12])
    const firstDivision = (region: string) => world.competitions!.filter((c) => c.tier === 1 && c.region === region).reduce((n, c) => n + c.teams.length, 0)
    expect(size('cont-eu-1') + size('cont-eu-2') + size('cont-eu-3')).toBeLessThan(firstDivision('EU') * 0.55)
    expect(size('cont-sa-1') + size('cont-sa-2')).toBeLessThan(firstDivision('SA') * 0.45)
    // Nenhum clube está em duas copas da mesma região.
    for (const [a, b] of [['cont-sa-1', 'cont-sa-2'], ['cont-eu-1', 'cont-eu-2'], ['cont-eu-1', 'cont-eu-3'], ['cont-eu-2', 'cont-eu-3']]) {
      const first = new Set(start.cups!.find((c) => c.id === a)!.entrants.map((e) => e.teamId))
      expect(start.cups!.find((c) => c.id === b)!.entrants.filter((e) => first.has(e.teamId))).toEqual([])
    }
  })

  it('a conta das vagas: raiz da receita, com mínimo e teto, e não passa do teto', () => {
    const leagues: ContinentalLeague[] = [
      { id: 'a', country: 'England', region: 'EU', teams: 20, revenue: 5 },
      { id: 'b', country: 'Portugal', region: 'EU', teams: 18, revenue: 0.9 },
      { id: 'c', country: 'France', region: 'EU', teams: 18, revenue: 1.8 },
    ]
    const slots = allocateSlots(leagues, 12, 2, (l) => Math.floor(l.teams * 0.5))!
    expect([...slots.values()].reduce((a, b) => a + b, 0)).toBe(12)
    expect(slots.get('a')!).toBeGreaterThan(slots.get('c')!)
    expect(slots.get('c')!).toBeGreaterThan(slots.get('b')!)
    expect(allocateSlots(leagues, 40, 2, (l) => Math.floor(l.teams * 0.5))).toBeUndefined()
  })
})

describe('calendário das fases de liga', () => {
  it('as datas usam o menor número de rodadas e nenhum clube joga duas vezes na mesma data', () => {
    const ids = Array.from({ length: 24 }, (_, i) => `t${i}`)
    const rng = createRng('datas')
    const fixtures = ids.flatMap((id, i) => [1, 2, 3, 4].map((k) => ({ homeTeamId: id, awayTeamId: ids[(i + k) % 24] as string })))
    const days = spreadInDays(fixtures, 8, rng)
    expect(days.length).toBeLessThanOrEqual(9)
    for (const day of days) {
      const seen = new Set<string>()
      for (const f of day) {
        expect(seen.has(f.homeTeamId) || seen.has(f.awayTeamId)).toBe(false)
        seen.add(f.homeTeamId)
        seen.add(f.awayTeamId)
      }
    }
    expect(days.flat()).toHaveLength(fixtures.length)
  })
})

describe('uma temporada com as cinco copas (mundo de 282 clubes)', () => {
  let state: SeasonState
  let mid: SeasonState
  let afterEurope: SeasonState
  beforeAll(() => {
    const start = createSeason({ year: 2026, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: specs })
    const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
    state = advanceUntil(start, '2026-12-30', { turn }).state
    mid = advanceUntil(state, '2027-06-15', { turn }).state
    afterEurope = advanceUntil(mid, '2027-07-03', { turn }).state
  }, 600_000)

  const cup = (s: SeasonState, id: string): Cup => s.cups!.find((c) => c.id === id) as Cup

  it('a copa principal sul-americana: preliminares, 4 grupos de 4, mata-mata de 8 e final em jogo único e campo neutro', () => {
    const main = cup(state, 'cont-sa-1')
    expect(main.year).toBe(2026)
    expect(main.winnerId).toBeDefined()
    expect(main.log.map((l) => `${l.kind}:${l.teams.length}`)).toEqual(['knockout:4', 'knockout:4', 'groups:16', 'knockout:8', 'knockout:4', 'knockout:2'])
    const matches = cupMatches(state.matches, main.id)
    const final = matches.filter((m) => m.cup?.stage === 5)
    expect(final).toHaveLength(1)
    expect(final[0]!.cup?.neutral).toBe(true)
    expect(matches.filter((m) => m.cup?.stage === 3).every((m) => m.cup?.leg !== undefined)).toBe(true)
    expect(groupTables(matches, 2)).toHaveLength(4)
    expect(matches.every((m) => m.status === 'finished')).toBe(true)
  })

  it('a secundária recebe os terceiros dos grupos da principal na repescagem e os líderes de grupo pulam a repescagem', () => {
    const main = cup(state, 'cont-sa-1')
    const second = cup(state, 'cont-sa-2')
    const thirds = groupTables(cupMatches(state.matches, main.id), 2).map((g) => g.rows[2]!.teamId)
    expect(thirds).toHaveLength(4)
    expect(second.log.map((l) => `${l.kind}:${l.teams.length}`)).toEqual(['groups:16', 'knockout:8', 'knockout:8', 'knockout:4', 'knockout:2'])
    for (const t of thirds) expect(second.log[1]!.teams).toContain(t)
    const leaders = groupTables(cupMatches(state.matches, second.id), 0).map((g) => g.rows[0]!.teamId)
    for (const l of leaders) {
      expect(second.log[1]!.teams).not.toContain(l)
      expect(second.log[2]!.teams).toContain(l)
    }
    expect(second.winnerId).toBeDefined()
  })

  it('a premiação por fase e o bônus de participação entram no caixa; o campeão ganha mais que o vice', () => {
    const main = cup(state, 'cont-sa-1')
    const team = (id: string) => state.teams.find((t) => t.id === id)!
    const prizes = (id: string) => team(id).finances.ledger.filter((e) => e.category === 'cup-prize' && (e.description ?? '').startsWith(main.name))
    const champion = prizes(main.winnerId!).reduce((s, e) => s + e.amount, 0)
    const runnerUp = prizes(main.runnerUpId!).reduce((s, e) => s + e.amount, 0)
    expect(champion).toBeGreaterThan(runnerUp)
    expect(prizes(main.winnerId!).length).toBeGreaterThanOrEqual(4)
    // Quem só jogou os grupos recebeu a participação.
    const group = main.log[2]!.teams.find((id) => id !== main.winnerId && id !== main.runnerUpId)!
    expect(prizes(group).length).toBeGreaterThanOrEqual(1)
  })

  it('a fase de liga europeia tem tabela única, repescagem e mata-mata, final em jogo único', () => {
    const top = cup(afterEurope, 'cont-eu-1')
    expect(top.year).toBe(2027)
    const old = afterEurope.cupHistory!['cont-eu-1']!.find((h) => h.year === 2026)!
    expect(old.winnerId).toBeDefined()
    // A edição 2026 acabou e foi trocada pela de 2027 depois que todos os países abriram a temporada nova.
    expect(afterEurope.matches.filter((m) => m.competitionId === 'cont-eu-1' && m.status === 'finished')).toHaveLength(0)
  })

  it('a fase de liga: 24 clubes, 8 jogos cada, 4 direto às quartas, 8 na repescagem, 12 eliminados', () => {
    const top = cup(mid, 'cont-eu-1')
    expect(top.year).toBe(2026)
    expect(top.log.map((l) => `${l.kind}:${l.teams.length}`)).toEqual(['league:24', 'knockout:8', 'knockout:8', 'knockout:4', 'knockout:2'])
    const matches = cupMatches(mid.matches, top.id)
    const table = leaguePhaseTable(matches, 0)
    expect(table).toHaveLength(24)
    expect(table.every((r) => r.played === 8)).toBe(true)
    const playoff = new Set(top.log[1]!.teams)
    expect([...playoff].every((id) => table.findIndex((r) => r.teamId === id) >= 4 && table.findIndex((r) => r.teamId === id) < 12)).toBe(true)
    const quarter = top.log[2]!.teams
    for (const row of table.slice(0, 4)) expect(quarter).toContain(row.teamId)
    expect(tiesOfStage(matches, top.spec, 4)).toHaveLength(1)
    expect(top.winnerId).toBeDefined()
    expect(pyramidFinished(mid, 'England')).toBe(true)
  })

  it('a europa entra depois da Europa: edições de 2027 de todas as copas europeias têm os campeões das copas nacionais', () => {
    const history = afterEurope.cupHistory!
    const eu = ['cont-eu-1', 'cont-eu-2', 'cont-eu-3'].map((id) => new Set(cup(afterEurope, id).entrants.map((e) => e.teamId)))
    const inEurope = (id: string) => eu.some((set) => set.has(id))
    for (const nationalCup of ['cup-en', 'cup-es', 'cup-de', 'cup-fr', 'cup-pt', 'cup-it']) {
      const winner = history[nationalCup]?.find((h) => h.year === 2026)?.winnerId
      expect(winner, nationalCup).toBeDefined()
      expect(inEurope(winner!), `${nationalCup}: campeão fora das copas europeias`).toBe(true)
    }
    // Sem repetir clube entre as três copas.
    expect(eu[0]!.size + eu[1]!.size + eu[2]!.size).toBe(new Set(eu.flatMap((s) => [...s])).size)
  })

  it('os jogos continentais caem no meio de semana, nunca no mesmo dia de outro jogo do clube', () => {
    const perDay = new Map<string, number>()
    for (const m of afterEurope.matches) for (const id of [m.homeTeamId, m.awayTeamId]) perDay.set(`${m.date}|${id}`, (perDay.get(`${m.date}|${id}`) ?? 0) + 1)
    expect(Math.max(...perDay.values())).toBe(1)
    const continental = afterEurope.matches.filter((m) => m.competitionId.startsWith('cont-'))
    const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay()
    expect(continental.every((m) => [2, 3, 4].includes(weekday(m.date)))).toBe(true)
  })
})

describe('telas das copas continentais', () => {
  const top = world.competitions!.find((c) => c.id === 'br-1')!.teams.reduce((a, b) => (b.reputation > a.reputation ? b : a))

  it('o caminho do seu time aparece no painel e na partida; a Tabela lista a copa continental', async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { advanceGame, createGame, finishPendingMatch, playPendingAuto } = await import('../src/store/game')
    const { Dashboard } = await import('../src/ui/screens/Dashboard')
    const { MatchScreen } = await import('../src/ui/screens/Match')
    const { Standings } = await import('../src/ui/screens/Standings')
    const { clearLive, beginLive } = await import('../src/store/liveMatch')
    let game = createGame(7, top.id, { world })
    game = { ...game, season: { ...game.season, teams: game.season.teams.map((t) => (t.id === top.id ? { ...t, objective: { targetPosition: 20, sackingPosition: 20 } } : t)) } }
    for (let i = 0; i < 200 && !(game.pendingUserMatch?.competitionId === 'cont-sa-1'); i++) game = game.pendingUserMatch ? playPendingAuto(game) : advanceGame(game)
    expect(game.pendingUserMatch?.competitionId).toBe('cont-sa-1')
    const noop = () => {}
    const screen = renderToStaticMarkup(createElement(MatchScreen, { game, onNavigate: noop }))
    expect(screen).toContain('Copa Continental dos Campeões da América do Sul')
    clearLive()
    const live = beginLive(game)
    live.match.playUntil(120)
    game = finishPendingMatch(game, live.match.result())
    const panel = renderToStaticMarkup(createElement(Dashboard, { game, onNavigate: noop }))
    expect(panel).toContain('Copa Continental dos Campeões da América do Sul')
    expect(panel).toContain('Caminho:')
    const table = renderToStaticMarkup(createElement(Standings, { game, initialSection: 'cups' }))
    expect(table).toContain('Copa Continental dos Campeões da América do Sul')
    expect(table).toContain('Chaveamento')
  }, 600_000)
})

describe('saves de antes das copas continentais', () => {
  it('ganham as copas continentais na virada, sem mudar a temporada em andamento', async () => {
    const { defaultCupSpecsForCompetitions } = await import('../src/data/package/packageCups')
    const national = specs.filter((s) => s.country !== undefined)
    const start = createSeason({ year: 2026, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: national })
    expect(start.cups!.some((c) => c.pyramid === undefined)).toBe(false)
    const turn = (s: SeasonState, pyramid: string) => advanceSeason(s, { createYouth, pyramid, defaultCupSpecs: defaultCupSpecsForCompetitions })
    const later = advanceUntil(start, '2027-01-02', { turn }).state
    expect(later.cups!.filter((c) => c.pyramid === undefined).map((c) => `${c.id}:${c.year}`).sort()).toEqual(['cont-sa-1:2027', 'cont-sa-2:2027'])
    // A Europa só abre a temporada seguinte em 1º de julho: as copas europeias nascem depois da virada dos países de lá.
    const europe = advanceUntil(later, '2027-07-03', { turn }).state
    expect(europe.cups!.filter((c) => c.pyramid === undefined).map((c) => c.id).sort()).toEqual(['cont-eu-1', 'cont-eu-2', 'cont-eu-3', 'cont-sa-1', 'cont-sa-2'])
  }, 600_000)
})
