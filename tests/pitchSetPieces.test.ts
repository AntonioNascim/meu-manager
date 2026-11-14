import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { formationOf } from '../src/engine/formations'
import { startMatch } from '../src/engine/match'
import type { MatchInput, MatchSnapshot } from '../src/engine/match'
import { HOLD_MS, holdFor, sceneScale } from '../src/engine/match/timing'
import type { PlayStyle, Player, Team } from '../src/engine/types'
import { afterShotBeats, beatsFor, layoutFrom } from '../src/ui/screens/match/pitchModel'
import type { Layout, Side } from '../src/ui/screens/match/pitchModel'
import { PitchMotion, choosePlan } from '../src/ui/screens/match/pitchMotion'

// Jogadas paradas na animação (só visual): tiro de meta, saída de bola depois do gol, escanteio e pênalti em tempos. Nada disso entra no motor.
const world = generateWorld({ seed: 11 })
const squad = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
const teams = world.teams.filter((t) => t.tier === 1)
const played = (i: number): MatchSnapshot => {
  const home = teams[i % teams.length] as Team
  const other = teams[(i * 5 + 3) % teams.length] as Team
  const away = other === home ? (teams[(i + 1) % teams.length] as Team) : other
  const input: MatchInput = { home: { team: home, players: squad(home) }, away: { team: away, players: squad(away) }, seed: 700 + i * 37, attendance: 30_000 }
  const m = startMatch(input)
  m.playUntil(90)
  return m.snapshot()
}
const games = Array.from({ length: 40 }, (_, i) => played(i))
const wingers = (s: MatchSnapshot) => ({
  home: formationOf({ formationId: s.home.formationId, grid: s.home.grid }).slots.some((x) => (x.position === 'RW' || x.position === 'LW') && x.sector === 'attack'),
  away: formationOf({ formationId: s.away.formationId, grid: s.away.grid }).slots.some((x) => (x.position === 'RW' || x.position === 'LW') && x.sector === 'attack'),
})
const withStyle = (layout: Layout, side: Side, style: PlayStyle): Layout => new Map([...layout].map(([id, p]) => [id, p.side === side ? { ...p, style } : p]))

function find(result: 'goal' | 'off-target') {
  const out: { trace: MatchSnapshot['trace'][number]; layout: Layout; snap: MatchSnapshot }[] = []
  for (const snap of games) {
    const layout = layoutFrom(snap, wingers(snap))
    for (const trace of snap.trace) if (trace.shot?.result === result && trace.shot.type !== 'penalty' && trace.shot.type !== 'freeKick' && layout.has(trace.shot.shooterId)) out.push({ trace, layout, snap })
  }
  return out
}

describe('tiro de meta depois de um chute para fora', () => {
  const list = find('off-target')
  it('existem chutes para fora para conferir', () => expect(list.length).toBeGreaterThan(5))

  it('a bola volta para a área, o goleiro a pega, ajeita e cobra; o time do goleiro é quem tem a bola', () => {
    for (const { trace, layout } of list.slice(0, 25)) {
      const att = layout.get(trace.shot!.shooterId)!.side
      const scene = afterShotBeats(trace, layout, new Set(layout.keys()))
      expect(scene).toHaveLength(3)
      const [place, settle, kick] = scene as [(typeof scene)[number], (typeof scene)[number], (typeof scene)[number]]
      const keeper = layout.get(place.holder!)!
      expect(keeper.slot).toBe('GK')
      expect(keeper.side).not.toBe(att)
      // a bola é recolocada dentro da área pequena, do lado do gol que foi atacado
      const gx = att === 'home' ? 1 : 0
      expect(Math.abs(place.ball.x - gx)).toBeLessThan(0.08)
      expect(place.ball.y).toBeGreaterThan(0.3)
      expect(place.ball.y).toBeLessThan(0.7)
      expect(place.still).toBe(true)
      expect(settle.holder).toBe(keeper.playerId)
      expect(settle.still).toBeUndefined()
      expect(kick.arrow?.from).toEqual(place.ball)
      expect(layout.get(kick.holder!)!.side).toBe(keeper.side)
      for (const b of scene) expect(b.scene).toBe(true)
    }
  })

  it('toque de bola sai jogando curto, lançamento direto lança longo e os outros estilos ficam no meio-termo', () => {
    const lengths: Record<string, number[]> = { possession: [], direct: [], 'counter-attack': [] }
    const curves: Record<string, boolean[]> = { possession: [], direct: [], 'counter-attack': [] }
    for (const { trace, layout } of list.slice(0, 30)) {
      const att = layout.get(trace.shot!.shooterId)!.side
      const def: Side = att === 'home' ? 'away' : 'home'
      for (const style of ['possession', 'direct', 'counter-attack'] as const) {
        const scene = afterShotBeats(trace, withStyle(layout, def, style), new Set(layout.keys()))
        const kick = scene[2]!
        lengths[style]!.push(Math.hypot((kick.arrow!.to.x - kick.arrow!.from.x) * 105, (kick.arrow!.to.y - kick.arrow!.from.y) * 68))
        curves[style]!.push(kick.arrow!.curve)
      }
    }
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    expect(avg(lengths['possession']!)).toBeLessThan(avg(lengths['counter-attack']!))
    expect(avg(lengths['counter-attack']!)).toBeLessThan(avg(lengths['direct']!))
    expect(avg(lengths['possession']!)).toBeLessThan(25)
    expect(avg(lengths['direct']!)).toBeGreaterThan(40)
    expect(curves['direct']!.every(Boolean)).toBe(true)
    expect(curves['possession']!.some(Boolean)).toBe(false)
  })

  it('é igual a cada vez (sem sorteio)', () => {
    const { trace, layout } = list[0]!
    expect(afterShotBeats(trace, layout)).toEqual(afterShotBeats(trace, layout))
  })
})

describe('saída de bola depois do gol', () => {
  const list = find('goal')
  it('existem gols para conferir', () => expect(list.length).toBeGreaterThan(5))

  it('a bola volta ao meio, cada time se reorganiza no seu lado e quem sofreu o gol dá a saída', () => {
    for (const { trace, layout } of list.slice(0, 25)) {
      const scorer = layout.get(trace.shot!.shooterId)!.side
      const scene = afterShotBeats(trace, layout, new Set(layout.keys()))
      expect(scene).toHaveLength(2)
      const [reset, kickoff] = scene as [(typeof scene)[number], (typeof scene)[number]]
      expect(reset.ball).toEqual({ x: 0.5, y: 0.5 })
      expect(reset.still).toBe(true)
      expect(reset.attSide).not.toBe(scorer)
      expect(layout.get(reset.holder!)!.side).not.toBe(scorer)
      for (const [id, at] of Object.entries(reset.moves)) {
        const p = layout.get(id)!
        if (p.side === 'home') expect(at.x).toBeLessThanOrEqual(0.5)
        else expect(at.x).toBeGreaterThanOrEqual(0.5)
      }
      // quem marcou fica fora do círculo central (≈ 9 m)
      for (const p of layout.values()) if (p.side === scorer) expect(Math.abs((reset.moves[p.playerId]!.x - 0.5) * 105)).toBeGreaterThan(9)
      expect(kickoff.arrow?.from).toEqual({ x: 0.5, y: 0.5 })
      expect(layout.get(kickoff.holder!)!.side).toBe(layout.get(reset.holder!)!.side)
    }
  })

  it('a cena entra no lance do gol depois da finalização', () => {
    const { trace, layout, snap } = list[0]!
    const beats = beatsFor(trace, layout, snap.events, new Set(layout.keys()))
    const shotAt = beats.findIndex((b) => b.phase === 'shot')
    expect(beats.slice(shotAt + 1).every((b) => b.scene)).toBe(true)
    expect(beats.slice(shotAt + 1).length).toBeGreaterThanOrEqual(2)
  })
})

describe('o relógio espera cada cena (e menos no 2x)', () => {
  const trace = (result: 'goal' | 'off-target'): MatchSnapshot['trace'][number] => ({ minute: 10, side: 'home', transition: false, play: 'through', shot: { shooterId: 'x', type: 'insideBox', result } })
  it('gol, tiro de meta e escanteio somam o tempo da cena; no 2x a cena dura a metade', () => {
    expect(holdFor([trace('goal')], [])).toBe(HOLD_MS.goal + HOLD_MS.restart)
    expect(holdFor([trace('off-target')], [])).toBe(HOLD_MS.shot + HOLD_MS.goalKick)
    expect(holdFor([trace('off-target')], [], 2)).toBe(HOLD_MS.shot + HOLD_MS.goalKick * sceneScale(2))
    expect(sceneScale(2)).toBeLessThan(sceneScale(1))
    const corner = { minute: 10, type: 'corner', teamId: 'x', playerId: 'y', text: '' } as const
    expect(holdFor([{ ...trace('off-target'), shot: { shooterId: 'x', type: 'insideBox', result: 'saved' } }], [corner])).toBe(HOLD_MS.shot + HOLD_MS.corner)
  })
})

describe('as cenas tocam no campo sem a bola dar salto', () => {
  it('tiro de meta, saída de bola e escanteio: a bola sai de onde estava e o trecho tem tempo', () => {
    const names = (id: string) => id
    let checked = 0
    for (const snap of games.slice(0, 15)) {
      const layout = layoutFrom(snap, wingers(snap))
      const motion = new PitchMotion()
      motion.setLayout(layout)
      for (const trace of snap.trace) {
        const scene = trace.shot && (trace.shot.result === 'goal' || trace.shot.result === 'off-target')
        // (quem já saiu por troca não está no campo do fim do jogo: o lance desses não tem condutor)
        if (trace.carrierId && !layout.has(trace.carrierId)) continue
        if (trace.shot && !layout.has(trace.shot.shooterId)) continue
        const beats = beatsFor(trace, layout, snap.events, new Set(layout.keys()))
        if (beats.length === 0) continue
        const choice = choosePlan(beats, trace, 1, 1)
        const legs = motion.plan(choice.seq, { trace, names, tickMs: choice.tick, connectors: choice.connectors, relays: choice.relays, arrows: true, setPiece: choice.setPiece, floors: true })
        if (!scene) continue
        checked++
        expect(legs.some((l) => l.beat?.scene)).toBe(true)
        for (const l of legs) expect(l.ms).toBeGreaterThan(0)
        // o texto de cada cena foi preenchido (sem os marcadores)
        for (const l of legs) expect(l.text).not.toContain('{')
        let last = 0
        for (let f = 0; f < Math.round(choice.tick / 16) + 60; f++) {
          const before = { ...motion.ball.pos }
          motion.step(16, { running: true, speed: 1 })
          // nenhum quadro move a bola mais do que um chute forte (o mesmo critério do teste do movimento: ~8 m por quadro; um salto de lado a lado passaria de 40 m)
          last = Math.hypot((motion.ball.pos.x - before.x) * 105, (motion.ball.pos.y - before.y) * 68)
          expect(last).toBeLessThan(8)
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('no 2x o lance cabe em menos tempo', () => {
    const [one] = find('off-target')
    const beats = beatsFor(one!.trace, one!.layout, one!.snap.events, new Set(one!.layout.keys()))
    expect(choosePlan(beats, one!.trace, 1, 2).tick).toBeLessThan(choosePlan(beats, one!.trace, 1, 1).tick)
  })
})
