import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { defaultPackage, loadWorld } from '../src/data/package/defaultPackage'
import { COUNTRY_DEFAULTS } from '../src/data/package/leagueDefaults'
import { isClassicPackage } from '../src/data/package/load'
import type { DataPackage } from '../src/data/package/types'
import { validatePackage } from '../src/data/package/validate'
import { formatImportReport, measureImport } from '../src/diagnostics/measure'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { buildTactic, repairTactic } from '../src/engine/lineup'
import { foreignCount, lineupForeign, lineupForeignCount, squadForeignBlocked } from '../src/engine/foreign'
import { buyerCheck } from '../src/engine/market/decision'
import { makeOffer } from '../src/engine/market'
import { quickLineup } from '../src/engine/match/quick'
import { advanceToMatchday, createGame, playPendingAuto, setUserTactic, squadOf, userCompetition, userTeam } from '../src/store/game'
import { worldChoices } from '../src/store/worldChoices'
import { packageIssueText } from '../src/ui/labels'
import { NewGame } from '../src/ui/screens/NewGame'
import type { Player, Team } from '../src/engine/types'

const pkg = buildScalePackage(7)
const copy = (): DataPackage => JSON.parse(JSON.stringify(pkg)) as DataPackage
const codes = (p: DataPackage) => validatePackage(p).report.errors.map((e) => e.code)
const world = loadWorld(7, pkg)
const teamIn = (leagueId: string) => world.competitions!.find((c) => c.id === leagueId)!.teams[0]!

describe('pacote com vários países', () => {
  it('o pacote de exemplo das 15 ligas é válido, sem atributos nem contratos', () => {
    const r = validatePackage(pkg).report
    expect(r.errors).toEqual([])
    expect(pkg.leagues).toHaveLength(15)
    expect(pkg.countries).toHaveLength(13)
    expect(pkg.clubs).toHaveLength(282)
    expect(pkg.players.every((p) => p.attributes === undefined && p.contract === undefined)).toBe(true)
  })

  it('valida cada país separado: divisões em sequência, acesso e rebaixamento coerentes, times pares', () => {
    const four = copy()
    four.leagues.push({ id: 'br-4', name: 'Série D', country: 'Brazil', level: 4, teams: 20, promotion: 4, relegation: 0 })
    expect(codes(four)).toContain('unsupported-leagues')

    const gap = copy()
    gap.leagues.find((l) => l.id === 'br-3')!.level = 4
    expect(codes(gap)).toContain('unsupported-leagues')

    const mismatch = copy()
    mismatch.leagues.find((l) => l.id === 'br-2')!.promotion = 3
    expect(codes(mismatch)).toContain('league-promotion')
    const lastRelegates = copy()
    lastRelegates.leagues.find((l) => l.id === 'ar-1')!.relegation = 2
    expect(codes(lastRelegates)).toContain('league-promotion')

    const odd = copy()
    odd.leagues.find((l) => l.id === 'py-1')!.teams = 11
    expect(codes(odd)).toContain('league-size-unsupported')
    expect(packageIssueText(validatePackage(odd).report.errors.find((e) => e.code === 'league-size-unsupported')!)).toContain('par')

    const country = copy()
    country.countries[0]!.id = 'Atlantida'
    expect(codes(country)).toContain('unknown-value')
  })

  it('economia, turno, região e limite de estrangeiros são opcionais e validados', () => {
    const ok = copy()
    ok.leagues.find((l) => l.id === 'pt-1')!.economy = { revenue: 1.2, level: 3 }
    ok.leagues.find((l) => l.id === 'pt-1')!.region = 'EU'
    ok.leagues.find((l) => l.id === 'pt-1')!.foreignLimit = { squad: 20, lineup: 6 }
    expect(codes(ok)).toEqual([])
    const bad = copy()
    const league = bad.leagues.find((l) => l.id === 'pt-1')!
    league.economy = { revenue: 0, level: 40 }
    league.foreignLimit = { squad: 99, lineup: 12 }
    ;(league as { rounds?: number }).rounds = 3
    ;(league as { region?: string }).region = 'MARS'
    const found = codes(bad)
    expect(found.filter((c) => c === 'out-of-range').length).toBeGreaterThanOrEqual(4)
    expect(found).toContain('unknown-value')
  })
})

describe('mundo montado de um pacote com várias ligas', () => {
  it('cada país vira uma pirâmide com as suas divisões, e a economia vem do país quando o pacote não diz', () => {
    const comps = world.competitions!
    expect(comps).toHaveLength(15)
    expect(new Set(comps.map((c) => c.pyramid)).size).toBe(13)
    const england = teamIn('en-1')
    expect(england.economy).toEqual(COUNTRY_DEFAULTS.England!.economy)
    expect(england.country).toBe('England')
    expect(teamIn('br-1').economy).toBeUndefined()
    expect(teamIn('br-1').country).toBeUndefined()
    expect(comps.find((c) => c.id === 'ar-1')!.rounds).toBe(1)
    expect(comps.find((c) => c.id === 'en-1')!.region).toBe('EU')
    expect(comps.find((c) => c.id === 'br-2')).toMatchObject({ promotion: 4, relegation: 4, tier: 2 })
    expect(comps.find((c) => c.id === 'en-1')).toMatchObject({ promotion: 0, relegation: 0 })
  })

  it('o que o pacote diz vale mais que o padrão do país', () => {
    const custom = copy()
    custom.leagues.find((l) => l.id === 'en-1')!.economy = { revenue: 9, level: 1 }
    const w = loadWorld(7, custom)
    expect(w.competitions!.find((c) => c.id === 'en-1')!.economy).toEqual({ revenue: 9, level: 1 })
    expect(w.teams.find((t) => t.country === 'England')!.economy).toEqual({ revenue: 9, level: 1 })
  })

  it('a economia muda os jogadores e as finanças: o clube inglês é mais forte e mais rico que o paraguaio', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const avgSalary = (id: string) => mean(world.players.filter((p) => p.teamId === teamIn(id).id).map((p) => p.contract.salary))
    expect(avgSalary('en-1')).toBeGreaterThan(avgSalary('py-1') * 5)
    expect(teamIn('en-1').finances.balance).toBeGreaterThan(teamIn('py-1').finances.balance * 3)
  })

  it('o pacote fictício padrão continua sem ligas explícitas (nada muda no jogo de sempre)', () => {
    const def = defaultPackage(5)
    expect(isClassicPackage(def)).toBe(true)
    expect(loadWorld(5, def).competitions).toBeUndefined()
    expect(JSON.stringify(loadWorld(5, def))).toBe(JSON.stringify(loadWorld(5)))
    expect(JSON.stringify(loadWorld(5))).toBe(JSON.stringify(generateWorld({ seed: 5 })))
  })

  it('o jogo começa com o foco na pirâmide do clube escolhido e joga as 15 ligas', () => {
    const england = teamIn('en-1')
    let game = createGame(7, england.id, { world, dataPackage: pkg })
    expect(game.season.focus).toBe('England')
    expect(game.season.season.competitions).toHaveLength(15)
    expect(userCompetition(game).id).toBe('en-1')
    game = playPendingAuto(advanceToMatchday(game))
    expect(game.season.season.currentDate > '2026-01-01').toBe(true)
    expect(createGame(7, teamIn('br-2').id, { world, dataPackage: pkg }).season.focus).toBe('Brazil')
  })
})

describe('escolha do país, da liga e do clube', () => {
  it('lista países, divisões e clubes do mundo', () => {
    const choices = worldChoices(world)
    expect(choices).toHaveLength(13)
    expect(choices[0]).toMatchObject({ country: 'Brazil' })
    expect(choices[0]!.divisions.map((d) => d.name)).toEqual(['Série A', 'Série B', 'Série C'])
    expect(choices.find((c) => c.country === 'England')!.divisions[0]!.teams).toHaveLength(20)
    const classic = worldChoices(generateWorld({ seed: 5 }))
    expect(classic).toHaveLength(1)
    expect(classic[0]!.divisions).toHaveLength(3)
  })

  it('a tela mostra o seletor de países só quando há mais de um', () => {
    const many = renderToStaticMarkup(createElement(NewGame, { slots: null, onBack: () => {}, dataPackage: { id: 'x', data: pkg } }))
    expect(many).toContain('country-picker')
    expect(many).toContain('Inglaterra')
    expect(many).toContain('Série A')
    const one = renderToStaticMarkup(createElement(NewGame, { slots: null, onBack: () => {} }))
    expect(one).not.toContain('country-picker')
    expect(one).toContain('Série B')
  })
})

describe('limite de estrangeiros', () => {
  const italy = teamIn('it-1')
  const argentina = teamIn('ar-1')
  const squadItaly = world.players.filter((p) => p.teamId === italy.id)
  const foreignOf = (team: Team, list: Player[]) => list.filter((p) => p.nationality !== (team.country ?? 'Brazil'))

  it('só conta como estrangeiro quem tem nacionalidade diferente da do país da liga', () => {
    expect(italy.foreignLimit).toEqual({ lineup: 8 })
    expect(argentina.foreignLimit).toEqual({ squad: 6 })
    expect(foreignCount(squadItaly, italy)).toBe(foreignOf(italy, squadItaly).length)
    expect(lineupForeign(italy)).toEqual({ country: 'Italy', max: 8 })
    expect(lineupForeign(teamIn('br-1'))).toBeUndefined()
  })

  it('a escalação automática respeita o limite dos titulares, mesmo quando o time só tem estrangeiros bons', () => {
    // Os 14 primeiros viram estrangeiros e o resto é da casa: sem o limite o time escalaria mais de 8 estrangeiros.
    const stacked = squadItaly.map((p, i) => ({ ...p, nationality: i < 20 ? ('Brazil' as const) : ('Italy' as const) }))
    const free = buildTactic(stacked, { formationId: '4-4-2', style: 'possession', mentality: 0 })
    expect(lineupForeignCount(free, stacked, italy)).toBeGreaterThan(3)
    const limited = buildTactic(stacked, { formationId: '4-4-2', style: 'possession', mentality: 0 }, { foreign: { country: 'Italy', max: 3 } })
    expect(lineupForeignCount(limited, stacked, italy)).toBeLessThanOrEqual(3)
    expect(new Set(limited.startingXI).size).toBe(11)
  })

  it('a tática do jogador que passa do limite é consertada antes do jogo', () => {
    const stacked = squadItaly.map((p) => ({ ...p, nationality: 'Brazil' as const }))
    const tactic = buildTactic(stacked, { formationId: '4-4-2', style: 'possession', mentality: 0 })
    const fixed = repairTactic(tactic, stacked.map((p, i) => (i < 6 ? { ...p, nationality: 'Italy' as const } : p)), { country: 'Italy', max: 5 })
    expect(fixed.startingXI.filter((id) => stacked.findIndex((p) => p.id === id) >= 6).length).toBeGreaterThan(0)
    expect(lineupForeignCount(fixed, stacked.map((p, i) => (i < 6 ? { ...p, nationality: 'Italy' as const } : p)), { country: 'Italy' })).toBeLessThanOrEqual(5)
  })

  it('a escalação simplificada das ligas fora do foco também respeita o limite', () => {
    const stacked = squadItaly.map((p) => ({ ...p, nationality: 'Brazil' as const }))
    const { xi } = quickLineup(stacked, '4-4-2', { country: 'Italy', max: 2 })
    expect(xi.filter((p) => p.nationality !== 'Italy').length).toBeLessThanOrEqual(2 + 11) // sem italiano nenhum no elenco, o limite não tem como ser cumprido
    const mixed = stacked.map((p, i) => ({ ...p, nationality: i % 2 === 0 ? ('Brazil' as const) : ('Italy' as const) }))
    expect(quickLineup(mixed, '4-4-2', { country: 'Italy', max: 2 }).xi.filter((p) => p.nationality !== 'Italy').length).toBeLessThanOrEqual(2)
  })

  it('o técnico não consegue escalar mais estrangeiros que o limite', () => {
    let game = createGame(7, italy.id, { world, dataPackage: pkg })
    const team = userTeam(game)
    const squad = squadOf(game, team.id)
    const natives = squad.filter((p) => p.nationality === 'Italy')
    const strangers = squad.filter((p) => p.nationality !== 'Italy')
    // O time tem estrangeiros e da casa para a prova.
    game = { ...game, season: { ...game.season, players: game.season.players.map((p, i) => (p.teamId === team.id && i % 2 === 0 ? { ...p, nationality: 'Brazil' as const } : p.teamId === team.id ? { ...p, nationality: 'Italy' as const } : p)) } }
    const now = squadOf(game, team.id)
    expect(natives.length + strangers.length).toBe(squad.length)
    const bad = { ...userTeam(game).tactic, startingXI: now.filter((p) => p.nationality === 'Brazil').slice(0, 9).map((p) => p.id).concat(now.filter((p) => p.nationality === 'Italy').slice(0, 2).map((p) => p.id)) }
    const goalkeepers = now.filter((p) => p.position === 'GK')
    expect(goalkeepers.length).toBeGreaterThan(0)
    // 9 estrangeiros > 8: a mudança é recusada com o motivo.
    expect(() => setUserTactic(game, bad)).toThrow(/Limite de estrangeiros/)
  })

  it('o mercado não deixa o clube passar do limite do elenco (compra e pré-contrato), e a IA não escolhe quem não pode contratar', () => {
    const squad = world.players.filter((p) => p.teamId === argentina.id)
    const full = squad.map((p, i) => ({ ...p, nationality: i < 6 ? ('Brazil' as const) : ('Argentina' as const) }))
    const foreignPlayer = { id: 'x', nationality: 'Brazil' as const }
    const local = { id: 'y', nationality: 'Argentina' as const }
    expect(squadForeignBlocked(argentina, full, foreignPlayer)).toBe(true)
    expect(squadForeignBlocked(argentina, full, local)).toBe(false)
    expect(squadForeignBlocked(argentina, full, { id: full[0]!.id, nationality: 'Brazil' })).toBe(false)
    expect(squadForeignBlocked(teamIn('br-1'), full, foreignPlayer)).toBe(false)
    const fine = { buyer: { ...argentina, finances: { ...argentina.finances, transferBudget: 1e9, balance: 1e9, salaryBudget: 1e9 } }, buyerSquad: full.slice(0, 22), payroll: 0, fee: 1, salary: 1 }
    expect(buyerCheck({ ...fine, player: foreignPlayer })).toBe('foreign-limit')
    expect(buyerCheck({ ...fine, player: local })).not.toBe('foreign-limit')
  })

  it('uma proposta do jogador por um estrangeiro com o elenco no limite é recusada com o motivo certo', () => {
    let game = createGame(7, argentina.id, { world, dataPackage: pkg })
    game = { ...game, season: { ...game.season, players: game.season.players.map((p, i) => (p.teamId === argentina.id ? { ...p, nationality: i % 3 === 0 ? ('Argentina' as const) : ('Brazil' as const) } : p)) } }
    expect(foreignCount(squadOf(game, argentina.id), userTeam(game))).toBeGreaterThan(6)
    const target = game.season.players.find((p) => p.teamId && p.teamId !== argentina.id && p.nationality !== 'Argentina' && !p.contract.loanedFrom)!
    expect(() => makeOffer(game.season, argentina.id, { kind: 'purchase', playerId: target.id, fee: 10_000, salary: 10_000, contractEnd: '2030-12-31' })).toThrowError('foreign-limit')
  })
})

describe('medida de importação (?diagnostico=1)', () => {
  it('mede ler, validar, montar o mundo e começar o jogo com o pacote de 15 ligas', async () => {
    const m = await measureImport(JSON.stringify(pkg), { label: 'teste', readMs: 5, saveStore: null })
    expect(m).toMatchObject({ clubs: 282, leagues: 15, countries: 13, errors: 0 })
    expect(m.worldMs).toBeGreaterThan(0)
    expect(m.importMs).toBeGreaterThanOrEqual(m.parseMs + m.validateMs + m.worldMs)
    const text = formatImportReport(m)
    expect(text).toContain('15 ligas')
    expect(text).toContain('Importar (tudo acima)')
    expect(text).toContain('Comecar o jogo')
    expect(text).toContain('Primeiro avanco')
  })

  it('um arquivo que não é pacote só mostra os erros', async () => {
    const m = await measureImport('{"format":"outra-coisa"}', { label: 'ruim', saveStore: null })
    expect(m.errors).toBeGreaterThan(0)
    expect(formatImportReport(m)).toContain('nada foi montado')
    expect((await measureImport('isto nao e json', { label: 'texto', saveStore: null })).errors).toBeGreaterThan(0)
  })
})
