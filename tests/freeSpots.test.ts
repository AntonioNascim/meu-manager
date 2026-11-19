import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { FORMATION_IDS, formationOf, getFormation } from '../src/engine/formations'
import { GK_POINT, gridKey, gridSpot } from '../src/engine/grid'
import { SWAP_RADIUS, assignGrid, freeSpotsOf, keeperIndexOf, parseSpots, readRoles, spotDistance, spotsOf } from '../src/engine/spots'
import { applySavedLineup, changeFormation, moveToSpot, movePlayerTo, suggestLineup } from '../src/engine/tacticEdit'
import { parseCommand } from '../src/engine/league'
import { setTeamTactic } from '../src/engine/season'
import { advanceToMatchday, createGame, finishPendingMatch, loadUserLineup, saveUserLineup, setUserTactic, userTeam } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive } from '../src/store/liveMatch'
import { GridPitch } from '../src/ui/components/GridPitch'
import type { Player, Tactic } from '../src/engine/types'

const USER = 'team-imp'
const game = createGame(3, USER, { cups: false })
const team = userTeam(game)
const squad = game.season.players.filter((p) => p.teamId === USER)
const byId = new Map(squad.map((p) => [p.id, p]))
const tactic0 = team.tactic
const keeper = keeperIndexOf(formationOf(tactic0).grid)
const field = (n: number) => tactic0.startingXI.findIndex((_, i) => i !== keeper && i === n)

describe('do ponto livre ao ponto da grade', () => {
  it('no centro exato de cada ponto o resultado é a grade de sempre, em todas as formações prontas', () => {
    for (const id of FORMATION_IDS) {
      const f = getFormation(id)
      const out = assignGrid(f.grid.map(gridSpot), keeperIndexOf(f.grid))
      expect(out.map(gridKey), id).toEqual(f.grid.map(gridKey))
    }
  })

  it('cada jogador recebe o ponto livre mais perto e ninguém repete ponto', () => {
    const f = getFormation('4-4-2')
    const spots = f.grid.map(gridSpot)
    // três jogadores soltos quase no mesmo lugar, no meio do campo
    const crowd = [4, 5, 6].filter((i) => i !== keeperIndexOf(f.grid))
    for (const i of crowd) spots[i] = { x: 50 + i * 0.4, y: 50 }
    const out = assignGrid(spots, keeperIndexOf(f.grid))
    expect(new Set(out.map(gridKey)).size).toBe(11)
    expect(out[keeperIndexOf(f.grid)]).toEqual(GK_POINT)
  })

  it('mesma entrada, mesma saída', () => {
    const spots = getFormation('4-3-3').grid.map(gridSpot).map((s, i) => ({ x: s.x + (i % 3), y: s.y - (i % 2) }))
    expect(assignGrid(spots, 0)).toEqual(assignGrid(spots, 0))
  })
})

describe('mover para onde quiser (moveToSpot)', () => {
  const i = field(5)
  const id = tactic0.startingXI[i] as string

  it('o jogador fica exatamente onde foi solto e o motor lê o ponto da grade mais perto', () => {
    const t = moveToSpot(tactic0, id, { x: 41.3, y: 38.6 })
    expect(spotsOf(t)[i]).toEqual({ x: 41.3, y: 38.6 })
    expect(t.grid).toBeDefined()
    expect(new Set((t.grid ?? []).map(gridKey)).size).toBe(11)
    expect(freeSpotsOf(t)).toBeDefined()
    expect(t.startingXI).toEqual(tactic0.startingXI)
  })

  it('solto em cima de outro jogador, os dois trocam de lugar', () => {
    const j = tactic0.startingXI.findIndex((_, k) => k !== i && k !== keeper)
    const a = spotsOf(tactic0)[i]!
    const b = spotsOf(tactic0)[j]!
    const t = moveToSpot(tactic0, id, { x: b.x + 1, y: b.y + 1 })
    expect(spotsOf(t)[i]).toEqual(b)
    expect(spotsOf(t)[j]).toEqual(a)
    expect(spotDistance(a, b)).toBeGreaterThan(SWAP_RADIUS)
  })

  it('o goleiro não sai do gol, mas pode trocar com um jogador de linha', () => {
    const gk = tactic0.startingXI[keeper] as string
    expect(() => moveToSpot(tactic0, gk, { x: 50, y: 40 })).toThrow()
    const other = spotsOf(tactic0)[i]!
    const t = moveToSpot(tactic0, gk, other)
    expect(keeperIndexOf(t.grid ?? [])).toBe(i)
  })

  it('dois soltos na mesma zona: cada um num ponto diferente e o aviso aparece', () => {
    const j = tactic0.startingXI.findIndex((_, k) => k !== i && k !== keeper && k !== 1)
    const start = spotsOf(tactic0)
    const spot = { x: 50, y: 30 }
    let t = moveToSpot(tactic0, id, spot)
    // o segundo é solto a uma distância fora do raio de troca, na mesma zona
    t = moveToSpot(t, tactic0.startingXI[j] as string, { x: 50 + (SWAP_RADIUS * 100) / 3 + 3, y: 30 })
    expect(new Set((t.grid ?? []).map(gridKey)).size).toBe(11)
    expect(start.length).toBe(11)
    const players = byId as ReadonlyMap<string, Player>
    expect(readRoles(t, players).length).toBe(11)
  })

  it('zona cheia: o segundo jogador vai para o ponto livre vizinho e a leitura marca isso', () => {
    const j = tactic0.startingXI.findIndex((_, k) => k !== i && k !== keeper && k !== 1)
    let t = moveToSpot(tactic0, id, { x: 50, y: 43 })
    t = moveToSpot(t, tactic0.startingXI[j] as string, { x: 50, y: 50 })
    const reads = readRoles(t, byId as ReadonlyMap<string, Player>)
    expect(reads.some((r) => r?.moved)).toBe(true)
    expect(new Set((t.grid ?? []).map(gridKey)).size).toBe(11)
    // a tela mostra onde cada um foi solto e o aviso de zona cheia
    const html = renderToStaticMarkup(createElement(GridPitch, { tactic: t, players: byId as ReadonlyMap<string, Player>, selectedId: null, onTap: () => {}, onMove: () => {}, renderToken: (p) => createElement('span', null, p.name) }))
    expect(html).toContain('data-testid="role-crowded"')
  })

  it('pontos livres que não batem com a grade não valem', () => {
    const t = moveToSpot(tactic0, id, { x: 41.3, y: 38.6 })
    const broken: Tactic = { ...t, grid: formationOf(tactic0).grid }
    expect(freeSpotsOf(broken)).toBeUndefined()
    expect(spotsOf(broken)).toEqual(formationOf(tactic0).grid.map(gridSpot))
  })

  it('mudar de formação ou mover para um ponto da grade tira os pontos livres', () => {
    const t = moveToSpot(tactic0, id, { x: 41.3, y: 38.6 })
    expect(changeFormation(t, squad, '4-3-3').spots).toBeUndefined()
    expect('spots' in movePlayerTo(t, id, { row: 3, lane: 2 })).toBe(false)
  })

  it('soltar no centro de um ponto livre não cria pontos livres (a tática é a de sempre)', () => {
    const f = formationOf(tactic0)
    const free = [{ row: 3, lane: 1 }].find((p) => !f.grid.some((q) => gridKey(q) === gridKey(p)))
    if (!free) return
    const t = moveToSpot(tactic0, id, gridSpot(free))
    expect(t.spots).toBeUndefined()
    expect(gridKey((t.grid ?? [])[i]!)).toBe(gridKey(free))
  })
})

describe('escalações guardadas e automática', () => {
  const i = field(6)
  const id = tactic0.startingXI[i] as string
  const free = moveToSpot(tactic0, id, { x: 71.4, y: 52.2 })

  it('a escalação guardada leva os pontos livres e carregá-la os devolve', () => {
    const g0 = setUserTactic(game, free)
    const g1 = saveUserLineup(g0, 0, 'Livre')
    expect(g1.savedLineups?.[0]?.spots).toBeDefined()
    const back = loadUserLineup(setUserTactic(g1, tactic0), 0)
    expect(spotsOf(userTeam(back).tactic)).toEqual(spotsOf(free))
  })

  it('carregar uma guardada sem pontos livres limpa os da tática atual', () => {
    const saved = { name: 'x', formationId: tactic0.formationId, style: tactic0.style, startingXI: [...tactic0.startingXI], ...(tactic0.grid ? { grid: tactic0.grid } : {}) }
    expect(applySavedLineup(free, squad, saved).spots).toBeUndefined()
  })

  it('a escalação automática mantém onde o técnico posicionou as vagas', () => {
    const out = suggestLineup(free, squad)
    if (out.grid && free.grid && out.grid.every((p, k) => gridKey(p) === gridKey(free.grid?.[k] as never))) expect(out.spots).toEqual(free.spots)
    expect(new Set(out.startingXI).size).toBe(11)
  })
})

describe('online e servidor', () => {
  const i = field(5)
  const free = moveToSpot(tactic0, tactic0.startingXI[i] as string, { x: 41.3, y: 38.6 })

  it('o comando de tática aceita pontos livres bem formados e recusa os malformados', () => {
    expect(parseCommand({ type: 'tactic', tactic: free })).toBeDefined()
    expect(parseCommand({ type: 'tactic', tactic: { ...free, spots: (free.spots ?? []).slice(1) } })).toBeUndefined()
    expect(parseCommand({ type: 'tactic', tactic: { ...free, spots: (free.spots ?? []).map((s) => ({ ...s, x: 140 })) } })).toBeUndefined()
    expect(parseCommand({ type: 'tactic', tactic: { ...free, spots: (free.spots ?? []).map((s) => ({ ...s, extra: 1 })) } })).toBeUndefined()
    expect(parseSpots([{ x: 1, y: 2 }])).toBeUndefined()
  })

  it('o mundo descarta pontos livres que não batem com a grade que o motor lê', () => {
    const ok = setTeamTactic(game.season, USER, free)
    expect(userTeamOf(ok).tactic.spots).toBeDefined()
    const bad = setTeamTactic(game.season, USER, { ...free, grid: formationOf(tactic0).grid })
    expect(userTeamOf(bad).tactic.spots).toBeUndefined()
  })
})

const userTeamOf = (s: { teams: { id: string; tactic: Tactic }[] }) => s.teams.find((t) => t.id === USER)!

describe('o motor continua lendo só a grade', () => {
  it('uma partida com pontos livres (mesma grade) dá exatamente o mesmo resultado', () => {
    const i = field(5)
    const c = spotsOf(tactic0)[i]!
    const nudged = moveToSpot(tactic0, tactic0.startingXI[i] as string, { x: c.x + 2, y: c.y + 2 })
    expect(nudged.spots).toBeDefined()
    expect(nudged.grid).toEqual(tactic0.grid ?? formationOf(tactic0).grid)
    const play = (g0: Game) => {
      let g = g0
      while (!g.pendingUserMatch) g = advanceToMatchday(g)
      const live = beginLive(g)
      live.match.playUntil(120)
      const r = live.match.result()
      clearLive()
      return JSON.stringify(finishPendingMatch(g, r).season.matches.filter((m) => m.status === 'finished').slice(0, 12).map((m) => [m.id, m.result?.homeGoals, m.result?.awayGoals]))
    }
    expect(play(setUserTactic(game, nudged))).toBe(play(game))
  })
})

describe('tela: papel entendido e penalidade', () => {
  it('mostra o cartão do papel, a penalidade fora da posição e o aviso de zona cheia', () => {
    const i = field(5)
    const player = byId.get(tactic0.startingXI[i] as string)!
    // leva o jogador a um papel que não é o dele: o lado oposto, numa linha de ponta
    const t = moveToSpot(tactic0, player.id, { x: 12, y: 20 })
    const html = renderToStaticMarkup(
      createElement(GridPitch, { tactic: t, players: byId as ReadonlyMap<string, Player>, selectedId: null, onTap: () => {}, onMove: () => {}, renderToken: (p) => createElement('span', null, p.name) }),
    )
    expect(html).toContain('data-testid="role-card"')
    expect(html).toContain('Toque ou arraste um jogador')
  })
})
