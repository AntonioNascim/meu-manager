import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PLAY_STYLES } from '../src/engine/types'
import { createGame, nextUserMatch, teamById, userTeam } from '../src/store/game'
import { getGame, setGame } from '../src/store/gameStore'
import { perform } from '../src/store/actions'
import { leagueGame } from '../src/store/leagueGame'
import { MENTALITY_LABELS, PLAY_STYLE_DESCRIPTIONS, PLAY_STYLE_LABELS, formationLabel } from '../src/ui/labels'
import { Squad } from '../src/ui/screens/Squad'
import { Tactics } from '../src/ui/screens/Tactics'

// A sessão da liga online é trocada por uma falsa que só anota o que o aparelho mandaria ao servidor.
const sent: unknown[] = []
vi.mock('../src/store/leagueSession', async (original) => ({
  ...(await original<typeof import('../src/store/leagueSession')>()),
  activeMirror: () => ({ perform: async (command: unknown) => (sent.push(command), { ok: true as const }) }),
}))

const solo = () => createGame(9, 'team-imp', { cups: false })
const lineup = (game: ReturnType<typeof solo>) => renderToStaticMarkup(createElement(Squad, { game, initialTab: 'lineup' }))

describe('estilo e mentalidade na Escalação (mesma escolha da Tática e da partida)', () => {
  beforeEach(() => setGame(null))

  it('a Escalação tem o seletor de estilo (os 5 estilos) e o de mentalidade, junto das formações', () => {
    const html = lineup(solo())
    expect(html).toContain('data-testid="style-controls"')
    for (const s of PLAY_STYLES) expect(html).toContain(PLAY_STYLE_LABELS[s])
    for (const label of ['Toque de bola', 'Contra-ataque', 'Pressão total', 'Lançamento direto', 'Jogar pelas pontas']) expect(html).toContain(label)
    expect(html).toContain('Mentalidade')
    expect(html).toContain('Muito ofensiva')
    // As formações vêm antes do seletor de estilo.
    expect(html.indexOf('Formações')).toBeLessThan(html.indexOf('Estilo de jogo'))
  })

  it('mudar o estilo e a mentalidade (como a Escalação faz, pelo comando de tática) muda a tática do time e aparece nas três telas', async () => {
    const g0 = solo()
    setGame(g0)
    const base = userTeam(g0).tactic
    expect(await perform({ type: 'tactic', tactic: { ...base, style: 'wings', mentality: 2 } })).toEqual({ ok: true })
    const g1 = getGame()!
    expect(userTeam(g1).tactic).toMatchObject({ style: 'wings', mentality: 2 })
    // O estilo escolhido aparece (com a descrição dele) na Escalação e na Tática.
    expect(lineup(g1)).toContain(PLAY_STYLE_DESCRIPTIONS.wings)
    expect(renderToStaticMarkup(createElement(Tactics, { game: g1 }))).toContain(PLAY_STYLE_DESCRIPTIONS.wings)
    // E de volta pela Tática.
    expect(await perform({ type: 'tactic', tactic: { ...userTeam(g1).tactic, style: 'direct' } })).toEqual({ ok: true })
    expect(lineup(getGame()!)).toContain(PLAY_STYLE_DESCRIPTIONS.direct)
  })

  it('no online a escolha vai ao servidor como o comando de tática (o mesmo da Tática)', async () => {
    const g0 = solo()
    const online = leagueGame(g0.season, g0.userTeamId, { leagueId: 'x', rev: 1, connection: 'online' })
    setGame(online)
    sent.length = 0
    const base = userTeam(online).tactic
    await perform({ type: 'tactic', tactic: { ...base, style: 'direct' } })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'tactic', tactic: { style: 'direct' } })
  })
})

describe('próximo adversário na Escalação', () => {
  beforeEach(() => setGame(null))

  it('mostra o adversário com a formação, o estilo e a mentalidade dele (os mesmos do time dele), antes das formações do técnico', () => {
    const g = solo()
    const next = nextUserMatch(g)!
    const opponent = teamById(g, next.homeTeamId === g.userTeamId ? next.awayTeamId : next.homeTeamId)
    const html = lineup(g)
    expect(html).toContain('data-testid="next-opponent"')
    expect(html).toContain('Próximo adversário')
    expect(html).toContain(opponent.name)
    const tactic = html.slice(html.indexOf('data-testid="next-opponent-tactic"'))
    expect(tactic).toContain(PLAY_STYLE_LABELS[opponent.tactic.style])
    expect(tactic).toContain(formationLabel(opponent.tactic.formationId))
    expect(tactic).toContain(MENTALITY_LABELS[opponent.tactic.mentality])
    expect(html.indexOf('Próximo adversário')).toBeGreaterThan(html.indexOf('Formações'))
  })

  it('o estilo do adversário muda no cartão quando a tática dele muda (no online chega pelo detalhe do clube)', () => {
    const g = solo()
    const next = nextUserMatch(g)!
    const oppId = next.homeTeamId === g.userTeamId ? next.awayTeamId : next.homeTeamId
    const changed = { ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === oppId ? { ...t, tactic: { ...t.tactic, style: 'direct' as const } } : t)) } }
    expect(lineup(changed)).toContain(PLAY_STYLE_DESCRIPTIONS.direct)
  })
})
