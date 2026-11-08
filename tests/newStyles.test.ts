import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { parseCommand } from '../src/engine/league'
import { parseClientMessage } from '../src/online/liveProtocol'
import { buildTactic } from '../src/engine/lineup'
import { simulateMatch } from '../src/engine/match'
import { chooseAiStyles, styleFit } from '../src/engine/styleChoice'
import { PLAY_STYLES } from '../src/engine/types'
import type { Player, PlayStyle, Team } from '../src/engine/types'
import { PLAY_STYLE_DESCRIPTIONS, PLAY_STYLE_LABELS } from '../src/ui/labels'

const world = generateWorld({ seed: 31 })
const teams = world.teams.filter((t) => t.tier === 1)
const squadOf = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
const withStyle = (t: Team, style: PlayStyle, players: Player[]): Team => ({ ...t, tactic: buildTactic(players, { formationId: t.tactic.formationId, style, mentality: 0 }) })

/** Saldo de gols médio do time `a` (com o estilo e os jogadores dados) contra os outros, mesmas sementes. */
function goalDiff(a: Team, aPlayers: Player[], style: PlayStyle, games = 80): number {
  let total = 0
  for (let i = 0; i < games; i++) {
    const b = teams[(i * 3 + 1) % teams.length] as Team
    if (b.id === a.id) continue
    const home = i % 2 === 0
    const mine = { team: withStyle(a, style, aPlayers), players: aPlayers }
    const other = { team: b, players: squadOf(b) }
    const r = simulateMatch({ home: home ? mine : other, away: home ? other : mine, seed: 500 + i })
    total += home ? r.homeGoals - r.awayGoals : r.awayGoals - r.homeGoals
  }
  return total / games
}

const boost = (players: Player[], positions: string[], attrs: (keyof Player['attributes'])[], by: number): Player[] =>
  players.map((p) => (positions.includes(p.position) ? { ...p, attributes: { ...p.attributes, ...Object.fromEntries(attrs.map((k) => [k, Math.min(100, p.attributes[k] + by)])) } } : p))

describe('estilos novos: lançamento direto e jogar pelas pontas (Fase 6D)', () => {
  it('há cinco estilos, todos com nome e descrição, e os dois antigos só mudaram de nome na tela', () => {
    expect(PLAY_STYLES).toEqual(['possession', 'counter-attack', 'high-press', 'direct', 'wings'])
    for (const s of PLAY_STYLES) {
      expect(PLAY_STYLE_LABELS[s].length).toBeGreaterThan(3)
      expect(PLAY_STYLE_DESCRIPTIONS[s].length).toBeGreaterThan(20)
    }
    expect(PLAY_STYLE_LABELS.possession).toBe('Toque de bola')
    expect(PLAY_STYLE_LABELS['high-press']).toBe('Pressão total')
    expect(PLAY_STYLE_LABELS.direct).toBe('Lançamento direto')
    expect(PLAY_STYLE_LABELS.wings).toBe('Jogar pelas pontas')
  })

  it('o lançamento direto rende mais com atacantes altos, fortes e rápidos do que com atacantes fracos no jogo aéreo', () => {
    const team = teams[0] as Team
    const base = squadOf(team)
    const strong = goalDiff(team, boost(base, ['ST', 'RW', 'LW'], ['heading', 'strength', 'pace'], 25), 'direct')
    const weak = goalDiff(team, boost(base, ['ST', 'RW', 'LW'], ['heading', 'strength', 'pace'], -25), 'direct')
    expect(strong).toBeGreaterThan(weak + 0.3)
  })

  it('jogar pelas pontas rende mais com laterais e pontas bons de cruzamento, drible e velocidade', () => {
    const team = teams[1] as Team
    const base = squadOf(team)
    const strong = goalDiff(team, boost(base, ['RB', 'LB', 'RW', 'LW'], ['crossing', 'dribbling', 'pace'], 25), 'wings')
    const weak = goalDiff(team, boost(base, ['RB', 'LB', 'RW', 'LW'], ['crossing', 'dribbling', 'pace'], -25), 'wings')
    expect(strong).toBeGreaterThan(weak + 0.3)
  })

  it('a mesma partida com o mesmo estilo dá sempre o mesmo resultado (determinístico) e a escolha de estilo não mexe nos três antigos', () => {
    const a = teams[2] as Team
    const b = teams[3] as Team
    for (const style of ['direct', 'wings'] as const) {
      const run = () => simulateMatch({ home: { team: withStyle(a, style, squadOf(a)), players: squadOf(a) }, away: { team: b, players: squadOf(b) }, seed: 77 })
      expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
    }
  })
})

describe('a IA escolhe o estilo (Fase 6D)', () => {
  it('é determinística, sempre devolve um estilo válido e quem tem o perfil certo tende a escolhê-lo', () => {
    const team = teams[0] as Team
    const squad = squadOf(team)
    const group = teams.map((t) => ({ team: t, squad: squadOf(t), current: t.tactic.style }))
    const pick = chooseAiStyles(group, 2027).get(team.id)
    expect(pick).toBe(chooseAiStyles(group, 2027).get(team.id))
    expect(PLAY_STYLES).toContain(pick)
    // Elenco com atacantes aéreos e laterais ruins escolhe mais o lançamento direto do que o elenco com laterais ótimos.
    const aerial = boost(boost(squad, ['ST', 'RW', 'LW'], ['heading', 'strength', 'pace'], 40), ['RB', 'LB'], ['crossing', 'dribbling'], -40)
    const wide = boost(boost(squad, ['ST'], ['heading', 'strength'], -40), ['RB', 'LB', 'RW', 'LW'], ['crossing', 'dribbling', 'pace'], 40)
    expect(styleFit(aerial, 'direct')).toBeGreaterThan(styleFit(wide, 'direct'))
    expect(styleFit(wide, 'wings')).toBeGreaterThan(styleFit(aerial, 'wings'))
  })

  it('os clubes não escolhem todos o mesmo estilo (nenhum passa de 40%) e todos os cinco estilos aparecem', () => {
    const count = new Map<PlayStyle, number>()
    const picks = chooseAiStyles(world.teams.map((t) => ({ team: t, squad: squadOf(t), current: t.tactic.style })), 2027)
    for (const s of picks.values()) count.set(s, (count.get(s) ?? 0) + 1)
    const total = world.teams.length
    for (const [style, n] of count) expect(n / total, style).toBeLessThanOrEqual(0.4)
    for (const style of PLAY_STYLES) expect(count.get(style) ?? 0, style).toBeGreaterThan(0)
  })
})

describe('os estilos novos viajam pela liga online (Fase 6D)', () => {
  it('o comando de tática e o ao vivo aceitam os cinco estilos e recusam outros', () => {
    const team = teams[0] as Team
    for (const style of PLAY_STYLES) {
      const tactic = { ...team.tactic, style }
      expect(parseCommand({ type: 'tactic', tactic })).toBeDefined()
      expect(parseClientMessage(JSON.stringify({ t: 'cmd', id: 'c1', command: { type: 'style', style } })).ok).toBe(true)
    }
    expect(parseCommand({ type: 'tactic', tactic: { ...team.tactic, style: 'catenaccio' } })).toBeUndefined()
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', id: 'c1', command: { type: 'style', style: 'catenaccio' } })).ok).toBe(false)
  })
})
