import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { FORMATION_IDS, FORMATIONS, formationOf, getFormation, labelOfGrid, readyGrid } from '../src/engine/formations'
import { GK_POINT, GRID_LANES, ROW_COUNT, allGridPoints, formationFromGrid, gridProblem, sameGridSet, shapeOf, slotAt } from '../src/engine/grid'
import { buildTactic } from '../src/engine/lineup'
import { startMatch } from '../src/engine/match'
import { gapsOf, profileOf, READY_CAPS } from '../src/engine/match/formationProfile'
import { MATCH } from '../src/engine/config'
import { simulateMatch } from '../src/engine/match'
import { applySavedLineup, changeFormation, movePlayerTo, swapPlayers } from '../src/engine/tacticEdit'
import type { GridPoint, Player, Tactic, Team } from '../src/engine/types'
import { advanceToMatchday, createGame, saveUserLineup, setUserTactic, squadOf, userTeam } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { MatchScreen } from '../src/ui/screens/Match'
import { Pitch } from '../src/ui/screens/match/Pitch'
import { SAVE_VERSION, makeEnvelope, migrateSave, validateGame } from '../src/store/saveFormat'
import { GridPitch } from '../src/ui/components/GridPitch'
import { gridCoords, nearestGridPoint } from '../src/ui/pitchLayout'
import { Lineup } from '../src/ui/screens/squad/Lineup'
import { Tactics } from '../src/ui/screens/Tactics'
import { extremeGrids } from '../tools/gridSearch'

const world = generateWorld({ seed: 11 })
const teams = world.teams.filter((t) => t.tier === 1) as [Team, Team, ...Team[]]
const squad = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
const [a, b] = teams

describe('grade de posições', () => {
  it('tem 26 pontos: o gol e 5 faixas em cada uma das 5 linhas de campo', () => {
    expect(allGridPoints()).toHaveLength(1 + (ROW_COUNT - 1) * GRID_LANES)
    expect(allGridPoints().filter((p) => p.row === 0)).toEqual([GK_POINT])
  })

  it('o papel vem do ponto: lateral e ponta nas faixas de fora, zagueiro, volante, meia e atacante no centro', () => {
    expect(slotAt({ row: 1, lane: 0 })).toEqual({ position: 'LB', sector: 'defense' })
    expect(slotAt({ row: 1, lane: 4 })).toEqual({ position: 'RB', sector: 'defense' })
    expect(slotAt({ row: 1, lane: 2 })).toEqual({ position: 'CB', sector: 'defense' })
    expect(slotAt({ row: 2, lane: 2 })).toEqual({ position: 'DM', sector: 'midfield' })
    expect(slotAt({ row: 2, lane: 0 })).toEqual({ position: 'LB', sector: 'midfield' })
    expect(slotAt({ row: 3, lane: 1 })).toEqual({ position: 'CM', sector: 'midfield' })
    expect(slotAt({ row: 3, lane: 4 })).toEqual({ position: 'RW', sector: 'midfield' })
    expect(slotAt({ row: 4, lane: 2 })).toEqual({ position: 'AM', sector: 'midfield' })
    expect(slotAt({ row: 5, lane: 2 })).toEqual({ position: 'ST', sector: 'attack' })
    expect(slotAt({ row: 5, lane: 0 })).toEqual({ position: 'LW', sector: 'attack' })
    expect(slotAt(GK_POINT)).toEqual({ position: 'GK', sector: 'defense' })
  })

  it('as formações prontas são atalhos: a grade de cada uma dá exatamente as vagas de sempre, na mesma ordem', () => {
    for (const id of FORMATION_IDS) {
      const f = getFormation(id)
      expect(gridProblem(f.grid)).toBeNull()
      expect(f.grid.map(slotAt)).toEqual(f.slots)
      expect(labelOfGrid(f.grid)).toBe(id)
    }
    expect(Object.keys(FORMATIONS)).toEqual(FORMATION_IDS)
  })

  it('valida: 11 pontos da grade, sem repetir, um goleiro só no ponto do gol', () => {
    const ok = readyGrid('4-4-2')
    expect(gridProblem(ok)).toBeNull()
    expect(gridProblem(ok.slice(1))).toMatch(/11/)
    expect(gridProblem([...ok.slice(0, 10), ok[1] as GridPoint])).toMatch(/mesmo ponto/)
    expect(gridProblem([...ok.slice(0, 10), { row: 9, lane: 0 }])).toMatch(/fora da grade/)
    expect(gridProblem([{ row: 0, lane: 0 }, ...ok.slice(1)])).toMatch(/fora da grade/)
    expect(gridProblem([{ row: 1, lane: 2 }, ...ok.slice(1)])).toMatch(/goleiro/)
    expect(() => formationFromGrid(ok.slice(1))).toThrow()
  })

  it('nome do esquema pelos setores', () => {
    expect(shapeOf(readyGrid('4-3-3'))).toBe('4-3-3')
    expect(shapeOf(readyGrid('3-5-2'))).toBe('3-5-2')
    expect(shapeOf(readyGrid('4-2-3-1'))).toBe('4-5-1')
  })

  it('a posição na tela volta ao mesmo ponto (toda a grade) e o canto mais perto do gol é o gol', () => {
    for (const p of allGridPoints()) {
      const c = gridCoords(p)
      expect(nearestGridPoint(c.x, c.y)).toEqual(p)
      expect(nearestGridPoint(c.x + 3, c.y - 3)).toEqual(p)
    }
    expect(nearestGridPoint(50, 99)).toEqual(GK_POINT)
    expect(nearestGridPoint(0, 0)).toEqual({ row: 5, lane: 0 })
    expect(nearestGridPoint(100, 46)).toEqual({ row: 3, lane: 4 })
  })
})

describe('mover jogadores na grade', () => {
  const base = buildTactic(squad(a), { formationId: '4-4-2', style: 'possession', mentality: 0 })

  it('toda tática montada já leva a grade da formação pronta', () => {
    expect(base.grid).toEqual(readyGrid('4-4-2'))
    expect(formationOf(base)).toBe(getFormation('4-4-2'))
  })

  it('mover para um ponto livre muda o papel só desse jogador e a formação vira "custom"', () => {
    const forward = base.startingXI[9] as string
    const moved = movePlayerTo(base, forward, { row: 4, lane: 2 })
    expect(moved.formationId).toBe('custom')
    expect(moved.startingXI).toEqual(base.startingXI)
    expect(formationOf(moved).slots[9]).toEqual({ position: 'AM', sector: 'midfield' })
    expect(moved.grid?.filter((_, i) => i !== 9)).toEqual(base.grid?.filter((_, i) => i !== 9))
    expect(formationOf(moved).id).toBe('custom')
  })

  it('soltar sobre quem já está no ponto troca os dois de lugar', () => {
    const left = base.startingXI[1] as string
    const swapped = movePlayerTo(base, left, base.grid![4] as GridPoint)
    expect(swapped.grid?.[1]).toEqual(base.grid?.[4])
    expect(swapped.grid?.[4]).toEqual(base.grid?.[1])
    // os dois só trocaram de ponto: o mesmo conjunto de pontos continua sendo o da formação pronta
    expect(swapped.formationId).toBe('4-4-2')
    expect(swapped.startingXI).toEqual(base.startingXI)
  })

  it('o goleiro não deixa o gol vazio, mas pode trocar com quem for posto no ponto do gol', () => {
    const keeper = base.startingXI[0] as string
    expect(() => movePlayerTo(base, keeper, { row: 3, lane: 2 })).toThrow(/goleiro/)
    const outfield = base.startingXI[5] as string
    const swapped = movePlayerTo(base, outfield, GK_POINT)
    expect(swapped.grid?.[5]).toEqual(GK_POINT)
    expect(swapped.grid?.[0]).toEqual(base.grid?.[5])
    expect(() => movePlayerTo(base, 'ninguem', { row: 3, lane: 2 })).toThrow(/titulares/)
  })

  it('voltar ao desenho de uma formação pronta devolve o nome dela; atalho de formação reposiciona todo mundo', () => {
    const forward = base.startingXI[9] as string
    const there = movePlayerTo(base, forward, { row: 4, lane: 2 })
    const back = movePlayerTo(there, forward, base.grid![9] as GridPoint)
    expect(back.formationId).toBe('4-4-2')
    const reset = changeFormation(there, squad(a), '4-3-3')
    expect(reset.formationId).toBe('4-3-3')
    expect(reset.grid).toEqual(readyGrid('4-3-3'))
    expect(changeFormation(there, squad(a), '4-4-2').grid).toEqual(readyGrid('4-4-2'))
  })

  it('trocar dois jogadores de lugar (toque) não mexe na grade', () => {
    const swapped = swapPlayers(base, base.startingXI[2] as string, base.startingXI[3] as string)
    expect(swapped.grid).toEqual(base.grid)
  })

  it('a sugestão automática mantém a grade livre e escolhe os 11 pelo papel de cada ponto', () => {
    const custom = movePlayerTo(base, base.startingXI[9] as string, { row: 4, lane: 2 })
    const auto = buildTactic(squad(a), { formationId: custom.formationId, grid: custom.grid, style: 'possession', mentality: 0 })
    expect(auto.formationId).toBe('custom')
    expect(auto.grid).toEqual(custom.grid)
    expect(auto.startingXI).toHaveLength(11)
  })

  it('escalação guardada com grade livre volta igualzinha', () => {
    let g = createGame(5, 'team-imp')
    const tactic = userTeam(g).tactic
    const moved = movePlayerTo(tactic, tactic.startingXI[9] as string, { row: 4, lane: 2 })
    g = setUserTactic(g, moved)
    g = saveUserLineup(g, 0, 'Livre')
    expect(g.savedLineups?.[0]?.grid).toEqual(moved.grid)
    const restored = applySavedLineup(tactic, squadOf(g, g.userTeamId), g.savedLineups![0]!)
    expect(restored.grid).toEqual(moved.grid)
    expect(restored.formationId).toBe('custom')
    expect(restored.startingXI).toEqual(moved.startingXI)
  })
})

describe('motor: o papel vem da grade', () => {
  const base = buildTactic(squad(a), { formationId: '4-4-2', style: 'possession', mentality: 0 })
  const play = (tactic: Tactic, seed = 3) => {
    const m = startMatch({ home: { team: { ...a, tactic }, players: squad(a) }, away: { team: b, players: squad(b) }, seed, attendance: 30_000 })
    m.playUntil(90)
    return m.snapshot()
  }

  it('cada jogador joga na posição e no setor do ponto que ocupa, e a substituição herda o ponto', () => {
    const custom = movePlayerTo(base, base.startingXI[1] as string, { row: 5, lane: 2 })
    const s = play(custom)
    const mover = s.home.onPitch.find((p) => p.playerId === base.startingXI[1])
    // o lateral foi para o ataque: joga de ATA, no ponto que escolheram
    if (mover) expect(mover).toMatchObject({ slot: 'ST', point: { row: 5, lane: 2 } })
    expect(s.home.grid).toEqual(custom.grid)
    expect(s.home.formationId).toBe('custom')
    const live = startMatch({ home: { team: { ...a, tactic: custom }, players: squad(a) }, away: { team: b, players: squad(b) }, seed: 3, attendance: 30_000, userControlled: { home: true } })
    live.playUntil(30)
    const out = live.snapshot().home.onPitch.find((p) => p.slot === 'ST' && p.point?.row === 5 && p.point.lane === 2) ?? live.snapshot().home.onPitch[1]!
    const inn = live.snapshot().home.bench.find((id) => world.players.find((p) => p.id === id)?.position !== 'GK') as string
    live.substitute('home', out.playerId, inn)
    const after = live.snapshot().home.onPitch.find((p) => p.playerId === inn)!
    expect(after.point).toEqual(out.point)
    expect(after.slot).toBe(out.slot)
  })

  it('a grade da formação pronta, com ou sem ela escrita na tática, dá o mesmo jogo', () => {
    const plain: Tactic = { ...base }
    delete plain.grid
    const withGrid: Tactic = { ...base, grid: readyGrid('4-4-2') }
    const run = (t: Tactic) => simulateMatch({ home: { team: { ...a, tactic: t }, players: squad(a) }, away: { team: b, players: squad(b) }, seed: 21, attendance: 30_000 })
    expect(run(withGrid)).toEqual(run(plain))
  })

  it('as formações prontas não têm buracos nem imposto; só a grade livre tem', () => {
    for (const id of FORMATION_IDS) {
      const gaps = gapsOf(getFormation(id))
      expect(gaps.defense).toBe(0)
      expect(gaps.midfield).toBe(0)
      expect(gaps.flank.every((g) => g === 0)).toBe(true)
      expect(profileOf(getFormation(id)).custom).toBe(false)
      expect(profileOf(getFormation(id))).toMatchObject(MATCH.formation.profile[id] as object)
    }
    const noRight = extremeGrids().find((c) => c.name.startsWith('sem ninguém pela direita'))!
    const gaps = gapsOf(formationFromGrid(noRight.grid!))
    // quem ataca pela esquerda dele enfrenta o lado direito de quem defende: sem ninguém ali
    expect(gaps.flank[0]).toBeGreaterThan(0)
    expect(profileOf(formationFromGrid(noRight.grid!)).custom).toBe(true)
    const noDefense = extremeGrids().find((c) => c.name.startsWith('0-5-5'))!
    expect(gapsOf(formationFromGrid(noDefense.grid!)).defense).toBe(MATCH.grid.minDefenders)
  })

  it('uma grade livre herda o perfil da formação pronta mais parecida, com imposto por jogador diferente', () => {
    const ready = getFormation('4-2-3-1')
    const moved = [...ready.grid.map((p) => ({ ...p }))]
    moved[1] = { row: 3, lane: 2 }
    const profile = profileOf(formationFromGrid(moved))
    expect(profile.custom).toBe(true)
    const base = MATCH.formation.profile['4-2-3-1'] as { control: number; attack: number }
    expect(profile.control).toBeCloseTo(base.control - MATCH.grid.distanceTax.control, 6)
    expect(profile.attack).toBeCloseTo(base.attack - MATCH.grid.distanceTax.attack, 6)
    expect(READY_CAPS.control).toBeGreaterThan(5)
  })

  it('o mesmo conjunto de papéis em outra arrumação das faixas é a formação pronta (mesmo perfil)', () => {
    const f = getFormation('4-3-1-2')
    const shuffled = [...f.grid].reverse()
    expect(sameGridSet(f.grid, shuffled)).toBe(true)
    expect(profileOf(formationFromGrid(shuffled)).custom).toBe(false)
  })
})

describe('save versão 9', () => {
  it('a migração 8→9 põe a grade da formação pronta nas táticas dos times e nas escalações guardadas', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(9)
    let g = createGame(5, 'team-imp')
    g = saveUserLineup(g, 1, 'Antiga')
    const old = JSON.parse(JSON.stringify(makeEnvelope(g, '2026-01-01T00:00:00Z')))
    const formationsBefore = new Map<string, string>()
    for (const t of old.game.season.teams) {
      formationsBefore.set(t.id, t.tactic.formationId)
      delete t.tactic.grid
    }
    delete old.game.savedLineups[1].grid
    old.version = 8
    const migrated = migrateSave(old)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(validateGame(migrated.game)).toEqual([])
    for (const t of migrated.game.season.teams) {
      expect(t.tactic.formationId).toBe(formationsBefore.get(t.id))
      expect(t.tactic.grid).toEqual(readyGrid(t.tactic.formationId))
    }
    expect(migrated.game.savedLineups?.[1]?.grid).toEqual(readyGrid(migrated.game.savedLineups![1]!.formationId))
    expect(migrated.game.savedLineups?.[0]).toBeNull()
  })
})

describe('telas com posicionamento livre', () => {
  const game = createGame(5, 'team-imp')
  const noop = () => {}

  it('o campo traz os 26 pontos da grade e os 11 titulares, cada um no seu ponto', () => {
    const tactic = userTeam(game).tactic
    const players = new Map(squadOf(game, game.userTeamId).map((p) => [p.id, p]))
    const html = renderToStaticMarkup(createElement(GridPitch, { tactic, players, selectedId: null, onTap: noop, onMove: noop, renderToken: (p) => createElement('span', null, p.name) }))
    expect(html.match(/data-grid-point=/g)).toHaveLength(26)
    expect(html.match(/data-player=/g)).toHaveLength(11)
    expect(html.match(/data-point=/g)).toHaveLength(11)
    expect(html).toContain('touch-action:none')
  })

  it('Escalação e Tática usam o campo arrastável e mostram o chip "Livre" só quando o time é livre', () => {
    for (const Screen of [Lineup, Tactics]) {
      const plain = renderToStaticMarkup(createElement(Screen, { game }))
      expect(plain).toContain('data-testid="grid-pitch"')
      expect(plain).not.toContain('data-testid="free-chip"')
      expect(plain).toContain('Arraste um jogador')
    }
    const tactic = userTeam(game).tactic
    const free = setUserTactic(game, movePlayerTo(tactic, tactic.startingXI[9] as string, { row: 4, lane: 2 }))
    for (const Screen of [Lineup, Tactics]) {
      const html = renderToStaticMarkup(createElement(Screen, { game: free }))
      expect(html).toContain('data-testid="free-chip"')
      expect(html).toContain('Livre · ')
    }
  })
})

describe('partida com posicionamento livre', () => {
  it('a tela de partida, o campo animado e o campo das trocas abrem com um time livre', () => {
    let g = createGame(3, 'team-imp')
    const tactic = userTeam(g).tactic
    const free = movePlayerTo(movePlayerTo(tactic, tactic.startingXI[9] as string, { row: 4, lane: 2 }), tactic.startingXI[1] as string, { row: 2, lane: 4 })
    expect(free.formationId).toBe('custom')
    g = setUserTactic(g, free)
    while (!g.pendingUserMatch) g = advanceToMatchday(g)
    const html = renderToStaticMarkup(createElement(MatchScreen, { game: g, onNavigate: () => {} }))
    expect(html).toContain('data-testid="pitch"')
    expect(html.match(/data-side="home"/g)).toHaveLength(11)
    const live = beginLive(g, true)
    live.match.playUntil(40)
    const snap = live.match.snapshot()
    const side = live.side === 'home' ? snap.home : snap.away
    expect(side.formationId).toBe('custom')
    expect(side.onPitch.every((p) => p.point)).toBe(true)
    const pitch = renderToStaticMarkup(createElement(Pitch, { game: g, snap, speed: 2, running: false }))
    expect(pitch.match(/data-side="home"/g)).toHaveLength(snap.home.onPitch.length)
    clearLive()
  })
})
