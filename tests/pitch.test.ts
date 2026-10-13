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
import { MatchScreen } from '../src/ui/screens/Match'
import { Pitch } from '../src/ui/screens/match/Pitch'
import { HOLD_MS, assignNumber, basePositions, beatsFor, colorDistance, hash, holdFor, kitsFor, layoutFrom, pickTrace, playbackFor, shifted, slowFor } from '../src/ui/screens/match/pitchModel'
import { otherGamesOf, scoreAt } from '../src/ui/screens/match/otherGames'
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

describe('outros jogos da rodada (revelados pelo relógio)', () => {
  afterEach(() => clearLive())
  const toDay = (): Game => {
    let g = createGame(3, 'team-imp')
    while (!g.pendingUserMatch) g = advanceToMatchday(g)
    return g
  }

  it('são os jogos da mesma série, rodada e data, já decididos, menos o do jogador', () => {
    const g = toDay()
    const mine = g.pendingUserMatch!
    const others = otherGamesOf(g)
    expect(others.length).toBeGreaterThan(0)
    for (const m of others) {
      expect(m.id).not.toBe(mine.id)
      expect([m.competitionId, m.round, m.date]).toEqual([mine.competitionId, mine.round, mine.date])
      expect(m.status).toBe('finished')
    }
  })

  it('os gols aparecem no minuto em que acontecem e no minuto 90 o placar é o resultado fechado', () => {
    const g = toDay()
    for (const m of otherGamesOf(g)) {
      const r = m.result!
      expect(scoreAt(m, 0)).toMatchObject({ home: 0, away: 0 })
      let before = 0
      for (let minute = 0; minute <= 90; minute++) {
        const s = scoreAt(m, minute)
        expect(s.home + s.away).toBeGreaterThanOrEqual(before)
        expect(s.goals.every((e) => e.minute <= minute || minute >= 90)).toBe(true)
        before = s.home + s.away
      }
      expect(scoreAt(m, 90)).toMatchObject({ home: r.homeGoals, away: r.awayGoals })
      expect(scoreAt(m, 89).home + scoreAt(m, 89).away).toBeLessThanOrEqual(r.homeGoals + r.awayGoals)
    }
  })

  it('ler o relógio não muda o resultado dos jogos', () => {
    const g = toDay()
    const before = JSON.stringify(otherGamesOf(g).map((m) => m.result))
    for (const m of otherGamesOf(g)) for (let minute = 0; minute <= 90; minute += 7) scoreAt(m, minute)
    expect(JSON.stringify(otherGamesOf(g).map((m) => m.result))).toBe(before)
  })

  it('a aba Jogos é a primeira e lista os outros jogos', () => {
    const g = toDay()
    const html = renderToStaticMarkup(createElement(MatchScreen, { game: g, onNavigate: () => {} }))
    expect(html).toContain('data-testid="other-game"')
    expect(html.match(/data-testid="other-game"/g)).toHaveLength(otherGamesOf(g).length)
    expect(html.indexOf('>Jogos<')).toBeLessThan(html.indexOf('>Dados<'))
  })
})

describe('câmera lenta em finalizações, gols e cartões', () => {
  const trace = (shot?: 'goal' | 'saved'): MatchSnapshot['trace'][number] => ({
    minute: 10,
    side: 'home',
    transition: false,
    play: 'through',
    ...(shot ? { shot: { shooterId: 'x', type: 'insideBox', result: shot } } : {}),
  })
  const event = (type: 'goal' | 'yellow-card' | 'red-card' | 'foul') => ({ minute: 10, type, teamId: 't', playerId: 'p', text: '' })

  it('gol é mais lento que finalização, que é mais lenta que o lance comum (que segue a velocidade)', () => {
    expect(slowFor(trace('goal'))).toBe(HOLD_MS.goal)
    expect(slowFor(trace('saved'))).toBe(HOLD_MS.shot)
    expect(slowFor(trace())).toBe(0)
    expect(HOLD_MS.goal).toBeGreaterThan(HOLD_MS.shot)
    expect(HOLD_MS.shot).toBeGreaterThan(700 / 8)
  })

  it('o relógio espera depois de gol, finalização e cartão, em qualquer velocidade, e não espera por falta', () => {
    expect(holdFor([trace('goal')], [event('goal')])).toBe(HOLD_MS.goal)
    expect(holdFor([trace('saved')], [])).toBe(HOLD_MS.shot)
    expect(holdFor([trace()], [event('yellow-card')])).toBe(HOLD_MS.card)
    expect(holdFor([trace()], [event('red-card')])).toBe(HOLD_MS.card)
    expect(holdFor([trace()], [event('foul')])).toBe(0)
    expect(holdFor([], [])).toBe(0)
  })
})

describe('lesão no seu time: o jogo para e o técnico escolhe', () => {
  const hold = (seed: number) => startMatch({ ...input(a, b, seed), userControlled: { home: true }, holdInjurySubs: true })

  /** Joga até a primeira lesão do mandante (ou o fim) e devolve a partida e o instante. */
  const untilInjury = (m: ReturnType<typeof hold>) => {
    for (let minute = 1; minute <= 90 && !m.finished; minute++) {
      m.playUntil(minute)
      const s = m.snapshot()
      if (s.injuryPending || s.events.some((e) => e.type === 'injury' && e.teamId === a.id)) return s
    }
    return m.snapshot()
  }
  const seedWithInjury = (): number => {
    for (let seed = 1; seed < 600; seed++) if (untilInjury(hold(seed)).injuryPending) return seed
    throw new Error('nenhuma lesão do mandante nas sementes testadas')
  }

  it('o jogador sai, o relógio não anda e a troca não é feita sozinha', () => {
    const m = hold(seedWithInjury())
    const s = untilInjury(m)
    const pending = s.injuryPending!
    expect(pending.side).toBe('home')
    expect(s.home.onPitch.some((p) => p.playerId === pending.playerId)).toBe(false)
    expect(s.home.onPitch).toHaveLength(10)
    expect(s.home.subsLeft).toBe(5)
    const minute = m.minute
    m.playUntil(90)
    expect(m.minute).toBe(minute)
    expect(m.finished).toBe(false)
  })

  it('escolher o reserva coloca o time com 11 de novo, gasta uma troca e o jogo segue até o fim', () => {
    const m = hold(seedWithInjury())
    const s = untilInjury(m)
    const pick = s.home.bench[0]!
    m.resolveInjury('home', pick)
    const after = m.snapshot()
    expect(after.injuryPending).toBeUndefined()
    expect(after.home.onPitch).toHaveLength(11)
    expect(after.home.onPitch.some((p) => p.playerId === pick)).toBe(true)
    expect(after.home.subsLeft).toBe(4)
    expect(after.home.stopsLeft).toBe(2)
    m.playUntil(90)
    expect(m.finished || m.snapshot().injuryPending !== undefined).toBe(true)
  })

  it('seguir com um a menos mantém o time com 10 e libera o jogo', () => {
    const m = hold(seedWithInjury())
    untilInjury(m)
    m.resolveInjury('home')
    const s = m.snapshot()
    expect(s.injuryPending).toBeUndefined()
    expect(s.home.subsLeft).toBe(5)
    expect(s.home.onPitch.length).toBeLessThanOrEqual(10)
  })

  it('sem trocas disponíveis o time fica com um a menos e o jogo não espera ninguém', () => {
    for (let seed = 1; seed < 800; seed++) {
      const m = hold(seed)
      m.playUntil(1)
      const s0 = m.snapshot()
      const bench = [...s0.home.bench]
      const outs = s0.home.onPitch.filter((p) => p.slot !== 'GK').slice(0, 5)
      if (bench.length < 5 || outs.length < 5) continue
      outs.forEach((o, i) => m.substitute('home', o.playerId, bench[i]!))
      const before = m.snapshot().events.length
      m.playUntil(90)
      const s = m.snapshot()
      const hurt = s.events.slice(before).find((e) => e.type === 'injury' && e.teamId === a.id)
      if (!hurt) continue
      expect(s.injuryPending).toBeUndefined()
      expect(s.home.subsLeft).toBe(0)
      expect(s.home.onPitch.length).toBeLessThanOrEqual(10)
      return
    }
    throw new Error('nenhuma lesão sem trocas nas sementes testadas')
  })

  it('a regra de 3 paradas vale: sem parada disponível a lesão também deixa o time com um a menos', () => {
    for (let seed = 1; seed < 1200; seed++) {
      const m = hold(seed)
      m.playUntil(1)
      let ok = true
      for (const minute of [10, 20, 30]) {
        m.playUntil(minute)
        const s = m.snapshot()
        if (s.injuryPending) {
          ok = false
          break
        }
        const out = s.home.onPitch.find((p) => p.slot !== 'GK')
        const inn = s.home.bench[0]
        if (!out || !inn) {
          ok = false
          break
        }
        m.substitute('home', out.playerId, inn)
      }
      if (!ok || m.snapshot().home.stopsLeft !== 0) continue
      const before = m.snapshot().events.length
      m.playUntil(90)
      const s = m.snapshot()
      if (!s.events.slice(before).some((e) => e.type === 'injury' && e.teamId === a.id)) continue
      expect(s.injuryPending).toBeUndefined()
      return
    }
    throw new Error('nenhuma lesão depois das 3 paradas nas sementes testadas')
  })

  it('sem o aviso (padrão) nada muda: o melhor reserva entra na hora, como sempre', () => {
    const seed = seedWithInjury()
    const plain = startMatch({ ...input(a, b, seed), userControlled: { home: true } })
    plain.playUntil(90)
    const s = plain.snapshot()
    expect(s.injuryPending).toBeUndefined()
    expect(s.events.some((e) => e.type === 'injury' && e.teamId === a.id)).toBe(true)
  })
})

describe('tela de partida: abas, controles e velocidade', () => {
  afterEach(() => clearLive())
  const toDay = (): Game => {
    let g = createGame(3, 'team-imp')
    while (!g.pendingUserMatch) g = advanceToMatchday(g)
    return g
  }

  it('o campo está sempre na tela e não existe mais Campo / Só lances', () => {
    const html = renderToStaticMarkup(createElement(MatchScreen, { game: toDay(), onNavigate: () => {} }))
    expect(html).toContain('data-testid="pitch"')
    expect(html).not.toContain('Só lances')
    expect(html).not.toContain('Como ver a partida')
    for (const old of ['>1x<', '>4x<', '>8x<', 'Velocidade</span>']) expect(html).not.toContain(old)
  })

  it('um único botão de velocidade (2x de início) fica no placar', () => {
    const html = renderToStaticMarkup(createElement(MatchScreen, { game: toDay(), onNavigate: () => {} }))
    expect(html.match(/data-testid="speed"/g)).toHaveLength(1)
    expect(html.indexOf('data-testid="speed"')).toBeLessThan(html.indexOf('data-testid="pitch"'))
  })

  it('a lista de lances fica numa seção própria depois das abas', () => {
    const g = toDay()
    beginLive(g, true).match.playUntil(20)
    const html = renderToStaticMarkup(createElement(MatchScreen, { game: g, onNavigate: () => {} }))
    expect(html.indexOf('>Trocas<')).toBeLessThan(html.indexOf('Lances ao vivo'))
    expect(html).toContain('Mostrar faltas')
  })

  it('no intervalo os botões são Começar o 2º tempo e Ir ao fim', () => {
    const g = toDay()
    const live = beginLive(g, true)
    live.match.playUntil(45)
    live.halftimeDone = true
    const html = renderToStaticMarkup(createElement(MatchScreen, { game: g, onNavigate: () => {} }))
    expect(html).toContain('Começar o 2º tempo')
    expect(html).toContain('Ir ao fim')
    expect(html).toContain('Intervalo')
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
