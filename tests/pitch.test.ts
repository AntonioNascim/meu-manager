import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { FORMATION_IDS, getFormation } from '../src/engine/formations'
import { startMatch } from '../src/engine/match'
import type { MatchInput, MatchSnapshot } from '../src/engine/match'
import type { Player, Team } from '../src/engine/types'
import { advanceToMatchday, createGame } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { MatchScreen, readView, writeView } from '../src/ui/screens/Match'
import { Pitch } from '../src/ui/screens/match/Pitch'
import { assignNumber, basePositions, beatsFor, colorDistance, hash, kitsFor, layoutFrom, pickTrace, playbackFor, shifted } from '../src/ui/screens/match/pitchModel'
import type { Layout, Placed } from '../src/ui/screens/match/pitchModel'

const world = generateWorld({ seed: 11 })
const squad = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
const [a, b, c, d] = world.teams.filter((t) => t.tier === 1) as [Team, Team, Team, Team]
const input = (home: Team, away: Team, seed: number): MatchInput => ({ home: { team: home, players: squad(home) }, away: { team: away, players: squad(away) }, seed, attendance: 30_000 })
const full = (seed: number, home = a, away = b): MatchSnapshot => {
  const m = startMatch(input(home, away, seed))
  m.playUntil(90)
  return m.snapshot()
}
const wingers = (snap: MatchSnapshot) => ({
  home: getFormation(snap.home.formationId).slots.find((s) => s.position === 'RW' || s.position === 'LW')?.sector === 'attack',
  away: getFormation(snap.away.formationId).slots.find((s) => s.position === 'RW' || s.position === 'LW')?.sector === 'attack',
})

describe('rastro dos lances do motor (só leitura)', () => {
  const snaps = [full(1), full(2, c, d), full(3, b, a), full(4, d, c)]

  it('há um rastro por momento de posse, na ordem dos minutos, e o ao vivo é um prefixo do final', () => {
    for (const s of snaps) {
      expect(s.trace.length).toBeGreaterThanOrEqual(90)
      expect(s.trace.map((t) => t.minute)).toEqual([...s.trace.map((t) => t.minute)].sort((x, y) => x - y))
    }
    const live = startMatch(input(a, b, 1))
    live.playUntil(30)
    const partial = live.snapshot().trace
    expect(partial.length).toBeGreaterThan(20)
    expect(full(1).trace.slice(0, partial.length)).toEqual(partial)
  })

  it('cada gol dos eventos tem um momento com finalização que terminou em gol, do mesmo jogador, e vice-versa', () => {
    for (const s of snaps) {
      const goals = s.events.filter((e) => e.type === 'goal')
      const traced = s.trace.filter((t) => t.shot?.result === 'goal')
      expect(traced.length).toBe(goals.length)
      for (const g of goals) expect(traced.some((t) => t.minute === g.minute && t.shot?.shooterId === g.playerId && t.shot?.assisterId === g.relatedPlayerId)).toBe(true)
    }
  })

  it('os jogadores do rastro são sempre jogadores da partida e a jogada tem quem conduziu', () => {
    for (const s of snaps) {
      const ids = new Set(world.players.map((p) => p.id))
      for (const t of s.trace) {
        for (const id of [t.carrierId, t.markerId, t.receiverId, t.shot?.shooterId, t.shot?.keeperId, t.shot?.assisterId]) if (id) expect(ids.has(id)).toBe(true)
        if (t.play !== 'held') expect(t.carrierId).toBeDefined()
        if (t.play === 'through' && t.outcome === 'won') expect(t.receiverId).toBeDefined()
      }
      expect(s.trace.some((t) => t.play === 'cross')).toBe(true)
      expect(s.trace.some((t) => t.play === 'through')).toBe(true)
      expect(s.trace.some((t) => t.play === 'dribble')).toBe(true)
      expect(s.trace.some((t) => t.shot?.result === 'saved')).toBe(true)
    }
  })
})

describe('posições de base', () => {
  const layoutOf = (formationId: string, side: 'home' | 'away'): Placed[] => {
    const slots = getFormation(formationId).slots
    return basePositions(
      side,
      slots.map((s, i) => ({ playerId: `p${i}`, slot: s.position })),
      slots.find((s) => s.position === 'RW')?.sector === 'attack',
    )
  }

  it('o mandante ataca para a direita (goleiro atrás, atacantes à frente) e o visitante é o espelho', () => {
    for (const id of FORMATION_IDS) {
      const home = layoutOf(id, 'home')
      const away = layoutOf(id, 'away')
      expect(home).toHaveLength(11)
      const gk = home.find((p) => p.slot === 'GK') as Placed
      const st = home.filter((p) => p.slot === 'ST' || p.slot === 'AM')
      expect(gk.base.x).toBeLessThan(0.1)
      for (const p of st) expect(p.base.x).toBeGreaterThan(0.5)
      for (const h of home) {
        const m = away.find((x) => x.playerId === h.playerId) as Placed
        expect(m.base.x).toBeCloseTo(1 - h.base.x, 6)
        expect(m.base.y).toBeCloseTo(1 - h.base.y, 6)
      }
    }
  })

  it('ninguém fica por cima de ninguém e o lado direito do time fica embaixo (esquerdo no topo)', () => {
    for (const id of FORMATION_IDS) {
      const home = layoutOf(id, 'home')
      for (let i = 0; i < home.length; i++) for (let j = i + 1; j < home.length; j++) expect(Math.hypot((home[i] as Placed).base.x - (home[j] as Placed).base.x, ((home[i] as Placed).base.y - (home[j] as Placed).base.y) * 0.65), `${id} ${i}-${j}`).toBeGreaterThan(0.05)
      const rb = home.find((p) => p.slot === 'RB') as Placed
      const lb = home.find((p) => p.slot === 'LB') as Placed
      expect(rb.base.y).toBeGreaterThan(lb.base.y)
    }
  })

  it('com 10 em campo (expulsão) o time continua distribuído sem o jogador que saiu', () => {
    const slots = getFormation('4-4-2').slots.slice(0, 10)
    const placed = basePositions('home', slots.map((s, i) => ({ playerId: `p${i}`, slot: s.position })), false)
    expect(placed).toHaveLength(10)
  })
})

describe('cores, números e movimento', () => {
  it('as camisas dos dois times são diferentes e o goleiro tem cor própria', () => {
    const kits = kitsFor(['#aa0000', '#ffffff'], ['#ab0202', '#111111'])
    expect(colorDistance(kits.home.shirt, kits.away.shirt)).toBeGreaterThan(80)
    for (const k of [kits.home, kits.away]) {
      expect(colorDistance(k.keeper, kits.home.shirt)).toBeGreaterThan(60)
      expect(colorDistance(k.keeper, kits.away.shirt)).toBeGreaterThan(60)
    }
    expect(kits.home.keeper).not.toBe(kits.away.keeper)
    for (const t of world.teams.slice(0, 12)) {
      const k = kitsFor(t.colors, (world.teams[5] as Team).colors)
      expect(colorDistance(k.home.shirt, k.away.shirt)).toBeGreaterThan(60)
    }
  })

  it('números de camisa por vaga, únicos dentro do time e estáveis', () => {
    const taken = new Map<string, number>()
    const gk = assignNumber(taken, 'home', 'a', 'GK')
    expect(gk).toBe(1)
    expect(assignNumber(taken, 'home', 'a', 'GK')).toBe(1)
    const cbs = [assignNumber(taken, 'home', 'b', 'CB'), assignNumber(taken, 'home', 'c', 'CB')]
    expect(cbs).toEqual([3, 4])
    expect(assignNumber(taken, 'away', 'x', 'GK')).toBe(1)
    const nums = Array.from({ length: 8 }, (_, i) => assignNumber(taken, 'home', `s${i}`, 'ST'))
    expect(new Set(nums).size).toBe(8)
  })

  it('quem tem a bola avança o bloco conforme a fase e o outro time recua', () => {
    const snap = full(1)
    const layout = layoutFrom(snap, wingers(snap))
    const st = [...layout.values()].find((p) => p.side === 'home' && (p.slot === 'ST' || p.slot === 'AM' || p.slot === 'RW')) as Placed
    const cbAway = [...layout.values()].find((p) => p.side === 'away' && (p.slot === 'CB' || p.slot === 'RB' || p.slot === 'LB')) as Placed
    const x = (p: Placed, att: 'home' | 'away', phase: Parameters<typeof shifted>[2]) => shifted(p, att, phase, 0.5).x
    expect(x(st, 'home', 'progress')).toBeGreaterThan(x(st, 'home', 'midfield'))
    expect(x(st, 'home', 'shot')).toBeGreaterThan(x(st, 'home', 'progress'))
    expect(x(st, 'away', 'shot')).toBeLessThan(st.base.x)
    expect(x(cbAway, 'home', 'shot')).toBeGreaterThan(cbAway.base.x)
    const gkHome = [...layout.values()].find((p) => p.side === 'home' && p.slot === 'GK') as Placed
    expect(Math.abs(x(gkHome, 'home', 'shot') - gkHome.base.x)).toBeLessThan(0.02)
  })

  it('a jogada pelo lado certo: a progressão do ponta vai para o lado dele e os vizinhos se aproximam', () => {
    const snap = full(1)
    const layout: Layout = layoutFrom(snap, wingers(snap))
    const winger = [...layout.values()].find((p) => p.side === 'home' && (p.slot === 'RW' || p.slot === 'RB')) as Placed
    const other = [...layout.values()].find((p) => p.side === 'home' && p.slot === 'CM') as Placed
    const toward = (p: Placed, focus: number) => Math.abs(shifted(p, 'home', 'progress', focus).y - focus)
    expect(toward(other, winger.base.y)).toBeLessThan(Math.abs(other.base.y - winger.base.y))
  })

  it('o hash é determinístico e fica entre 0 e 1', () => {
    expect(hash('x:1')).toBe(hash('x:1'))
    expect(hash('x:1')).not.toBe(hash('x:2'))
    for (let i = 0; i < 50; i++) expect(hash(`k${i}`)).toBeGreaterThanOrEqual(0)
  })
})

describe('bola, setas e marcações de cada lance', () => {
  const snap = full(2, c, d)
  const layout = layoutFrom(snap, wingers(snap))
  // O elenco inteiro conta (quem saiu por troca ainda aparece no rastro).
  const everyone: Layout = new Map(layout)
  for (const p of snap.trace.flatMap((t) => [t.carrierId, t.markerId, t.receiverId, t.shot?.shooterId, t.shot?.keeperId])) {
    if (p && !everyone.has(p)) everyone.set(p, { playerId: p, side: 'home', slot: 'CM', base: { x: 0.5, y: 0.5 } })
  }

  it('todo momento vira uma sequência de batidas dentro do campo, com bola e quem está com ela', () => {
    for (const t of snap.trace) {
      const beats = beatsFor(t, everyone, snap.events)
      expect(beats.length).toBeGreaterThan(0)
      expect(beats[0]?.phase).toBe('midfield')
      for (const beat of beats) {
        expect(beat.ball.x).toBeGreaterThanOrEqual(-0.05)
        expect(beat.ball.x).toBeLessThanOrEqual(1.05)
        expect(beat.ball.y).toBeGreaterThanOrEqual(0)
        expect(beat.ball.y).toBeLessThanOrEqual(1)
        if (beat.holder) expect(everyone.has(beat.holder)).toBe(true)
      }
    }
  })

  it('passe em profundidade e cruzamento têm seta tracejada; cruzamento faz curva; o chute tem seta contínua', () => {
    const through = snap.trace.find((t) => t.play === 'through' && t.outcome === 'won' && t.receiverId)!
    const cross = snap.trace.find((t) => t.play === 'cross' && t.outcome === 'won' && t.receiverId)!
    const shotTrace = snap.trace.find((t) => t.shot?.result === 'saved')!
    const arrowOf = (t: typeof through, phase: string) => beatsFor(t, everyone, snap.events).find((x) => x.arrow && (x.arrow.solid ? phase === 'solid' : phase === 'dashed'))?.arrow
    expect(arrowOf(through, 'dashed')).toBeDefined()
    expect(arrowOf(through, 'dashed')?.curve).toBe(false)
    expect(arrowOf(cross, 'dashed')?.curve).toBe(true)
    expect(arrowOf(shotTrace, 'solid')?.solid).toBe(true)
  })

  it('a bola segue quem o motor escolheu: condutor, receptor, finalizador e goleiro', () => {
    const t = snap.trace.find((x) => x.play === 'through' && x.outcome === 'won' && x.shot?.result === 'saved')
    if (t) {
      const holders = beatsFor(t, everyone, snap.events).map((x) => x.holder)
      expect(holders).toContain(t.carrierId)
      expect(holders).toContain(t.receiverId)
      expect(holders[holders.length - 1]).toBe(t.shot?.keeperId)
    }
    const g = snap.trace.find((x) => x.shot?.result === 'goal')!
    const beats = beatsFor(g, everyone, snap.events)
    expect(beats.map((x) => x.holder)).toContain(g.carrierId)
    expect(beats[beats.length - 1]?.holder).toBe(g.shot?.shooterId)
  })

  it('gol, defesa, para fora, escanteio, falta e cartão ganham marcação no local', () => {
    const kinds = new Set<string>()
    for (const t of snap.trace) for (const beat of beatsFor(t, everyone, snap.events)) for (const m of beat.marks) kinds.add(m.kind)
    for (const k of ['goal', 'save', 'off']) expect(kinds.has(k), k).toBe(true)
    const goal = snap.trace.find((t) => t.shot?.result === 'goal')!
    const mark = beatsFor(goal, everyone, snap.events).flatMap((x) => x.marks).find((m) => m.kind === 'goal')!
    expect(mark.at.x).toBeCloseTo(goal.side === 'home' ? 1 : 0, 6)
    const more = [full(5), full(6), full(7)]
    for (const s of more) {
      const lay = layoutFrom(s, wingers(s))
      for (const t of s.trace) for (const beat of beatsFor(t, lay, s.events)) for (const m of beat.marks) kinds.add(m.kind)
    }
    for (const k of ['corner', 'foul', 'yellow']) expect(kinds.has(k), k).toBe(true)
  })

  it('em 4x e 8x a animação se simplifica (só o desfecho, sem setas); em 2x pula o meio; em 1x toca tudo', () => {
    const t = snap.trace.find((x) => x.play === 'through' && x.outcome === 'won' && x.shot)!
    const beats = beatsFor(t, everyone, snap.events)
    expect(beats.length).toBeGreaterThanOrEqual(4)
    expect(playbackFor(beats, 1, false)).toEqual({ beats, arrows: true })
    const two = playbackFor(beats, 2, false)
    expect(two.beats.length).toBe(2)
    expect(two.beats[1]).toBe(beats[beats.length - 1])
    for (const speed of [4, 8]) expect(playbackFor(beats, speed, false)).toEqual({ beats: [beats[beats.length - 1]], arrows: false })
    expect(playbackFor(beats, 1, true).arrows).toBe(false)
    expect(playbackFor([], 1, false).beats).toEqual([])
  })

  it('pickTrace escolhe o gol, senão a finalização, senão o último momento', () => {
    const goal = snap.trace.find((t) => t.shot?.result === 'goal')!
    const idle = snap.trace.filter((t) => !t.shot).slice(0, 2)
    expect(pickTrace([...idle, goal, ...idle])).toBe(goal)
    expect(pickTrace(idle)).toBe(idle[1])
    expect(pickTrace([])).toBeUndefined()
  })
})

describe('campo na tela', () => {
  const game: Game = createGame(3, 'team-imp')

  it('desenha 22 camisas (11 de cada lado), a bola, as linhas e o nome de quem está com a bola', () => {
    let g = game
    while (!g.pendingUserMatch) g = advanceToMatchday(g)
    const live = beginLive(g)
    live.match.playUntil(30)
    const html = renderToStaticMarkup(createElement(Pitch, { game: g, snap: live.match.snapshot(), speed: 2, running: false }))
    expect(html.match(/data-side="home"/g)).toHaveLength(11)
    expect(html.match(/data-side="away"/g)).toHaveLength(11)
    expect(html).toContain('aria-label="Bola"')
    expect(html).toContain('<svg viewBox="0 0 105 68"')
    expect(html).toContain('aspect-[105/68]')
    clearLive()
  })

  it('substituição e expulsão atualizam o campo (quem saiu some, quem entrou aparece, 10 em campo)', () => {
    const m = startMatch({ ...input(a, b, 9), userControlled: { home: true } })
    m.playUntil(30)
    const before = m.snapshot()
    const out = before.home.onPitch.find((p) => p.slot !== 'GK')!.playerId
    const inn = before.home.bench.find((id) => world.players.find((p) => p.id === id)?.position !== 'GK')!
    m.substitute('home', out, inn)
    const after = m.snapshot()
    const g: Game = { ...game, season: { ...game.season, teams: game.season.teams.map((t) => t), players: world.players } }
    const render = (s: MatchSnapshot) => renderToStaticMarkup(createElement(Pitch, { game: { ...g, season: { ...g.season, teams: world.teams } }, snap: s, speed: 1, running: false }))
    expect(render(before)).toContain(`data-player="${out}"`)
    const html = render(after)
    expect(html).not.toContain(`data-player="${out}"`)
    expect(html).toContain(`data-player="${inn}"`)
    expect(html.match(/data-side="home"/g)).toHaveLength(11)
    const sentOff = { ...after, home: { ...after.home, onPitch: after.home.onPitch.slice(1) } }
    expect(render(sentOff).match(/data-side="home"/g)).toHaveLength(10)
  })
})

describe('tela de partida: Campo ou Só lances', () => {
  afterEach(() => {
    clearLive()
    delete (globalThis as { window?: unknown }).window
  })
  const toDay = (): Game => {
    let g = createGame(3, 'team-imp')
    while (!g.pendingUserMatch) g = advanceToMatchday(g)
    return g
  }

  it('a preferência é guardada no aparelho e, sem armazenamento, volta ao campo', () => {
    const store = new Map<string, string>()
    ;(globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } }
    expect(readView()).toBe('field')
    writeView('log')
    expect(readView()).toBe('log')
    writeView('field')
    expect(readView()).toBe('field')
    ;(globalThis as { window?: unknown }).window = { localStorage: { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } } }
    expect(readView()).toBe('field')
    expect(() => writeView('log')).not.toThrow()
  })

  it('a tela ao vivo traz o botão Campo / Só lances, o campo em cima e os lances e dados embaixo; Só lances esconde o campo', () => {
    const g = toDay()
    beginLive(g).match.playUntil(20)
    const html = renderToStaticMarkup(createElement(MatchScreen, { game: g, onNavigate: () => {} }))
    for (const t of ['Campo', 'Só lances', 'Lances', 'Dados', 'Tática', 'Trocas']) expect(html).toContain(t)
    expect(html).toContain('data-testid="pitch"')
    expect(html.indexOf('data-testid="pitch"')).toBeLessThan(html.indexOf('Mostrar faltas'))
    ;(globalThis as { window?: unknown }).window = { localStorage: { getItem: () => 'log', setItem: () => {} } }
    const log = renderToStaticMarkup(createElement(MatchScreen, { game: g, onNavigate: () => {} }))
    expect(log).not.toContain('data-testid="pitch"')
    expect(log).toContain('Mostrar faltas')
  })
})

describe('a animação não usa o gerador do motor', () => {
  it('nem Math.random: o modelo e o campo só usam um hash próprio', () => {
    for (const file of ['../src/ui/screens/match/pitchModel.ts', '../src/ui/screens/match/Pitch.tsx']) {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8')
      expect(text).not.toMatch(/engine\/rng|createRng|Math\.random/)
    }
  })
})
