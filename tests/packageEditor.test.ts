import { describe, expect, it } from 'vitest'
import { defaultPackage, loadWorld } from '../src/data/package/defaultPackage'
import { applyClubsImport, applyPlayersImport, clubsToCsv, parseClubsCsv, parseCsv, parsePlayersCsv, playersToCsv } from '../src/data/package/edit/csv'
import { commit, createHistory, redo, undo } from '../src/data/package/edit/history'
import { addClub, addCountry, addLeague, addPlayer, emptyPackage, ensurePlayerIds, locateIssue, moveClubToLeague, removeClub, removeLeague, removePlayer, setLinkedMovement, transferPlayer } from '../src/data/package/edit/ops'
import { playerStrength, suggestPlayerData } from '../src/data/package/edit/suggest'
import { validatePackage } from '../src/data/package/validate'
import type { DataPackage } from '../src/data/package/types'

const base = (): DataPackage => {
  let pkg = addCountry(emptyPackage('Teste'), { id: 'Brazil', name: 'Brasil' })
  pkg = addLeague(pkg, 'Brazil', 'Liga Um')
  for (let i = 0; i < 4; i++) pkg = addClub(pkg, pkg.leagues[0]!.id)
  return pkg
}

describe('histórico', () => {
  it('desfaz, refaz e junta edições seguidas da mesma chave', () => {
    let h = createHistory(1)
    h = commit(h, 2, 'a', 1000)
    h = commit(h, 3, 'a', 1500)
    h = commit(h, 4, 'b', 1600)
    expect(h.past).toEqual([1, 3])
    h = undo(h)
    expect(h.present).toBe(3)
    h = undo(h)
    expect(h.present).toBe(1)
    h = redo(h)
    expect(h.present).toBe(3)
    expect(commit(h, 9, 'x', 99999).future).toEqual([])
  })
})

describe('operações do editor', () => {
  it('um pacote montado do zero passa na validação', () => {
    const pkg = base()
    const { report } = validatePackage(pkg, { maxIssues: 500 })
    expect(report.errors).toEqual([])
    expect(pkg.clubs).toHaveLength(4)
    expect(pkg.players.length).toBe(4 * 24)
    expect(() => loadWorld(1, pkg)).not.toThrow()
  })

  it('remover clube solta os jogadores e ajusta o número de times; mover clube troca a contagem das ligas', () => {
    const two = addLeague(base(), 'Brazil', 'Liga Dois')
    const pkg = removeClub(two, two.clubs[0]!.id)
    expect(pkg.leagues[0]!.teams).toBe(3)
    expect(pkg.players.filter((p) => p.club === null)).toHaveLength(24)
    const moved = moveClubToLeague(pkg, pkg.clubs[0]!.id, pkg.leagues[1]!.id)
    expect(moved.leagues.map((l) => l.teams)).toEqual([2, 1])
  })

  it('acesso e rebaixamento andam juntos e a liga só sai vazia', () => {
    let pkg = addLeague(base(), 'Brazil', 'Liga Dois')
    expect(pkg.leagues[0]!.relegation).toBe(pkg.leagues[1]!.promotion)
    pkg = setLinkedMovement(pkg, pkg.leagues[1]!.id, 'promotion', 1)
    expect(pkg.leagues[0]!.relegation).toBe(1)
    expect(removeLeague(pkg, pkg.leagues[0]!.id)).toBe(pkg)
    const removed = removeLeague(pkg, pkg.leagues[1]!.id)
    expect(removed.leagues).toHaveLength(1)
    expect(removed.leagues[0]!.relegation).toBe(0)
  })

  it('cria, transfere e apaga jogadores', () => {
    let pkg = addPlayer(base(), 'players', null, 'ST')
    const index = pkg.players.length - 1
    expect(pkg.players[index]!.club).toBeNull()
    pkg = transferPlayer(pkg, 'players', index, pkg.clubs[1]!.id)
    expect(pkg.players[index]!.club).toBe(pkg.clubs[1]!.id)
    expect(removePlayer(pkg, 'players', index).players).toHaveLength(index)
  })

  it('localiza o problema pelo caminho', () => {
    expect(locateIssue('clubs[3].name')).toEqual({ kind: 'clubs', index: 3, field: 'name' })
    expect(locateIssue('players[12]')).toEqual({ kind: 'players', index: 12 })
    expect(locateIssue('version')).toBeNull()
  })
})

describe('atributos automáticos', () => {
  it('geram o mesmo jogador que o jogo gera ao importar sem atributos', () => {
    const pkg = base()
    const bare = pkg.players[5]!
    const suggestion = suggestPlayerData(pkg, bare)
    const made = loadWorld(1, pkg).players.find((p) => p.id === bare.id)!
    expect(suggestion.attributes).toEqual(made.attributes)
    expect(suggestion.potential).toBe(made.hidden.potential)
    expect(playerStrength(pkg, bare)).toBeGreaterThan(20)
  })
})

describe('planilha (CSV)', () => {
  it('lê ponto e vírgula, vírgula e aspas', () => {
    expect(parseCsv('a;b\r\n"x;1";"y ""q"""\r\n').rows).toEqual([['a', 'b'], ['x;1', 'y "q"']])
    expect(parseCsv('a,b\n1,2').delimiter).toBe(',')
  })

  it('exporta e importa de volta sem mudar nada (pacote padrão, com atributos)', () => {
    const pkg = ensurePlayerIds(defaultPackage(3))
    const clubs = new Set(pkg.clubs.slice(0, 2).map((c) => c.id))
    const parsed = parsePlayersCsv(playersToCsv(pkg, 'players', { clubIds: clubs }), pkg)
    expect(parsed.issues).toEqual([])
    const out = applyPlayersImport(pkg, 'players', parsed)
    expect(out.updated).toBe(parsed.total)
    expect(out.added).toBe(0)
    expect(out.pkg.players).toEqual(pkg.players)
    const clubParsed = parseClubsCsv(clubsToCsv(pkg), pkg)
    expect(clubParsed.issues).toEqual([])
    expect(applyClubsImport(pkg, clubParsed).pkg.clubs).toEqual(pkg.clubs)
  })

  it('mostra os erros por linha e coluna e importa só as linhas boas quando pedido', () => {
    const pkg = base()
    const club = pkg.clubs[0]!.id
    const csv = ['name;birthDate;nationality;position;club;passing', `Ana Silva;03/04/1999;Brazil;st;${club};`, `Beto;1999-02-30;Brazil;ST;${club};`, 'Caio;2000-01-01;Narnia;ST;club-x;', 'Davi;2000-01-01;Brazil;ST;;50'].join('\n')
    const parsed = parsePlayersCsv(csv, pkg)
    expect(parsed.rows.map((r) => r.value.name)).toEqual(['Ana Silva'])
    expect(parsed.rows[0]!.value.birthDate).toBe('1999-04-03')
    expect(parsed.issues.map((i) => [i.line, i.column, i.code])).toEqual([
      [3, 'birthDate', 'bad-date'],
      [4, 'nationality', 'unknown-value'],
      [4, 'club', 'unknown-club'],
      [5, 'finishing', 'attributes-incomplete'],
    ])
    expect(applyPlayersImport(pkg, 'players', parsed).added).toBe(0)
    const partial = applyPlayersImport(pkg, 'players', parsed, { validOnly: true })
    expect(partial.added).toBe(1)
    expect(partial.pkg.players.at(-1)!.id).toMatch(/^player-ed-/)
  })

  it('apaga quem não aparece na planilha só dentro dos clubes dela', () => {
    const pkg = ensurePlayerIds(base())
    const club = pkg.clubs[0]!.id
    const kept = playersToCsv(pkg, 'players', { clubIds: new Set([club]) }).trim().split('\r\n').slice(0, 11).join('\r\n')
    const out = applyPlayersImport(pkg, 'players', parsePlayersCsv(kept, pkg), { removeMissing: true })
    expect(out.removed).toBe(24 - 10)
    expect(out.pkg.players.filter((p) => p.club === pkg.clubs[1]!.id)).toHaveLength(24)
  })
})
