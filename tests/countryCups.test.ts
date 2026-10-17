import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { defaultCupSpecs, normalizeCup } from '../src/data/package/cups'
import { COUNTRIES_WITH_CUPS, defaultCupsFor } from '../src/data/package/countryCups'
import { loadWorld } from '../src/data/package/defaultPackage'
import { cupsForPackage } from '../src/data/package/packageCups'
import type { DataPackage } from '../src/data/package/types'
import { validatePackage } from '../src/data/package/validate'
import { FULL_WORLD, buildScaleWorld } from '../src/diagnostics/scaleWorld'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { cupMatches, groupTables, stageList, tiesOfStage } from '../src/engine/cups'
import { createSeason, simulateToSeasonEnd } from '../src/engine/season'
import type { CupSpec } from '../src/engine/types'
import { packageIssueText } from '../src/ui/labels'

const sample = buildScalePackage(7)
const copy = () => JSON.parse(JSON.stringify(sample)) as DataPackage

describe('copas padrão de cada país', () => {
  it('há copas padrão para Brasil, Inglaterra, Espanha, Itália, Alemanha, França, Portugal e Argentina', () => {
    expect([...COUNTRIES_WITH_CUPS].sort()).toEqual(['Argentina', 'Brazil', 'England', 'France', 'Germany', 'Italy', 'Portugal', 'Spain'])
    const ids = (country: Parameters<typeof defaultCupsFor>[0]) => defaultCupsFor(country, [{ id: 'x-1', level: 1 }]).map((c) => c.id)
    expect(ids('England')).toEqual(['cup-en'])
    expect(ids('Spain')).toEqual(['cup-es', 'supercup-es'])
    expect(ids('Italy')).toEqual(['cup-it', 'supercup-it'])
    expect(ids('Germany')).toEqual(['cup-de', 'supercup-de'])
    expect(ids('France')).toEqual(['cup-fr'])
    expect(ids('Portugal')).toEqual(['cup-pt', 'league-cup-pt'])
    expect(ids('Argentina')).toEqual(['cup-ar', 'supercup-ar'])
    expect(defaultCupsFor('Uruguay', [{ id: 'uy-1', level: 1 }])).toEqual([])
  })

  it('os nomes são genéricos (nenhum nome oficial de campeonato)', () => {
    const names = sample.cups!.map((c) => c.name)
    for (const official of ['FA Cup', 'Copa del Rey', 'Coppa Italia', 'DFB', 'Coupe de France', 'Taça de Portugal', 'Taça da Liga', 'Copa Argentina', 'Supercopa de España', 'Supercoppa', 'Copa do Brasil', 'Supercopa do Brasil']) for (const n of names) expect(n).not.toContain(official)
    expect(names).toContain('Copa da Inglaterra')
    expect(names).toContain('Supercopa da Alemanha')
  })

  it('o pacote de exemplo das 15 ligas traz as copas dos oito países e é válido', () => {
    expect(sample.cups!.map((c) => c.id).sort()).toEqual(['cup-ar', 'cup-br', 'cup-de', 'cup-en', 'cup-es', 'cup-fr', 'cup-it', 'cup-pt', 'league-cup-pt', 'supercup-ar', 'supercup-br', 'supercup-de', 'supercup-es', 'supercup-it'])
    expect(validatePackage(copy()).report.errors).toEqual([])
  })

  it('cada copa fecha o chaveamento com o número de clubes do país (folgas para os cabeças de chave)', () => {
    const world = loadWorld(7, copy())
    const start = createSeason({ year: 2026, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: world.cups! })
    const shape = (id: string) => {
      const cup = start.cups!.find((c) => c.id === id)!
      return { clubs: cup.entrants.length, stages: stageList(cup.spec).map((s) => s.name), byes: cup.log[0]!.byes.length, firstRound: tiesOfStage(cupMatches(start.matches, id), cup.spec, 0).length }
    }
    expect(shape('cup-en')).toMatchObject({ clubs: 20, byes: 12, firstRound: 4 })
    expect(shape('cup-es')).toMatchObject({ clubs: 20, byes: 12, firstRound: 4 })
    expect(shape('cup-it')).toMatchObject({ clubs: 20, byes: 12, firstRound: 4 })
    expect(shape('cup-de')).toMatchObject({ clubs: 18, byes: 14, firstRound: 2 })
    expect(shape('cup-fr')).toMatchObject({ clubs: 18, byes: 14, firstRound: 2 })
    expect(shape('cup-pt')).toMatchObject({ clubs: 18, byes: 14, firstRound: 2 })
    expect(shape('cup-ar')).toMatchObject({ clubs: 28, byes: 4, firstRound: 12 })
    expect(shape('cup-br')).toMatchObject({ clubs: 60, byes: 4, firstRound: 28 })
    expect(shape('supercup-es').clubs).toBe(4)
    expect(shape('supercup-de').clubs).toBe(2)
    // Os cabeças de chave (os melhores) folgam.
    const england = start.cups!.find((c) => c.id === 'cup-en')!
    const rep = new Map(world.teams.map((t) => [t.id, t.reputation]))
    const worstBye = Math.min(...england.log[0]!.byes.map((id) => rep.get(id)!))
    const bestPlaying = Math.max(...england.log[0]!.teams.filter((id) => !england.log[0]!.byes.includes(id)).map((id) => rep.get(id)!))
    expect(worstBye).toBeGreaterThanOrEqual(bestPlaying)
  })

  it('a copa da liga de Portugal tem 16 clubes em 4 grupos de 4 e termina em semifinais e final neutras; a Argentina decide direto nos pênaltis, em campo neutro', () => {
    const world = loadWorld(7, copy())
    const start = createSeason({ year: 2026, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: world.cups! })
    const league = start.cups!.find((c) => c.id === 'league-cup-pt')!
    expect(league.entrants).toHaveLength(16)
    expect(groupTables(cupMatches(start.matches, league.id), 0)).toHaveLength(4)
    expect(league.spec.stages.map((s) => [s.name, s.neutral])).toEqual([['Semifinais', true], ['Final', true]])
    const argentina = start.cups!.find((c) => c.id === 'cup-ar')!
    expect(argentina.spec.extraTime).toBe(false)
    expect(cupMatches(start.matches, 'cup-ar').every((m) => m.cup?.neutral)).toBe(true)
    expect(argentina.spec.stages.every((s) => s.neutral)).toBe(true)
  })
})

describe('uma temporada de várias copas de países diferentes', () => {
  const built = buildScaleWorld(FULL_WORLD.filter((l) => ['en-1', 'es-1', 'it-1'].includes(l.id)), 5)
  const specs = ['England', 'Spain', 'Italy'].flatMap((country, i) => defaultCupsFor(country as 'England', [{ id: ['en-1', 'es-1', 'it-1'][i]!, level: 1 }])).map((c) => normalizeCup(c))
  const ended = simulateToSeasonEnd(createSeason({ year: 2026, seed: 'copas', teams: built.teams, players: built.players, academy: built.academy, competitions: built.competitions, cupSpecs: specs }))

  it('cada copa tem o seu campeão, que é um clube dela (copas de países diferentes não se misturam)', () => {
    const cups = ended.cups!
    expect(cups.map((c) => c.id)).toEqual(['cup-en', 'cup-es', 'supercup-es', 'cup-it', 'supercup-it'])
    for (const cup of cups) {
      expect(cup.winnerId, cup.id).toBeDefined()
      expect(cup.entrants.map((e) => e.teamId)).toContain(cup.winnerId)
      expect(cup.entrants.map((e) => e.teamId)).toContain(cup.runnerUpId)
    }
    const winners = ['cup-en', 'cup-es', 'cup-it'].map((id) => ended.cups!.find((c) => c.id === id)!.winnerId)
    expect(new Set(winners).size).toBe(3)
    expect(() => tiesOfStage(ended.matches, cups[0]!.spec, 0)).toThrow(/uma copa só/)
  }, 240_000)

  it('o mandante do jogo único segue a regra da copa e a final é em campo neutro', () => {
    const it = ended.cups!.find((c) => c.id === 'cup-it')!
    const rep = new Map(ended.teams.map((t) => [t.id, t.reputation]))
    for (const m of cupMatches(ended.matches, 'cup-it').filter((x) => x.cup?.stage === 1)) expect(rep.get(m.homeTeamId)!).toBeGreaterThanOrEqual(rep.get(m.awayTeamId)!)
    const final = cupMatches(ended.matches, 'cup-it').find((m) => m.cup?.stage === 4)!
    expect(final.cup?.neutral).toBe(true)
    expect(it.spec.homeOfSingleLeg).toBe('higher-reputation')
    // Semifinais da copa da Itália em ida e volta; a da Alemanha, em jogo único (conferido pelas fases).
    expect(it.spec.stages[3]!.legs).toBe(2)
  })

  it('a supercopa de quatro clubes junta campeão e vice da liga e da copa, sem repetir clube', () => {
    for (const id of ['supercup-es', 'supercup-it']) {
      const cup = ended.cups!.find((c) => c.id === id)!
      const ids = cup.entrants.map((e) => e.teamId)
      expect(ids).toHaveLength(4)
      expect(new Set(ids).size).toBe(4)
      expect(cupMatches(ended.matches, id).every((m) => m.cup?.neutral)).toBe(true)
      expect(cupMatches(ended.matches, id)).toHaveLength(3)
    }
  })
})

describe('mandante por divisão, por reputação e o primeiro listado', () => {
  const world = generateWorld({ seed: 8 })
  const run = (home: CupSpec['homeOfSingleLeg'], seeding: 'random' | 'seeded' = 'random') => {
    const spec = normalizeCup(
      {
        id: 'teste',
        name: 'Copa de teste',
        format: 'knockout',
        entrants: [{ source: { type: 'league', league: 'serie-a' } }, { source: { type: 'league', league: 'serie-b' } }, { source: { type: 'league', league: 'serie-c' } }],
        stages: [{ name: 'Primeira fase', legs: 1, date: [2, 4] }, { name: 'Segunda fase', legs: 1, date: [2, 25] }, { name: 'Oitavas', legs: 1, date: [3, 18] }, { name: 'Quartas', legs: 1, date: [4, 15] }, { name: 'Semifinais', legs: 1, date: [5, 6] }, { name: 'Final', legs: 1, date: [6, 3] }],
        homeOfSingleLeg: home,
        seeding,
      },
    )
    const state = createSeason({ year: 2026, seed: 3, teams: world.teams, players: world.players, academy: world.academy, cupSpecs: [spec] })
    return { state, matches: cupMatches(state.matches, 'teste') }
  }
  const tier = (state: ReturnType<typeof run>['state'], id: string) => state.teams.find((t) => t.id === id)!.tier

  it('lower-division: o clube da divisão inferior joga em casa; entre iguais vale o sorteio', () => {
    const { state, matches } = run('lower-division')
    const mixed = matches.filter((m) => tier(state, m.homeTeamId) !== tier(state, m.awayTeamId))
    expect(mixed.length).toBeGreaterThan(5)
    for (const m of mixed) expect(tier(state, m.homeTeamId)).toBeGreaterThan(tier(state, m.awayTeamId))
  })

  it('higher-reputation e lower-reputation: o mandante é o de maior ou de menor reputação', () => {
    for (const [mode, ok] of [['higher-reputation', (h: number, a: number) => h >= a], ['lower-reputation', (h: number, a: number) => h <= a]] as const) {
      const { state, matches } = run(mode)
      for (const m of matches) expect(ok(state.teams.find((t) => t.id === m.homeTeamId)!.reputation, state.teams.find((t) => t.id === m.awayTeamId)!.reputation)).toBe(true)
    }
  })
})

describe('copas padrão quando o pacote não define as do país', () => {
  it('um país com liga e sem copas ganha as padrão; com copa dele no pacote, só vale a do pacote; com cups vazio, nenhuma', () => {
    const noCups = copy()
    delete noCups.cups
    expect(cupsForPackage(noCups).cups.map((c) => c.id).sort()).toEqual(sample.cups!.map((c) => c.id).sort())
    expect(loadWorld(7, noCups).cups!.map((c) => c.id).sort()).toEqual(sample.cups!.map((c) => c.id).sort())

    const own = copy()
    own.cups = [{ id: 'minha-copa-en', name: 'Minha Copa', country: 'England', format: 'knockout', entrants: [{ source: { type: 'league', league: 'en-1', positions: [1, 16] } }], stages: [{ name: 'Oitavas', legs: 1, date: [3, 4] }, { name: 'Quartas', legs: 1, date: [4, 15] }, { name: 'Semifinais', legs: 1, date: [6, 3] }, { name: 'Final', legs: 1, date: [9, 2] }] }]
    expect(validatePackage(own).report.errors).toEqual([])
    const ids = cupsForPackage(own).cups.map((c) => c.id)
    expect(ids).toContain('minha-copa-en')
    expect(ids).not.toContain('cup-en')
    expect(ids).toContain('cup-es')

    const none = copy()
    none.cups = []
    expect(loadWorld(7, none).cups).toBeUndefined()
  })

  it('copa padrão que não cabe nas ligas do país fica de fora, com aviso', () => {
    const small = copy()
    delete small.cups
    const league = small.leagues.find((l) => l.id === 'pt-1')!
    const keep = small.clubs.filter((c) => c.league === 'pt-1').slice(0, 10).map((c) => c.id)
    small.clubs = small.clubs.filter((c) => c.league !== 'pt-1' || keep.includes(c.id))
    small.players = small.players.filter((p) => !p.club || small.clubs.some((c) => c.id === p.club))
    league.teams = 10
    const result = validatePackage(small)
    expect(result.report.errors).toEqual([])
    const warning = result.report.warnings.find((w) => w.code === 'cup-defaults-skipped')!
    expect(warning.detail).toBe('Portugal')
    expect(packageIssueText(warning)).toContain('Portugal')
    expect(loadWorld(7, result.pkg!).cups!.some((c) => c.id === 'cup-pt')).toBe(false)
    expect(loadWorld(7, result.pkg!).cups!.some((c) => c.id === 'cup-en')).toBe(true)
  })

  it('as copas padrão do Brasil seguem iguais às do mundo fictício', () => {
    expect(defaultCupSpecs().map((c) => c.id)).toEqual(['cup-br', 'supercup-br'])
    expect(generateWorld({ seed: 2 }).cups).toEqual(defaultCupSpecs())
  })
})
