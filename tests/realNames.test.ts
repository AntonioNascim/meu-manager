/**
 * Varredura de nomes suspeitos (`tools/realdata/nameScan.ts`) e as correções de nome já conferidas (`nameFixes.ts`): o pacote real embutido não pode
 * ter palavrão, frase no lugar de nome, código do Wikidata, texto de página nem letra de outro alfabeto.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyClubsImport, clubsToCsv, parseClubsCsv } from '../src/data/package/edit/csv'
import type { DataPackage } from '../src/data/package/types'
import { interpretTask, patchSheet } from '../tools/realdata/corrections'
import { NAME_FIXES, nameFixCorrections } from '../tools/realdata/nameFixes'
import { entriesFromPackage, fixMojibake, scanNames } from '../tools/realdata/nameScan'
import type { NameEntry } from '../tools/realdata/nameScan'

const player = (name: string, nickname?: string): NameEntry => ({ kind: 'jogador', id: `p-${name}`, league: 'x-1', club: 'Clube', name, ...(nickname ? { nickname } : {}) })
const codes = (entries: NameEntry[]): string[] => scanNames(entries).map((f) => `${f.severity}/${f.code}`)
const place = (kind: 'clube' | 'estadio' | 'cidade', id: string, name: string): NameEntry => ({ kind, id, league: 'x', club: 'C', name })

describe('varredura de nomes', () => {
  it('acha palavrão em várias línguas, sem acusar nomes que só se parecem com ele', () => {
    expect(codes([player('João Merda')])).toContain('alta/palavrao')
    expect(codes([player('Pepe Mierda')])).toContain('alta/palavrao')
    expect(codes([player('Hans Scheisse')])).toContain('alta/palavrao')
    expect(codes([player('Mario Stronzo')])).toContain('alta/palavrao')
    expect(codes([player('Jean Connard')])).toContain('alta/palavrao')
    expect(codes([player('Big Fuckface')])).toContain('alta/palavrao')
    expect(codes([player('Marsexlino Nunes')])).toContain('media/palavrao')
    // Nomes legítimos que contêm trechos parecidos.
    expect(codes([player('Alex Vergara'), player('Toshitaka Maeda'), player('Dennis Cockburn'), player('Gabriel Pinto')])).toEqual([])
  })

  it('acha frase, minúsculas, símbolos e números em nome de pessoa', () => {
    expect(codes([player('Sebastián Meza la mamá de mazzanti bien rica')])).toEqual(expect.arrayContaining(['alta/frase', 'alta/minusculas']))
    expect(codes([player('axel vigo')])).toContain('alta/minusculas')
    expect(codes([player('Ayumu Seko 67')])).toContain('alta/caracteres')
    expect(codes([player('Francisco "Paco" Venegas')])).toContain('alta/caracteres')
    expect(codes([player('Guido Carrillo EL GOAT')])).toContain('media/maiusculas')
    expect(codes([player('Brian RodríguezF')])).toContain('media/maiuscula-no-meio')
  })

  it('aceita nomes reais com partículas, hífens, apóstrofos e letras raras', () => {
    const ok = ['Kevin De Bruyne', 'Virgil van Dijk', "Ben O'Brien", 'Son Heung-min', 'Hwang In-beom', 'Marc-André ter Stegen', 'Trent Alexander-Arnold', 'Wellington Gonzaga de Assis Filho', 'Ágúst Þorsteinsson', 'D.J. Taylor', 'Ibrahima Konaté', 'Marek Hamšík']
    expect(codes(ok.map((n) => player(n)))).toEqual([])
  })

  it('acha o apelido da torcida escrito no nome e apelido que não tem a ver com o nome', () => {
    expect(codes([player('Carlos Quintana El Destructor De Cacas', 'Carlos Quintana')])).toContain('alta/apelido-no-nome')
    expect(codes([player('Fernando Augusto Pereira Bueno Júnior', 'Fernando')])).toEqual([])
    expect(codes([player('Gabriel Barbosa', 'Gabigol')])).toEqual(['baixa/apelido-sem-relacao'])
    expect(codes([player('Jan Oblak', 'El Guardián')])).toEqual(['baixa/apelido-sem-relacao'])
    expect(codes([player('Rafael Silva', 'Garoto Dos Tres Gols')])).toContain('media/apelido-sem-relacao')
  })

  it('acha texto de página, link, codificação errada, alfabeto misturado e código do Wikidata', () => {
    const f = scanNames([player('Reigan Heskey'), player('Leonardo VoniÄ‡'), player('Αrda Güler'), player('Visite www.exemplo.com')])
    expect(f.map((x) => x.code)).toEqual(expect.arrayContaining(['codificacao', 'alfabeto-misturado', 'link']))
    expect(f.find((x) => x.code === 'codificacao')?.suggestion).toBe('Leonardo Vonić')
    expect(f.find((x) => x.code === 'alfabeto-misturado')?.suggestion).toBe('Arda Güler')
    expect(fixMojibake('Ã©')).toBe('é')
    const places = scanNames([place('cidade', 'c1', 'Q10509'), place('estadio', 'c2', 'Q5848075'), place('estadio', 'c3', 'Gorda hilda'), place('estadio', 'c4', 'stade Marie-Marvingt'), place('clube', 'c5', 'Guayaquil&nbsp;City')])
    expect(places.map((x) => `${x.id}:${x.code}`)).toEqual(expect.arrayContaining(['c1:id-wikidata', 'c2:id-wikidata', 'c3:palavrao', 'c4:minusculas', 'c5:texto-de-pagina']))
  })

  it('aceita clubes, estádios e cidades reais com números, partículas e minúsculas permitidas', () => {
    const places: NameEntry[] = [
      ...['1. FC Köln', 'Mainz 05', 'Schalke 04', '2 de Mayo', 'Brighton & Hove Albion F.C.', 'Gimnasia y Esgrima (LP)', 'Espérance Sportive de Tunis'].map((name, i) => place('clube', `a${i}`, name)),
      ...['Estadio Atanasio Girardot', 'Stade de l’Abbé-Deschamps', 'Waldstadion an der Kaiserlinde', 'Estadio 15 de Abril', 'MAC³PARK stadion'].map((name, i) => place('estadio', `b${i}`, name)),
      ...['Ribeirão Preto', 'Kingston upon Hull', 'São João del-Rei', 'León de Los Aldama'].map((name, i) => place('cidade', `c${i}`, name)),
    ]
    expect(scanNames(places)).toEqual([])
  })
})

describe('correções de nome', () => {
  it('as correções de nameFixes valem em toda rodada, e a correção à mão vence', () => {
    const manual = [{ id: 'wd-Q3660120', field: 'name' as const, value: 'Carlos A. Quintana', at: '2026-01-01' }]
    const fixes = nameFixCorrections(manual)
    expect(fixes.some((c) => c.id === 'wd-Q3660120' && c.field === 'name')).toBe(false)
    expect(fixes.length).toBe(NAME_FIXES.length - 1)
    const sheet = { header: ['id', 'name', 'nickname', 'city', 'stadiumName'], rows: [{ id: 'wd-Q2843080', name: 'Enner Valencia', nickname: '"Flash" "Ennerman"', city: '', stadiumName: '' }, { id: 'wd-Q10512', name: 'Elche', nickname: '', city: 'Q10509', stadiumName: '' }] }
    expect(patchSheet(sheet, nameFixCorrections([]))).toBe(2)
    expect(sheet.rows[0]?.nickname).toBe('')
    expect(sheet.rows[1]?.city).toBe('Elche')
  })

  it('a planilha de tarefas aceita nome, apelido (- tira o apelido) e nome curto', () => {
    expect(interpretTask('nome', 'Arda Güler')).toEqual({ ok: true, entries: [{ field: 'name', value: 'Arda Güler' }] })
    expect(interpretTask('apelido', '-')).toEqual({ ok: true, entries: [{ field: 'nickname', value: '' }] })
    expect(interpretTask('Nome curto', 'Gladbach')).toEqual({ ok: true, entries: [{ field: 'shortName', value: 'Gladbach' }] })
    expect(interpretTask('nome', '').ok).toBe(false)
  })
})

describe('pacote real embutido', () => {
  const pkg = JSON.parse(readFileSync('data/pacote-real.json', 'utf8')) as DataPackage
  const findings = scanNames(entriesFromPackage(pkg))

  it('não tem nome, apelido, clube, estádio ou cidade suspeito (graves ou médios)', () => {
    const bad = findings.filter((f) => f.severity !== 'baixa')
    expect(bad.map((f) => `${f.severity}/${f.code} ${f.club}: ${f.value}`)).toEqual([])
  })

  it('traz as correções conferidas (vandalismo corrigido)', () => {
    const all = JSON.stringify([pkg.players, pkg.clubs])
    for (const text of ['Destructor De Cacas', 'mamá de mazzanti', 'bullanguero', 'Superman ecuatoriano', 'Gorda hilda', 'EL GOAT', 'Marsexlino', 'harwood 6417', 'pollin', '&nbsp;', 'Moutinh0']) expect(all, text).not.toContain(text)
    expect(pkg.players.find((p) => p.id === 'wd-Q3660120')?.name).toBe('Carlos Quintana')
    expect(pkg.clubs.find((c) => c.id === 'wd-Q736937')?.stadium.name).toBe('Estadio Hidalgo')
  })
})

describe('nome curto na planilha de clubes (CSV)', () => {
  it('a planilha leva o nome curto e a importação o guarda', () => {
    const pkg = JSON.parse(readFileSync('data/pacote-real.json', 'utf8')) as DataPackage
    const csv = clubsToCsv(pkg, { leagueIds: new Set(['de-1']) })
    expect(csv.split('\n')[0]).toContain('shortName')
    expect(csv).toContain('Gladbach')
    const parsed = parseClubsCsv(csv.replace('Gladbach', 'Mönchengladbach'), pkg)
    expect(parsed.issues).toEqual([])
    const result = applyClubsImport(pkg, parsed)
    expect(result.pkg.clubs.find((c) => c.name === 'Borussia Mönchengladbach')?.shortName).toBe('Mönchengladbach')
    const tooLong = parseClubsCsv(csv.replace('Gladbach', 'Nome curto grande demais para caber'), pkg)
    expect(tooLong.issues.some((i) => i.column === 'shortName')).toBe(true)
  })
})
