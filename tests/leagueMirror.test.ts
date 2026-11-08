import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, applyCommand, applyPayload, buildDelta, buildFull, createLeague, defaultLeagueConfig, diffWorlds, emptyMirror, mergeChanges, parseCommand, processLeague, toSeasonState } from '../src/engine/league'
import type { MirrorPayload, MirrorState } from '../src/engine/league'
import { MS_HOUR } from '../src/engine/league/pace'
import { playerOverall } from '../src/engine/overall'
import { createLeagueWorld } from '../src/store/leagueWorld'
import { turnRunner } from '../src/store/game'
import type { SeasonState } from '../src/engine/season'

const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)
const base = createLeagueWorld(11, undefined, { cups: false })
const comp = base.season.competitions[0]!
const MY = comp.teamIds[0]!

/** Joga alguns dias do mundo (o motor da liga, resultado direto) e devolve o mundo e a lista de mundos intermediários. */
function play(days: number): SeasonState[] {
  const config = defaultLeagueConfig(DEFAULT_CONFIG('espelho'), true)
  let league = createLeague(config, base, [{ teamId: MY, playerId: 'ana' }], T0)
  let world = base
  const out: SeasonState[] = [base]
  for (let t = T0; t < T0 + days * 24 * MS_HOUR; t += 6 * MS_HOUR) {
    const r = processLeague(league, world, t, { turn: turnRunner })
    league = r.league
    if (r.world !== world) out.push(r.world)
    world = r.world
  }
  return out
}

function syncFull(world: SeasonState, teamId: string, rev: number): MirrorState {
  let m = emptyMirror()
  const first = buildFull(world, teamId, rev, 0)
  m = applyPayload(m, first)
  for (let page = 1; page < (first.pages ?? 1); page++) m = applyPayload(m, buildFull(world, teamId, rev, page))
  return m
}

describe('espelho do mundo da liga (C2)', () => {
  it('a carga completa reconstrói o mundo, com o clube do técnico completo', () => {
    const m = syncFull(base, MY, 1)
    const seen = toSeasonState(m)!
    expect(seen.players).toHaveLength(base.players.length)
    expect(seen.teams).toHaveLength(base.teams.length)
    expect(seen.matches).toHaveLength(base.matches.length)
    expect(seen.season.matchIds).toHaveLength(base.matches.length)
    const truth = new Map(base.players.map((p) => [p.id, p] as const))
    for (const p of seen.players) {
      const t = truth.get(p.id)!
      expect(p.attributes).toEqual(t.attributes)
      expect(p.contract).toEqual(t.contract)
      expect(p.teamId).toBe(t.teamId)
      if (p.teamId === MY) expect(p.condition).toEqual(t.condition)
    }
  })

  it('nenhum campo oculto sai do servidor: o hidden é embaçado e o texto não traz o de verdade', () => {
    const payloads: MirrorPayload[] = [buildFull(base, MY, 1, 0)]
    for (let page = 1; page < (payloads[0]!.pages ?? 1); page++) payloads.push(buildFull(base, MY, 1, page))
    const seen = toSeasonState(payloads.reduce(applyPayload, emptyMirror()))!
    const truth = new Map(base.players.map((p) => [p.id, p] as const))
    let differs = 0
    for (const p of [...seen.players, ...seen.academy]) {
      expect(p.hidden.consistency).toBe(50)
      expect(p.hidden.injuryProneness).toBe(50)
      expect(p.hidden.professionalism).toBe(50)
      const real = truth.get(p.id)?.hidden.potential
      if (real !== undefined && real !== p.hidden.potential) differs++
      if (real !== undefined) expect(Math.abs(real - p.hidden.potential)).toBeLessThanOrEqual(15)
    }
    expect(differs).toBeGreaterThan(seen.players.length / 2)
    // O texto da carga também não leva os valores ocultos de verdade: nenhum jogador sai com a propensão a lesão ou a consistência reais.
    const text = JSON.stringify(payloads)
    const leaks = base.players.filter((p) => p.hidden.consistency !== 50 && text.includes(`"consistency":${p.hidden.consistency},"injuryProneness":${p.hidden.injuryProneness},"professionalism":${p.hidden.professionalism}`))
    expect(leaks).toHaveLength(0)
  })

  it('outros clubes chegam sem finanças; o clube do técnico chega com elas', () => {
    const seen = toSeasonState(syncFull(base, MY, 1))!
    const other = seen.teams.find((t) => t.id !== MY)!
    expect(other.finances.ledger).toEqual([])
    // O caixa e os orçamentos vêm (decidem quanto um clube da IA pagaria); o extrato não.
    expect(other.finances.balance).toBe(base.teams.find((t) => t.id === other.id)!.finances.balance)
    expect(seen.teams.find((t) => t.id === MY)!.finances.balance).toBe(base.teams.find((t) => t.id === MY)!.finances.balance)
  })

  it('o jogador de outro clube chega sem condição física e moral (neutras)', () => {
    const seen = toSeasonState(syncFull(base, MY, 1))!
    const stranger = seen.players.find((p) => p.teamId !== MY && p.teamId !== null)!
    expect(stranger.condition.fitness).toBe(100)
    expect(stranger.condition.morale).toBe(70)
  })

  it('a atualização por revisão leva o espelho ao mesmo estado de uma carga nova', () => {
    const worlds = play(30)
    expect(worlds.length).toBeGreaterThan(5)
    const first = worlds[0]!
    const last = worlds[worlds.length - 1]!
    let m = syncFull(first, MY, 0)
    // Sincroniza a cada mudança do mundo (revisão a revisão).
    const changes = []
    for (let i = 1; i < worlds.length; i++) changes.push(diffWorlds(worlds[i - 1]!, worlds[i]!))
    // Um aparelho que sincroniza a cada 5 revisões recebe as mudanças juntas.
    for (let i = 0; i < changes.length; i += 5) {
      const chunk = changes.slice(i, i + 5)
      const end = Math.min(changes.length, i + 5)
      m = applyPayload(m, buildDelta(worlds[end]!, MY, end, i, mergeChanges(chunk)))
    }
    const delta = toSeasonState(m)!
    const fresh = toSeasonState(syncFull(last, MY, changes.length))!
    const sort = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id))
    expect(sort(delta.players)).toEqual(sort(fresh.players))
    expect(sort(delta.teams)).toEqual(sort(fresh.teams))
    expect(sort(delta.matches)).toEqual(sort(fresh.matches))
    expect(delta.season).toEqual(fresh.season)
    expect(delta.market).toEqual(fresh.market)
    expect(delta.training).toEqual(fresh.training)
  })

  it('a atualização é idempotente (aplicar duas vezes dá o mesmo)', () => {
    const worlds = play(10)
    let m = syncFull(worlds[0]!, MY, 0)
    const change = mergeChanges(worlds.slice(1).map((w, i) => diffWorlds(worlds[i]!, w)))
    const payload = buildDelta(worlds[worlds.length - 1]!, MY, 9, 0, change)
    m = applyPayload(m, payload)
    const once = toSeasonState(m)!
    const twice = toSeasonState(applyPayload(m, payload))!
    expect(twice.players.length).toBe(once.players.length)
    expect(twice.players.map((p) => p.attributes)).toEqual(once.players.map((p) => p.attributes))
  })

  it('a atualização é bem menor que a carga completa (só o que mudou)', () => {
    const worlds = play(3)
    const full = JSON.stringify(buildFull(worlds[0]!, MY, 0, 1)).length * 4
    const last = worlds[worlds.length - 1]!
    const change = mergeChanges(worlds.slice(1).map((w, i) => diffWorlds(worlds[i]!, w)))
    const delta = JSON.stringify(buildDelta(last, MY, 1, 0, change)).length
    expect(delta).toBeLessThan(full)
  })
})

describe('comandos do técnico (C2)', () => {
  const squad = base.players.filter((p) => p.teamId === MY)
  const team = base.teams.find((t) => t.id === MY)!

  it('rejeita corpo com campo a mais, tipo desconhecido ou valor fora da lista', () => {
    expect(parseCommand({ type: 'training-plan', plan: { intensity: 'normal', focus: 'balanced' } })).toBeDefined()
    expect(parseCommand({ type: 'training-plan', plan: { intensity: 'normal', focus: 'balanced', extra: 1 } })).toBeUndefined()
    expect(parseCommand({ type: 'training-plan', plan: { intensity: 'insane', focus: 'balanced' } })).toBeUndefined()
    expect(parseCommand({ type: 'ticket-price', price: -3 })).toBeUndefined()
    expect(parseCommand({ type: 'ticket-price', price: 1e12 })).toBeUndefined()
    expect(parseCommand({ type: 'format-disk' })).toBeUndefined()
    expect(parseCommand({ type: 'club', action: { type: 'promote', playerId: 'x y' } })).toBeUndefined()
    expect(parseCommand('tactic')).toBeUndefined()
  })

  it('aplica o plano de treino e o preço do ingresso no mundo', () => {
    const plan = applyCommand(base, MY, { type: 'training-plan', plan: { intensity: 'intense', focus: 'physical' } })
    expect(plan.ok && plan.world.training.plans[MY]).toEqual({ intensity: 'intense', focus: 'physical' })
    const price = applyCommand(base, MY, { type: 'ticket-price', price: 55 })
    expect(price.ok && price.world.teams.find((t) => t.id === MY)!.ticketPrice).toBe(55)
  })

  it('a tática vale se os 11 são do elenco e é recusada se não são', () => {
    const ok = applyCommand(base, MY, { type: 'tactic', tactic: team.tactic })
    expect(ok.ok).toBe(true)
    const stranger = base.players.find((p) => p.teamId !== MY && p.teamId !== null)!
    const bad = applyCommand(base, MY, { type: 'tactic', tactic: { ...team.tactic, startingXI: [stranger.id, ...team.tactic.startingXI.slice(1)] } })
    expect(bad.ok).toBe(false)
  })

  it('treino individual: jogador de outro clube é recusado; o do elenco entra na vaga', () => {
    const mine = squad.find((p) => p.position !== 'GK')!
    const r = applyCommand(base, MY, { type: 'individual-training', playerId: mine.id, goal: { type: 'group', group: 'technical' } })
    expect(r.ok && r.world.training.individual[MY]?.playerId).toBe(mine.id)
    const other = base.players.find((p) => p.teamId !== MY && p.teamId !== null)!
    expect(applyCommand(base, MY, { type: 'individual-training', playerId: other.id, goal: { type: 'group', group: 'technical' } })).toMatchObject({ ok: false, error: 'not-found' })
    if (r.ok) expect(applyCommand(r.world, MY, { type: 'individual-training', playerId: squad[1]!.id, goal: { type: 'group', group: 'physical' } })).toMatchObject({ ok: false, error: 'busy' })
  })

  it('mesma função no aparelho e no servidor: o mesmo comando dá o mesmo mundo', () => {
    const local = toSeasonState(syncFull(base, MY, 0))!
    const cmd = { type: 'training-plan', plan: { intensity: 'light', focus: 'technical' } } as const
    const a = applyCommand(local, MY, cmd)
    const b = applyCommand(base, MY, cmd)
    expect(a.ok && b.ok && a.world.training.plans[MY]).toEqual(b.ok && b.world.training.plans[MY])
  })

  it('o técnico só mexe no próprio clube (anunciar jogador de outro clube é recusado)', () => {
    const other = base.players.find((p) => p.teamId !== MY && p.teamId !== null)!
    expect(applyCommand(base, MY, { type: 'list-player', playerId: other.id, kind: 'transfer', price: 1000 })).toMatchObject({ ok: false })
    expect(applyCommand(base, MY, { type: 'release-player', playerId: other.id }).ok).toBe(false)
  })

  it('o espelho mostra a mesma força do servidor para atributos visíveis', () => {
    const seen = toSeasonState(syncFull(base, MY, 0))!
    const truth = new Map(base.players.map((p) => [p.id, p] as const))
    for (const p of seen.players.slice(0, 200)) expect(playerOverall(p)).toBeCloseTo(playerOverall(truth.get(p.id)!), 6)
  })
})
