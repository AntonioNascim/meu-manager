import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PLAY_STYLES } from '../src/engine/types'
import { createGame, userTeam } from '../src/store/game'
import { getGame, setGame } from '../src/store/gameStore'
import { perform } from '../src/store/actions'
import { leagueGame } from '../src/store/leagueGame'
import { PLAY_STYLE_DESCRIPTIONS, PLAY_STYLE_LABELS } from '../src/ui/labels'
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
