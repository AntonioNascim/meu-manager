import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { MATCH } from '../src/engine/config'
import { simulateMatch, startMatch } from '../src/engine/match'
import type { MatchInput } from '../src/engine/match'

const world = generateWorld({ seed: 4 })
const [home, away] = world.teams.filter((t) => t.tier === 1) as [(typeof world.teams)[number], (typeof world.teams)[number]]
const input = (seed: number, userControlled = false): MatchInput => ({
  home: { team: home, players: world.players.filter((p) => p.teamId === home.id) },
  away: { team: away, players: world.players.filter((p) => p.teamId === away.id) },
  seed,
  ...(userControlled ? { userControlled: { home: true } } : {}),
})

describe('partida ao vivo', () => {
  it('dá o mesmo resultado que a simulação direta, não importa em quantos passos é jogada', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const direct = simulateMatch(input(seed))
      const byMinute = startMatch(input(seed))
      for (let m = 1; m <= 90; m++) byMinute.playUntil(m)
      expect(byMinute.result()).toEqual(direct)
      const halves = startMatch(input(seed))
      halves.playUntil(45)
      halves.snapshot()
      halves.playUntil(90)
      expect(halves.result()).toEqual(direct)
    }
  })

  it('o intervalo para no minuto 45, sem eventos do segundo tempo', () => {
    const live = startMatch(input(7))
    expect(live.minute).toBe(0)
    expect(live.finished).toBe(false)
    live.playUntil(45)
    const snap = live.snapshot()
    expect(snap.minute).toBe(45)
    expect(snap.finished).toBe(false)
    expect(snap.events.every((e) => e.minute <= 45)).toBe(true)
    expect(snap.home.onPitch).toHaveLength(11)
    expect(snap.homeGoals + snap.awayGoals).toBe(snap.events.filter((e) => e.type === 'goal' || e.type === 'own-goal').length)
    live.playUntil(90)
    expect(live.finished).toBe(true)
    expect(live.minute).toBe(90)
    expect(live.snapshot().events.length).toBeGreaterThanOrEqual(snap.events.length)
  })

  it('o resultado só sai depois do apito final', () => {
    const live = startMatch(input(7))
    live.playUntil(60)
    expect(() => live.result()).toThrow()
  })

  it('a mesma sequência de decisões dá sempre o mesmo jogo', () => {
    const run = () => {
      const live = startMatch(input(11, true))
      live.playUntil(45)
      live.setStyle('home', 'high-press')
      live.setMentality('home', 2)
      const snap = live.snapshot()
      live.substitute('home', snap.home.onPitch[3]?.playerId as string, snap.home.bench[0] as string)
      live.playUntil(90)
      return live.result()
    }
    expect(run()).toEqual(run())
  })

  it('mudar estilo e mentalidade aparece no retrato e muda o jogo', () => {
    const live = startMatch(input(11, true))
    live.playUntil(45)
    live.setStyle('home', 'counter-attack')
    live.setMentality('home', -2)
    const snap = live.snapshot()
    expect(snap.home.style).toBe('counter-attack')
    expect(snap.home.mentality).toBe(-2)
    let different = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const a = startMatch(input(seed, true))
      const b = startMatch(input(seed, true))
      a.playUntil(45)
      b.playUntil(45)
      b.setMentality('home', 2)
      b.setStyle('home', 'high-press')
      a.playUntil(90)
      b.playUntil(90)
      if (JSON.stringify(a.result()) !== JSON.stringify(b.result())) different++
    }
    expect(different).toBeGreaterThan(3)
  })

  it('o time do jogador mantém a mentalidade escolhida em qualquer placar', () => {
    for (const seed of [21, 22, 23, 24]) {
      const live = startMatch(input(seed, true))
      live.setMentality('home', 1)
      live.playUntil(90)
      expect(live.snapshot().home.mentality).toBe(1)
    }
  })
})

describe('substituições ao vivo', () => {
  it('troca o jogador, gasta uma substituição e registra o lance', () => {
    const live = startMatch(input(3, true))
    live.playUntil(45)
    const before = live.snapshot()
    const out = before.home.onPitch[5]?.playerId as string
    const into = before.home.bench[2] as string
    live.substitute('home', out, into)
    const after = live.snapshot()
    expect(after.home.onPitch.map((p) => p.playerId)).toContain(into)
    expect(after.home.onPitch.map((p) => p.playerId)).not.toContain(out)
    expect(after.home.bench).not.toContain(into)
    expect(after.home.subsLeft).toBe(before.home.subsLeft - 1)
    const event = after.events.find((e) => e.type === 'substitution' && e.playerId === out)
    expect(event?.relatedPlayerId).toBe(into)
    expect(after.home.onPitch).toHaveLength(11)
  })

  it('recusa jogador que não está em campo, reserva que não está no banco e excesso de trocas', () => {
    const live = startMatch(input(3, true))
    live.playUntil(30)
    const snap = live.snapshot()
    expect(() => live.substitute('home', snap.home.bench[0] as string, snap.home.bench[1] as string)).toThrow()
    expect(() => live.substitute('home', snap.home.onPitch[1]?.playerId as string, snap.home.onPitch[2]?.playerId as string)).toThrow()
    for (let i = 0; i < MATCH.maxSubs; i++) {
      const s = live.snapshot()
      live.substitute('home', s.home.onPitch[1 + i]?.playerId as string, s.home.bench[0] as string)
    }
    const s = live.snapshot()
    expect(s.home.subsLeft).toBe(0)
    expect(() => live.substitute('home', s.home.onPitch[9]?.playerId as string, s.home.bench[0] as string)).toThrow()
  })

  it('sem a IA, o time do jogador só troca quando manda (a IA do rival continua trocando)', () => {
    let mine = 0
    let theirs = 0
    for (const seed of [31, 32, 33, 34, 35, 36]) {
      const tired = {
        ...input(seed, true),
        home: { team: home, players: world.players.filter((p) => p.teamId === home.id).map((p) => ({ ...p, condition: { ...p.condition, fitness: 35 } })) },
        away: { team: away, players: world.players.filter((p) => p.teamId === away.id).map((p) => ({ ...p, condition: { ...p.condition, fitness: 35 } })) },
      }
      const live = startMatch(tired)
      live.playUntil(90)
      const events = live.snapshot().events
      mine += events.filter((e) => e.type === 'substitution' && e.teamId === home.id).length
      theirs += events.filter((e) => e.type === 'substitution' && e.teamId === away.id).length
    }
    expect(theirs).toBeGreaterThan(6)
    expect(mine).toBeLessThanOrEqual(6) // só substituições forçadas por lesão
    expect(mine).toBeLessThan(theirs)
  })
})

describe('formação ao vivo', () => {
  it('muda a formação com os mesmos 11 em campo, cada um numa vaga', () => {
    const live = startMatch(input(5, true))
    live.playUntil(45)
    const before = live.snapshot().home.onPitch.map((p) => p.playerId).sort()
    const other = home.tactic.formationId === '4-3-3' ? '4-4-2' : '4-3-3'
    live.setFormation('home', other)
    const snap = live.snapshot()
    expect(snap.home.formationId).toBe(other)
    expect(snap.home.onPitch.map((p) => p.playerId).sort()).toEqual(before)
    expect(snap.home.onPitch[0]?.slot).toBe('GK')
    live.playUntil(90)
    expect(live.finished).toBe(true)
  })
})
