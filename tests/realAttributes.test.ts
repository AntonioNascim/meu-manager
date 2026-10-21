import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CLUB_COLUMNS, PLAYER_COLUMNS, parsePlayersCsv, toCsv } from '../src/data/package/edit/csv'
import type { DataPackage } from '../src/data/package/types'
import { overallForPosition } from '../src/engine/overall'
import type { Position } from '../src/engine/types'
import { fameQuality, fameWeight, generateLeagueAttributes, solveAttributes } from '../tools/realdata/attributes'
import type { RosterPlayer } from '../tools/realdata/attributes'
import { saveCorrections } from '../tools/realdata/corrections'
import { finalizeOutput, saveFame } from '../tools/realdata/finalize'

const POSITIONS: Position[] = ['GK', 'GK', 'RB', 'LB', 'CB', 'CB', 'CB', 'DM', 'DM', 'CM', 'CM', 'AM', 'AM', 'RW', 'RW', 'LW', 'LW', 'ST', 'ST', 'ST', 'CB', 'CM', 'ST', 'RB']
const roster = (clubId: string, count = 24): RosterPlayer[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${clubId}-p${i}`, name: `Jogador ${clubId} ${i}`, birthDate: `${1990 + (i % 12)}-${String(1 + (i % 12)).padStart(2, '0')}-10`, nationality: 'Brazil', position: POSITIONS[i % POSITIONS.length] as Position, clubId, academy: false }))

const league = { id: 'br-1', tier: 1 as const, repBottom: 7 }
const run = (players: RosterPlayer[], fame: Record<string, number>, reputations: Record<string, number>, overrides?: Map<string, { overall?: number; potential?: number }>) =>
  generateLeagueAttributes(league, Object.entries(reputations).map(([id, reputation]) => ({ id, reputation })), players, { startYear: 2026, fame, ...(overrides ? { overrides } : {}) })

describe('atributos pela fama', () => {
  it('a força na posição bate com o alvo, com os mesmos atributos a cada rodada', () => {
    for (const position of ['GK', 'CB', 'ST', 'AM'] as Position[]) for (const target of [55, 70, 85]) {
      const a = solveAttributes('semente', position, 26, target)
      expect(Math.abs(a.overall - target)).toBeLessThan(0.8)
      expect(overallForPosition(a.attributes, position)).toBeCloseTo(a.overall, 6)
      expect(solveAttributes('semente', position, 26, target).attributes).toEqual(a.attributes)
    }
  })

  it('é determinístico e preenche tudo na escala 1 a 100', () => {
    const players = [...roster('a'), ...roster('b')]
    const fame = Object.fromEntries(players.map((p, i) => [p.id, (i * 7) % 40]))
    const first = run(players, fame, { a: 15, b: 8 })
    const second = run(players, fame, { a: 15, b: 8 })
    expect([...second.values()]).toEqual([...first.values()])
    for (const made of first.values()) {
      for (const value of Object.values(made.attributes)) { expect(value).toBeGreaterThanOrEqual(1); expect(value).toBeLessThanOrEqual(100) }
      expect(made.potential).toBeGreaterThanOrEqual(Math.round(made.overall))
      expect(made.hidden.consistency).toBeGreaterThanOrEqual(1)
    }
  })

  it('o clube melhor tem o elenco melhor', () => {
    const players = [...roster('forte'), ...roster('fraco')]
    const made = run(players, {}, { forte: 18, fraco: 8 })
    const mean = (club: string): number => players.filter((p) => p.clubId === club).reduce((s, p) => s + (made.get(p.id)?.overall ?? 0), 0) / 24
    expect(mean('forte')).toBeGreaterThan(mean('fraco') + 4)
  })

  it('dentro do clube, os mais famosos ficam com as vagas de titular', () => {
    const players = roster('a')
    const outfield = players.filter((p) => p.position !== 'GK')
    const fame = Object.fromEntries(outfield.map((p, i) => [p.id, i < 10 ? 18 : 0]))
    const made = run(players, fame, { a: 14 })
    const mean = (list: RosterPlayer[]): number => list.reduce((s, p) => s + (made.get(p.id)?.overall ?? 0), 0) / list.length
    const famous = outfield.filter((_, i) => i < 10)
    const unknown = outfield.filter((_, i) => i >= 10)
    expect(mean(famous)).toBeGreaterThan(mean(unknown) + 5)
  })

  it('o craque num clube fraco continua craque, e a fama pesa mais que o clube', () => {
    const players = roster('pequeno')
    const star = players[10] as RosterPlayer
    const made = run(players, { [star.id]: 120 }, { pequeno: 8 })
    const others = players.filter((p) => p.id !== star.id)
    const best = Math.max(...others.map((p) => made.get(p.id)?.overall ?? 0))
    expect(made.get(star.id)?.overall).toBeGreaterThan(best + 8)
    expect(fameWeight(0)).toBe(0)
    expect(fameWeight(500)).toBeCloseTo(0.9, 6)
    // A fama é de carreira: aos 36 anos ela indica menos que aos 28.
    expect(fameQuality(120, 36)).toBeLessThan(fameQuality(120, 28) - 5)
  })

  it('força e potencial corrigidos à mão viram o alvo', () => {
    const players = roster('a')
    const target = players[3] as RosterPlayer
    const made = run(players, {}, { a: 12 }, new Map([[target.id, { overall: 88, potential: 91 }]]))
    expect(Math.abs((made.get(target.id)?.overall ?? 0) - 88)).toBeLessThan(0.8)
    expect(made.get(target.id)?.potential).toBe(91)
  })
})

describe('etapa final das planilhas', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  function setup(): string[] {
    dir = mkdtempSync(join(tmpdir(), 'final-'))
    const clubRows = [['wd-Q1', 'Clube Um', 'UMM', '#ff0000', '#ffffff', 'Cidade', '', 'Estádio Um', 30000, 15, 'br-1', 'Brasil A'], ['wd-Q2', 'Clube Dois', 'DOI', '#0000ff', '', 'Cidade Dois', '', 'Estádio Dois', '', 9, 'br-1', 'Brasil A']]
    writeFileSync(join(dir, 'br-1-clubes.csv'), toCsv(CLUB_COLUMNS, clubRows))
    const players = [...roster('wd-Q1', 20), ...roster('wd-Q2', 20)]
    const cells = (p: RosterPlayer): Record<string, string> => ({ id: p.id, name: p.name, birthDate: p.birthDate, nationality: p.nationality, position: p.position, club: p.clubId ?? '', clubName: p.clubId ?? '' })
    writeFileSync(join(dir, 'br-1-jogadores.csv'), toCsv(PLAYER_COLUMNS, players.map((p) => PLAYER_COLUMNS.map((c) => cells(p)[c] ?? ''))))
    writeFileSync(join(dir, 'br-1-base.csv'), toCsv(PLAYER_COLUMNS, []))
    saveFame(dir, { date: '2026-10-20', fame: { 'wd-Q1-p10': 90 } })
    return players.map((p) => p.id)
  }

  it('gera os atributos de todo mundo, valida o pacote e escreve as planilhas de conferência', () => {
    setup()
    const result = finalizeOutput(dir)
    expect(result.leagues).toEqual(['br-1'])
    expect(result.validation.rejected).toBe(0) // a liga de 2 clubes do teste tem erros de liga; os jogadores e clubes passam
    expect(result.topPlayers[0]?.id).toBe('wd-Q1-p10')
    expect(result.topPlayers.map((p) => p.rank)).toEqual(result.topPlayers.map((_, i) => i + 1))
    expect(result.topClubs[0]?.name).toBe('Clube Um')
    const parsed = parsePlayersCsv(readFileSync(join(dir, 'br-1-jogadores.csv'), 'utf8'), { clubs: [{ id: 'wd-Q1' }, { id: 'wd-Q2' }] } as unknown as DataPackage)
    expect(parsed.issues).toEqual([])
    expect(parsed.rows.every((r) => r.value.attributes !== undefined && r.value.potential !== undefined && r.value.hidden !== undefined)).toBe(true)
    expect(readFileSync(join(dir, 'conferencia', 'top-300-jogadores.csv'), 'utf8')).toContain('wd-Q1-p10')
    expect(readFileSync(join(dir, 'conferencia', 'forca-dos-clubes.csv'), 'utf8')).toContain('Clube Um')
  })

  it('as correções guardadas sobrevivem a uma nova rodada (as planilhas voltam como saíram do script)', () => {
    const ids = setup()
    saveCorrections(dir, [
      { id: 'wd-Q2', field: 'color2', value: '#00ff00', at: '2026-10-21' },
      { id: 'wd-Q2', field: 'capacity', value: '25000', at: '2026-10-21' },
      { id: ids[3] as string, field: 'position', value: 'ST', at: '2026-10-21' },
      { id: ids[4] as string, field: 'overall', value: '90', at: '2026-10-21' },
      { id: 'wd-fora', field: 'city', value: 'X', at: '2026-10-21' },
    ])
    const first = finalizeOutput(dir)
    expect(first.orphans.map((o) => o.id)).toEqual(['wd-fora'])
    const clubs = readFileSync(join(dir, 'br-1-clubes.csv'), 'utf8')
    expect(clubs).toContain('#00ff00')
    expect(clubs).toContain('25000')
    const after = (id: string) => readFileSync(join(dir, 'br-1-jogadores.csv'), 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${id};`)) ?? ''
    expect(after(ids[3] as string).split(';')[6]).toBe('ST')
    expect(first.topPlayers.find((p) => p.id === ids[4])?.overall).toBeGreaterThan(89)
    expect(first.topPlayers.find((p) => p.id === ids[4])?.corrected).toBe(true)

    // Uma rodada nova reescreve as planilhas sem as correções; a etapa final as põe de volta, com os mesmos atributos.
    const before = after(ids[5] as string)
    writeFileSync(join(dir, 'br-1-clubes.csv'), toCsv(CLUB_COLUMNS, [['wd-Q1', 'Clube Um', 'UMM', '#ff0000', '#ffffff', 'Cidade', '', 'Estádio Um', 30000, 15, 'br-1', 'Brasil A'], ['wd-Q2', 'Clube Dois', 'DOI', '#0000ff', '', 'Cidade Dois', '', 'Estádio Dois', '', 9, 'br-1', 'Brasil A']]))
    finalizeOutput(dir)
    expect(readFileSync(join(dir, 'br-1-clubes.csv'), 'utf8')).toContain('#00ff00')
    expect(after(ids[5] as string)).toBe(before)
  })
})
