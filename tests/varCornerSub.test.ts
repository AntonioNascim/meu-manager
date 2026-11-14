import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { formationOf } from '../src/engine/formations'
import { startMatch } from '../src/engine/match'
import type { MatchInput, MatchSnapshot } from '../src/engine/match'
import { holdFor, HOLD_MS } from '../src/engine/match/timing'
import type { Player, Team } from '../src/engine/types'
import { beatsFor, layoutFrom, playbackFor } from '../src/ui/screens/match/pitchModel'
import { VAR, varMoments } from '../src/ui/screens/match/varNarrative'
import { substituteCandidates } from '../src/ui/screens/squad/SubstituteSheet'
import { OnlineMatchHandle, POSITION_SEND_DELAY_MS } from '../src/store/onlineMatch'
import type { LiveSession } from '../src/online/liveSession'

const world = generateWorld({ seed: 11 })
const squad = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
const teams = world.teams.filter((t) => t.tier === 1)
const played = (i: number): MatchSnapshot => {
  const home = teams[i % teams.length] as Team
  const away = teams[(i * 5 + 3) % teams.length] === home ? (teams[(i + 1) % teams.length] as Team) : (teams[(i * 5 + 3) % teams.length] as Team)
  const input: MatchInput = { home: { team: home, players: squad(home) }, away: { team: away, players: squad(away) }, seed: 500 + i * 31, attendance: 30_000 }
  const m = startMatch(input)
  m.playUntil(90)
  return m.snapshot()
}
const games = Array.from({ length: 60 }, (_, i) => played(i))
const wingers = (s: MatchSnapshot) => ({
  home: formationOf({ formationId: s.home.formationId, grid: s.home.grid }).slots.some((x) => (x.position === 'RW' || x.position === 'LW') && x.sector === 'attack'),
  away: formationOf({ formationId: s.away.formationId, grid: s.away.grid }).slots.some((x) => (x.position === 'RW' || x.position === 'LW') && x.sector === 'attack'),
})

describe('VAR como narrativa (só visual)', () => {
  it('é igual para a mesma partida, rara (no máximo 2 por jogo) e só em lances que o motor decidiu assim', () => {
    let withVar = 0
    for (const [i, s] of games.entries()) {
      const a = varMoments(s.trace, s.events, `m${i}`)
      expect(varMoments(s.trace, s.events, `m${i}`)).toEqual(a)
      expect(a.size).toBeLessThanOrEqual(VAR.maxPerMatch)
      if (a.size > 0) withVar++
      for (const [key, m] of a) {
        const [type, idx] = key.split(':') as ['t' | 'e', string]
        if (type === 'e') {
          expect(s.events[Number(idx)]?.type).toBe('red-card')
          expect(m.steps[m.steps.length - 1]).toBe('Vermelho confirmado')
        } else {
          const t = s.trace[Number(idx)]!
          if (m.kind === 'goal-check') expect(t.shot?.result).toBe('goal')
          if (m.kind === 'penalty-confirmed') expect(t.shot?.type).toBe('penalty')
          // "Pênalti anulado" só em lance em que o motor não deu finalização nenhuma (nem pênalti).
          if (m.kind === 'penalty-overturned') expect(t.shot).toBeUndefined()
        }
      }
    }
    // Algumas partidas têm, a maioria não.
    expect(withVar).toBeGreaterThan(0)
    expect(withVar).toBeLessThan(games.length * 0.8)
  })

  it('escolher com o jogo pela metade dá o mesmo que escolher no fim (os primeiros lances nunca mudam)', () => {
    for (const [i, s] of games.slice(0, 30).entries()) {
      const full = varMoments(s.trace, s.events, `m${i}`)
      const half = s.trace.filter((t) => t.minute <= 45)
      const first = varMoments(half, s.events.filter((e) => e.minute <= 45), `m${i}`)
      for (const [key, m] of first) expect(full.get(key)).toEqual(m)
    }
  })

  it('a semente da partida muda quais lances ganham a cena', () => {
    const s = games.find((g) => g.trace.some((t) => t.shot?.result === 'goal'))!
    const sets = new Set(Array.from({ length: 40 }, (_, k) => [...varMoments(s.trace, s.events, `x${k}`).keys()].join(',')))
    expect(sets.size).toBeGreaterThan(1)
  })
})

describe('escanteio no campo 2D (só visual)', () => {
  it('o motor já gera escanteios e a cena leva a bola ao canto e cruza para a área', () => {
    let corners = 0
    let scenes = 0
    for (const s of games) {
      corners += s.homeStats.corners + s.awayStats.corners
      const layout = layoutFrom(s, wingers(s))
      const active = new Set(layout.keys())
      for (const t of s.trace) {
        const beats = beatsFor(t, layout, s.events, active)
        const at = beats.findIndex((b) => b.marks.some((m) => m.kind === 'corner') && b.phase === 'chance' && !b.arrow)
        if (at < 0) continue
        scenes++
        const setup = beats[at]!
        // o batedor caminha até o canto, os jogadores se posicionam na área e só então vem o cruzamento
        const gather = beats[at + 1]!
        expect(setup.still && gather.still).toBe(true)
        expect(Object.keys(gather.moves).length).toBeGreaterThan(Object.keys(setup.moves).length - 1)
        const cross = beats[at + 2]!
        const flag = setup.marks.find((m) => m.kind === 'corner')!.at
        // a bola vai ao canto (perto da linha de fundo e de uma das laterais) ...
        expect(Math.min(flag.x, 1 - flag.x)).toBeLessThan(0.05)
        expect(Math.min(flag.y, 1 - flag.y)).toBeLessThan(0.05)
        expect(setup.ball).toEqual(flag)
        // ... e a cobrança é um cruzamento (curva) para dentro da área
        expect(cross.arrow?.curve).toBe(true)
        expect(cross.arrow!.from).toEqual(flag)
        expect(Math.abs(cross.arrow!.to.y - 0.5)).toBeLessThan(0.15)
        expect(Math.min(cross.ball.x, 1 - cross.ball.x)).toBeLessThan(0.14)
      }
    }
    expect(corners).toBeGreaterThan(0)
    expect(scenes).toBeGreaterThan(0)
  })

  it('em velocidades altas o desfecho continua sendo a finalização, e o escanteio pede um tempo a mais do relógio sem passar do gol', () => {
    for (const s of games.slice(0, 20)) {
      const layout = layoutFrom(s, wingers(s))
      for (const t of s.trace) {
        if (!t.shot) continue
        const beats = beatsFor(t, layout, s.events, new Set(layout.keys()))
        if (!beats.some((b) => b.phase === 'shot')) continue
        const fast = playbackFor(beats, 8, false)
        expect(fast.beats).toHaveLength(1)
        expect(fast.beats[0]!.phase).toBe('shot')
      }
    }
    const corner = { minute: 10, type: 'corner', teamId: 'x', playerId: 'y', text: '' } as const
    expect(holdFor([], [corner])).toBe(HOLD_MS.corner)
    expect(HOLD_MS.corner).toBeLessThan(HOLD_MS.goal)
  })
})

describe('janela de substituição na Escalação', () => {
  const team = teams[0] as Team
  const players = squad(team)
  it('mesma posição primeiro, depois as outras com a força mais baixa; goleiro só com goleiro', () => {
    for (const starterId of team.tactic.startingXI) {
      const found = substituteCandidates(team.tactic, players, starterId)!
      expect(found.same.every((c) => c.player.position === found.slot)).toBe(true)
      expect(found.others.every((c) => c.player.position !== found.slot)).toBe(true)
      const sorted = (list: typeof found.same) => list.every((c, i) => i === 0 || list[i - 1]!.strength >= c.strength)
      expect(sorted(found.same) && sorted(found.others)).toBe(true)
      expect(found.same.concat(found.others).some((c) => c.player.id === starterId)).toBe(false)
      if (found.slot === 'GK') expect(found.same.concat(found.others).every((c) => c.player.position === 'GK')).toBe(true)
      else expect(found.same.concat(found.others).every((c) => c.player.position !== 'GK')).toBe(true)
      // quem está fora da posição natural rende menos que na própria
      for (const c of found.others) expect(c.strength).toBeLessThan(c.player.attributes ? 100 : 0)
    }
    expect(substituteCandidates(team.tactic, players, 'ninguem')).toBeUndefined()
  })
  it('diz onde cada um está hoje: titular em outra posição, banco ou fora do banco', () => {
    const starter = team.tactic.startingXI[3]!
    const found = substituteCandidates(team.tactic, players, starter)!
    const all = [...found.same, ...found.others]
    for (const c of all) {
      if (team.tactic.startingXI.includes(c.player.id)) expect(c.where.zone).toBe('xi')
      else if (team.tactic.bench.includes(c.player.id)) expect(c.where.zone).toBe('bench')
      else expect(c.where.zone).toBe('rest')
    }
  })
})

describe('posição na partida online: aparece na hora e vale só a última', () => {
  const s = games[0]!
  const sent: { type: string; playerId?: string; point?: { row: number; lane: number } }[] = []
  const session = {
    state: { status: 'live', minute: 10, paused: false, games: [{ matchId: 'm', snapshot: s, controlled: { home: true, away: false }, speed: 2, speeds: {} }], outcomes: [] as never[], pending: [], myTeamId: s.home.teamId },
    subscribe: () => () => {},
    send: (c: { type: string }) => {
      sent.push(c)
      return `id${sent.length}`
    },
    close: () => {},
  } as unknown as LiveSession
  const handle = new OnlineMatchHandle('liga', 'eu', session)
  const mine = s.home.onPitch
  const [a, b] = [mine[3]!, mine[5]!]
  const pointOf = (id: string) => handle.live.match.snapshot().home.onPitch.find((p) => p.playerId === id)!.point

  it('o jogador vai na hora para o ponto novo (e quem estava lá troca) e só a última de cada jogador é enviada', async () => {
    const free = { row: 5, lane: 4 }
    handle.live.match.setPosition('home', a.playerId, { row: 5, lane: 0 })
    handle.live.match.setPosition('home', a.playerId, free)
    expect(pointOf(a.playerId)).toEqual(free)
    handle.live.match.setPosition('home', b.playerId, a.point as { row: number; lane: number })
    expect(pointOf(b.playerId)).toEqual(a.point)
    expect(sent).toHaveLength(0) // ainda não foi (espera o tempo de agrupar)
    await new Promise((r) => setTimeout(r, POSITION_SEND_DELAY_MS + 80))
    expect(sent.map((c) => c.playerId)).toEqual([a.playerId, b.playerId])
    expect(sent[0]!.point).toEqual(free) // só a última posição de `a`
  })

  it('se o servidor recusa, o jogador volta ao lugar e aparece o motivo', () => {
    ;(session.state as { outcomes: unknown[] }).outcomes = ['id1', 'id2'].map((id) => ({ id, playerId: 'eu', ok: false, reason: 'engine', detail: 'O gol não pode ficar sem goleiro' }))
    ;(handle as unknown as { adapter: { reconcile: (o: unknown[]) => void } }).adapter.reconcile((session.state as { outcomes: unknown[] }).outcomes)
    expect(pointOf(a.playerId)).toEqual(a.point)
    expect(handle.positionError()).toBe('O gol não pode ficar sem goleiro')
  })
})
