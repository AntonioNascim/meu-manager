import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { getFormation } from '../src/engine/formations'
import { startMatch } from '../src/engine/match'
import type { Player, Team } from '../src/engine/types'
import { advanceToMatchday, createGame, teamById } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { FieldLineup, placeLineup } from '../src/ui/components/FieldLineup'
import { Dashboard } from '../src/ui/screens/Dashboard'
import { MatchScreen } from '../src/ui/screens/Match'
import { TacticSection } from '../src/ui/screens/standings/TacticSection'
import { TeamPage } from '../src/ui/screens/standings/TeamPage'

const toDay = (): Game => {
  let g = createGame(3, 'team-imp')
  while (!g.pendingUserMatch) g = advanceToMatchday(g)
  return g
}
afterEach(() => clearLive())

describe('campo de titulares (Trocas e escalação provável)', () => {
  const world = generateWorld({ seed: 11 })
  const team = world.teams.find((t) => t.tier === 1) as Team
  const squad = world.players.filter((p) => p.teamId === team.id)
  const formation = getFormation(team.tactic.formationId)
  const lineup = team.tactic.startingXI.map((id, i) => ({ playerId: id, slot: formation.slots[i]!.position }))

  it('cada titular ocupa uma vaga diferente', () => {
    const placed = placeLineup(team.tactic.formationId, lineup)
    expect(placed).toHaveLength(11)
    expect(new Set(placed.map((p) => `${p.point.x},${p.point.y}`)).size).toBe(11)
  })

  it('mostra camisa com número, nome e condição física de cada titular, e vira botão com onTap', () => {
    const players = new Map<string, Player>(squad.map((p) => [p.id, p]))
    const props = { formationId: team.tactic.formationId, lineup, players, kit: { shirt: '#c00', trim: '#fff' }, numberOf: (_: string, __: unknown) => 7, fitnessOf: () => 88 }
    const read = renderToStaticMarkup(createElement(FieldLineup, props))
    expect(read.match(/data-player=/g)).toHaveLength(11)
    expect(read.match(/88%/g)).toHaveLength(11)
    expect(read).not.toContain('<button')
    const touch = renderToStaticMarkup(createElement(FieldLineup, { ...props, onTap: () => {}, selectedId: lineup[3]!.playerId }))
    expect(touch.match(/<button/g)).toHaveLength(11)
    expect(touch).toContain('aria-pressed="true"')
  })
})

describe('tática do adversário', () => {
  it('o motor informa a mentalidade em uso: a da IA muda pelo placar, a do time do jogador não', () => {
    const world = generateWorld({ seed: 11 })
    const [a, b] = world.teams.filter((t) => t.tier === 1) as [Team, Team]
    const squad = (t: Team) => world.players.filter((p) => p.teamId === t.id)
    let changed = false
    for (let seed = 1; seed < 40 && !changed; seed++) {
      const m = startMatch({ home: { team: a, players: squad(a) }, away: { team: b, players: squad(b) }, seed, attendance: 30_000, userControlled: { home: true } })
      m.playUntil(90)
      const s = m.snapshot()
      expect(s.home.activeMentality).toBe(s.home.mentality)
      expect([-2, -1, 0, 1, 2]).toContain(s.away.activeMentality)
      if (s.away.activeMentality !== s.away.mentality) changed = true
    }
    expect(changed).toBe(true)
  })

  it('a página do adversário traz formação, estilo, mentalidade e a escalação provável num campo', () => {
    const g = toDay()
    const opp = teamById(g, g.pendingUserMatch!.homeTeamId === g.userTeamId ? g.pendingUserMatch!.awayTeamId : g.pendingUserMatch!.homeTeamId)
    const html = renderToStaticMarkup(createElement(TeamPage, { game: g, teamId: opp.id, onBack: () => {}, onTeam: () => {} }))
    for (const t of ['Formação', 'Estilo', 'Mentalidade', 'escalação provável', 'data-testid="field-lineup"', 'Últimos resultados', 'Elenco']) expect(html).toContain(t)
    expect(html.match(/data-player=/g)).toHaveLength(11)
  })

  it('durante o jogo mostra a tática atual dele (inclusive mudanças da IA)', () => {
    const g = toDay()
    const live = beginLive(g, true)
    live.match.playUntil(80)
    const snap = live.match.snapshot()
    const side = live.side === 'home' ? snap.away : snap.home
    const html = renderToStaticMarkup(
      createElement(TacticSection, { game: g, teamId: side.teamId, live: { teamId: side.teamId, formationId: side.formationId, style: side.style, mentality: 0, activeMentality: 2, onPitch: side.onPitch } }),
    )
    expect(html).toContain('Tática agora, no jogo')
    expect(html).toContain('Muito ofensiva')
    expect(html).toContain('A IA mudou a postura')
    expect(html.match(/data-player=/g)).toHaveLength(side.onPitch.length)
  })

  it('o escudo do adversário abre a página: no painel e na partida (só o dele, não o seu)', () => {
    const g = toDay()
    expect(renderToStaticMarkup(createElement(Dashboard, { game: g, onNavigate: () => {} }))).toContain('Ver a tática do adversário')
    const html = renderToStaticMarkup(createElement(MatchScreen, { game: g, onNavigate: () => {} }))
    expect(html.match(/data-testid="opponent-crest"/g)).toHaveLength(1)
  })
})
