import 'fake-indexeddb/auto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { defaultPackage, loadWorld, packageFromWorld } from '../src/data/package/defaultPackage'
import { generateRealPlayer } from '../src/data/package/realPlayer'
import { PACKAGE_VERSION } from '../src/data/package/types'
import type { DataPackage, PackageIssueCode, PackagePlayer } from '../src/data/package/types'
import { parsePackage, validatePackage } from '../src/data/package/validate'
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from '../src/engine/config'
import { overallAt, playerOverall } from '../src/engine/overall'
import { ATTRIBUTE_NAMES } from '../src/engine/types'
import { advanceToMatchday, createGame, playPendingAuto } from '../src/store/game'
import { closeSavesDatabase, deletePackage, listPackages, loadPackage, savePackage } from '../src/store/saves'
import { validateGame } from '../src/store/saveFormat'
import { packageIssueText } from '../src/ui/labels'
import { ImportPackage } from '../src/ui/screens/ImportPackage'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const valid = (pkg: DataPackage) => {
  const r = validatePackage(copy(pkg))
  expect(r.report.errors).toEqual([])
  return r.pkg as DataPackage
}

/** O mesmo pacote sem tudo o que o jogo gera sozinho: só os dados que uma fonte real traria. */
function bare(seed: number): DataPackage {
  const pkg = copy(defaultPackage(seed))
  delete pkg.academy
  for (const club of pkg.clubs) delete club.game
  pkg.players = pkg.players.map((p): PackagePlayer => {
    const { id: _id, attributes: _a, potential: _p, hidden: _h, contract: _c, foot: _f, secondaryPositions: _s, ...rest } = p
    return rest
  })
  return pkg
}

describe('pacote de dados: ida e volta', () => {
  it.each([1, 7, 41])('exportar o mundo fictício (semente %i) e importar de volta dá o mesmo mundo', (seed) => {
    const world = generateWorld({ seed })
    const text = JSON.stringify(packageFromWorld(world))
    const parsed = parsePackage(text)
    expect(parsed.report.errors).toEqual([])
    expect(parsed.report.warnings).toEqual([])
    expect(loadWorld(seed, parsed.pkg)).toEqual(world)
    // o caminho padrão do jogo é o mesmo
    expect(loadWorld(seed)).toEqual(world)
  })

  it('o pacote padrão é estável: exportar duas vezes dá o mesmo arquivo', () => {
    expect(JSON.stringify(defaultPackage(5))).toBe(JSON.stringify(defaultPackage(5)))
    const pkg = defaultPackage(5)
    expect(pkg.version).toBe(PACKAGE_VERSION)
    expect(pkg.leagues.map((l) => [l.level, l.teams])).toEqual([[1, 20], [2, 20], [3, 20]])
    expect(pkg.clubs).toHaveLength(60)
  })

  it('o jogo novo nasce do pacote padrão e do pacote do usuário', () => {
    const plain = createGame(9, 'team-imp')
    expect(plain.season.teams).toEqual(loadWorld(9).teams)
    expect(plain.dataPackage).toBeUndefined()
    const pkg = valid(bare(9))
    const custom = createGame(9, 'team-imp', { dataPackage: pkg, dataPackageId: 'pkg-x' })
    expect(custom.dataPackage).toEqual({ id: 'pkg-x', name: pkg.name })
    expect(custom.season.teams).toHaveLength(60)
    expect(validateGame(custom)).toEqual([])
    let g = custom
    for (let i = 0; i < 3; i++) g = playPendingAuto(advanceToMatchday(g))
    expect(g.season.matches.some((m) => m.status === 'finished')).toBe(true)
  })
})

describe('atributos gerados de forma estável', () => {
  const world = generateWorld({ seed: 3 })
  const club = world.teams[0]!
  const spec: PackagePlayer = { name: 'Fulano de Tal', birthDate: '2000-05-10', nationality: 'Brazil', position: 'CM', club: club.id }
  const make = (s: PackagePlayer, c = club) => generateRealPlayer(s, 'player-1', c.id, { startYear: 2026, tier: c.tier as 1 | 2, club: c })

  it('o mesmo jogador gera sempre os mesmos atributos', () => {
    expect(make(spec)).toEqual(make(copy(spec)))
    const other = make({ ...spec, name: 'Beltrano da Silva' })
    expect(other.attributes).not.toEqual(make(spec).attributes)
  })

  it('o que o pacote traz substitui só o seu campo e não muda o resto dos sorteios', () => {
    const base = make(spec)
    const withFoot = make({ ...spec, foot: base.foot === 'left' ? 'right' : 'left' })
    expect(withFoot.attributes).toEqual(base.attributes)
    expect(withFoot.hidden).toEqual(base.hidden)
    const withAttrs = make({ ...spec, attributes: base.attributes })
    expect(withAttrs.hidden.potential).toBe(base.hidden.potential)
    expect(make({ ...spec, potential: 99 }).hidden.potential).toBe(99)
  })

  it('a idade vem da data de nascimento e os atributos ficam na escala do jogo', () => {
    expect(make(spec).age).toBe(25)
    expect(make({ ...spec, birthDate: '2000-01-01' }).age).toBe(26)
    expect(make({ ...spec, birthDate: '2000-01-02' }).age).toBe(25)
    for (const name of ATTRIBUTE_NAMES) {
      const v = make(spec).attributes[name]
      expect(v).toBeGreaterThanOrEqual(ATTRIBUTE_MIN)
      expect(v).toBeLessThanOrEqual(ATTRIBUTE_MAX)
    }
  })

  it('reputação e divisão do clube mudam o nível, na faixa do mundo fictício', () => {
    const strong = { id: 'x1', reputation: 19 }
    const weak = { id: 'x2', reputation: 7 }
    const mean = (c: { id: string; reputation: number }, tier: 1 | 2) => {
      const overalls = Array.from({ length: 60 }, (_, i) => playerOverall(generateRealPlayer({ ...spec, name: `Jogador ${i}`, position: i % 2 ? 'CM' : 'ST' }, `player-${i}`, c.id, { startYear: 2026, tier, club: c })))
      return overalls.reduce((a, b) => a + b, 0) / overalls.length
    }
    expect(mean(strong, 1)).toBeGreaterThan(mean(weak, 1) + 3)
    expect(mean(weak, 1)).toBeGreaterThan(mean({ id: 'x3', reputation: 4 }, 2) + 5)
  })

  it('sem atributos, os titulares ficam nas faixas de força que o jogo usa (A ~55 a 85, B ~40 a 65)', () => {
    const generated = loadWorld(11, valid(bare(11)))
    const fictional = generateWorld({ seed: 11 })
    const startersOverall = (w: typeof generated, tier: number) => {
      const byId = new Map(w.players.map((p) => [p.id, p]))
      return w.teams
        .filter((t) => t.tier === tier)
        .map((t) => {
          const xi = t.tactic.startingXI.map((id, i) => overallAt(byId.get(id)!, byId.get(id)!.position === 'GK' ? 'GK' : byId.get(id)!.position) + 0 * i)
          return xi.reduce((a, b) => a + b, 0) / xi.length
        })
    }
    for (const tier of [1, 2] as const) {
      const a = startersOverall(generated, tier)
      const b = startersOverall(fictional, tier)
      const meanA = a.reduce((x, y) => x + y, 0) / a.length
      const meanB = b.reduce((x, y) => x + y, 0) / b.length
      expect(Math.abs(meanA - meanB)).toBeLessThan(2.5)
      expect(Math.min(...a)).toBeGreaterThan(tier === 1 ? 52 : 36)
      expect(Math.max(...a)).toBeLessThan(tier === 1 ? 86 : 68)
    }
    const stars = generated.players.filter((p) => playerOverall(p) >= 90).length
    expect(stars).toBeLessThanOrEqual(8)
  })

  it('o mundo gerado de um pacote sem extras também é estável e completo', () => {
    const a = loadWorld(11, valid(bare(11)))
    const b = loadWorld(11, valid(bare(11)))
    expect(a).toEqual(b)
    expect(a.teams.every((t) => t.squad.length >= 18 && t.tactic.startingXI.length === 11)).toBe(true)
    expect(new Set(a.players.map((p) => p.id)).size).toBe(a.players.length)
    expect(a.academy.length).toBeGreaterThan(200)
    // outra semente muda só a base, nunca os jogadores
    const c = loadWorld(12, valid(bare(11)))
    expect(c.players).toEqual(a.players)
  })
})

describe('validação com mensagens claras', () => {
  const good = defaultPackage(2)
  const issues = (pkg: unknown) => validatePackage(pkg).report.errors.map((e) => e.code)

  it('aceita o pacote padrão', () => {
    expect(validatePackage(copy(good)).report.errors).toEqual([])
  })

  it('arquivo que não é JSON, formato errado, versão nova', () => {
    expect(parsePackage('{ isso não é json').report.errors[0]?.code).toBe('not-json')
    expect(issues([1, 2])).toEqual(['not-object'])
    expect(issues({ ...copy(good), format: 'outra-coisa' })).toEqual(['wrong-format'])
    expect(issues({ ...copy(good), version: PACKAGE_VERSION + 1 })).toEqual(['newer-version'])
  })

  it('campos faltando', () => {
    const noName = copy(good)
    delete (noName.clubs[3] as Partial<DataPackage['clubs'][number]>).name
    const r = validatePackage(noName).report.errors
    expect(r).toEqual([{ code: 'missing-field', path: 'clubs[3].name', detail: 'name' }])
    expect(packageIssueText(r[0]!)).toBe('Falta o campo "name" em clubs[3].name.')
    const noPos = copy(good)
    delete (noPos.players[0] as Partial<PackagePlayer>).position
    expect(issues(noPos)).toContain('missing-field')
    const noLeagues = copy(good) as Partial<DataPackage>
    delete noLeagues.leagues
    expect(issues(noLeagues)).toContain('missing-field')
  })

  it('clube sem jogadores e elenco fora de 18 a 30', () => {
    const empty = copy(good)
    const club = empty.clubs[5]!
    empty.players = empty.players.filter((p) => p.club !== club.id)
    const r = validatePackage(empty).report.errors
    expect(r.map((e) => e.code)).toContain('club-without-players')
    expect(packageIssueText(r.find((e) => e.code === 'club-without-players')!)).toContain(`"${club.id}"`)
    const small = copy(good)
    const victim = small.clubs[6]!.id
    let kept = 0
    small.players = small.players.filter((p) => p.club !== victim || kept++ < 10)
    expect(issues(small)).toContain('club-squad-size')
    const noKeeper = copy(good)
    const target = noKeeper.clubs[7]!.id
    noKeeper.players = noKeeper.players.map((p) => (p.club === target && p.position === 'GK' ? { ...p, position: 'CB' as const } : p))
    expect(issues(noKeeper)).toContain('club-no-goalkeeper')
  })

  it('liga com número errado de times', () => {
    const wrong = copy(good)
    wrong.leagues[0]!.teams = 19
    const r = validatePackage(wrong).report.errors
    expect(r.map((e) => e.code)).toContain('league-team-count')
    expect(packageIssueText(r.find((e) => e.code === 'league-team-count')!)).toBe('A liga em leagues[0] declara 19 times, mas o pacote tem 20 clubes nela.')
    // divisão com 18 clubes de verdade (e 18 declarados): vale, desde que o número seja par
    const small = copy(good)
    const drop = small.clubs.filter((c) => c.league === 'br-2').slice(0, 2).map((c) => c.id)
    small.clubs = small.clubs.filter((c) => !drop.includes(c.id))
    small.players = small.players.filter((p) => !drop.includes(p.club as string))
    small.academy = small.academy!.filter((p) => !drop.includes(p.club as string))
    small.leagues[1]!.teams = 18
    expect(issues(small)).toEqual([])
    small.leagues[1]!.teams = 17
    expect(issues(small)).toContain('league-size-unsupported')
  })

  it('um país com mais de 3 divisões é recusado com aviso', () => {
    const many = copy(good)
    many.leagues.push({ id: 'br-4', name: 'Série D', country: 'Brazil', level: 4, teams: 20, promotion: 4, relegation: 0 })
    const r = validatePackage(many).report.errors
    expect(r.map((e) => e.code)).toContain('unsupported-leagues')
    expect(packageIssueText(r.find((e) => e.code === 'unsupported-leagues')!)).toContain('de 1 a 3 divisões')
  })

  it('valores inválidos: id repetido, nacionalidade, data, cor, referência, escala', () => {
    const bad = copy(good)
    bad.clubs[1]!.id = bad.clubs[0]!.id
    bad.players[0]!.nationality = 'Atlantis' as never
    bad.players[1]!.birthDate = '2001-02-30'
    bad.clubs[2]!.colors = ['vermelho', '#fff000']
    bad.players[2]!.club = 'team-nao-existe'
    bad.clubs[3]!.reputation = 25
    bad.players[3]!.attributes = { ...bad.players[3]!.attributes!, passing: 150 }
    const codes = issues(bad)
    for (const code of ['duplicate-id', 'unknown-value', 'bad-date', 'bad-color', 'unknown-reference', 'out-of-range'] as PackageIssueCode[]) expect(codes).toContain(code)
  })

  it('toda mensagem tem texto em português', () => {
    const all: PackageIssueCode[] = ['not-json', 'not-object', 'wrong-format', 'newer-version', 'missing-field', 'wrong-type', 'out-of-range', 'duplicate-id', 'unknown-reference', 'unknown-value', 'bad-date', 'bad-color', 'club-without-players', 'club-squad-size', 'club-no-goalkeeper', 'league-team-count', 'league-size-unsupported', 'league-promotion', 'unsupported-leagues', 'tiebreakers-unsupported']
    for (const code of all) expect(packageIssueText({ code, path: 'x', detail: 'y', expected: 'z' }).length).toBeGreaterThan(10)
  })

  it('critério de desempate diferente só avisa', () => {
    const other = copy(good)
    other.leagues[0]!.tiebreakers = ['goal-difference', 'wins']
    const r = validatePackage(other).report
    expect(r.errors).toEqual([])
    expect(r.warnings[0]?.code).toBe('tiebreakers-unsupported')
  })
})

describe('pacote guardado só no navegador', () => {
  it('salva, lista, abre e apaga; o mesmo conteúdo vale um só', async () => {
    const pkg = valid(bare(4))
    const a = await savePackage(pkg)
    const b = await savePackage(pkg)
    expect(b.id).toBe(a.id)
    const list = await listPackages()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: pkg.name, clubs: 60 })
    expect('data' in list[0]!).toBe(false)
    expect((await loadPackage(a.id))?.data.players).toHaveLength(pkg.players.length)
    await deletePackage(a.id)
    expect(await listPackages()).toHaveLength(0)
    closeSavesDatabase()
  })

  it('a tela de importação mostra o botão e o texto de privacidade', () => {
    const out = renderToStaticMarkup(createElement(ImportPackage, { onBack: () => {}, onUse: () => {} }))
    expect(out).toContain('Pacote de dados')
    expect(out).toContain('Escolher arquivo')
    expect(out).toContain('só neste navegador')
  })
})
