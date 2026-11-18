import { describe, expect, it } from 'vitest'
import { applyCommand, applyPayload, buildDelta, buildFull, diffWorlds, emptyMirror, parseCommand, toSeasonState } from '../src/engine/league'
import type { MirrorState } from '../src/engine/league'
import type { SeasonState } from '../src/engine/season'
import { agendaOf, setAgenda, trainingWindow } from '../src/engine/training'
import { joinSeasonParts, planSeasonParts } from '../src/store/saveParts'
import { createLeagueWorld } from '../src/store/leagueWorld'

const base = createLeagueWorld(11, undefined, { cups: false })
const comp = base.season.competitions[0]!
const MY = comp.teamIds[0]!
const OTHER = comp.teamIds[1]!
const window = trainingWindow(base, MY)

function syncFull(world: SeasonState, teamId: string, rev: number): MirrorState {
  let m = applyPayload(emptyMirror(), buildFull(world, teamId, rev, 0))
  const first = buildFull(world, teamId, rev, 0)
  for (let page = 1; page < (first.pages ?? 1); page++) m = applyPayload(m, buildFull(world, teamId, rev, page))
  return m
}

describe('comando da agenda de treino (online)', () => {
  it('a janela de um mundo novo tem dias para montar', () => expect(window.length).toBeGreaterThan(0))

  it('aceita só o corpo certo, com lista fechada de campos e exercícios do catálogo', () => {
    const d = window[0] as string
    expect(parseCommand({ type: 'training-agenda', sessions: { [d]: { drill: 'rondo', intensity: 'normal' } } })).toEqual({ type: 'training-agenda', sessions: { [d]: { drill: 'rondo', intensity: 'normal' } } })
    expect(parseCommand({ type: 'training-agenda', sessions: { [d]: null } })).toEqual({ type: 'training-agenda', sessions: { [d]: null } })
    expect(parseCommand({ type: 'training-agenda', sessions: {} })).toEqual({ type: 'training-agenda', sessions: {} })
    expect(parseCommand({ type: 'training-agenda', sessions: { [d]: { drill: 'rest', intensity: 'light' } } })).toBeDefined()
    // recusados
    expect(parseCommand({ type: 'training-agenda', sessions: { [d]: { drill: 'nao-existe', intensity: 'normal' } } })).toBeUndefined()
    expect(parseCommand({ type: 'training-agenda', sessions: { [d]: { drill: 'rondo', intensity: 'turbo' } } })).toBeUndefined()
    expect(parseCommand({ type: 'training-agenda', sessions: { [d]: { drill: 'rondo', intensity: 'normal', extra: 1 } } })).toBeUndefined()
    expect(parseCommand({ type: 'training-agenda', sessions: { 'amanha': { drill: 'rondo', intensity: 'normal' } } })).toBeUndefined()
    expect(parseCommand({ type: 'training-agenda', sessions: 'x' })).toBeUndefined()
    expect(parseCommand({ type: 'training-agenda', sessions: {}, teamId: 'outro' })).toBeUndefined()
    const many = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`2027-01-${String(i + 1).padStart(2, '0')}`, null]))
    expect(parseCommand({ type: 'training-agenda', sessions: many })).toBeUndefined()
  })

  it('aplica na agenda do próprio clube e recusa dia fora da semana', () => {
    const d = window[0] as string
    const ok = applyCommand(base, MY, { type: 'training-agenda', sessions: { [d]: { drill: 'full-match', intensity: 'intense' } } })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(agendaOf(ok.world.training, MY)[d]).toEqual({ drill: 'full-match', intensity: 'intense' })
      expect(agendaOf(ok.world.training, OTHER)).toEqual({})
    }
    const bad = applyCommand(base, MY, { type: 'training-agenda', sessions: { '1999-01-01': { drill: 'rondo', intensity: 'normal' } } })
    expect(bad).toMatchObject({ ok: false, error: 'out-of-window' })
  })

  it('o espelho leva a agenda do próprio clube e nunca a dos outros', () => {
    const d = window[0] as string
    const withBoth = setAgenda(setAgenda(base, MY, { [d]: { drill: 'rondo', intensity: 'normal' } }), OTHER, { [(trainingWindow(base, OTHER)[0]) as string]: { drill: 'mid-block', intensity: 'light' } })
    const seen = toSeasonState(syncFull(withBoth, MY, 1))!
    expect(agendaOf(seen.training, MY)[d]).toEqual({ drill: 'rondo', intensity: 'normal' })
    expect(Object.keys(seen.training.agenda ?? {})).toEqual([MY])
  })

  it('mudar a agenda muda a parte "own" do espelho (o aparelho recebe a atualização)', () => {
    const d = window[0] as string
    const next = setAgenda(base, MY, { [d]: { drill: 'rondo', intensity: 'normal' } })
    const change = diffWorlds(base, next)
    expect(change.sections).toContain('own')
    const m = syncFull(base, MY, 1)
    const after = toSeasonState(applyPayload(m, buildDelta(next, MY, 2, 1, change)))!
    expect(agendaOf(after.training, MY)[d]).toEqual({ drill: 'rondo', intensity: 'normal' })
  })

  it('a agenda entra no save em partes e volta igual', () => {
    const d = window[0] as string
    const world = setAgenda(base, MY, { [d]: { drill: 'rondo', intensity: 'normal' } })
    const values = new Map(planSeasonParts(world).map((p) => [p.name, p.build()] as const))
    const back = joinSeasonParts(values)
    expect(agendaOf(back.training, MY)[d]).toEqual({ drill: 'rondo', intensity: 'normal' })
    expect(back.training).toEqual(world.training)
  })
})
