import { describe, expect, it } from 'vitest'
import { ANALYST, analystRead } from '../src/ui/screens/match/analyst'
import type { AnalystInput } from '../src/ui/screens/match/analyst'

const stats = (o: Partial<AnalystInput['snap']['homeStats']> = {}) => ({ possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, xg: 0, ...o })
const pitch = (n = 11, fitness = 90) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, slot: i === 0 ? ('GK' as const) : ('CM' as const), fitness, yellowCards: 0 }))
const sideOf = (o: Record<string, unknown> = {}) => ({ teamId: 'a', formationId: '4-4-2', style: 'possession', mentality: 0, activeMentality: 0, goals: 0, onPitch: pitch(), grid: [], bench: ['b1'], subsLeft: 5, stopsLeft: 3, ...o })
function input(o: { minute: number; goals?: [number, number]; mine?: Record<string, unknown>; myStats?: object; theirStats?: object }): AnalystInput {
  const [h, a] = o.goals ?? [0, 0]
  return {
    side: 'home',
    nameOf: (id) => `Jogador ${id}`,
    snap: { minute: o.minute, finished: false, homeGoals: h, awayGoals: a, homeStats: stats(o.myStats), awayStats: stats(o.theirStats), home: sideOf(o.mine) as never, away: sideOf() as never },
  }
}

describe('analista', () => {
  it('não diz nada antes do jogo, no fim, ou com a partida parada por lesão', () => {
    expect(analystRead(input({ minute: 0 }))).toBeNull()
    const i = input({ minute: 50 })
    expect(analystRead({ ...i, snap: { ...i.snap, finished: true } })).toBeNull()
    expect(analystRead({ ...i, snap: { ...i.snap, injuryPending: { side: 'home', playerId: 'p3' } } })).toBeNull()
  })

  it('jogo equilibrado, nada a dizer', () => {
    expect(analystRead(input({ minute: 30, myStats: { shots: 4 }, theirStats: { shots: 4 } }))).toBeNull()
  })

  it('pressão do rival: sugere recuar um nível', () => {
    const r = analystRead(input({ minute: 30, myStats: { shots: 1 }, theirStats: { shots: 7 } }))
    expect(r?.tone).toBe('warn')
    expect(r?.text).toContain('7 finalizações contra 1')
    expect(r?.action).toEqual({ kind: 'mentality', value: -1 })
  })

  it('não sugere recuar de quem já está defensivo', () => {
    expect(analystRead(input({ minute: 30, mine: { activeMentality: -1 }, myStats: { shots: 1 }, theirStats: { shots: 7 } }))).toBeNull()
  })

  it('domínio sem gol: sugere ousar', () => {
    const r = analystRead(input({ minute: 40, myStats: { shots: 9, possession: 62 }, theirStats: { shots: 3 } }))
    expect(r?.action).toEqual({ kind: 'mentality', value: 1 })
  })

  it('reta final perdendo: ataca; nos 10 minutos finais, mais', () => {
    expect(analystRead(input({ minute: 70, goals: [0, 1] }))?.action).toEqual({ kind: 'mentality', value: 1 })
    expect(analystRead(input({ minute: 82, goals: [0, 1] }))?.action).toEqual({ kind: 'mentality', value: 2 })
  })

  it('reta final ganhando: fecha a casa', () => {
    const r = analystRead(input({ minute: 80, goals: [2, 1] }))
    expect(r?.tone).toBe('good')
    expect(r?.action).toEqual({ kind: 'mentality', value: -1 })
  })

  it('cansaço: aponta o mais cansado e leva à aba Tática', () => {
    const onPitch = pitch(11, 90).map((p, i) => (i === 4 ? { ...p, fitness: 40 } : i === 6 ? { ...p, fitness: 50 } : p))
    const r = analystRead(input({ minute: 60, mine: { onPitch } }))
    expect(r?.text).toContain('Jogador p4')
    expect(r?.text).toContain('40%')
    expect(r?.action).toEqual({ kind: 'open-tactics' })
  })

  it('cansaço sem troca disponível: nada', () => {
    const onPitch = pitch(11, 40)
    expect(analystRead(input({ minute: 60, mine: { onPitch, subsLeft: 0 } }))).toBeNull()
    expect(analystRead(input({ minute: 60, mine: { onPitch, bench: [] } }))).toBeNull()
  })

  it('com um a menos: sugere recuar', () => {
    const r = analystRead(input({ minute: 40, mine: { onPitch: pitch(10) }, myStats: { redCards: 1 } }))
    expect(r?.text).toContain('10')
    expect(r?.action).toEqual({ kind: 'mentality', value: -1 })
  })

  it('a mentalidade sugerida nunca sai de -2 a 2', () => {
    expect(analystRead(input({ minute: 85, goals: [0, 2], mine: { activeMentality: 2 } }))).toBeNull()
    const r = analystRead(input({ minute: 85, goals: [0, 2], mine: { activeMentality: 1 } }))
    expect(r?.action).toEqual({ kind: 'mentality', value: 2 })
  })

  it('o aviso tem um id estável para o mesmo motivo', () => {
    const a = analystRead(input({ minute: 30, myStats: { shots: 1 }, theirStats: { shots: 7 } }))
    const b = analystRead(input({ minute: 33, myStats: { shots: 1 }, theirStats: { shots: 8 } }))
    expect(a?.id).toBe(b?.id)
    expect(ANALYST.minMinute).toBeGreaterThan(0)
  })
})
