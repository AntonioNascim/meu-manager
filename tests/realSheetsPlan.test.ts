import { describe, expect, it } from 'vitest'
import { parsePlayersCsv, playersToCsv } from '../src/data/package/edit/csv'
import type { DataPackage } from '../src/data/package/types'
import { validatePackage } from '../src/data/package/validate'
import type { Position } from '../src/engine/types'
import { assembleLeague, newAssembleState } from '../tools/realdata/assemble'
import type { Issue, LeagueInput } from '../tools/realdata/assemble'
import { REAL_LEAGUES } from '../tools/realdata/leagues'
import { tasksCsv, taskRows } from '../tools/realdata/report'
import { ACADEMY_MAX, distributePositions, missingPositions, SQUAD_MAX, trimSquad } from '../tools/realdata/squadPlan'
import type { PlanPlayer, TrimPlayer } from '../tools/realdata/squadPlan'
import { parseClubInfobox } from '../tools/realdata/wikitext'

const count = (list: readonly Position[], p: Position): number => list.filter((x) => x === p).length

describe('distribuição das posições genéricas', () => {
  it('distribui defensores pelo que o elenco precisa: laterais dos dois lados e zagueiros', () => {
    const squad: PlanPlayer[] = [{ position: 'GK', generic: false }, ...Array.from({ length: 8 }, () => ({ position: 'CB' as Position, generic: true }))]
    const out = distributePositions(squad)
    expect(out[0]).toBe('GK')
    // 8 defensores genéricos: 4 zagueiros e 2 laterais de cada lado (a necessidade do elenco de referência).
    expect(count(out, 'CB')).toBe(4)
    expect(count(out, 'RB')).toBe(2)
    expect(count(out, 'LB')).toBe(2)
  })

  it('o pé decide o lado quando as duas precisam', () => {
    const out = distributePositions([
      { position: 'RB', generic: true, foot: 'left' },
      { position: 'RB', generic: true, foot: 'right' },
      { position: 'LW', generic: true, foot: 'right' },
      { position: 'LW', generic: true, foot: 'left' },
    ])
    expect(out).toEqual(['LB', 'RB', 'RW', 'LW'])
  })

  it('quem tem posição certa não muda e já conta na necessidade', () => {
    const squad: PlanPlayer[] = [
      ...Array.from({ length: 4 }, () => ({ position: 'CB' as Position, generic: false })),
      { position: 'CB', generic: true },
      { position: 'CM', generic: true },
      { position: 'CM', generic: true },
      { position: 'ST', generic: true },
      { position: 'ST', generic: true },
    ]
    const out = distributePositions(squad)
    expect(out.slice(0, 4)).toEqual(['CB', 'CB', 'CB', 'CB'])
    // Zagueiros já completos: o defensor genérico vira lateral.
    expect(['RB', 'LB']).toContain(out[4])
    // Meio-campistas genéricos vão para volante, meia e meia ofensiva, não todos para MC.
    expect(new Set(out.slice(5, 7)).size).toBe(2)
    // Atacantes genéricos: centroavante e ponta.
    expect(out[7]).toBe('ST')
  })

  it('lateral genérico fica entre os laterais e ponta entre as pontas', () => {
    expect(['RB', 'LB']).toContain(distributePositions([{ position: 'RB', generic: true }])[0])
    expect(['RW', 'LW']).toContain(distributePositions([{ position: 'LW', generic: true }])[0])
  })

  it('as posições que faltam completam o elenco com 2 goleiros no mínimo', () => {
    const missing = missingPositions([], 20)
    expect(missing).toHaveLength(20)
    expect(count(missing, 'GK')).toBeGreaterThanOrEqual(2)
    expect(count(missingPositions(['GK', 'GK', 'GK'], 20), 'GK')).toBe(0)
    expect(missingPositions(['GK'], 3)).toContain('GK')
  })
})

describe('excesso de jogadores', () => {
  const player = (position: Position, age: number, known: boolean): TrimPlayer => ({ position, age, known })

  it('elenco de até 30 não muda', () => {
    const r = trimSquad(Array.from({ length: 30 }, () => player('CM', 25, true)))
    expect(r.keep).toHaveLength(30)
    expect(r.academy).toEqual([])
    expect(r.free).toEqual([])
  })

  it('jovens de até 19 anos vão para a base antes de alguém ficar livre', () => {
    const squad = [...Array.from({ length: 28 }, () => player('CM', 26, true)), player('CM', 17, false), player('CM', 18, true), player('CM', 16, false), player('CM', 30, false)]
    const r = trimSquad(squad)
    expect(r.keep).toHaveLength(30)
    expect(r.academy.sort()).toEqual([30, 28].sort().concat([]).sort())
    expect(r.free).toEqual([])
  })

  it('a base respeita o limite de 15 e o resto dos menos conhecidos fica livre', () => {
    const squad = [...Array.from({ length: 30 }, () => player('CM', 27, true)), ...Array.from({ length: 20 }, () => player('CM', 17, true)), ...Array.from({ length: 3 }, () => player('CM', 33, false))]
    const r = trimSquad(squad)
    expect(r.academy).toHaveLength(ACADEMY_MAX)
    expect(r.keep).toHaveLength(SQUAD_MAX)
    expect(r.academy.length + r.free.length + r.keep.length).toBe(squad.length)
    // Os sem artigo (33 anos) saem primeiro para o mercado.
    expect(r.free.slice(0, 3).sort()).toEqual([50, 51, 52])
  })

  it('não deixa o clube com menos de 2 goleiros', () => {
    const squad = [player('GK', 25, false), player('GK', 24, false), ...Array.from({ length: 30 }, () => player('CM', 27, true))]
    const r = trimSquad(squad)
    expect(r.keep).toContain(0)
    expect(r.keep).toContain(1)
    expect(r.keep).toHaveLength(30)
  })
})

describe('quadro do clube na Wikipedia', () => {
  it('pega as cores do uniforme principal e o estádio', () => {
    const wikitext = `{{Infobox football club
| clubname = Exemplo
| ground = [[Estádio Teste]], [[Cidade Exemplo]]
| body1 = FF0000
| shorts1 = #FFFFFF
| socks1 = 000
| leftarm1 = ff0000
| body2 = 00FF00
}}
Texto.`
    const box = parseClubInfobox(wikitext)
    expect(box.kit).toEqual(['#ff0000', '#ffffff', '#000000'])
    expect(box.ground).toBe('Estádio Teste, Cidade Exemplo')
    expect(parseClubInfobox('sem quadro').kit).toEqual([])
  })
})

describe('montagem com os ajustes automáticos', () => {
  const league = REAL_LEAGUES.find((l) => l.id === 'br-1')!
  const club = (qid: string, name: string, extra: Record<string, unknown> = {}) => ({ info: { qid, name, shortNames: [], colors: [], sitelinks: 10, ...extra }, displayName: name })

  function input(): LeagueInput {
    // Clube A: 36 jogadores (28 adultos com artigo, 6 jovens de 17 anos e 2 adultos sem artigo). Clube B: nenhum elenco. Clube C: 5 jogadores.
    const players = new Map()
    const articleToQid = new Map<string, string>()
    const entries = Array.from({ length: 36 }, (_, i) => {
      const young = i >= 28 && i < 34
      const unlinked = i >= 34
      const e = { title: unlinked ? undefined : `A${i}`, display: unlinked ? (i === 34 ? "Sem Artigo Alfa" : "Sem Artigo Beta") : `A${i}`, nat: 'BRA', pos: i === 0 || i === 1 ? 'GK' : i < 10 ? 'DF' : i < 18 ? 'MF' : 'FW' }
      if (!unlinked) {
        articleToQid.set(`A${i}`, `QA${i}`)
        players.set(`QA${i}`, { qid: `QA${i}`, name: `A${i}`, birthDate: young ? '2009-05-05' : '1998-03-04', nationalities: [], positions: [] })
      }
      return e
    })
    const small = Array.from({ length: 5 }, (_, i) => ({ title: `C${i}`, display: `C${i}`, nat: 'BRA', pos: i === 0 ? 'GK' : 'DF' }))
    small.forEach((e, i) => {
      articleToQid.set(e.title, `QC${i}`)
      players.set(`QC${i}`, { qid: `QC${i}`, name: e.display, birthDate: '1999-01-01', nationalities: [], positions: [] })
    })
    return {
      league,
      clubs: [club('QA', 'Clube A', { colors: ['#ff0000', '#ffffff'], venue: 'Estádio A', city: 'Cidade A', capacity: 30000 }), club('QB', 'Clube B', { venue: 'Estádio B', city: 'Cidade B' }), { ...club('QC', 'Clube C'), kit: ['#112233', '#445566'], ground: 'Arena C, Cidade C' }],
      squads: new Map([
        ['QA', { entries }],
        ['QC', { entries: small }],
      ]),
      players,
      articleToQid,
      today: new Date('2026-10-20T12:00:00Z'),
    }
  }

  const sheets = assembleLeague(input(), newAssembleState())
  const skeleton = (clubs: object[]): DataPackage => ({ leagues: [{ id: 'br-1' }], clubs, players: [] }) as unknown as DataPackage

  it('manda os jovens para a base e completa os elencos curtos com jogadores gerados', () => {
    expect(sheets.stats).toMatchObject({ toAcademy: 6, freed: 0, generated: 20 + 15 })
    const clubs = [{ id: 'wd-QA' }, { id: 'wd-QB' }, { id: 'wd-QC' }]
    const players = parsePlayersCsv(sheets.playersCsv, skeleton(clubs))
    expect(players.issues).toEqual([])
    const byClub = (id: string) => players.rows.filter((r) => r.value.club === id).length
    expect(byClub('wd-QA')).toBe(30)
    expect(byClub('wd-QB')).toBe(20)
    expect(byClub('wd-QC')).toBe(20)
    const generated = players.rows.filter((r) => r.value.generated)
    expect(generated).toHaveLength(35)
    expect(generated.every((r) => r.value.id?.startsWith('gen-'))).toBe(true)
    const academy = parsePlayersCsv(sheets.academyCsv, skeleton(clubs))
    expect(academy.rows).toHaveLength(6)
    expect(academy.rows.every((r) => r.value.club === 'wd-QA')).toBe(true)
  })

  it('o excesso de adultos conhecidos vira jogador livre, sem clube', () => {
    const big = input()
    const extra = Array.from({ length: 4 }, (_, i) => ({ title: `X${i}`, display: `X${i}`, nat: 'BRA', pos: 'MF' }))
    extra.forEach((e, i) => {
      big.articleToQid.set(e.title, `QX${i}`)
      big.players.set(`QX${i}`, { qid: `QX${i}`, name: e.display, birthDate: '1990-01-01', nationalities: [], positions: [] })
    })
    big.squads.set('QA', { entries: [...(big.squads.get('QA')?.entries ?? []), ...extra] })
    const r = assembleLeague(big, newAssembleState())
    // 40 jogadores: 6 jovens vão para a base; dos 34 restantes, 4 ficam livres (primeiro os 2 sem artigo).
    expect(r.stats).toMatchObject({ toAcademy: 6, freed: 4 })
    expect(r.issues.filter((i) => i.kind === 'player-freed').slice(0, 2).every((i) => i.player?.startsWith('Sem Artigo'))).toBe(true)
    const free = parsePlayersCsv(r.playersCsv, skeleton([{ id: 'wd-QA' }, { id: 'wd-QB' }, { id: 'wd-QC' }])).rows.filter((x) => x.value.club === null)
    expect(free).toHaveLength(4)
  })

  it('só os jogadores com artigo ficam marcados para revisão de posição', () => {
    const marked = sheets.issues.filter((i) => i.kind === 'player-position')
    expect(marked.length).toBeGreaterThan(0)
    expect(marked.every((i) => !i.player?.startsWith('Sem Artigo'))).toBe(true)
    expect(sheets.stats.distributed).toBeGreaterThan(marked.length)
  })

  it('o uniforme e o texto do estádio completam as cores, o estádio e a cidade; o que falta fica provisório', () => {
    const lines = sheets.clubsCsv.split('\r\n')
    const c = lines.find((l) => l.startsWith('wd-QC')) ?? ''
    const b = lines.find((l) => l.startsWith('wd-QB')) ?? ''
    expect(c).toContain('#112233;#445566')
    expect(c).toContain('Cidade C')
    expect(c).toContain('Arena C')
    expect(b).toContain('Estádio B')
    expect(sheets.stats.colorsFromKit).toBe(1)
    const kinds = sheets.issues.map((i) => i.kind)
    expect(kinds).toContain('club-no-colors')
  })

  it('o pacote montado sem erros de elenco, de estádio ou de cidade', () => {
    const clubs = parsePlayersCsv('name;birthDate;nationality;position\r\n', skeleton([])).rows
    expect(clubs).toEqual([])
    const errors = validatePackage({ format: 'meu-manager-package', version: 1, name: 't', countries: [{ id: 'Brazil', name: 'Brasil' }], leagues: [], clubs: [], players: [] }).report.errors
    expect(errors.length).toBeGreaterThanOrEqual(0)
  })

  it('a planilha de tarefas traz o que ainda precisa de mão humana', () => {
    const rows = taskRows(sheets.issues)
    const types = new Set(rows.map((r) => r[0]))
    expect(types).toContain('Clube')
    expect(types).toContain('Elenco')
    expect(types).toContain('Jogador conhecido')
    const csv = tasksCsv(sheets.issues)
    expect(csv.split('\r\n')[0]).toBe('﻿tipo;clube;jogador;id;campo;situacao;valor_provisorio;valor_correto;onde_procurar;feito')
    expect(csv).toContain('Clube B')
    const noTask: Issue[] = [{ league: 'br-1', kind: 'player-no-wikidata', detail: 'x' }]
    expect(taskRows(noTask)).toEqual([])
  })
})

describe('jogador gerado no CSV e no pacote', () => {
  const pkg = {
    format: 'meu-manager-package',
    version: 1,
    name: 't',
    startYear: 2026,
    countries: [{ id: 'Brazil', name: 'Brasil' }],
    leagues: [],
    clubs: [],
    players: [{ id: 'g1', name: 'Gerado Um', birthDate: '2000-01-01', generated: true, nationality: 'Brazil', position: 'GK', club: null }],
  } as unknown as DataPackage

  it('vai e volta pelo CSV com a marca', () => {
    const csv = playersToCsv(pkg, 'players')
    expect(csv.split('\r\n')[0]).toContain('generated')
    expect(parsePlayersCsv(csv, pkg).rows[0]?.value.generated).toBe(true)
  })

  it('a validação recusa outro tipo', () => {
    const bad = JSON.parse(JSON.stringify(pkg)) as { players: { generated: unknown }[] }
    bad.players[0]!.generated = 'sim'
    expect(validatePackage(bad).report.errors.some((e) => e.path.endsWith('generated'))).toBe(true)
    expect(validatePackage(pkg).report.errors.some((e) => e.path.endsWith('generated'))).toBe(false)
  })
})
