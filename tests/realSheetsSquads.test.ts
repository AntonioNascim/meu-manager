import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyLeagueSquads, mergeSquad, parseBirth, readSquadSheet, squadFileName, squadPlayerId, squadTemplate } from '../tools/realdata/clubSquads'
import type { SquadReport, SquadSheet } from '../tools/realdata/clubSquads'
import { PLAYER_COLUMNS } from '../src/data/package/edit/csv'
import type { Sheet } from '../tools/realdata/corrections'

const header = [...PLAYER_COLUMNS] as string[]
const row = (o: Record<string, string>): Record<string, string> => ({ ...Object.fromEntries(header.map((h) => [h, ''])), ...o })
const club = { id: 'wd-Q1', name: 'Floresta' }
const generated = (n: number, position: string): Record<string, string> => row({ id: `gen-Q1-${n}`, name: `Inventado ${n}`, birthDate: '1998-01-01', nationality: 'Brazil', position, club: club.id, clubName: club.name, generated: 'sim' })
const sheet = (): Sheet => ({ header, rows: [generated(1, 'GK'), generated(2, 'CB'), generated(3, 'CB'), row({ id: 'wd-Q9', name: 'Fulano Real', birthDate: '1995-05-05', position: 'ST', club: club.id }), row({ id: 'wd-Q8', name: 'Outro Clube', position: 'GK', club: 'wd-Q2' })] })
const okSquad = (text: string): SquadSheet => {
  const r = readSquadSheet(text)
  if ('header' in r) throw new Error(r.header)
  return r
}

describe('elencos reais por clube', () => {
  it('lê a planilha: posição da interface, datas do Brasil, país em português e linhas com problema', () => {
    const r = okSquad('jogador;posicao;nascimento;pais;pe;apelido;forca\nJoão Silva;ZAG VOL;13/01/1994;Brasil;canhoto;Joãozinho;70\nMaria;XYZ;;;;;\nPedro;GOL;1990;Uruguai;;;\n;ATA;;;;;\nBruno;ATA;31/02/1990;;;;\nJoão Silva;ATA;;;;;')
    expect(r.players.map((p) => p.name)).toEqual(['João Silva', 'Pedro'])
    expect(r.players[0]).toMatchObject({ position: 'CB', secondary: ['DM'], birth: { date: '1994-01-13', exact: true }, nationality: 'Brazil', foot: 'left', overall: 70 })
    expect(r.players[1]).toMatchObject({ position: 'GK', birth: { date: '1990-07-01', exact: false }, nationality: 'Uruguay' })
    expect(r.open).toBe(1)
    expect(r.problems.map((p) => p.line)).toEqual([3, 6, 7])
  })

  it('datas: AAAA-MM-DD, DD/MM/AAAA, só o ano; recusa dia que não existe', () => {
    expect(parseBirth('1994-01-13')?.date).toBe('1994-01-13')
    expect(parseBirth('13/1/1994')?.date).toBe('1994-01-13')
    expect(parseBirth('1994')).toEqual({ date: '1994-07-01', exact: false })
    expect(parseBirth('30/02/1994')).toBeUndefined()
  })

  it('troca um gerado (da mesma posição) para cada jogador novo, e rodar de novo não muda nada', () => {
    const squad = okSquad('jogador;posicao\nZeca Zagueiro;ZAG\nGoleiro Real;GOL\nFulano Real;ATA').players
    const s = sheet()
    const overrides = new Map<string, { overall?: number }>()
    const first = mergeSquad(s, club, squad, { startYear: 2026, country: 'Brazil', overrides })
    expect(first).toMatchObject({ added: 2, updated: 1, replacedGenerated: 2, size: 4 })
    const mine = s.rows.filter((r) => r.club === club.id)
    expect(mine.filter((r) => r.generated === 'sim').map((r) => r.id)).toEqual(['gen-Q1-3'])
    expect(mine.find((r) => r.name === 'Zeca Zagueiro')).toMatchObject({ id: squadPlayerId(club.id, 'Zeca Zagueiro'), position: 'CB', nationality: 'Brazil', birthEstimated: 'sim', generated: '' })
    expect(mine.find((r) => r.name === 'Fulano Real')).toMatchObject({ id: 'wd-Q9', position: 'ST', birthDate: '1995-05-05', birthEstimated: '' })
    expect(s.rows.find((r) => r.id === 'wd-Q8')?.club).toBe('wd-Q2')
    const snapshot = JSON.stringify(s.rows)
    expect(mergeSquad(s, club, squad, { startYear: 2026, country: 'Brazil', overrides })).toMatchObject({ added: 0, replacedGenerated: 0, size: 4 })
    expect(JSON.stringify(s.rows)).toBe(snapshot)
  })

  it('tirar: remove quem a Wikipedia listou por engano, sem pedir posição, e não repete', () => {
    const squad = okSquad('jogador;posicao;tirar\nFulano Real;;sim').players
    expect(squad[0]?.remove).toBe(true)
    const s = sheet()
    expect(mergeSquad(s, club, squad, { startYear: 2026, country: 'Brazil' })).toMatchObject({ removed: 1, added: 0 })
    expect(s.rows.some((r) => r.id === 'wd-Q9')).toBe(false)
    expect(mergeSquad(s, club, squad, { startYear: 2026, country: 'Brazil' }).removed).toBe(0)
  })

  it('o modelo traz os reais que já existem e uma vaga por gerado', () => {
    const csv = squadTemplate(sheet().rows, club.id)
    expect(csv.split('\n').filter(Boolean)).toHaveLength(1 + 1 + 3)
    expect(csv).toContain('Fulano Real')
  })

  it('aplica pelo nome do arquivo e avisa elenco fora de 18 a 30', () => {
    const dir = mkdtempSync(join(tmpdir(), 'elencos-'))
    mkdirSync(join(dir, 'elencos-reais'))
    writeFileSync(join(dir, 'elencos-reais', squadFileName('br-3', club.name)), 'jogador;posicao\nZeca;ZAG\n')
    const report: SquadReport = { clubs: [], problems: [] }
    const clubs: Sheet = { header: ['id', 'name'], rows: [{ id: club.id, name: club.name }] }
    const used = applyLeagueSquads(dir, { id: 'br-3', country: 'Brazil' }, clubs, sheet(), { startYear: 2026, overrides: new Map() }, report)
    expect(used).toEqual(['br-3-floresta.csv'])
    expect(report.clubs[0]).toMatchObject({ added: 1, replacedGenerated: 1 })
    expect(report.problems[0]).toMatch(/ficou com 4 jogadores/)
  })
})
