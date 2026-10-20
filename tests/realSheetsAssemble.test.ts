import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseClubsCsv, parsePlayersCsv } from '../src/data/package/edit/csv'
import type { DataPackage } from '../src/data/package/types'
import { assembleLeague, newAssembleState, pickAbbreviation, pickColors, playerId, provisionalReputation } from '../tools/realdata/assemble'
import type { ClubSource, LeagueInput } from '../tools/realdata/assemble'
import { Fetcher } from '../tools/realdata/http'
import { REAL_LEAGUES, seasonTitleCandidates, seasonYear } from '../tools/realdata/leagues'
import { buildReport, reviewCsv } from '../tools/realdata/report'
import { aggregateClubRows, aggregatePlayerRows } from '../tools/realdata/wikidata'
import type { PlayerInfo } from '../tools/realdata/wikidata'

const league = REAL_LEAGUES.find((l) => l.id === 'br-1')!

const club = (qid: string, name: string, extra: Partial<ClubSource['info']> = {}): ClubSource => ({
  info: { qid, name, shortNames: [], colors: ['#ffffff', '#ff0000'], sitelinks: 50, venue: 'Estádio', capacity: 40_000, city: 'Cidade', ...extra },
  displayName: name,
})

const wd = (qid: string, extra: Partial<PlayerInfo> = {}): PlayerInfo => ({ qid, name: `Jogador ${qid}`, birthDate: '2000-05-17', nationalities: ['Brazil'], positions: [], ...extra })

function input(): LeagueInput {
  const squadA = Array.from({ length: 20 }, (_, i) => ({ title: `Player A${i}`, display: `Player A${i}`, nat: 'BRA', pos: i === 0 ? 'GK' : i < 8 ? 'DF' : i < 14 ? 'MF' : 'FW' }))
  const players = new Map<string, PlayerInfo>()
  const articleToQid = new Map<string, string>()
  squadA.forEach((e, i) => {
    articleToQid.set(e.title, `Q${100 + i}`)
    players.set(`Q${100 + i}`, wd(`Q${100 + i}`))
  })
  // Sem data de nascimento e sem artigo.
  players.set('Q100', wd('Q100', { birthDate: undefined, birthYear: 1999 }))
  return {
    league,
    clubs: [club('Q1', 'Flamengo', { sitelinks: 90 }), club('Q2', 'Remo', { sitelinks: 20, colors: [] })],
    squads: new Map([
      ['Q1', { entries: [...squadA, { display: 'Fulano Sem Link', nat: 'ARG', pos: 'FW' }] }],
      ['Q2', { entries: [{ title: 'Player A3', display: 'Player A3', pos: 'DF' }] }],
    ]),
    players,
    articleToQid,
  }
}

describe('planilhas dos elencos reais', () => {
  const sheets = assembleLeague(input(), newAssembleState())
  const pkg = { leagues: [{ id: 'br-1' }], clubs: [], players: [] } as unknown as DataPackage
  const clubs = parseClubsCsv(sheets.clubsCsv, pkg)

  it('a planilha de clubes é aceita pelo editor', () => {
    expect(clubs.issues).toEqual([])
    expect(clubs.rows.map((r) => r.value.name)).toEqual(['Flamengo', 'Remo'])
    const [flamengo, remo] = clubs.rows.map((r) => r.value)
    expect(flamengo?.id).toBe('wd-Q1')
    expect(flamengo?.league).toBe('br-1')
    expect(flamengo?.reputation).toBeGreaterThan(remo?.reputation ?? 99)
    expect(flamengo?.colors).toEqual(['#ff0000', '#ffffff'])
    expect(new Set(clubs.rows.map((r) => r.value.abbreviation)).size).toBe(2)
  })

  it('a planilha de jogadores é aceita inteira pelo editor, com as datas ausentes estimadas e marcadas', () => {
    const withClubs = { ...pkg, clubs: clubs.rows.map((r) => r.value) } as DataPackage
    const parsed = parsePlayersCsv(sheets.playersCsv, withClubs)
    expect(parsed.total).toBe(41)
    expect(parsed.issues).toEqual([])
    // Os atributos ficam em branco para o jogo gerar.
    const first = parsed.rows[0]?.value
    expect(first?.attributes).toBeUndefined()
    expect(first?.potential).toBeUndefined()
    expect(first?.club).toBe('wd-Q1')
    const estimated = parsed.rows.filter((r) => r.value.birthEstimated)
    expect(estimated.map((r) => r.value.name).sort()).toEqual(['Fulano Sem Link', 'Jogador Q100'])
    expect(parsed.rows.filter((r) => !r.value.birthEstimated && !r.value.generated).every((r) => r.value.birthDate === '2000-05-17')).toBe(true)
  })

  it('a data estimada pelo ano é 1º de julho; a sem ano usa a média de idade do elenco', () => {
    const rows = parsePlayersCsv(sheets.playersCsv, { ...pkg, clubs: clubs.rows.map((r) => r.value) } as DataPackage).rows.map((r) => r.value)
    expect(rows.find((p) => p.name === 'Jogador Q100')?.birthDate).toBe('1999-07-01')
    const age = new Date().getFullYear() - Number(rows.find((p) => p.name === 'Fulano Sem Link')?.birthDate.slice(0, 4))
    // Elenco de 2000-05-17: a média é de 26 anos e a data estimada fica a até 3 anos dela.
    expect(Math.abs(age - (new Date().getFullYear() - 2000))).toBeLessThanOrEqual(3)
  })

  it('usa o país e o setor da tabela quando o jogador não tem artigo', () => {
    const line = sheets.playersCsv.split('\r\n').find((l) => l.includes('Fulano Sem Link')) ?? ''
    const cells = line.split(';')
    expect(cells[5]).toBe('Argentina')
    expect(cells[6]).toBe('ST')
    expect(cells[4]).toBe('sim')
    expect(cells[0]).toMatch(/^wp-Q1-/)
  })

  it('anota o que ficou faltando', () => {
    const kinds = sheets.issues.map((i) => i.kind)
    expect(kinds).toContain('club-count')
    expect(kinds).toContain('club-no-colors')
    expect(kinds).toContain('squad-generated')
    expect(kinds).toContain('player-generated')
    expect(kinds).toContain('player-birth-imprecise')
    expect(kinds).toContain('player-no-birthdate')
    expect(kinds).toContain('player-no-wikidata')
    expect(kinds).toContain('player-position')
    expect(kinds).toContain('player-duplicate')
    expect(sheets.stats).toMatchObject({ clubs: 2, expected: 20, players: 41, smallest: 20 })
  })

  it('o relatório e a lista de revisão trazem os casos', () => {
    const report = buildReport([sheets], { date: '2026-10-20', articles: [], seasons: [], local: [], network: 3, cached: 1 })
    expect(report).toContain('completado por jogadores gerados')
    expect(report).toContain('Remo')
    const review = reviewCsv(sheets.issues)
    expect(review.split('\r\n').length).toBeGreaterThan(sheets.issues.length)
    expect(review).toContain('Fulano Sem Link')
  })

  it('siglas e ids não se repetem entre ligas', () => {
    const state = newAssembleState()
    const a = assembleLeague(input(), state)
    const b = assembleLeague(input(), state)
    expect(a.issues.some((i) => i.kind === 'player-duplicate')).toBe(true)
    // Segunda passada: todos os jogadores já existem e os clubes ganham siglas diferentes.
    expect(b.issues.filter((i) => i.kind === 'player-duplicate').length).toBeGreaterThan(0)
    const abbreviations = [...a.clubsCsv.split('\r\n'), ...b.clubsCsv.split('\r\n')].filter((l) => l.startsWith('wd-')).map((l) => l.split(';')[2])
    expect(new Set(abbreviations).size).toBe(abbreviations.length)
  })
})

describe('peças da montagem', () => {
  it('a sigla vem do Wikidata, do nome ou de outra combinação, sem repetir', () => {
    const taken = new Set<string>()
    expect(pickAbbreviation('Bahia', ['ECB'], taken)).toBe('ECB')
    expect(pickAbbreviation('Flamengo', [], taken)).toBe('FLA')
    expect(pickAbbreviation('Clube de Regatas do Flamengo', [], taken)).toBe('REG')
    expect(pickAbbreviation('Manchester United', [], taken)).toBe('MAN')
    expect(pickAbbreviation('Manchester City', [], taken)).toBe('MCI')
    expect(pickAbbreviation('Real Madrid', [], taken)).toBe('REA')
  })

  it('escolhe primeiro as cores fortes e depois preto e branco', () => {
    expect(pickColors(['#ffffff', '#000000', '#ff0000'])).toEqual(['#ff0000', '#000000'])
    expect(pickColors(['#ffffff', '#00ff00'])).toEqual(['#00ff00', '#ffffff'])
    expect(pickColors([])).toEqual([])
  })

  it('a reputação provisória desce com a fama e fica de 1 a 20', () => {
    const values = Array.from({ length: 20 }, (_, i) => provisionalReputation(i, 20, league))
    expect(values[0]).toBe(league.spec.repTop)
    expect(values[19]).toBe(league.spec.repBottom)
    for (let i = 1; i < 20; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1] as number)
  })

  it('id estável do jogador: item do Wikidata, ou clube e nome', () => {
    expect(playerId('Q5', 'Q1', 'Fulano')).toBe('wd-Q5')
    expect(playerId(undefined, 'Q1', 'João da Silva')).toBe('wp-Q1-joaodasilva')
  })

  it('temporada: ano civil no Brasil e agosto a maio na Europa', () => {
    const today = new Date('2026-10-20T12:00:00')
    expect(seasonYear('year', today)).toBe(2026)
    expect(seasonYear('split', today)).toBe(2026)
    expect(seasonYear('split', new Date('2027-03-01T12:00:00'))).toBe(2026)
    const en = REAL_LEAGUES.find((l) => l.id === 'en-1')!
    expect(seasonTitleCandidates(en, today).map((c) => c.title)).toEqual(['2026–27 Premier League', '2025–26 Premier League'])
    expect(seasonTitleCandidates(league, today)[0]).toEqual({ title: '2026 Campeonato Brasileiro Série A', previous: false })
  })

  it('as ligas de elite usam clubes fixos e as demais um artigo de temporada', () => {
    for (const l of REAL_LEAGUES) expect(Boolean(l.fixedClubs) !== (l.seasonTitles.length > 0)).toBe(true)
    expect(REAL_LEAGUES.find((l) => l.id === 'oc-1')?.fixedClubs).toHaveLength(4)
    expect(REAL_LEAGUES).toHaveLength(21)
  })
})

describe('linhas do Wikidata', () => {
  it('capacidade atual: a mais recente com data', () => {
    const uri = (q: string) => `http://www.wikidata.org/entity/${q}`
    const clubs = aggregateClubRows([
      { c: uri('Q1'), name: 'São Paulo', sl: '95', venueName: 'Morumbi', cap: '120000', capWhen: '1960-01-01T00:00:00Z', hex: 'FF0000' },
      { c: uri('Q1'), name: 'São Paulo', sl: '95', venueName: 'Morumbi', cap: '71200', capWhen: '2020-01-01T00:00:00Z', hex: 'ffffff', short: 'SAO', hqName: 'São Paulo' },
    ])
    const info = clubs.get('Q1')
    expect(info).toMatchObject({ venue: 'Morumbi', capacity: 71_200, city: 'São Paulo', shortNames: ['SAO'], sitelinks: 95 })
    expect(info?.colors).toEqual(['#ff0000', '#ffffff'])
  })

  it('só aceita data de nascimento com dia, mês e ano', () => {
    const uri = (q: string) => `http://www.wikidata.org/entity/${q}`
    const players = aggregatePlayerRows([
      { p: uri('Q1'), name: 'Dia Completo', birth: '1999-02-03T00:00:00Z', prec: '11', natn: 'Brazil', posn: 'goalkeeper', footn: 'left foot' },
      { p: uri('Q2'), name: 'Só O Ano', birth: '1999-01-01T00:00:00Z', prec: '9' },
      { p: uri('Q3'), name: 'Q3' },
    ])
    expect(players.get('Q1')).toMatchObject({ birthDate: '1999-02-03', foot: 'left', positions: ['goalkeeper'] })
    expect(players.get('Q2')).toMatchObject({ birthYear: 1999 })
    expect(players.get('Q2')?.birthDate).toBeUndefined()
    expect(players.get('Q3')?.name).toBeUndefined()
  })
})

describe('acesso à rede', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const fetcher = (impl: typeof fetch, refresh = false): Fetcher => {
    const dir = mkdtempSync(join(tmpdir(), 'mm-fetch-'))
    dirs.push(dir)
    return new Fetcher({ userAgent: 'teste', cacheDir: dir, refresh, pauseMs: 0, retryBaseMs: 1, fetchImpl: impl })
  }
  const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })

  it('identifica o script, guarda no cache e não repete a consulta', async () => {
    let calls = 0
    let agent = ''
    const f = fetcher(async (_url, init) => {
      calls++
      agent = (init?.headers as Record<string, string>)['User-Agent'] ?? ''
      return ok({ n: calls })
    })
    expect(await f.getJson('https://exemplo.test/a')).toEqual({ n: 1 })
    expect(await f.getJson('https://exemplo.test/a')).toEqual({ n: 1 })
    expect(calls).toBe(1)
    expect(agent).toBe('teste')
    expect(f.stats).toEqual({ network: 1, cached: 1 })
  })

  it('espera e tenta de novo quando o servidor pede (429)', async () => {
    let calls = 0
    const f = fetcher(async () => (++calls < 3 ? new Response('devagar', { status: 429, headers: { 'retry-after': '0' } }) : ok({ done: true })))
    expect(await f.getJson('https://exemplo.test/b')).toEqual({ done: true })
    expect(calls).toBe(3)
  })

  it('falha com mensagem clara em erro definitivo', async () => {
    const f = fetcher(async () => new Response('não existe', { status: 404 }))
    await expect(f.getJson('https://exemplo.test/c')).rejects.toThrow(/HTTP 404/)
  })

  it('com atualizar ignora o cache', async () => {
    let calls = 0
    const impl = async () => ok({ n: ++calls })
    const dir = mkdtempSync(join(tmpdir(), 'mm-fetch-'))
    dirs.push(dir)
    const first = new Fetcher({ userAgent: 'teste', cacheDir: dir, refresh: false, pauseMs: 0, fetchImpl: impl })
    const again = new Fetcher({ userAgent: 'teste', cacheDir: dir, refresh: true, pauseMs: 0, fetchImpl: impl })
    await first.getJson('https://exemplo.test/d')
    expect(await again.getJson('https://exemplo.test/d')).toEqual({ n: 2 })
  })
})
