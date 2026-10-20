import { describe, expect, it } from 'vitest'
import { applyPlayersImport, parsePlayersCsv, playersToCsv } from '../src/data/package/edit/csv'
import { validatePackage } from '../src/data/package/validate'
import type { DataPackage } from '../src/data/package/types'
import { flagCountry, mainSquadHtml, parseSquadHtml, pickSquadSection, positionInfo } from '../tools/realdata/localSquad'
import { mergeSquads, sameName } from '../tools/realdata/merge'
import { leagueDefinitions } from '../tools/realdata/packageOut'
import { guessPositions } from '../tools/realdata/positions'
import type { LeagueSheets } from '../tools/realdata/assemble'

const flag = (country: string): string => `<span class="flagicon"><a href="/wiki/File:Flag_of_${country}.svg" class="mw-file-description"><img alt="x" src="//thumb.wikimedia.org/a/b/Flag_of_${country}.svg/20px-Flag_of_${country}.svg.png"/></a></span>`

// Tabela do estilo espanhol: número, bandeira, posição, nome, e uma coluna com o clube de origem (outro link, que não é jogador).
const SPANISH = `
<h2>Plantel</h2>
<table><tr><th>N.º</th><th>Nac.</th><th>Pos.</th><th>Nombre</th><th>Procedencia</th></tr>
<tr><td>1 </td><td>${flag('Uruguay')}</td><td><span style="display:none">0</span><a href="/wiki/Guardameta">POR</a></td><td><a href="/wiki/Sebasti%C3%A1n_Britos" title="Sebastián Britos">Sebastián Britos</a></td><td><a href="/wiki/Club_Universitario">Universitario</a></td></tr>
<tr><td>4 </td><td>${flag('Argentina')}</td><td><a href="/wiki/Defensa">LD</a></td><td><a href="/wiki/Juan_Perez_(futbolista)" title="Juan Pérez">Juan Pérez</a></td><td></td></tr>
<tr><td>9 </td><td>${flag('the_Netherlands')}</td><td><a href="/wiki/Delantero">DEL</a></td><td><a href="/w/index.php?title=Jose_Nuevo&amp;action=edit&amp;redlink=1" class="new">José Nuevo</a></td><td></td></tr>
</table>
<h3>Jugadores cedidos</h3>
<table><tr><td>30 </td><td>${flag('Peru')}</td><td><a href="/wiki/Defensa">DEF</a></td><td><a href="/wiki/Cedido_Um">Cedido Um</a></td></tr></table>`

// Tabela do estilo português: três jogadores por linha (número, posição, nome), sem bandeiras.
const PORTUGUESE = `
<table>
<tr><td align="center">2 </td><td><a href="/wiki/Lateral_(futebol)">LD</a></td><td><a href="/wiki/Matheuzinho" class="mw-disambig">Matheuzinho</a></td><td align="center">19 </td><td><a href="/wiki/Meio-campista">M</a></td><td><a href="/wiki/Andr%C3%A9_Carrillo">André Carrillo</a></td><td>49 </td><td><a href="/wiki/Volante">V</a></td><td><a href="/wiki/Andr%C3%A9_Luiz">André</a></td></tr>
</table>`

describe('elenco da Wikipedia no idioma do país', () => {
  it('lê número, país da bandeira, posição e jogador, e ignora o clube de origem e os emprestados', () => {
    const entries = parseSquadHtml(SPANISH, 'es')
    expect(entries.map((e) => e.display)).toEqual(['Sebastián Britos', 'Juan Pérez', 'José Nuevo'])
    expect(entries[0]).toEqual({ display: 'Sebastián Britos', title: 'Sebastián Britos', number: 1, nat: 'Uruguay', pos: 'GK', position: 'GK' })
    expect(entries[1]).toMatchObject({ number: 4, nat: 'Argentina', pos: 'DF', position: 'RB', title: 'Juan Perez (futbolista)' })
    // Link vermelho: o nome vale, o artigo não existe. "the Netherlands" vira Netherlands.
    expect(entries[2]).toMatchObject({ display: 'José Nuevo', nat: 'Netherlands', pos: 'FW' })
    expect(entries[2]?.title).toBeUndefined()
  })

  it('lê linhas com três jogadores e posição detalhada', () => {
    const entries = parseSquadHtml(PORTUGUESE, 'pt')
    expect(entries.map((e) => [e.display, e.number, e.pos, e.position])).toEqual([
      ['Matheuzinho', 2, 'DF', 'RB'],
      ['André Carrillo', 19, 'MF', undefined],
      ['André', 49, 'MF', 'DM'],
    ])
  })

  it('corta no título de emprestados e de base', () => {
    expect(mainSquadHtml(SPANISH)).not.toContain('Cedido Um')
    expect(mainSquadHtml('<h2>Elenco</h2><p>x</p><h3>Categorias de base</h3><p>y</p>')).toBe('<h2>Elenco</h2><p>x</p>')
  })

  it('o país vem do arquivo da bandeira, em qualquer língua', () => {
    expect(flagCountry('<img src="//t/Flag_of_Brazil.svg/20px-Flag_of_Brazil.svg.png">')).toBe('Brazil')
    expect(flagCountry('<a href="/wiki/Fichier:Flag_of_France_(1974%E2%80%932020).svg">')).toBe('France')
    expect(flagCountry('<td>sem bandeira</td>')).toBeUndefined()
  })

  it('siglas de posição das seis línguas, com ajuste por língua', () => {
    expect(positionInfo('POR', 'es')).toEqual({ coarse: 'GK', position: 'GK' })
    expect(positionInfo('DC', 'es')).toEqual({ coarse: 'FW', position: 'ST' })
    expect(positionInfo('DC', 'it')).toEqual({ coarse: 'DF', position: 'CB' })
    expect(positionInfo('Volante', 'pt')).toEqual({ coarse: 'MF', position: 'DM' })
    expect(positionInfo('M', 'fr')).toEqual({ coarse: 'MF' })
    expect(positionInfo('Doelman', 'nl')).toEqual({ coarse: 'GK', position: 'GK' })
    expect(positionInfo('Mittelfeld', 'de')).toEqual({ coarse: 'MF' })
    expect(positionInfo('talvez', 'es')).toBeUndefined()
  })

  it('escolhe a seção do elenco atual e não a de histórico', () => {
    const sections = [
      { index: '3', line: 'Joueurs' },
      { index: '5', line: 'Effectif professionnel actuel' },
      { index: '9', line: 'Joueurs historiques' },
    ]
    expect(pickSquadSection(sections)?.index).toBe('5')
    expect(pickSquadSection([{ index: '1', line: 'Historia' }, { index: '2', line: 'Plantilla 2026' }])?.index).toBe('2')
    expect(pickSquadSection([{ index: '1', line: 'Estadio' }])).toBeUndefined()
  })
})

describe('junção dos elencos', () => {
  const english = [
    { title: 'Gleison Bremer', display: 'Bremer', pos: 'DF', nat: 'BRA' },
    { title: 'Jonas Urbig', display: 'Jonas Urbig' },
  ]

  it('reconhece o mesmo jogador por nome, apelido ou título', () => {
    expect(sameName({ display: 'Bremer', title: 'Gleison Bremer' }, { display: 'Gleison Bremer' })).toBe(true)
    expect(sameName({ display: 'Raúl Jiménez' }, { display: 'Raul Jimenez' })).toBe(true)
    expect(sameName({ display: 'Juan Pérez', title: 'Juan Pérez (footballer, born 1990)' }, { display: 'Juan Pérez' })).toBe(true)
    expect(sameName({ display: 'Ana Souza' }, { display: 'Pedro Souza' })).toBe(false)
  })

  it('enriquece com a posição exata e o país da tabela local, sem acrescentar quando o elenco em inglês basta', () => {
    const local = [{ display: 'Gleison Bremer', title: 'Gleison Bremer', position: 'CB' as const, pos: 'DF' as const, nat: 'Brazil' }]
    const merged = mergeSquads(english, local, 'it', 2)
    expect(merged.added).toBe(0)
    expect(merged.enriched).toBe(1)
    expect(merged.entries[0]).toMatchObject({ localPosition: 'CB', nat: 'BRA' })
  })

  it('completa o elenco com quem só a tabela local tem quando o inglês não chega a um time', () => {
    const local = [
      { display: 'Jonas Urbig', title: 'Jonas Urbig' },
      { display: 'Novo Jogador', title: 'Novo Jogador', number: 7, pos: 'FW' as const, nat: 'Chile' },
    ]
    const merged = mergeSquads(english, local, 'es', 18)
    expect(merged.added).toBe(1)
    expect(merged.entries.at(-1)).toEqual({ display: 'Novo Jogador', lang: 'es', title: 'Novo Jogador', number: 7, nat: 'Chile', pos: 'FW' })
  })

  it('a tabela local não passa de 30 jogadores quando é a única fonte', () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ display: `Jogador ${i}`, title: `Jogador ${i}` }))
    const merged = mergeSquads([], many, 'es')
    expect(merged.entries).toHaveLength(30)
    expect(merged.added).toBe(30)
  })

  it('sem elenco em inglês, o elenco local vira o elenco', () => {
    const merged = mergeSquads([], [{ display: 'A', title: 'A' }, { display: 'B' }], 'pt')
    expect(merged.entries.map((e) => e.display)).toEqual(['A', 'B'])
    expect(merged.entries.every((e) => e.lang === 'pt')).toBe(true)
  })

  it('a posição exata da tabela local vale quando o Wikidata só diz "defensor" e fica sem revisão', () => {
    const generic = guessPositions(['defender'], 'DF')
    expect(generic.review).toHaveLength(1)
    const local = guessPositions(['defender'], 'DF', undefined, 'LB')
    expect(local.primary).toBe('LB')
    expect(local.review).toEqual([])
    // Fora do setor da tabela, a posição local é ignorada.
    expect(guessPositions([], 'DF', undefined, 'ST').primary).toBe('CB')
  })
})

describe('data de nascimento estimada no pacote e no CSV', () => {
  const pkg = {
    format: 'meu-manager-package',
    version: 1,
    name: 't',
    startYear: 2026,
    countries: [{ id: 'Brazil', name: 'Brasil' }],
    leagues: [],
    clubs: [],
    players: [{ id: 'p1', name: 'Fulano', birthDate: '1999-07-01', birthEstimated: true, nationality: 'Brazil', position: 'ST', club: null }],
  } as unknown as DataPackage

  it('vai e volta pelo CSV com a marca', () => {
    const csv = playersToCsv(pkg, 'players')
    expect(csv.split('\r\n')[0]).toContain('birthEstimated')
    const parsed = parsePlayersCsv(csv, pkg)
    expect(parsed.issues).toEqual([])
    expect(parsed.rows[0]?.value.birthEstimated).toBe(true)
    const back = applyPlayersImport(pkg, 'players', parsed)
    expect(back.pkg.players[0]?.birthEstimated).toBe(true)
  })

  it('sem a marca, o campo some', () => {
    const clean = { ...pkg, players: [{ ...(pkg.players[0] as object), birthEstimated: undefined }] } as unknown as DataPackage
    const parsed = parsePlayersCsv(playersToCsv(clean, 'players'), clean)
    expect(parsed.rows[0]?.value.birthEstimated).toBeUndefined()
  })

  it('a validação aceita booleano e recusa outro tipo', () => {
    const bad = JSON.parse(JSON.stringify(pkg)) as { players: { birthEstimated: unknown }[] }
    bad.players[0]!.birthEstimated = 'sim'
    expect(validatePackage(bad).report.errors.some((e) => e.path.endsWith('birthEstimated'))).toBe(true)
    expect(validatePackage(pkg).report.errors.some((e) => e.path.endsWith('birthEstimated'))).toBe(false)
  })
})

describe('ligas com o número real de clubes', () => {
  const sheet = (leagueId: string, clubs: number): LeagueSheets => ({ leagueId, clubsCsv: '', playersCsv: '', issues: [], stats: { clubs, expected: clubs, players: 0, smallest: 0, largest: 0, estimated: 0, reviewPositions: 0 } })

  it('usa o número de clubes achado em cada liga, turno único onde for o caso', () => {
    const leagues = leagueDefinitions([sheet('br-1', 20), sheet('br-3', 20), sheet('ar-1', 28), sheet('us-1', 30), sheet('en-1', 20)])
    const by = Object.fromEntries(leagues.map((l) => [l.id, l]))
    expect(by['ar-1']).toMatchObject({ teams: 28, rounds: 1, promotion: 0, relegation: 0 })
    expect(by['us-1']).toMatchObject({ teams: 30, rounds: 1 })
    expect(by['en-1']?.rounds).toBeUndefined()
    expect(by['br-1']).toMatchObject({ name: 'Série A', promotion: 0, relegation: 4 })
    expect(by['br-3']).toMatchObject({ name: 'Série C', promotion: 4, relegation: 0 })
  })
})
