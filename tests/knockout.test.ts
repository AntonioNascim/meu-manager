import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { MATCH } from '../src/engine/config'
import { knockoutLeader, runShootout, simulateMatch, simulateQuick, startMatch } from '../src/engine/match'
import type { KnockoutRules, MatchInput } from '../src/engine/match'
import { createRng } from '../src/engine/rng'
import type { Player } from '../src/engine/types'

const world = generateWorld({ seed: 4 })
const [home, away] = world.teams.filter((t) => t.tier === 1) as [(typeof world.teams)[number], (typeof world.teams)[number]]
const squad = (id: string) => world.players.filter((p) => p.teamId === id)
const input = (seed: number, knockout?: KnockoutRules): MatchInput => ({
  home: { team: home, players: squad(home.id) },
  away: { team: away, players: squad(away.id) },
  seed,
  ...(knockout ? { knockout } : {}),
})
const KO: KnockoutRules = { extraTime: true, penalties: true }
/** Gols de um time até o minuto dado (gol contra conta para o time beneficiado, que é o teamId do lance). */
const goalsBy = (r: { events: { type: string; minute: number; teamId: string }[] }, teamId: string, upTo: number) =>
  r.events.filter((e) => e.minute <= upTo && ((e.type === 'goal' || e.type === 'own-goal') && e.teamId === teamId)).length

describe('quem está na frente do confronto', () => {
  it('jogo único: vence quem fez mais gols; empate = ninguém', () => {
    expect(knockoutLeader({}, 2, 1)).toBe('home')
    expect(knockoutLeader({}, 0, 1)).toBe('away')
    expect(knockoutLeader({}, 1, 1)).toBeNull()
  })

  it('volta: soma da ida e da volta; gol fora só conta quando a regra está ligada', () => {
    // Na ida o mandante desta partida (que jogou fora lá) fez 2 e o visitante fez 1.
    const prior = { home: 2, away: 1 }
    expect(knockoutLeader({ priorLeg: prior }, 1, 1)).toBe('home')
    expect(knockoutLeader({ priorLeg: prior }, 0, 1)).toBeNull()
    expect(knockoutLeader({ priorLeg: prior }, 0, 2)).toBe('away')
    // Soma 2 a 2 com a regra: o mandante da volta marcou 2 fora e o visitante marca 1 fora aqui -> o mandante da volta passa.
    expect(knockoutLeader({ priorLeg: prior, awayGoals: true }, 0, 1)).toBe('home')
    // Soma 3 a 3 (ida 2 a 1; volta 1 a 2): o visitante da volta fez 2 fora, o mandante fez 2 fora na ida -> empate também no gol fora.
    expect(knockoutLeader({ priorLeg: prior, awayGoals: true }, 1, 2)).toBeNull()
    expect(knockoutLeader({ priorLeg: prior }, 1, 2)).toBeNull()
  })
})

describe('prorrogação e pênaltis no motor completo', () => {
  const results = Array.from({ length: 120 }, (_, i) => simulateMatch(input(i + 1, KO)))

  it('todo jogo acaba decidido: no tempo normal, na prorrogação ou nos pênaltis', () => {
    for (const r of results) {
      if (r.penalties) {
        expect(r.homeGoals).toBe(r.awayGoals)
        expect(r.penalties.home).not.toBe(r.penalties.away)
        expect(r.shootout!.length).toBeGreaterThanOrEqual(6)
        expect(r.extraTime).toBe(true)
      } else {
        expect(r.homeGoals).not.toBe(r.awayGoals)
      }
    }
    expect(results.some((r) => r.penalties)).toBe(true)
  })

  it('só os empatados nos 90 minutos têm prorrogação, e os lances dela são dos minutos 91 a 120', () => {
    const extra = results.filter((r) => r.extraTime)
    expect(extra.length).toBeGreaterThan(10)
    expect(extra.length).toBeLessThan(60)
    for (const r of extra) {
      expect(goalsBy(r, home.id, 90)).toBe(goalsBy(r, away.id, 90))
      expect(Math.max(...r.events.map((e) => e.minute))).toBeLessThanOrEqual(120)
    }
    for (const r of results.filter((x) => !x.extraTime)) expect(Math.max(0, ...r.events.map((e) => e.minute))).toBeLessThanOrEqual(90)
  })

  it('a prorrogação cansa: quem joga 120 minutos termina com menos condição do que no mesmo jogo sem ela', () => {
    let compared = 0
    let drop = 0
    for (let seed = 1; seed <= 120 && compared < 40; seed++) {
      const withExtra = simulateMatch(input(seed, KO))
      if (!withExtra.extraTime) continue
      const plain = simulateMatch(input(seed))
      const a = new Map(withExtra.playerResults.map((p) => [p.playerId, p]))
      const b = new Map(plain.playerResults.map((p) => [p.playerId, p]))
      for (const [id, p] of a) {
        const q = b.get(id)
        if (q && p.minutesPlayed >= 100) {
          expect(p.minutesPlayed).toBeGreaterThan(q.minutesPlayed)
          drop += q.finalFitness - p.finalFitness
          compared++
        }
      }
    }
    expect(compared).toBeGreaterThan(20)
    expect(drop / compared).toBeGreaterThan(4)
  })

  it('o resultado é o mesmo em qualquer número de passos e a disputa de pênaltis não muda quando se pede de novo', () => {
    for (const seed of [3, 9, 14, 21]) {
      const direct = simulateMatch(input(seed, KO))
      const live = startMatch(input(seed, KO))
      for (let m = 5; m <= 120; m += 5) live.playUntil(m)
      expect(live.finished).toBe(true)
      expect(live.result()).toEqual(direct)
      expect(live.result()).toBe(live.result())
    }
  })

  it('sem regras de mata-mata nada muda: 90 minutos, empate é empate', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = simulateMatch(input(seed))
      expect(r.extraTime).toBeUndefined()
      expect(r.penalties).toBeUndefined()
      expect(Math.max(...r.events.map((e) => e.minute))).toBeLessThanOrEqual(90)
    }
  })

  it('o tempo normal é o mesmo com ou sem as regras de mata-mata', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const plain = simulateMatch(input(seed))
      const ko = simulateMatch(input(seed, KO))
      const goals = (r: typeof plain, upTo: number) => r.events.filter((e) => e.type === 'goal' && e.minute <= upTo).map((e) => e.playerId)
      expect(goals(ko, 90)).toEqual(goals(plain, 90))
    }
  })

  it('na volta de um confronto, a prorrogação só vem se a soma com a ida está empatada', () => {
    const lead = { extraTime: true, penalties: true, priorLeg: { home: 0, away: 3 } }
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = simulateMatch(input(seed, lead))
      const tiedAt90 = goalsBy(r, home.id, 90) + lead.priorLeg.home === goalsBy(r, away.id, 90) + lead.priorLeg.away
      expect(Boolean(r.extraTime)).toBe(tiedAt90)
    }
  })

  it('estádio neutro tira a vantagem de casa', () => {
    let neutral = 0
    let normal = 0
    const n = 200
    for (let seed = 1; seed <= n; seed++) {
      const a = simulateMatch({ ...input(seed), neutral: true })
      if (a.homeGoals > a.awayGoals) neutral++
      const b = simulateMatch(input(seed))
      if (b.homeGoals > b.awayGoals) normal++
    }
    expect(normal).toBeGreaterThan(neutral)
  })
})

describe('disputa de pênaltis decidida pelos atributos', () => {
  const pick = (teamId: string): Player[] => squad(teamId).filter((p) => p.position !== 'GK').slice(0, 10)
  const keeperOf = (teamId: string) => squad(teamId).find((p) => p.position === 'GK') as Player
  const side = (teamId: string, tweak: (p: Player) => Player) => {
    const on = [...pick(teamId).map(tweak), tweak(keeperOf(teamId))]
    return { teamId, onPitch: on, preferred: [] as string[], keeper: on[on.length - 1] as Player }
  }
  const boost = (finishing: number, determination: number, reflexes = 50) => (p: Player): Player => ({ ...p, attributes: { ...p.attributes, finishing, determination, decisions: determination, reflexes, positioning: reflexes } })

  const winRate = (a: (p: Player) => Player, b: (p: Player) => Player, n = 600) => {
    let wins = 0
    for (let i = 0; i < n; i++) {
      const r = runShootout(createRng(`pen-${i}`), side(home.id, a), side(away.id, b))
      expect(r.home).not.toBe(r.away)
      if (r.home > r.away) wins++
    }
    return wins / n
  }

  it('cobradores melhores e frios ganham mais; goleiro melhor também', () => {
    expect(winRate(boost(85, 85), boost(45, 45))).toBeGreaterThan(0.6)
    expect(winRate(boost(45, 45), boost(85, 85))).toBeLessThan(0.4)
    expect(winRate(boost(60, 60, 90), boost(60, 60, 20))).toBeGreaterThan(0.58)
    const even = winRate(boost(60, 60), boost(60, 60))
    expect(even).toBeGreaterThan(0.4)
    expect(even).toBeLessThan(0.6)
  })

  it('segue a ordem dos cobradores do técnico e para quando um lado já não alcança', () => {
    const s = side(home.id, (p) => p)
    const preferred = [s.onPitch[3]!.id, s.onPitch[1]!.id, s.onPitch[0]!.id]
    const r = runShootout(createRng('ordem'), { ...s, preferred }, side(away.id, (p) => p))
    const mine = r.kicks.filter((k) => k.teamId === home.id).map((k) => k.playerId)
    expect(mine.slice(0, 3)).toEqual(preferred)
    expect(r.kicks.length).toBeLessThanOrEqual(10 + 2 * MATCH.shootout.suddenDeathMax)
  })
})

describe('prorrogação e pênaltis no motor simplificado', () => {
  const quick = (seed: number, knockout?: KnockoutRules) =>
    simulateQuick({ home: { team: home, players: squad(home.id) }, away: { team: away, players: squad(away.id) }, seed, ...(knockout ? { knockout } : {}) })

  it('decide todos os jogos e a prorrogação aparece nos minutos jogados', () => {
    const results = Array.from({ length: 200 }, (_, i) => quick(i + 1, KO))
    const extra = results.filter((r) => r.extraTime)
    expect(extra.length).toBeGreaterThan(20)
    for (const r of results) {
      if (r.penalties) {
        expect(r.homeGoals).toBe(r.awayGoals)
        expect(r.penalties.home).not.toBe(r.penalties.away)
      } else expect(r.homeGoals).not.toBe(r.awayGoals)
    }
    const minutes = (r: (typeof results)[number]) => Math.max(...r.playerResults.map((p) => p.minutesPlayed))
    expect(Math.max(...extra.map(minutes))).toBeGreaterThan(100)
    expect(Math.max(...results.filter((r) => !r.extraTime).map(minutes))).toBeLessThanOrEqual(91)
  })

  it('sem regras de mata-mata continua igual', () => {
    for (const seed of [1, 2, 3]) expect(quick(seed)).toEqual(quick(seed))
    expect(quick(1).extraTime).toBeUndefined()
  })
})
