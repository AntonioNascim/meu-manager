import { describe, expect, it } from 'vitest'
import { applyCommand, applyPayload, buildDelta, buildFull, diffWorlds, emptyMirror, parseCommand, toSeasonState } from '../src/engine/league'
import { parsePrefs } from '../src/engine/league/career'
import type { MirrorState } from '../src/engine/league'
import type { SeasonState } from '../src/engine/season'
import { formationOf } from '../src/engine/formations'
import { gridKey } from '../src/engine/grid'
import { freeSpotsOf, keeperIndexOf, spotsOf } from '../src/engine/spots'
import { moveToSpot } from '../src/engine/tacticEdit'
import { joinSeasonParts, planSeasonParts } from '../src/store/saveParts'
import { createLeagueWorld } from '../src/store/leagueWorld'

const base = createLeagueWorld(11, undefined, { cups: false })
const comp = base.season.competitions[0]!
const MY = comp.teamIds[0]!
const OTHER = comp.teamIds[1]!
const team = (w: SeasonState, id: string) => w.teams.find((t) => t.id === id)!
const tactic0 = team(base, MY).tactic
const keeper = keeperIndexOf(formationOf(tactic0).grid)
const i = tactic0.startingXI.findIndex((_, k) => k !== keeper)
const free = moveToSpot(tactic0, tactic0.startingXI[i] as string, { x: 41.3, y: 38.6 })

function syncFull(world: SeasonState, teamId: string, rev: number): MirrorState {
  let m = applyPayload(emptyMirror(), buildFull(world, teamId, rev, 0))
  const first = buildFull(world, teamId, rev, 0)
  for (let page = 1; page < (first.pages ?? 1); page++) m = applyPayload(m, buildFull(world, teamId, rev, page))
  return m
}

describe('posicionamento livre na liga online', () => {
  it('o comando aplica os pontos livres e o servidor guarda a grade que o motor lê', () => {
    const cmd = parseCommand({ type: 'tactic', tactic: free })
    expect(cmd).toBeDefined()
    const out = applyCommand(base, MY, cmd!)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const t = team(out.world, MY).tactic
    expect(spotsOf(t)[i]).toEqual({ x: 41.3, y: 38.6 })
    expect(t.grid?.map(gridKey)).toEqual(free.grid?.map(gridKey))
    expect(team(out.world, OTHER).tactic.spots).toBeUndefined()
  })

  it('pontos livres que não batem com a grade são descartados no servidor (a grade manda)', () => {
    const forged = { ...free, grid: formationOf(tactic0).grid }
    const out = applyCommand(base, MY, parseCommand({ type: 'tactic', tactic: forged })!)
    expect(out.ok).toBe(true)
    if (out.ok) expect(freeSpotsOf(team(out.world, MY).tactic)).toBeUndefined()
  })

  it('o espelho leva os pontos livres do próprio clube e a atualização chega ao aparelho', () => {
    const next = applyCommand(base, MY, { type: 'tactic', tactic: free })
    expect(next.ok).toBe(true)
    if (!next.ok) return
    const change = diffWorlds(base, next.world)
    const m = syncFull(base, MY, 1)
    const after = toSeasonState(applyPayload(m, buildDelta(next.world, MY, 2, 1, change)))!
    expect(spotsOf(team(after, MY).tactic)[i]).toEqual({ x: 41.3, y: 38.6 })
  })

  it('entram no save em partes e voltam iguais', () => {
    const w = applyCommand(base, MY, { type: 'tactic', tactic: free })
    if (!w.ok) throw new Error('falhou')
    const values = new Map(planSeasonParts(w.world).map((p) => [p.name, p.build()] as const))
    expect(team(joinSeasonParts(values), MY).tactic.spots).toEqual(free.spots)
  })

  it('as escalações guardadas por conta aceitam os pontos livres e recusam os malformados', () => {
    const line = { name: 'Livre', formationId: free.formationId, style: free.style, startingXI: free.startingXI, grid: free.grid, spots: free.spots }
    const ok = parsePrefs({ favorites: [], lineups: [line, null, null] })
    expect(ok?.lineups[0]?.spots).toEqual(free.spots)
    expect(parsePrefs({ favorites: [], lineups: [{ ...line, spots: [{ x: 1, y: 2 }] }, null, null] })).toBeUndefined()
  })
})
