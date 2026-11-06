import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, advanceLeague, createLeague, defaultLeagueConfig, processLeague, type LeagueState, type Stepped } from '../src/engine/league'
import { MS_DAY } from '../src/engine/league/pace'
import { ACADEMY } from '../src/engine/config'
import { cycleOfPyramid } from '../src/engine/season/cycles'
import { pyramidOf } from '../src/engine/season/fidelity'
import { createGame, turnRunner } from '../src/store/game'

// Sábado, 7 de novembro de 2026, 12h em São Paulo.
const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const base = createGame(6, 'team-imp', { cups: false }).season
const serieA = base.season.competitions[0]!
const SEATS = [
  { teamId: serieA.teamIds[0]!, playerId: 'jogador-1' },
  { teamId: serieA.teamIds[7]!, playerId: 'jogador-2' },
]
const humans = new Set(SEATS.map((s) => s.teamId))
const deps = { turn: turnRunner }
const pyramid = pyramidOf(serieA)

/** Avança a liga (como o ADM) até a virada de temporada do país das séries A e B. */
function playSeason(status?: Record<string, 'absent' | 'autopilot'>): { before: Stepped; after: Stepped } {
  const league = createLeague(defaultLeagueConfig(DEFAULT_CONFIG('liga-virada'), true), base, SEATS, T0)
  let s: Stepped = { league: { ...league, seats: league.seats.map((x) => (status?.[x.playerId] ? { ...x, status: status[x.playerId] as 'absent' | 'autopilot' } : x)) }, world: base, actions: [] }
  const startYear = cycleOfPyramid(s.world, pyramid).year
  let before = s
  let now = T0
  for (let i = 0; i < 400 && cycleOfPyramid(s.world, pyramid).year === startYear; i++) {
    before = s
    now += MS_DAY
    s = advanceLeague(JSON.parse(JSON.stringify(s.league)) as LeagueState, s.world, now, deps, 'adm')
    s = processLeague(s.league, s.world, now, deps)
  }
  return { before, after: s }
}

describe('virada de temporada numa liga online (B8.7)', () => {
  const { before, after } = playSeason()
  const cycleEnd = cycleOfPyramid(before.world, pyramid).end

  it('a temporada do país vira durante a liga', () => {
    expect(cycleOfPyramid(after.world, pyramid).year).toBe(cycleOfPyramid(base, pyramid).year + 1)
  })

  it('o contrato que acaba num clube humano não é renovado pela IA (o técnico decide antes); nos clubes da IA há renovações', () => {
    const expiring = (state: Stepped, ids: (t: string) => boolean) => state.world.players.filter((p) => p.teamId !== null && ids(p.teamId) && !p.contract.loanedFrom && p.contract.endDate <= cycleEnd)
    const humanExpiring = expiring(before, (t) => humans.has(t))
    const aiExpiring = expiring(before, (t) => !humans.has(t) && base.teams.find((x) => x.id === t)?.tier === 1)
    expect(humanExpiring.length).toBeGreaterThan(0)
    expect(aiExpiring.length).toBeGreaterThan(0)
    const afterById = new Map(after.world.players.map((p) => [p.id, p]))
    // Quem tinha contrato acabando num clube humano saiu: livre ou fora do jogo, nunca renovado.
    for (const p of humanExpiring) {
      const now = afterById.get(p.id)
      if (now) expect(now.teamId === p.teamId && now.contract.endDate > cycleEnd).toBe(false)
    }
    // Na IA a renovação existe (sanidade do teste).
    const renewed = aiExpiring.filter((p) => {
      const now = afterById.get(p.id)
      return now && now.teamId === p.teamId && now.contract.endDate > cycleEnd
    })
    expect(renewed.length).toBeGreaterThan(0)
  })

  it('a base dos clubes humanos fica com quem fez 20 anos esperando decisão; a da IA decide sozinha', () => {
    const graduating = (ids: (t: string | null) => boolean) => after.world.academy.filter((p) => ids(p.teamId) && p.age >= ACADEMY.graduationAge)
    const mine = graduating((t) => t !== null && humans.has(t))
    const theirs = graduating((t) => t !== null && !humans.has(t) && base.teams.find((x) => x.id === t)?.tier === 1)
    expect(theirs).toEqual([])
    expect(mine.length).toBeGreaterThan(0)
  })

  it('cada clube humano ganha uma meta nova da diretoria, histórico da temporada e elenco sem cortes da IA', () => {
    for (const id of humans) {
      const team = after.world.teams.find((t) => t.id === id)!
      const was = before.world.teams.find((t) => t.id === id)!
      expect(team.objective.targetPosition).toBeGreaterThan(0)
      expect(team.history.length).toBe(was.history.length + 1)
      // Os que saíram são os de contrato vencido (ou aposentados): mais ninguém foi cortado pela folha ou pelo excesso.
      const squadBefore = before.world.players.filter((p) => p.teamId === id)
      const gone = squadBefore.filter((p) => !after.world.players.some((q) => q.id === p.id && q.teamId === id))
      for (const p of gone) expect(p.contract.endDate <= cycleEnd || p.contract.loanedFrom !== undefined || p.age >= 33).toBe(true)
    }
  })
}, 600_000)

describe('virada de temporada: técnico ausente ou em piloto automático (B8.7)', () => {
  const [ana, bia] = SEATS
  const { before, after } = playSeason({ 'jogador-2': 'absent' })
  const cycleEnd = cycleOfPyramid(before.world, pyramid).end
  const afterById = new Map(after.world.players.map((p) => [p.id, p]))
  const renewedIn = (teamId: string) =>
    before.world.players.filter((p) => p.teamId === teamId && !p.contract.loanedFrom && p.contract.endDate <= cycleEnd).filter((p) => {
      const now = afterById.get(p.id)
      return now && now.teamId === teamId && now.contract.endDate > cycleEnd
    })

  it('a IA renova os contratos do clube do técnico ausente (como faz com os da IA); o clube do técnico ativo segue sem renovação automática', () => {
    expect(renewedIn(bia!.teamId).length).toBeGreaterThan(0)
    expect(renewedIn(ana!.teamId)).toEqual([])
  })

  it('a base do técnico ausente é decidida pela IA (ninguém fica esperando); a do ativo espera a decisão dele', () => {
    const pending = (teamId: string) => after.world.academy.filter((p) => p.teamId === teamId && p.age >= ACADEMY.graduationAge)
    expect(pending(bia!.teamId)).toEqual([])
    expect(pending(ana!.teamId).length).toBeGreaterThan(0)
  })

  it('piloto automático conta como ausente na virada', () => {
    const auto = playSeason({ 'jogador-2': 'autopilot' })
    const end = cycleOfPyramid(auto.before.world, pyramid).end
    const byId = new Map(auto.after.world.players.map((p) => [p.id, p]))
    const renewed = auto.before.world.players.filter((p) => p.teamId === bia!.teamId && !p.contract.loanedFrom && p.contract.endDate <= end).filter((p) => {
      const now = byId.get(p.id)
      return now && now.teamId === bia!.teamId && now.contract.endDate > end
    })
    expect(renewed.length).toBeGreaterThan(0)
  })
}, 600_000)
