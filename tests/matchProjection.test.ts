import { describe, expect, it } from 'vitest'
import { computeStandings } from '../src/engine/season/standings'
import type { Cup, CupSpec, Match } from '../src/engine/types'
import { advanceToMatchday, createGame, finishPendingMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { otherGamesOf } from '../src/ui/screens/match/otherGames'
import { continentalOf, continentalSlots, isLeagueProjection, leagueOf, onlineOthers, projectNow, prognosisOf, soloOthers } from '../src/ui/screens/match/projection'
import type { LeagueProjection } from '../src/ui/screens/match/projection'

const USER = 'team-imp'

/** Joga duas rodadas e para no dia do 3º jogo do time (a tabela já tem pontos e há outros jogos no mesmo dia). */
function toThirdMatchDay(): Game {
  let game = createGame(3, USER, { cups: false })
  for (let i = 0; i < 3; i++) {
    while (!game.pendingUserMatch) game = advanceToMatchday(game)
    if (i === 2) break
    const live = beginLive(game)
    live.match.playUntil(120)
    game = finishPendingMatch(game, live.match.result())
    clearLive()
  }
  return game
}

const league = (p: unknown) => {
  expect(p && isLeagueProjection(p as never)).toBeTruthy()
  return p as LeagueProjection
}

describe('se terminar assim: liga', () => {
  it('o prognóstico é coerente: vencer nunca fica atrás de empatar, que nunca fica atrás de perder', () => {
    const game = toThirdMatchDay()
    const p = prognosisOf(game, game.pendingUserMatch, USER)
    expect(p).not.toBeNull()
    const { win, draw, lose } = p as NonNullable<typeof p>
    const [w, d, l] = [league(win), league(draw), league(lose)]
    expect(w.position).toBeLessThanOrEqual(d.position)
    expect(d.position).toBeLessThanOrEqual(l.position)
    expect(w.points).toBe(d.points + 2)
    expect(d.points).toBe(l.points + 1)
    expect(w.size).toBe(20)
  })

  it('no minuto 0 com 0 a 0 é o mesmo que "se empatar" (os outros jogos do dia ainda não contam)', () => {
    const game = toThirdMatchDay()
    const match = game.pendingUserMatch as Match
    const now = projectNow(game, match, USER, { home: 0, away: 0 }, soloOthers(game, match, 0))
    expect(now).toEqual(prognosisOf(game, match, USER)?.draw)
  })

  it('a tabela-base não usa os outros jogos do dia, que o motor já decidiu', () => {
    const game = toThirdMatchDay()
    const match = game.pendingUserMatch as Match
    expect(otherGamesOf(game).length).toBeGreaterThan(0)
    const competition = leagueOf(game, match)
    const ids = new Set([match.id, ...otherGamesOf(game).map((m) => m.id)])
    const base = game.season.matches.filter((m) => m.competitionId === competition?.id && m.status === 'finished' && !ids.has(m.id))
    const table = computeStandings((competition as NonNullable<typeof competition>).teamIds, base)
    expect(league(projectNow(game, match, USER, { home: 0, away: 0 }, soloOthers(game, match, 0))).current).toBe(table.findIndex((r) => r.teamId === USER) + 1)
  })

  it('no minuto 90 com o placar final dá exatamente a posição da tabela depois de registrar a partida', () => {
    const game = toThirdMatchDay()
    const match = game.pendingUserMatch as Match
    const live = beginLive(game)
    live.match.playUntil(120)
    const result = live.match.result()
    clearLive()
    const projected = league(projectNow(game, match, USER, { home: result.homeGoals, away: result.awayGoals }, soloOthers(game, match, 90)))
    const after = finishPendingMatch(game, result)
    const competition = leagueOf(game, match) as NonNullable<ReturnType<typeof leagueOf>>
    const table = computeStandings(competition.teamIds, after.season.matches.filter((m) => m.competitionId === competition.id))
    expect(projected.position).toBe(table.findIndex((r) => r.teamId === USER) + 1)
    expect(projected.points).toBe(table.find((r) => r.teamId === USER)?.points)
  })

  it('no online, os jogos já simulados pelo servidor nunca vazam: trocar o resultado deles não muda a projeção', () => {
    const game = toThirdMatchDay()
    const match = game.pendingUserMatch as Match
    const same = (m: Match) => m.competitionId === match.competitionId && m.round === match.round && m.date === match.date && m.id !== match.id
    expect(game.season.matches.filter(same).length).toBeGreaterThan(0)
    const before = projectNow(game, match, USER, { home: 1, away: 0 }, onlineOthers(game, match, []))
    // O servidor "decidiu" os jogos do dia de outro jeito: 9 a 0 para o mandante em todos.
    const tampered: Game = { ...game, season: { ...game.season, matches: game.season.matches.map((m) => (same(m) && m.result ? { ...m, result: { ...m.result, homeGoals: 9, awayGoals: 0 } } : m)) } }
    expect(projectNow(tampered, match, USER, { home: 1, away: 0 }, onlineOthers(tampered, match, []))).toEqual(before)
  })

  it('no online, os jogos ao vivo dos outros técnicos entram com o placar que a tela vê', () => {
    const game = toThirdMatchDay()
    const match = game.pendingUserMatch as Match
    const other = game.season.matches.find((m) => m.competitionId === match.competitionId && m.round === match.round && m.date === match.date && m.id !== match.id) as Match
    const none = league(projectNow(game, match, USER, { home: 0, away: 0 }, onlineOthers(game, match, [])))
    const live = league(projectNow(game, match, USER, { home: 0, away: 0 }, onlineOthers(game, match, [{ matchId: other.id, homeGoals: 3, awayGoals: 0 }])))
    // o placar visto passou a valer: se o dono do jogo é um rival direto, a posição muda; no mínimo a tabela não é a mesma de "sem o jogo"
    expect(onlineOthers(game, match, [{ matchId: other.id, homeGoals: 3, awayGoals: 0 }]).scores).toHaveLength(1)
    expect(onlineOthers(game, match, []).scores).toHaveLength(0)
    expect(live.size).toBe(none.size)
  })
})

describe('vagas continentais pela colocação', () => {
  const cup = (id: string, name: string, extra: Partial<CupSpec>, entrants: CupSpec['entrants']): CupSpec => ({ id, name, kind: 'cup', region: 'SA', format: 'groups-knockout', entrants, stages: [], seeding: 'random', homeOfSingleLeg: 'draw', awayGoals: false, extraTime: true, penalties: true, ...extra }) as unknown as CupSpec
  const specs: CupSpec[] = [
    cup('lib', 'Copa Libertadores', { preliminary: [{ name: 'Fase prévia', legs: 1, date: [2, 1] }] }, [
      { source: { type: 'league', league: 'br-1', positions: [1, 4] }, stage: 1 },
      { source: { type: 'league', league: 'br-1', positions: [5, 5] } },
      { source: { type: 'league', league: 'ar-1', positions: [1, 3] } },
    ]),
    cup('sul', 'Copa Sul-Americana', {}, [{ source: { type: 'league', league: 'br-1', positions: [6, 11] } }]),
    { id: 'nac', name: 'Copa do Brasil', kind: 'cup', country: 'Brazil', format: 'knockout', entrants: [{ source: { type: 'league', league: 'br-1' } }] } as unknown as CupSpec,
  ]

  it('lista as vagas só da liga pedida, na ordem, e ignora copas de país', () => {
    const slots = continentalSlots(specs, 'br-1')
    expect(slots.map((s) => [s.from, s.to, s.slot.cupId])).toEqual([
      [1, 4, 'lib'],
      [5, 5, 'lib'],
      [6, 11, 'sul'],
    ])
    expect(continentalSlots(specs, 'ar-1')).toHaveLength(1)
    expect(continentalSlots(undefined, 'br-1')).toEqual([])
  })

  it('a posição dá a vaga e o ponto de entrada', () => {
    expect(continentalOf(specs, 'br-1', 2)?.entry).toBe('knockout') // stage > 0 = já no mata-mata
    expect(continentalOf(specs, 'br-1', 5)?.entry).toBe('qualifying')
    expect(continentalOf(specs, 'br-1', 8)?.cupName).toBe('Copa Sul-Americana')
    expect(continentalOf(specs, 'br-1', 12)).toBeNull()
    expect(continentalOf(specs, 'xx-1', 1)).toBeNull()
  })

  it('a projeção da liga leva a vaga da posição projetada', () => {
    const game = toThirdMatchDay()
    const match = game.pendingUserMatch as Match
    const competition = leagueOf(game, match)
    const withCups: Game = { ...game, season: { ...game.season, cupSpecs: [cup('lib', 'Copa Libertadores', {}, [{ source: { type: 'league', league: competition?.id as string, positions: [1, 20] } }])] } }
    const p = league(projectNow(withCups, match, USER, { home: 0, away: 0 }, soloOthers(withCups, match, 0)))
    expect(p.continental?.cupName).toBe('Copa Libertadores')
  })
})

describe('se terminar assim: copas', () => {
  const A = 'team-a'
  const B = 'team-b'
  const C = 'team-c'
  const D = 'team-d'
  const mk = (id: string, home: string, away: string, hg: number | null, ag: number | null, cup: Match['cup'], extra: Partial<Match> = {}): Match =>
    ({ id, competitionId: 'copa', round: 1, date: '2027-04-08', homeTeamId: home, awayTeamId: away, status: hg === null ? 'scheduled' : 'finished', seed: 1, cup, ...(hg === null ? {} : { result: { homeGoals: hg, awayGoals: ag, events: [], homeStats: { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, xg: 0 }, awayStats: { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, xg: 0 }, playerResults: [] } }), ...extra }) as unknown as Match
  const fakeGame = (matches: Match[], spec: Partial<CupSpec>): Game => {
    const cup = { id: 'copa', name: 'Copa Teste', year: 2027, spec: { id: 'copa', name: 'Copa Teste', awayGoals: false, extraTime: true, penalties: true, stages: [{ name: 'Semifinal', legs: 2 }], ...spec }, entrants: [], log: [] } as unknown as Cup
    return { userTeamId: B, lastDay: [], season: { matches, cups: [cup], cupSpecs: [], season: { competitions: [] } } } as unknown as Game
  }
  const none = { excluded: new Set<string>(), scores: [] }

  it('mata-mata, volta: soma a ida (A 2 x 0 B) e diz classificado, eliminado ou prorrogação', () => {
    const first = mk('m1', A, B, 2, 0, { stage: 0, kind: 'knockout', tie: 0, leg: 1 })
    const second = mk('m2', B, A, null, null, { stage: 0, kind: 'knockout', tie: 0, leg: 2, firstLegId: 'm1' })
    const game = fakeGame([first, second], {})
    const at = (home: number, away: number) => projectNow(game, second, B, { home, away }, none)
    expect(at(3, 0)).toMatchObject({ kind: 'knockout', goalsFor: 3, goalsAgainst: 2, status: 'through' })
    expect(at(1, 0)).toMatchObject({ goalsFor: 1, goalsAgainst: 2, status: 'out' })
    expect(at(2, 0)).toMatchObject({ status: 'tied-extra-time' })
    const noExtra = fakeGame([first, second], { extraTime: false })
    expect(projectNow(noExtra, second, B, { home: 2, away: 0 }, none)).toMatchObject({ status: 'tied-penalties' })
  })

  it('mata-mata, gol fora (se a copa usa): empate no agregado decide pelos gols fora', () => {
    const first = mk('m1', A, B, 1, 1, { stage: 0, kind: 'knockout', tie: 0, leg: 1 })
    const second = mk('m2', B, A, null, null, { stage: 0, kind: 'knockout', tie: 0, leg: 2, firstLegId: 'm1' })
    const game = fakeGame([first, second], { awayGoals: true })
    // B joga a volta em casa e perde por 0 a 0? agregado 1 x 1, gols fora: B fez 1 fora na ida, A fez 0 fora: B passa
    expect(projectNow(game, second, B, { home: 0, away: 0 }, none)).toMatchObject({ status: 'through' })
  })

  it('mata-mata, ida: não decide nada, só diz quem está na frente', () => {
    const first = mk('m1', A, B, null, null, { stage: 0, kind: 'knockout', tie: 0, leg: 1 })
    const game = fakeGame([first], {})
    expect(projectNow(game, first, B, { home: 1, away: 2 }, none)).toMatchObject({ firstLeg: true, goalsFor: 2, goalsAgainst: 1, status: 'ahead' })
    expect(projectNow(game, first, B, { home: 2, away: 0 }, none)).toMatchObject({ status: 'behind' })
    expect(projectNow(game, first, B, { home: 0, away: 0 }, none)).toMatchObject({ status: 'level' })
  })

  it('jogo único empatado: prorrogação ou pênaltis', () => {
    const single = mk('s1', A, B, null, null, { stage: 0, kind: 'knockout', tie: 0 })
    const game = fakeGame([single], { stages: [{ name: 'Final', legs: 1 }] as never })
    expect(projectNow(game, single, B, { home: 1, away: 1 }, none)).toMatchObject({ firstLeg: false, status: 'tied-extra-time' })
    expect(projectNow(game, single, B, { home: 1, away: 0 }, none)).toMatchObject({ status: 'out' })
  })

  it('grupos: posição no grupo com os outros jogos do dia como a tela viu (e só eles)', () => {
    const g = { stage: 0, kind: 'group' as const, group: 1 }
    const done = [mk('g1', A, C, 3, 0, g, { round: 1, date: '2027-03-01' }), mk('g2', B, D, 1, 1, g, { round: 1, date: '2027-03-01' })]
    const mine = mk('g3', B, A, null, null, g, { round: 2 })
    const other = mk('g4', C, D, 4, 0, g, { round: 2 }) // o servidor já decidiu 4 a 0: não pode vazar
    const game = fakeGame([...done, mine, other], { format: 'groups-knockout', groups: { name: 'Grupos', count: 2, advance: 2, legs: 1, date: [3, 1] } } as never)
    const excluded = new Set(['g3', 'g4'])
    const p0 = projectNow(game, mine, B, { home: 0, away: 0 }, { excluded, scores: [] })
    expect(p0).toMatchObject({ kind: 'group', group: 'B', size: 4 })
    // B empata com A (0 x 0): B soma 2, A soma 4; C e D sem jogo do dia contado
    const withB = projectNow(game, mine, B, { home: 2, away: 0 }, { excluded, scores: [] })
    expect((withB as { position: number }).position).toBeLessThan((p0 as { position: number }).position)
    // com o 4 a 0 de C visto na tela, C sobe e a posição de B não melhora
    const seen = projectNow(game, mine, B, { home: 2, away: 0 }, { excluded, scores: [{ match: other, home: 4, away: 0 }] })
    expect((seen as { position: number }).position).toBeGreaterThanOrEqual((withB as { position: number }).position)
  })

  it('jogo de copa sem projeção quando a copa não existe no estado', () => {
    const lonely = mk('x1', A, B, null, null, { stage: 0, kind: 'knockout', tie: 0 }, { competitionId: 'outra' })
    const game = fakeGame([lonely], {})
    expect(projectNow(game, lonely, B, { home: 0, away: 0 }, none)).toBeNull()
    expect(prognosisOf(game, lonely, B)).toBeNull()
  })
})
