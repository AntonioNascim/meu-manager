/**
 * Fase 3, parte 3D: o mundo ampliado (Países Baixos, México, Estados Unidos e as ligas de elite da África, da Ásia e da Oceania), a copa da
 * América do Norte, a Copa Intercontinental (todo ano) e o Mundial de Clubes (a cada quatro anos), todos como padrão do pacote.
 */
import { describe, expect, it } from 'vitest'
import { defaultWorldCups } from '../src/data/package/continentalCups'
import type { ContinentalLeague } from '../src/data/package/continentalCups'
import { cupsForPackage } from '../src/data/package/packageCups'
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import type { DataPackage } from '../src/data/package/types'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { MARKET } from '../src/engine/config'
import { groupTables, progressCups, resolveEntrants, stageList } from '../src/engine/cups'
import { transferWindows } from '../src/engine/market/windows'
import { advanceUntil, createSeason } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import { weekday } from '../src/engine/season/dates'
import { REGIONS, continentOf } from '../src/engine/types'
import type { Continent, CupSpec, Match, Region } from '../src/engine/types'

const sample = buildScalePackage(7)
const copy = () => JSON.parse(JSON.stringify(sample)) as DataPackage
const { pkg } = validatePackage(copy())
const world = loadWorld(7, pkg)
const specs = world.cups as CupSpec[]
const spec = (id: string) => specs.find((s) => s.id === id) as CupSpec
const start = createSeason({ year: 2026, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: specs })

const regionOfTeam = (state: SeasonState, id: string): Continent => continentOf(state.season.competitions.find((c) => c.teamIds.includes(id))!.region as Region)
const countByContinent = (state: SeasonState, ids: string[]) => {
  const out: Partial<Record<Continent, number>> = {}
  for (const id of ids) out[regionOfTeam(state, id)] = (out[regionOfTeam(state, id)] ?? 0) + 1
  return out
}

describe('mundo ampliado', () => {
  it('traz Países Baixos, México e Estados Unidos e uma liga de elite pequena para África, Ásia e Oceania', () => {
    const leagues = Object.fromEntries(sample.leagues.map((l) => [l.id, l]))
    expect(leagues['nl-1']).toMatchObject({ country: 'Netherlands', teams: 18 })
    expect(leagues['mx-1']).toMatchObject({ country: 'Mexico', teams: 18 })
    expect(leagues['us-1']).toMatchObject({ country: 'United States', teams: 20, rounds: 1 })
    expect([leagues['af-1']!.teams, leagues['as-1']!.teams, leagues['oc-1']!.teams]).toEqual([8, 8, 4])
    // Sem acesso nem rebaixamento: são ligas de elite fechadas.
    for (const id of ['af-1', 'as-1', 'oc-1']) expect(leagues[id]).toMatchObject({ promotion: 0, relegation: 0, level: 1 })
  })

  it('cada liga nova tem região, economia e temporada própria (padrões do país)', () => {
    const comp = (id: string) => world.competitions!.find((c) => c.id === id)!
    expect(comp('nl-1')).toMatchObject({ region: 'EU', split: true })
    expect(comp('mx-1')).toMatchObject({ region: 'NA' })
    expect(comp('mx-1').split).toBeFalsy()
    expect(comp('us-1')).toMatchObject({ region: 'NA' })
    expect(comp('af-1')).toMatchObject({ region: 'AF', split: true })
    expect(comp('as-1')).toMatchObject({ region: 'AS', split: true })
    expect(comp('oc-1')).toMatchObject({ region: 'OC', split: true })
    for (const id of ['af-1', 'as-1', 'oc-1']) expect(comp(id).economy!.level).toBeLessThan(0)
    // Os clubes levam o país da liga (nacionalidade da base e dos nomes).
    expect(comp('af-1').teams.every((t) => t.country === 'Egypt')).toBe(true)
  })

  it('todas as regiões têm janelas de transferência', () => {
    for (const region of REGIONS) {
      expect(MARKET.windows.regions[region].length).toBeGreaterThan(0)
      expect(transferWindows({ year: 2027 }, [], region).length).toBeGreaterThan(0)
    }
  })
})

describe('copa da América do Norte e Supercopa dos Países Baixos', () => {
  it('a copa norte-americana tem 16 clubes (8 do México e 8 dos Estados Unidos) em oitavas, quartas, semifinais e final em ida e volta', () => {
    const cup = spec('cont-na-1')
    expect(cup.region).toBe('NA')
    expect(stageList(cup).map((s) => `${s.name}:${s.legs}`)).toEqual(['Oitavas de final:2', 'Quartas de final:2', 'Semifinais:2', 'Final:2'])
    const edition = start.cups!.find((c) => c.id === 'cont-na-1')!
    expect(edition.entrants).toHaveLength(16)
    expect(countByContinent(start, edition.entrants.map((e) => e.teamId))).toEqual({ NA: 16 })
    const perLeague = (id: string) => edition.entrants.filter((e) => start.season.competitions.find((c) => c.id === id)!.teamIds.includes(e.teamId)).length
    expect([perLeague('mx-1'), perLeague('us-1')]).toEqual([8, 8])
    // Fevereiro a maio: dentro do ano civil das duas ligas.
    const dates = start.matches.filter((m) => m.competitionId === 'cont-na-1').map((m) => m.date)
    expect(dates.every((d) => d >= '2026-02-01' && d <= '2026-06-30')).toBe(true)
  })

  it('a supercopa dos Países Baixos junta o campeão da liga e o da copa, com a final antes da temporada', () => {
    const cup = spec('supercup-nl')
    expect(cup).toMatchObject({ kind: 'supercup', country: 'Netherlands', homeOfSingleLeg: 'first-listed' })
    expect(spec('cup-nl').country).toBe('Netherlands')
    const edition = start.cups!.find((c) => c.id === 'supercup-nl')!
    expect(edition.entrants).toHaveLength(2)
  })

  it('o campeão da copa nacional dos Países Baixos tem vaga na segunda copa europeia', () => {
    const second = spec('cont-eu-2')
    expect(second.entrants.some((e) => e.source.type === 'cup' && e.source.cup === 'cup-nl')).toBe(true)
  })
})

describe('copas mundiais no pacote', () => {
  it('são duas, sem país nem região, com nomes genéricos', () => {
    const worlds = specs.filter((s) => s.world)
    expect(worlds.map((s) => s.id)).toEqual(['world-1', 'world-2'])
    for (const s of worlds) {
      expect(s.country).toBeUndefined()
      expect(s.region).toBeUndefined()
      for (const brand of ['FIFA', 'Mundial de Clubes da', 'Intercontinental Cup']) expect(s.name).not.toContain(brand)
    }
    expect(spec('world-1').world).toEqual({ every: 1, offset: 0, from: [12, 1] })
    expect(spec('world-2').world).toEqual({ every: 4, offset: 2025, from: [6, 1], pause: { from: [6, 3], to: [7, 22] } })
  })

  it('o Mundial de Clubes tem 32 clubes em 8 grupos de 4, oitavas, quartas, semifinais e final', () => {
    const cup = spec('world-2')
    expect(cup.format).toBe('groups-knockout')
    expect(cup.groups).toMatchObject({ count: 8, advance: 2, legs: 1 })
    expect(stageList(cup).map((s) => s.name)).toEqual(['Fase de grupos', 'Oitavas de final', 'Quartas de final', 'Semifinais', 'Final'])
  })

  it('a Copa Intercontinental tem 6 clubes no formato da FIFA: o campeão europeu entra direto na final', () => {
    const cup = spec('world-1')
    expect(cup.entrants).toHaveLength(6)
    expect(stageList(cup).map((s) => s.name)).toEqual(['Play-off', 'Segunda fase', 'Semifinais', 'Final'])
    const entry = (region: string) => cup.entrants.find((e) => (e.source.type === 'cup' ? e.source.cup === region : e.source.type === 'league' && e.source.league === region))?.stage
    expect(entry('cont-eu-1')).toBe(3)
    expect([entry('cont-sa-1'), entry('cont-na-1'), entry('af-1')]).toEqual([1, 1, 1])
    expect([entry('as-1'), entry('oc-1')]).toEqual([0, 0])
  })

  it('só existem quando todos os continentes têm clubes: sem a África, nada de copas mundiais (e um aviso)', () => {
    const noAfrica = copy()
    noAfrica.leagues = noAfrica.leagues.filter((l) => l.id !== 'af-1')
    const ids = new Set(noAfrica.clubs.filter((c) => c.league === 'af-1').map((c) => c.id))
    noAfrica.clubs = noAfrica.clubs.filter((c) => !ids.has(c.id))
    noAfrica.players = noAfrica.players.filter((p) => !p.club || !ids.has(p.club))
    delete noAfrica.cups
    const result = cupsForPackage({ leagues: noAfrica.leagues })
    expect(result.cups.some((c) => c.world)).toBe(false)
    expect(result.skipped).toContain('world')
    expect(result.cups.some((c) => c.id === 'cont-na-1')).toBe(true)
  })

  it('defaultWorldCups pede as copas continentais da Europa, da América do Sul e da América do Norte', () => {
    const members: ContinentalLeague[] = [
      { id: 'a-1', country: 'England', region: 'EU', teams: 20, revenue: 3 },
      { id: 'b-1', country: 'Brazil', region: 'SA', teams: 20, revenue: 1 },
      { id: 'c-1', country: 'Mexico', region: 'NA', teams: 18, revenue: 1 },
      { id: 'd-1', country: 'Egypt', region: 'AF', teams: 8, revenue: 0.3 },
      { id: 'e-1', country: 'Japan', region: 'AS', teams: 8, revenue: 0.7 },
      { id: 'f-1', country: 'Australia', region: 'OC', teams: 4, revenue: 0.3 },
    ]
    expect(defaultWorldCups(members, [{ id: 'cont-eu-1' }, { id: 'cont-sa-1' }])).toBeUndefined()
    expect(defaultWorldCups(members, [{ id: 'cont-eu-1' }, { id: 'cont-sa-1' }, { id: 'cont-na-1' }])?.map((c) => c.id)).toEqual(['world-1', 'world-2'])
    // Europa com poucos clubes (menos de 12): o Mundial não fecha.
    expect(defaultWorldCups(members.map((m) => (m.region === 'EU' ? { ...m, teams: 10 } : m)), [{ id: 'cont-eu-1' }, { id: 'cont-sa-1' }, { id: 'cont-na-1' }])).toBeUndefined()
  })
})

describe('validação das copas mundiais', () => {
  const withCup = (patch: (cup: Record<string, unknown>) => void) => {
    const p = copy()
    const cup = p.cups!.find((c) => c.id === 'world-2') as unknown as Record<string, unknown>
    patch(cup)
    return validatePackage(p).report.errors.map((e) => `${e.code}:${e.path}`)
  }

  it('o pacote de exemplo é válido', () => {
    expect(validatePackage(copy()).report.errors).toEqual([])
  })

  it('recusa um mundial com país, anos fora do intervalo ou vaga por continente inválida', () => {
    expect(withCup((c) => (c.country = 'Brazil'))).not.toEqual([])
    expect(withCup((c) => (c.world = { every: 0, offset: 2025, from: [6, 1] }))).toContain('out-of-range:cups[23].world')
    expect(withCup((c) => (c.world = { every: 4, offset: 2025, from: [13, 1] }))).toContain('out-of-range:cups[23].world')
    expect(withCup((c) => ((c.entrants as { source: Record<string, unknown> }[])[0]!.source.region = 'BR'))).toContain('unknown-value:cups[23].entrants[0].source.region')
    expect(withCup((c) => ((c.entrants as { source: Record<string, unknown> }[])[0]!.source.count = 0))).toContain('out-of-range:cups[23].entrants[0].source.count')
    expect(withCup((c) => ((c.entrants as { source: Record<string, unknown> }[])[0]!.source.cup = 'nao-existe'))).toContain('unknown-reference:cups[23].entrants[0].source.cup')
  })

  it('o chaveamento tem que fechar: 31 clubes não se repartem em 8 grupos', () => {
    const errors = withCup((c) => ((c.entrants as { source: Record<string, unknown> }[])[1]!.source.count = 5))
    expect(errors.some((e) => e.startsWith('cup-groups:'))).toBe(true)
  })

  it('aceita as regiões novas nas ligas e nas copas', () => {
    const p = copy()
    const league = p.leagues.find((l) => l.id === 'af-1')!
    league.region = 'AF'
    expect(validatePackage(p).report.errors).toEqual([])
    league.region = 'XX' as never
    expect(validatePackage(p).report.errors.map((e) => e.code)).toContain('unknown-value')
  })
})

describe('vagas por continente (Mundial de Clubes)', () => {
  const mundial = spec('world-2')
  const ctx = (extra: Partial<Parameters<typeof resolveEntrants>[1]> = {}) => ({ year: 2029, teams: start.teams, competitions: start.season.competitions, cupHistory: {}, specs, players: start.players, ...extra })

  it('sem histórico, os 32 clubes saem pela força: 12 da Europa, 6 da América do Sul, 4 da África, 4 da Ásia, 5 da América do Norte e 1 da Oceania', () => {
    const entrants = resolveEntrants(mundial, ctx())
    expect(entrants).toHaveLength(32)
    expect(new Set(entrants.map((e) => e.teamId)).size).toBe(32)
    expect(countByContinent(start, entrants.map((e) => e.teamId))).toEqual({ EU: 12, SA: 6, AF: 4, AS: 4, NA: 5, OC: 1 })
  })

  it('os campeões das últimas quatro edições da copa continental entram primeiro, mesmo sem ser os mais fortes', () => {
    const eu = start.season.competitions.filter((c) => c.region === 'EU').flatMap((c) => c.teamIds)
    const strength = new Map(eu.map((id) => [id, start.players.filter((p) => p.teamId === id).length]))
    // Os campeões são clubes qualquer: pegamos os de menor reputação.
    const weak = [...eu].sort((a, b) => start.teams.find((t) => t.id === a)!.reputation - start.teams.find((t) => t.id === b)!.reputation).slice(0, 5)
    expect(strength.size).toBeGreaterThan(5)
    const cupHistory = { 'cont-eu-1': weak.map((id, i) => ({ year: 2024 + i, winnerId: id })) }
    const entrants = resolveEntrants(mundial, ctx({ cupHistory })).map((e) => e.teamId)
    // Últimas 4 edições: 2028, 2027, 2026 e 2025 (o de 2024 fica de fora).
    for (const id of weak.slice(1)) expect(entrants).toContain(id)
    expect(entrants).not.toContain(weak[0])
    expect(entrants).toHaveLength(32)
  })

  it('o país-sede é o campeão da primeira liga da América do Norte; se ele já está pelo continente, entra o próximo mais forte', () => {
    const entrants = resolveEntrants(mundial, ctx())
    expect(entrants.at(-1)).toBeDefined()
    const na = entrants.filter((e) => regionOfTeam(start, e.teamId) === 'NA')
    expect(na).toHaveLength(5)
  })
})

describe('uma edição do Mundial de Clubes (2029), sem esperar quatro anos de jogo', () => {
  // O relógio do mundo é posto em 2 de junho de 2029 (as copas europeias do ano já acabaram) e o motor de copas cria a edição.
  const june: SeasonState = { ...start, season: { ...start.season, currentDate: '2029-06-02' }, cups: start.cups!.filter((c) => c.pyramid !== undefined || c.id.startsWith('cont-')) }
  const created = progressCups(june)
  const cup = created.cups!.find((c) => c.id === 'world-2')!

  it('nasce na data certa, com 32 clubes', () => {
    expect(cup).toBeDefined()
    expect(cup.year).toBe(2029)
    expect(cup.entrants).toHaveLength(32)
    expect(cup.log).toHaveLength(1)
    expect(cup.log[0]!.kind).toBe('groups')
  })

  it('não nasce em 2027 nem 2028 (a cada quatro anos), nem antes de 1º de junho', () => {
    for (const date of ['2027-06-02', '2028-06-02', '2029-05-31']) {
      const s = progressCups({ ...june, season: { ...june.season, currentDate: date } })
      expect(s.cups!.some((c) => c.id === 'world-2')).toBe(false)
    }
  })

  it('tem oito grupos de quatro, todos os jogos em quartas-feiras de junho, sem clube jogando duas vezes no mesmo dia', () => {
    const matches = created.matches.filter((m) => m.competitionId === 'world-2')
    expect(matches).toHaveLength(48)
    const tables = groupTables(matches, 0)
    expect(tables).toHaveLength(8)
    for (const t of tables) expect(t.rows).toHaveLength(4)
    expect(matches.every((m) => [2, 3, 4].includes(weekday(m.date)))).toBe(true)
    expect(matches.every((m) => m.date >= '2029-06-01' && m.date <= '2029-07-05')).toBe(true)
    const days = new Map<string, Match[]>()
    for (const m of created.matches) for (const id of [m.homeTeamId, m.awayTeamId]) days.set(`${id}:${m.date}`, [...(days.get(`${id}:${m.date}`) ?? []), m])
    const entrants = new Set(cup.entrants.map((e) => e.teamId))
    const clash = [...days.entries()].filter(([key, list]) => entrants.has(key.split(':')[0]!) && list.length > 1)
    expect(clash).toEqual([])
  })

  it('o mata-mata cabe antes da abertura das ligas europeias (agosto): oitavas em 27/6, final em 18/7, tudo em campo neutro', () => {
    expect(cup.spec.stages.map((s) => s.date)).toEqual([[6, 27], [7, 4], [7, 11], [7, 18]])
    expect(cup.spec.stages.every((s) => s.neutral)).toBe(true)
    const lastGroupDay = created.matches.filter((m) => m.competitionId === 'world-2').map((m) => m.date).sort().at(-1)!
    expect(lastGroupDay < '2029-06-27').toBe(true)
  })
})

describe('a temporada de 2026 com as copas novas (mundo de 358 clubes)', () => {
  const season = advanceUntil(start, '2027-01-03', { market: true }).state

  it('a copa da América do Norte termina em maio e tem campeão', () => {
    const cup = season.cups!.find((c) => c.id === 'cont-na-1')!
    expect(cup.winnerId).toBeDefined()
    const dates = season.matches.filter((m) => m.competitionId === 'cont-na-1').map((m) => m.date)
    expect(dates.sort().at(-1)! <= '2026-06-30').toBe(true)
  })

  it('a Copa Intercontinental nasce em dezembro com um clube de cada continente e acaba antes da virada do ano', () => {
    const cup = season.cups!.find((c) => c.id === 'world-1')!
    expect(cup).toBeDefined()
    expect(cup.year).toBe(2026)
    expect(cup.entrants).toHaveLength(6)
    expect(countByContinent(season, cup.entrants.map((e) => e.teamId))).toEqual({ EU: 1, SA: 1, NA: 1, AF: 1, AS: 1, OC: 1 })
    const dates = season.matches.filter((m) => m.competitionId === 'world-1').map((m) => m.date).sort()
    expect(dates[0]! >= '2026-12-01' && dates.at(-1)! <= '2026-12-31').toBe(true)
    expect(cup.winnerId).toBeDefined()
    // O campeão da América do Sul de 2026 e o da América do Norte estão na lista.
    const sa = season.cups!.find((c) => c.id === 'cont-sa-1')!
    const na = season.cups!.find((c) => c.id === 'cont-na-1')!
    const ids = cup.entrants.map((e) => e.teamId)
    expect(ids).toContain(sa.winnerId)
    expect(ids).toContain(na.winnerId)
    expect(season.cupHistory!['world-1']).toHaveLength(1)
  })

  it('os campeões das ligas de elite de África, Ásia e Oceania entram na Intercontinental só depois de a temporada deles acabar', () => {
    const cup = season.cups!.find((c) => c.id === 'world-1')!
    const africa = season.season.competitions.find((c) => c.id === 'af-1')!
    expect(cup.entrants.filter((e) => africa.teamIds.includes(e.teamId))).toHaveLength(1)
  })
})
