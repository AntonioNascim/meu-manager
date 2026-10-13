import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { CONDITION } from '../src/engine/config'
import { FORMATION_IDS } from '../src/engine/formations'
import { simulateMatch } from '../src/engine/match'
import { applySavedLineup } from '../src/engine/tacticEdit'
import type { Player, SavedLineup } from '../src/engine/types'
import {
  LINEUP_SLOTS,
  advanceToMatchday,
  createGame,
  deleteUserLineup,
  loadUserLineup,
  playPendingAuto,
  saveUserLineup,
  setUserTactic,
  squadOf,
  userTeam,
} from '../src/store/game'
import type { Game } from '../src/store/game'
import { MIGRATIONS, SAVE_VERSION, makeEnvelope, migrateSave } from '../src/store/saveFormat'
import { moodBand } from '../src/ui/colors'
import { Squad } from '../src/ui/screens/Squad'
import { averageRating, inGroup, isOnYellowEdge, sortNumbers } from '../src/ui/squadSort'
import { Flag, MoodIcon, ratingToScale } from '../src/ui/theme'
import { NATIONALITIES } from '../src/engine/types'

const USER = 'team-imp'
const playDays = (game: Game, days: number): Game => {
  let g = game
  for (let i = 0; i < days; i++) g = playPendingAuto(advanceToMatchday(g))
  return g
}
const withPlayer = (game: Game, id: string, change: (p: Player) => Player): Game => ({
  ...game,
  season: { ...game.season, players: game.season.players.map((p) => (p.id === id ? change(p) : p)) },
})

describe('assistências no motor', () => {
  const world = generateWorld({ seed: 4 })
  const teams = world.teams.filter((t) => t.tier === 1)
  const squad = (id: string) => world.players.filter((p) => p.teamId === id)

  it('o passe que gerou o gol vira assistência: do mesmo time, nunca do próprio autor, em boa parte dos gols', () => {
    let goals = 0
    let assisted = 0
    for (let i = 0; i < 60; i++) {
      const home = teams[i % 10]!
      const away = teams[10 + ((i * 3) % 10)]!
      const result = simulateMatch({ home: { team: home, players: squad(home.id) }, away: { team: away, players: squad(away.id) }, seed: i })
      for (const e of result.events) {
        if (e.type !== 'goal') continue
        goals++
        if (!e.relatedPlayerId) continue
        assisted++
        expect(e.relatedPlayerId).not.toBe(e.playerId)
        const scorer = world.players.find((p) => p.id === e.playerId)
        const assister = world.players.find((p) => p.id === e.relatedPlayerId)
        expect(assister?.teamId).toBe(scorer?.teamId)
      }
      const total = result.playerResults.length > 0 ? result.events.filter((e) => e.type === 'goal' && e.relatedPlayerId).length : 0
      expect(total).toBeLessThanOrEqual(result.homeGoals + result.awayGoals)
    }
    expect(goals).toBeGreaterThan(100)
    expect(assisted / goals).toBeGreaterThan(0.3)
    expect(assisted / goals).toBeLessThan(0.95)
  })

  it('as estatísticas da temporada somam gols e assistências dos jogos jogados', () => {
    const g = playDays(createGame(7, USER), 10)
    const players = g.season.players
    const goals = players.reduce((s, p) => s + p.seasonStats.goals, 0)
    const assists = players.reduce((s, p) => s + p.seasonStats.assists, 0)
    expect(assists).toBeGreaterThan(0)
    expect(assists).toBeLessThanOrEqual(goals)
  })
})

describe('nota média da temporada', () => {
  it('soma as notas de quem jogou o mínimo de minutos e a média fica numa faixa plausível', () => {
    const g = playDays(createGame(7, USER), 8)
    const rated = g.season.players.filter((p) => p.seasonStats.ratedGames > 0)
    expect(rated.length).toBeGreaterThan(100)
    for (const p of rated) {
      expect(p.seasonStats.ratedGames).toBeLessThanOrEqual(p.seasonStats.appearances)
      const avg = averageRating(p) as number
      expect(avg).toBeGreaterThan(3)
      expect(avg).toBeLessThan(10)
    }
    const fresh = createGame(7, USER).season.players[0] as Player
    expect(averageRating(fresh)).toBeUndefined()
  })

  it('a faixa de cor da nota: 6,0 verde-limão, 7,6 azul, 5,0 vermelho', () => {
    expect(ratingToScale(7.6)).toBeGreaterThanOrEqual(85)
    expect(ratingToScale(6)).toBeGreaterThanOrEqual(55)
    expect(ratingToScale(6)).toBeLessThan(70)
    expect(ratingToScale(5)).toBeLessThan(40)
  })

  it('save da versão 1 abre na versão atual com a nota média partindo das últimas notas', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(2)
    expect(MIGRATIONS[1]).toBeTypeOf('function')
    const game = playDays(createGame(7, USER), 6)
    const envelope = JSON.parse(JSON.stringify(makeEnvelope(game, '2026-01-01T00:00:00Z')))
    envelope.version = 1
    for (const p of envelope.game.season.players) {
      delete p.seasonStats.ratingSum
      delete p.seasonStats.ratedGames
    }
    const migrated = migrateSave(envelope)
    expect(migrated.version).toBe(SAVE_VERSION)
    const withRatings = migrated.game.season.players.find((p) => p.condition.recentRatings.length > 0) as Player
    expect(withRatings.seasonStats.ratedGames).toBe(withRatings.condition.recentRatings.length)
    expect(withRatings.seasonStats.ratingSum).toBeCloseTo(withRatings.condition.recentRatings.reduce((a, b) => a + b, 0))
  })
})

describe('escalações salvas', () => {
  it('guarda nome, formação, estilo e titulares; carregar devolve exatamente isso à tática', () => {
    let g = createGame(5, USER)
    const original = userTeam(g).tactic
    g = saveUserLineup(g, 0, '  Time titular ')
    expect(g.savedLineups?.[0]).toEqual({ name: 'Time titular', formationId: original.formationId, style: original.style, startingXI: original.startingXI, grid: original.grid })
    expect(g.savedLineups?.[1]).toBeNull()
    const other = FORMATION_IDS.find((f) => f !== original.formationId) as string
    g = setUserTactic(g, { ...userTeam(g).tactic, formationId: other, style: 'high-press' })
    // (a mudança de formação sem remontar os titulares é só para ter outra tática; carregar restaura a guardada)
    g = loadUserLineup(g, 0)
    const loaded = userTeam(g).tactic
    expect(loaded.formationId).toBe(original.formationId)
    expect(loaded.style).toBe(original.style)
    expect(loaded.startingXI).toEqual(original.startingXI)
    expect(new Set([...loaded.startingXI, ...loaded.bench]).size).toBe(loaded.startingXI.length + loaded.bench.length)
  })

  it('tem 3 espaços, nome vazio vira o padrão, e dá para excluir', () => {
    let g = createGame(5, USER)
    expect(LINEUP_SLOTS).toBe(3)
    g = saveUserLineup(g, 2, '   ')
    expect(g.savedLineups?.[2]?.name).toBe('Escalação 3')
    expect(() => saveUserLineup(g, 3, 'x')).toThrow()
    expect(() => loadUserLineup(g, 1)).toThrow()
    g = deleteUserLineup(g, 2)
    expect(g.savedLineups).toEqual([null, null, null])
  })

  it('jogador que saiu do elenco é trocado pelo melhor que sobrou para a vaga, sem repetir ninguém', () => {
    const g = createGame(5, USER)
    const team = userTeam(g)
    const squad = squadOf(g, USER)
    const gone = team.tactic.startingXI[5] as string
    const saved: SavedLineup = { name: 'x', formationId: team.tactic.formationId, style: team.tactic.style, startingXI: team.tactic.startingXI }
    const tactic = applySavedLineup(team.tactic, squad.filter((p) => p.id !== gone), saved)
    expect(tactic.startingXI).toHaveLength(11)
    expect(tactic.startingXI).not.toContain(gone)
    expect(new Set(tactic.startingXI).size).toBe(11)
    expect(tactic.bench.some((id) => tactic.startingXI.includes(id))).toBe(false)
    expect(tactic.startingXI.filter((id) => id !== tactic.startingXI[5])).toEqual(team.tactic.startingXI.filter((id) => id !== gone))
  })

  it('o jogo guarda as escalações no save (JSON ida e volta)', () => {
    const g = saveUserLineup(createGame(5, USER), 1, 'Jogo grande')
    const back = migrateSave(JSON.parse(JSON.stringify(makeEnvelope(g, '2026-01-01T00:00:00Z'))))
    expect(back.game.savedLineups?.[1]?.name).toBe('Jogo grande')
  })
})

describe('números da temporada', () => {
  const g = playDays(createGame(7, USER), 10)
  const squad = squadOf(g, USER)

  it('ordena por qualquer coluna nas duas direções; sem nota fica por último na ordem por nota', () => {
    const goals = sortNumbers(squad, 'goals', -1).map((p) => p.seasonStats.goals)
    expect(goals).toEqual([...goals].sort((a, b) => b - a))
    expect(sortNumbers(squad, 'goals', 1).map((p) => p.seasonStats.goals)).toEqual([...goals].reverse())
    for (const [key, pick] of [['games', (p: Player) => p.seasonStats.appearances], ['assists', (p: Player) => p.seasonStats.assists], ['yellow', (p: Player) => p.seasonStats.yellowCards], ['red', (p: Player) => p.seasonStats.redCards]] as const) {
      const values = sortNumbers(squad, key, -1).map(pick)
      expect(values).toEqual([...values].sort((a, b) => b - a))
    }
    const ratings = sortNumbers(squad, 'rating', -1).map((p) => averageRating(p) ?? -1)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
    expect(ratings.at(-1)).toBe(-1)
    const names = sortNumbers(squad, 'name', 1).map((p) => p.nickname ?? p.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')))
  })

  it('pendurado = um amarelo a menos da suspensão; suspenso não conta como pendurado', () => {
    const p = squad[0] as Player
    const edge = { ...p, condition: { ...p.condition, yellowCards: CONDITION.yellowsPerSuspension - 1, suspensionGames: 0 } }
    expect(isOnYellowEdge(edge)).toBe(true)
    expect(isOnYellowEdge({ ...edge, condition: { ...edge.condition, suspensionGames: 1 } })).toBe(false)
    expect(isOnYellowEdge({ ...edge, condition: { ...edge.condition, yellowCards: 0 } })).toBe(false)
  })

  it('a tabela mostra as etiquetas pendurado e suspenso', () => {
    const [a, b] = squad as [Player, Player]
    let game = withPlayer(g, a.id, (p) => ({ ...p, condition: { ...p.condition, yellowCards: CONDITION.yellowsPerSuspension - 1, suspensionGames: 0 } }))
    game = withPlayer(game, b.id, (p) => ({ ...p, condition: { ...p.condition, suspensionGames: 1 } }))
    const html = renderToStaticMarkup(createElement(Squad, { game, initialTab: 'numbers' }))
    expect(html).toContain('pendurado')
    expect(html).toContain('suspenso')
    expect(html.match(/<li/g)).toHaveLength(squad.length)
  })
})

describe('abas do Elenco', () => {
  const g = playDays(createGame(7, USER), 4)

  it('existem Jogadores, Escalação, Números, Base e Treino', () => {
    const html = renderToStaticMarkup(createElement(Squad, { game: g }))
    expect(html.match(/role="tab"/g)).toHaveLength(5)
    expect(html).toContain('Treino')
  })

  it('Jogadores: filtros por setor, resumo de disponíveis, etiquetas de titular, lesão e suspensão', () => {
    const hurt = squadOf(g, USER).find((p) => !userTeam(g).tactic.startingXI.includes(p.id)) as Player
    const game = withPlayer(g, hurt.id, (p) => ({ ...p, condition: { ...p.condition, injuryDaysLeft: 9 } }))
    const html = renderToStaticMarkup(createElement(Squad, { game }))
    for (const text of ['Todos', 'GOL', 'DEF', 'MEI', 'ATA', 'Ordenar', 'disponíveis', 'moral', 'condição', 'titular', 'Lesionado · 9 d']) expect(html).toContain(text)
    expect(html).toContain(`${squadOf(g, USER).length - 1}/${squadOf(g, USER).length} disponíveis`)
    const squad = squadOf(g, USER)
    const total = (['GK', 'DEF', 'MID', 'FWD'] as const).reduce((s, group) => s + squad.filter((p) => inGroup(p, group)).length, 0)
    expect(total).toBe(squad.length)
  })

  it('Escalação: todas as formações do motor (e nenhuma a mais), campo, banco e as 3 vagas salvas', () => {
    const html = renderToStaticMarkup(createElement(Squad, { game: saveUserLineup(g, 0, 'Meu time'), initialTab: 'lineup' }))
    for (const id of FORMATION_IDS) expect(html).toContain(`>${id}<`)
    expect(html.match(/aria-pressed/g)).toHaveLength(FORMATION_IDS.length)
    expect(html).toContain('Escalações salvas')
    expect(html).toContain('Meu time')
    expect(html.match(/\+ Vazio/g)).toHaveLength(2)
    expect(html).toContain('Banco de reservas')
    expect(html.match(/>C</g)?.length).toBeGreaterThanOrEqual(1)
  })

  it('moral por faixa e bandeira para todas as nacionalidades', () => {
    expect([80, 70, 69, 50, 49, 10].map(moodBand)).toEqual(['happy', 'happy', 'neutral', 'neutral', 'sad', 'sad'])
    for (const n of NATIONALITIES) expect(renderToStaticMarkup(createElement(Flag, { nationality: n }))).toContain('<svg')
    expect(renderToStaticMarkup(createElement(MoodIcon, { morale: 30 }))).toContain('Moral baixa')
  })
})
