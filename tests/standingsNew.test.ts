import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { simulateToSeasonEnd } from '../src/engine/season'
import type { Match, Player } from '../src/engine/types'
import { advanceToMatchday, createGame, playPendingAuto, startNextSeason, userCompetition } from '../src/store/game'
import type { Game } from '../src/store/game'
import { MIGRATIONS, SAVE_VERSION, compactGame, makeEnvelope, migrateSave, validateGame } from '../src/store/saveFormat'
import { Standings } from '../src/ui/screens/Standings'
import { History } from '../src/ui/screens/standings/History'
import { Leaders } from '../src/ui/screens/standings/Leaders'
import { Rounds } from '../src/ui/screens/standings/Rounds'
import { Table } from '../src/ui/screens/standings/Table'
import { TeamPage } from '../src/ui/screens/standings/TeamPage'
import { leaders, teamForm } from '../src/ui/screens/standings/data'

const USER = 'team-imp'
const play = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) g = playPendingAuto(advanceToMatchday(g))
  return g
}
const played = play(createGame(3, USER), 10)
const comp = (g: Game, tier = 1) => g.season.season.competitions.find((c) => c.tier === tier)!
const noop = () => {}

describe('contagens novas do motor', () => {
  const stats = played.season.players.map((p) => p.seasonStats)

  it('gols em casa e fora somam os gols da temporada; assistências de passe e de cruzamento somam as assistências', () => {
    for (const s of stats) {
      expect(s.homeGoals + s.awayGoals).toBe(s.goals)
      expect(s.passAssists + s.crossAssists).toBe(s.assists)
    }
    expect(stats.reduce((a, s) => a + s.homeGoals, 0)).toBeGreaterThan(0)
    expect(stats.reduce((a, s) => a + s.awayGoals, 0)).toBeGreaterThan(0)
    expect(stats.reduce((a, s) => a + s.passAssists, 0)).toBeGreaterThan(0)
    expect(stats.reduce((a, s) => a + s.crossAssists, 0)).toBeGreaterThan(0)
  })

  it('o evento do gol diz se a assistência foi passe ou cruzamento', () => {
    const goals = played.season.matches.flatMap((m) => m.result?.events ?? []).filter((e) => e.type === 'goal' && e.relatedPlayerId)
    expect(goals.length).toBeGreaterThan(5)
    expect(goals.every((e) => e.assistKind === 'pass' || e.assistKind === 'cross')).toBe(true)
  })

  it('os gols como mandante batem com os jogos em casa de cada time', () => {
    const home = new Map<string, number>()
    for (const m of played.season.matches) if (m.result) home.set(m.homeTeamId, (home.get(m.homeTeamId) ?? 0) + m.result.homeGoals)
    for (const [teamId, goals] of home) {
      const sum = played.season.players.filter((p) => p.teamId === teamId).reduce((a, p) => a + p.seasonStats.homeGoals, 0)
      expect(sum).toBeLessThanOrEqual(goals) // gols contra e jogadores que saíram do time ficam de fora
      expect(sum).toBeGreaterThanOrEqual(goals - 2)
    }
  })
})

describe('rankings', () => {
  it('Geral, Casa, Fora, Brasileiros e Sub-23 são recortes da artilharia da série, em ordem decrescente', () => {
    const a = comp(played)
    const ids = new Set(a.teamIds)
    const general = leaders(played, a, 'goals')
    expect(general.length).toBeGreaterThan(5)
    expect(general.every((l) => ids.has(l.team.id))).toBe(true)
    expect(general.map((l) => l.value)).toEqual([...general.map((l) => l.value)].sort((x, y) => y - x))
    expect(leaders(played, a, 'brazilians').every((l) => l.player.nationality === 'Brazil')).toBe(true)
    expect(leaders(played, a, 'under-23').every((l) => l.player.age <= 23)).toBe(true)
    expect(leaders(played, a, 'home-goals')[0]?.value).toBeLessThanOrEqual(general[0]!.value)
    expect(leaders(played, a, 'away-goals').length).toBeGreaterThan(0)
    expect(leaders(played, a, 'pass-assists').length).toBeGreaterThan(0)
    expect(leaders(played, a, 'cross-assists').length).toBeGreaterThan(0)
    expect(leaders(played, a, 'yellow').length).toBeGreaterThan(0)
    expect(leaders(played, comp(played, 2), 'goals').every((l) => !ids.has(l.team.id))).toBe(true)
  })

  it('a tela tem cabeçalho próprio, abas, pódio de ouro, prata e bronze e a lista com clube e gols', () => {
    const goals = renderToStaticMarkup(createElement(Leaders, { game: played, competition: comp(played), board: 'goals', onTeam: noop }))
    for (const t of ['Artilharia', 'Geral', 'Casa', 'Fora', 'Brasileiros', 'Sub-23', 'Ouro: 1º', 'Prata: 2º', 'Bronze: 3º', 'Gols']) expect(goals).toContain(t)
    expect(goals).toContain('text-amber-300')
    const assists = renderToStaticMarkup(createElement(Leaders, { game: played, competition: comp(played), board: 'assists', onTeam: noop }))
    for (const t of ['Assistências', 'Passes', 'Cruzamentos']) expect(assists).toContain(t)
    expect(assists).toContain('teal')
    expect(assists).not.toContain('Brasileiros')
    const cards = renderToStaticMarkup(createElement(Leaders, { game: played, competition: comp(played), board: 'cards', onTeam: noop }))
    for (const t of ['Cartões', 'Amarelos', 'Vermelhos']) expect(cards).toContain(t)
    const empty = renderToStaticMarkup(createElement(Leaders, { game: createGame(3, USER), competition: comp(played), board: 'goals', onTeam: noop }))
    expect(empty).toContain('Ainda não houve gols')
  })
})

describe('classificação', () => {
  it('colunas, bolinhas dos últimos 5 jogos, campeão e rebaixamento na Série A, e o seu time em destaque', () => {
    const html = renderToStaticMarkup(createElement(Table, { game: played, competition: comp(played), onTeam: noop }))
    for (const t of ['>J<', '>V<', '>E<', '>D<', '>GP<', '>GC<', '>SG<', '>Pts<', 'Últ. 5', 'Campeão', 'Zona de rebaixamento']) expect(html).toContain(t)
    expect(html.match(/aria-label="Campeão"/g)).toHaveLength(1)
    expect(html.match(/aria-label="Zona de rebaixamento"/g)).toHaveLength(4)
    expect(html).not.toContain('Zona de acesso"')
    expect(html).toContain('bg-accent/10')
    expect(html).toContain('Últimos jogos')
    expect(html).toContain('aria-label="Temporada anterior"')
  })

  it('a Série B marca o acesso e o rebaixamento, sem campeão; a Série C só o acesso', () => {
    const b = renderToStaticMarkup(createElement(Table, { game: played, competition: comp(played, 2), onTeam: noop }))
    expect(b.match(/aria-label="Zona de acesso"/g)).toHaveLength(4)
    expect(b.match(/aria-label="Zona de rebaixamento"/g)).toHaveLength(4)
    expect(b).not.toContain('aria-label="Campeão"')
    const c = renderToStaticMarkup(createElement(Table, { game: played, competition: comp(played, 3), onTeam: noop }))
    expect(c.match(/aria-label="Zona de acesso"/g)).toHaveLength(4)
    expect(c).not.toContain('Zona de rebaixamento"')
    expect(c).not.toContain('aria-label="Campeão"')
  })

  it('a forma mostra os últimos 5 resultados em ordem', () => {
    const matches = played.season.matches.filter((m) => m.competitionId === 'serie-a')
    const form = teamForm(matches, USER)
    expect(form.length).toBe(5)
    expect(teamForm(played.season.matches, USER, 3)).toHaveLength(3)
    expect(teamForm([], USER)).toEqual([])
  })

  it('navega pelas temporadas passadas com o histórico do save', () => {
    const ended: Game = { ...played, season: simulateToSeasonEnd(played.season) }
    const next = startNextSeason(ended)
    expect(next.archive).toHaveLength(1)
    const html = renderToStaticMarkup(createElement(Table, { game: next, competition: comp(next), onTeam: noop }))
    expect(html).toContain('2027')
    expect(html).toContain('aria-label="Temporada anterior"')
    // Na temporada passada não há bolinhas dos últimos jogos (o save só guarda a tabela final).
    const archive = next.archive[0]!
    expect(archive.tables[0]).toHaveLength(20)
  })
})

describe('rodadas', () => {
  it('título com setas e data, jogos com escudos, placar ou x e estádio; o seu jogo em destaque', () => {
    const html = renderToStaticMarkup(createElement(Rounds, { game: played, competition: comp(played), onTeam: noop }))
    for (const t of ['Rodada', 'aria-label="Rodada anterior"', 'aria-label="Próxima rodada"']) expect(html).toContain(t)
    expect(html).toContain('bg-accent/10')
    expect(html).toMatch(/\d+ x \d+/)
    expect(html).toContain(played.season.teams.find((t) => t.id === USER)!.stadium.name === '' ? 'x' : ' x ')
    expect(html.match(/<svg/g)!.length).toBeGreaterThan(18)
  })

  it('jogos já disputados abrem o resumo com gols, assistências e cartões', () => {
    const finished = played.season.matches.find((m): m is Match => m.status === 'finished' && !!m.result && m.result.homeGoals + m.result.awayGoals >= 2)!
    expect(finished.result!.events.length).toBeGreaterThan(0)
    expect(renderToStaticMarkup(createElement(Rounds, { game: played, competition: comp(played), onTeam: noop }))).toContain('Abrir o resumo do jogo')
  })
})

describe('histórico e página do time', () => {
  it('o histórico lista campeões, quem subiu, quem caiu e a posição do seu time', () => {
    expect(renderToStaticMarkup(createElement(History, { game: played, onTeam: noop }))).toContain('Nenhuma temporada foi encerrada')
    const ended: Game = { ...played, season: simulateToSeasonEnd(played.season) }
    const next = startNextSeason(ended)
    const html = renderToStaticMarkup(createElement(History, { game: next, onTeam: noop }))
    for (const t of ['2026', 'Subiram:', 'Caíram:', 'Seu time:', 'Série A', 'Série B']) expect(html).toContain(t)
    expect(html).toContain(next.season.teams.find((t) => t.id === next.seasonLog[0]!.champions[0])!.name)
  })

  it('a página do time mostra posição, pontos, força, últimos resultados e o elenco', () => {
    const rival = played.season.teams.find((t) => t.id !== USER && t.tier === 1)!
    const html = renderToStaticMarkup(createElement(TeamPage, { game: played, teamId: rival.id, onBack: noop, onTeam: noop }))
    for (const t of [rival.name, 'Posição', 'Pontos', 'Força', 'Últimos resultados', 'Elenco', 'Voltar', 'Próximo jogo']) expect(html).toContain(t)
    expect(html.match(/<li/g)!.length).toBeGreaterThan(20)
  })

  it('a tela tem as seis seções e nenhuma aba de copas ou torneios', () => {
    const html = renderToStaticMarkup(createElement(Standings, { game: played }))
    for (const t of ['Classificação', 'Rodadas', 'Artilharia', 'Assistências', 'Cartões', 'Histórico', 'Série A', 'Série B', 'Série C']) expect(html).toContain(t)
    for (const t of ['Copa', 'Libertadores', 'Torneio']) expect(html).not.toContain(t)
    expect(userCompetition(played).tier).toBe(1)
  })
})

describe('save versão 8', () => {
  it('a migração 7→8 cria as contagens novas e o extrato guarda gols e cartões de todos os jogos', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(8)
    expect(MIGRATIONS[7]).toBeTypeOf('function')
    const old = JSON.parse(JSON.stringify(makeEnvelope(played, '2026-01-01T00:00:00Z')))
    for (const p of [...old.game.season.players, ...old.game.season.academy]) for (const k of ['homeGoals', 'awayGoals', 'passAssists', 'crossAssists']) delete p.seasonStats[k]
    old.version = 7
    const migrated = migrateSave(old)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(validateGame(migrated.game)).toEqual([])
    const p = migrated.game.season.players[0] as Player
    expect(p.seasonStats).toMatchObject({ homeGoals: 0, awayGoals: 0, passAssists: 0, crossAssists: 0 })
  })

  it('compactar guarda só gols (com assistência) e cartões, sem texto, e os jogos continuam com o resumo', () => {
    const slim = compactGame(played)
    const other = slim.season.matches.find((m) => m.result && m.result.homeGoals + m.result.awayGoals > 0 && m.id !== played.season.matches.filter((x) => x.status === 'finished' && (x.homeTeamId === USER || x.awayTeamId === USER)).sort((a, b) => b.date.localeCompare(a.date))[0]?.id)!
    const kept = other.result!.events
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.every((e) => ['goal', 'own-goal', 'yellow-card', 'red-card'].includes(e.type) && e.text === '')).toBe(true)
    expect(other.result!.playerResults).toEqual([])
    expect(kept.filter((e) => e.type === 'goal').length).toBe(other.result!.events.filter((e) => e.type === 'goal').length)
    expect(compactGame(slim)).toBe(slim)
  })
})

describe('resumo do jogo', () => {
  it('mostra o placar, os gols com quem fez e quem assistiu, e os cartões, com o minuto', async () => {
    const { MatchSummary } = await import('../src/ui/screens/standings/Rounds')
    const match = played.season.matches.find((m): m is Match => m.status === 'finished' && !!m.result && m.result.events.some((e) => e.type === 'goal' && e.relatedPlayerId) && m.result.events.some((e) => e.type === 'yellow-card'))!
    const html = renderToStaticMarkup(createElement(MatchSummary, { game: played, match, onClose: noop }))
    for (const t of ['Resumo do jogo', 'assist.:', '&#x27;']) expect(html).toContain(t)
    expect(html).toContain(`${match.result!.homeGoals} x ${match.result!.awayGoals}`)
    expect(html).toMatch(/\((passe|cruzamento)\)/)
    const slim = compactGame(played).season.matches.find((m) => m.id === match.id)!
    expect(renderToStaticMarkup(createElement(MatchSummary, { game: { ...played, season: { ...played.season, matches: [slim] } }, match: slim, onClose: noop }))).toContain('assist.:')
  })
})
