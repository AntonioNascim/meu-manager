import { describe, expect, it } from 'vitest'
import { applyEventAbsence, levelOf, markPresent, recordMatch, shouldOpenVacancy, suggestionsFor } from '../src/engine/league/absence'
import type { Seat } from '../src/engine/league/runner'

const seat = (over: Partial<Seat> = {}): Seat => ({ teamId: 't1', playerId: 'p1', status: 'active', ready: false, ...over })
const DAY = 24 * 60 * 60 * 1000

describe('ausência na liga online (B7, 2.9)', () => {
  it('1 ou 2 faltas = ausente; 3 = autopiloto longo; presença zera', () => {
    let s = recordMatch(seat(), false, 0)
    expect([s.status, levelOf(s)]).toEqual(['absent', 'absent'])
    s = recordMatch(s, false, 0)
    expect(levelOf(s)).toBe('absent')
    s = recordMatch(s, false, 0)
    expect([s.status, levelOf(s)]).toEqual(['autopilot', 'long-autopilot'])
    s = recordMatch(s, true, 5)
    expect([s.status, s.missed, levelOf(s)]).toEqual(['active', 0, 'present'])
  })

  it('liga aberta abre a vaga com 6 faltas ou 21 dias; liga de amigos nunca', () => {
    expect(shouldOpenVacancy(seat({ missed: 5 }), 'open', 0, 0)).toBe(false)
    expect(shouldOpenVacancy(seat({ missed: 6 }), 'open', 0, 0)).toBe(true)
    expect(shouldOpenVacancy(seat({ lastActiveAt: 0 }), 'open', 20 * DAY, 0)).toBe(false)
    expect(shouldOpenVacancy(seat({ lastActiveAt: 0 }), 'open', 21 * DAY, 0)).toBe(true)
    expect(shouldOpenVacancy(seat({ missed: 30, lastActiveAt: 0 }), 'friends', 90 * DAY, 0)).toBe(false)
  })

  it('applyEventAbsence: só conta quem tinha partida, avisa o autopiloto longo e retira em liga aberta', () => {
    const seats = [seat({ playerId: 'a', missed: 2 }), seat({ playerId: 'b', missed: 5 }), seat({ playerId: 'c', missed: 4 })]
    const out = applyEventAbsence(seats, new Set(['a', 'b']), new Set(), 'open', 0, () => 0)
    expect(out.seats.map((s) => s.playerId)).toEqual(['a', 'c'])
    expect(out.vacated.map((s) => s.playerId)).toEqual(['b'])
    expect(out.newLongAutopilot.map((s) => s.playerId)).toEqual(['a'])
    expect(out.seats.find((s) => s.playerId === 'c')?.missed).toBe(4)
    const friends = applyEventAbsence(seats, new Set(['a', 'b']), new Set(), 'friends', 0, () => 0)
    expect(friends.vacated).toEqual([])
    expect(friends.seats).toHaveLength(3)
  })

  it('sugestões ao ADM de amigos', () => {
    const list = suggestionsFor([seat({ playerId: 'a', missed: 6 }), seat({ playerId: 'b', missed: 1 })], 0, () => 0)
    expect(list.map((x) => x.playerId)).toEqual(['a'])
    expect(markPresent(seat({ missed: 4 }), 9).missed).toBe(0)
  })
})
