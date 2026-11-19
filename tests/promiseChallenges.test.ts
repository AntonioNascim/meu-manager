import { describe, expect, it } from 'vitest'
import { evaluateBoard } from '../src/engine/board'
import { BOARD } from '../src/engine/config'
import type { ChallengeKind } from '../src/engine/challenges'
import { drawChallenges, drawOffers, evaluateChallenge, startChallenge, starsOf } from '../src/engine/challenges'
import { applyCommand, parseCommand } from '../src/engine/league'
import { adjustObjective, continentalLastPlace, makePromise, promiseGoal, promiseShift } from '../src/engine/promise'
import type { CupSpec } from '../src/engine/types'
import { createGame } from '../src/store/game'
import { createLeagueWorld } from '../src/store/leagueWorld'

const USER = 'team-imp'
const base = { year: 2027, teamCount: 20, played: 20, totalGames: 38, continentalLast: 6 }

describe('promessa na coletiva', () => {
  it('título pede o 1º e vaga pede a última colocação continental da liga (ou o terço de cima)', () => {
    expect(promiseGoal('title', 20, 6)).toBe(1)
    expect(promiseGoal('continental', 20, 6)).toBe(6)
    expect(promiseGoal('continental', 20, 0)).toBe(7)
    expect(promiseGoal('none', 20, 6)).toBeNull()
  })

  it('cumprindo dá +1, falhando dá -1, no meio do caminho e cedo dá 0, e só vale na temporada em que foi feita', () => {
    const title = { kind: 'title' as const, year: 2027 }
    expect(promiseShift({ ...base, promise: title, position: 1 })).toBe(1)
    expect(promiseShift({ ...base, promise: title, position: 2 })).toBe(0)
    expect(promiseShift({ ...base, promise: title, position: 8 })).toBe(-1)
    expect(promiseShift({ ...base, promise: title, position: 8, played: BOARD.judgeAfterGames - 1 })).toBe(0)
    expect(promiseShift({ ...base, promise: { kind: 'title', year: 2026 }, position: 1 })).toBe(0)
    expect(promiseShift({ ...base, promise: undefined, position: 1 })).toBe(0)
    expect(promiseShift({ ...base, promise: { kind: 'none', year: 2027 }, position: 1 })).toBe(0)
    const cont = { kind: 'continental' as const, year: 2027 }
    expect(promiseShift({ ...base, promise: cont, position: 5 })).toBe(1)
    expect(promiseShift({ ...base, promise: cont, position: 8 })).toBe(0)
    expect(promiseShift({ ...base, promise: cont, position: 12 })).toBe(-1)
    // no fim da temporada vale só a colocação final
    expect(promiseShift({ ...base, played: 38, promise: cont, position: 7 })).toBe(-1)
    expect(promiseShift({ ...base, played: 38, promise: cont, position: 6 })).toBe(1)
  })

  it('a margem da diretoria anda uma posição, sem passar dos limites da tabela', () => {
    const o = { targetPosition: 4, sackingPosition: 12 }
    expect(adjustObjective(o, 1, 20).sackingPosition).toBe(13)
    expect(adjustObjective(o, -1, 20).sackingPosition).toBe(11)
    expect(adjustObjective(o, 0, 20)).toBe(o)
    expect(adjustObjective({ targetPosition: 4, sackingPosition: 20 }, 1, 20).sackingPosition).toBe(20)
    expect(adjustObjective({ targetPosition: 4, sackingPosition: 4 }, -1, 20).sackingPosition).toBe(4)
  })

  it('a confiança da diretoria sobe com a promessa cumprida e cai com a falhada', () => {
    const input = { row: { played: 20, points: 28 }, position: 9, teamCount: 20, totalGames: 38, balance: 1e7, monthlyCost: 1e6 }
    const objective = { targetPosition: 6, sackingPosition: 14 }
    const plain = evaluateBoard({ ...input, objective }).confidence
    const kept = evaluateBoard({ ...input, objective: adjustObjective(objective, 1, 20) }).confidence
    const broken = evaluateBoard({ ...input, objective: adjustObjective(objective, -1, 20) }).confidence
    expect(kept).toBeGreaterThan(plain)
    expect(broken).toBeLessThan(plain)
  })

  it('lê as vagas continentais da liga nas copas do mundo', () => {
    const cup = (id: string, positions: [number, number], league = 'br-1'): CupSpec => ({ id, name: id, kind: 'cup', region: 'SA', format: 'groups-knockout', entrants: [{ source: { type: 'league', league, positions } }], stages: [] }) as unknown as CupSpec
    expect(continentalLastPlace([cup('a', [1, 4]), cup('b', [5, 11])], 'br-1')).toBe(11)
    expect(continentalLastPlace([cup('a', [1, 4], 'ar-1')], 'br-1')).toBe(0)
    expect(continentalLastPlace(undefined, 'br-1')).toBe(0)
  })

  it('o comando vale uma vez por temporada e só nas primeiras rodadas, no mundo da liga online', () => {
    const world = createLeagueWorld(11, undefined, { cups: false })
    const my = world.season.competitions[0]!.teamIds[0]!
    expect(parseCommand({ type: 'promise', kind: 'title' })).toEqual({ type: 'promise', kind: 'title' })
    expect(parseCommand({ type: 'promise', kind: 'ouro' })).toBeUndefined()
    expect(parseCommand({ type: 'promise', kind: 'none', x: 1 })).toBeUndefined()
    const out = applyCommand(world, my, { type: 'promise', kind: 'continental' })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.world.teams.find((t) => t.id === my)!.promise).toEqual({ kind: 'continental', year: world.season.year })
      expect(applyCommand(out.world, my, { type: 'promise', kind: 'title' })).toMatchObject({ ok: false, error: 'promise-done' })
    }
    const late = { ...world, matches: world.matches.map((m, i) => (i < 60 && (m.homeTeamId === my || m.awayTeamId === my) && m.cup === undefined ? { ...m, status: 'finished' as const } : m)) }
    const played = late.matches.filter((m) => m.status === 'finished' && (m.homeTeamId === my || m.awayTeamId === my)).length
    if (played > 4) expect(applyCommand(late, my, { type: 'promise', kind: 'title' })).toMatchObject({ ok: false, error: 'promise-closed' })
    expect(makePromise(world.teams[0]!, 'none', 2027).promise).toEqual({ kind: 'none', year: 2027 })
  })
})

describe('desafios do início de carreira', () => {
  const g = createGame(3, USER, { cups: false })
  const world = { teams: g.season.teams, players: g.season.players }

  it('sorteia até quatro desafios de clubes diferentes, estáveis pela semente, com meta, prazo e estrelas válidos', () => {
    const list = drawChallenges(world, 7)
    expect(list.length).toBeGreaterThanOrEqual(3)
    expect(list.length).toBeLessThanOrEqual(4)
    expect(new Set(list.map((c) => c.teamId)).size).toBe(list.length)
    expect(drawChallenges(world, 7)).toEqual(list)
    expect(drawChallenges(world, 8, 0)).not.toEqual(list)
    for (const c of list) {
      expect(c.stars).toBeGreaterThanOrEqual(1)
      expect(c.stars).toBeLessThanOrEqual(5)
      expect([1, 2]).toContain(c.seasons)
      expect(c.targetPosition).toBeGreaterThanOrEqual(1)
      expect(world.teams.some((t) => t.id === c.teamId)).toBe(true)
    }
    const kinds: ChallengeKind[] = list.map((c) => c.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('mais estrelas quanto mais longe a meta; menos com duas temporadas', () => {
    expect(starsOf(1, 1, 20, 1)).toBe(1)
    expect(starsOf(20, 16, 20, 1)).toBe(5)
    expect(starsOf(18, 16, 20, 1)).toBeLessThan(starsOf(20, 16, 20, 1))
    expect(starsOf(20, 16, 20, 2)).toBe(4)
    expect(starsOf(5, 5, 20, 2)).toBe(1)
  })

  it('cumprido vira conquista, prazo esgotado termina sem registro, outro clube cancela', () => {
    const [c] = drawChallenges(world, 7)
    const active = startChallenge({ ...(c as NonNullable<typeof c>), targetPosition: 6, seasons: 2 }, 2026)
    const sum = (o: object) => ({ year: 2026, userTeamId: active.teamId, userTier: 1, userPosition: 6, ...o })
    expect(evaluateChallenge(active, sum({}), 'Clube').conquest).toMatchObject({ stars: active.stars, year: 2026, seasonsTaken: 1, teamName: 'Clube' })
    const miss = evaluateChallenge(active, sum({ userPosition: 9 }), 'Clube')
    expect(miss.conquest).toBeUndefined()
    expect(miss.active?.seasonsPlayed).toBe(1)
    const second = evaluateChallenge(miss.active, sum({ year: 2027, userPosition: 9 }), 'Clube')
    expect(second).toEqual({})
    expect(evaluateChallenge(miss.active, sum({ year: 2027 }), 'Clube').conquest?.seasonsTaken).toBe(2)
    expect(evaluateChallenge(active, sum({ userTeamId: 'outro' }), 'Clube')).toEqual({})
    expect(evaluateChallenge(active, sum({ userTier: 2 }), 'Clube').conquest).toBeUndefined()
    expect(evaluateChallenge(undefined, sum({}), 'Clube')).toEqual({})
  })

  it('o jogo guarda o desafio aceito só se for do clube escolhido', () => {
    const [c] = drawChallenges(world, 7)
    const ok = createGame(3, c!.teamId, { cups: false, challenge: c! })
    expect(ok.challenge).toMatchObject({ id: c!.id, seasonsPlayed: 0 })
    expect(createGame(3, USER, { cups: false, challenge: c!.teamId === USER ? undefined : c! }).challenge).toBeUndefined()
  })
})

describe('quatro propostas de clubes', () => {
  const g = createGame(3, USER, { cups: false })
  const world = { teams: g.season.teams, players: g.season.players }

  it('são quatro clubes diferentes, estáveis pela semente, e "que outros liguem" traz outros', () => {
    const offers = drawOffers(world, 7)
    expect(offers).toHaveLength(4)
    expect(new Set(offers.map((o) => o.teamId)).size).toBe(4)
    expect(drawOffers(world, 7)).toEqual(offers)
    expect(drawOffers(world, 7, 1).map((o) => o.teamId)).not.toEqual(offers.map((o) => o.teamId))
    for (const o of offers) {
      expect(o.seconds).toBeGreaterThanOrEqual(60)
      expect(o.seconds).toBeLessThanOrEqual(120)
      expect(o.expectedPosition).toBeGreaterThanOrEqual(1)
    }
    // do mais forte ao mais fraco: a primeira proposta é de clube de cima
    const kinds = offers.map((o) => o.kind)
    expect(kinds.some((k) => k === 'title-hopeful' || k === 'continental')).toBe(true)
  })
})
