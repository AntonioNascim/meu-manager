import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { FORMATION_IDS, FORMATIONS } from '../src/engine/formations'
import { MAX_TAKERS, changeFormation, locate, setCaptain, setTaker, swapPlayers } from '../src/engine/tacticEdit'
import type { Player, Tactic, Team } from '../src/engine/types'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createGame, setUserTactic } from '../src/store/game'
import { pitchLayout } from '../src/ui/pitchLayout'
import { Tactics } from '../src/ui/screens/Tactics'

const world = generateWorld({ seed: 9 })
const team = world.teams.find((t) => t.tier === 1) as Team
const squad = world.players.filter((p) => p.teamId === team.id)
const tactic = team.tactic

const valid = (t: Tactic) => {
  expect(t.startingXI).toHaveLength(11)
  expect(new Set(t.startingXI).size).toBe(11)
  expect(new Set(t.bench).size).toBe(t.bench.length)
  expect(t.bench.some((id) => t.startingXI.includes(id))).toBe(false)
  expect(t.startingXI).toContain(t.captainId)
  for (const id of [...t.penaltyTakerIds, ...t.freeKickTakerIds]) expect(t.startingXI).toContain(id)
}
const outsider = squad.find((p) => !tactic.startingXI.includes(p.id) && !tactic.bench.includes(p.id)) as Player

describe('trocar jogadores', () => {
  it('há jogador fora do banco para testar (elenco de 24 a 30)', () => {
    expect(outsider).toBeDefined()
  })

  it('dois titulares trocam de vaga', () => {
    const [a, b] = [tactic.startingXI[2] as string, tactic.startingXI[7] as string]
    const t = swapPlayers(tactic, a, b)
    expect(t.startingXI[2]).toBe(b)
    expect(t.startingXI[7]).toBe(a)
    expect(t.bench).toEqual(tactic.bench)
    valid(t)
  })

  it('titular e reserva do banco trocam: o titular vai para o banco', () => {
    const a = tactic.startingXI[4] as string
    const b = tactic.bench[1] as string
    const t = swapPlayers(tactic, a, b)
    expect(t.startingXI[4]).toBe(b)
    expect(t.bench[1]).toBe(a)
    valid(t)
  })

  it('a ordem dos dois toques não importa', () => {
    const a = tactic.startingXI[4] as string
    const b = tactic.bench[1] as string
    expect(swapPlayers(tactic, b, a)).toEqual(swapPlayers(tactic, a, b))
  })

  it('titular e jogador fora do banco: o titular sai da lista e o banco não muda', () => {
    const a = tactic.startingXI[9] as string
    const t = swapPlayers(tactic, a, outsider.id)
    expect(t.startingXI[9]).toBe(outsider.id)
    expect(locate(t, a).zone).toBe('out')
    expect(t.bench).toEqual(tactic.bench)
    valid(t)
  })

  it('reserva do banco e jogador fora do banco trocam; dois do banco trocam de ordem', () => {
    const t = swapPlayers(tactic, tactic.bench[0] as string, outsider.id)
    expect(t.bench[0]).toBe(outsider.id)
    expect(t.startingXI).toEqual(tactic.startingXI)
    const t2 = swapPlayers(tactic, tactic.bench[0] as string, tactic.bench[2] as string)
    expect([t2.bench[0], t2.bench[2]]).toEqual([tactic.bench[2], tactic.bench[0]])
  })

  it('quem sai passa capitão e cobranças para quem entra', () => {
    const sub = tactic.bench[0] as string
    let t = swapPlayers(tactic, tactic.captainId, sub)
    expect(t.captainId).toBe(sub)
    valid(t)
    t = swapPlayers(tactic, tactic.penaltyTakerIds[0] as string, tactic.bench[1] as string)
    expect(t.penaltyTakerIds[0]).toBe(tactic.bench[1])
    valid(t)
  })

  it('trocar dois titulares não muda as funções', () => {
    const [x, y] = [tactic.captainId, tactic.startingXI.find((id) => id !== tactic.captainId) as string]
    expect(swapPlayers(tactic, x, y).captainId).toBe(x)
  })

  it('trocar um jogador com ele mesmo não faz nada', () => {
    expect(swapPlayers(tactic, tactic.startingXI[0] as string, tactic.startingXI[0] as string)).toBe(tactic)
  })
})

describe('mudar de formação', () => {
  for (const id of FORMATION_IDS) {
    it(`${id}: mantém os mesmos 11 jogadores, cada um numa vaga`, () => {
      const t = changeFormation(tactic, squad, id)
      expect(t.formationId).toBe(id)
      expect([...t.startingXI].sort()).toEqual([...tactic.startingXI].sort())
      expect(t.bench).toEqual(tactic.bench)
      expect(t.captainId).toBe(tactic.captainId)
      valid(t)
      expect(FORMATIONS[id]?.slots).toHaveLength(11)
    })
  }

  it('o goleiro continua no gol', () => {
    const keeper = squad.find((p) => p.id === tactic.startingXI[0]) as Player
    expect(keeper.position).toBe('GK')
    for (const id of FORMATION_IDS) expect(changeFormation(tactic, squad, id).startingXI[0]).toBe(keeper.id)
  })

  it('titular lesionado continua na escalação ao mudar de formação (o jogador decide)', () => {
    const hurtId = tactic.startingXI[5] as string
    const hurt = squad.map((p) => (p.id === hurtId ? { ...p, condition: { ...p.condition, injuryDaysLeft: 4 } } : p))
    const other = FORMATION_IDS.find((id) => id !== tactic.formationId) as string
    expect(changeFormation(tactic, hurt, other).startingXI).toContain(hurtId)
  })
})

describe('capitão e cobradores', () => {
  it('capitão e cobradores precisam ser titulares', () => {
    const bench = tactic.bench[0] as string
    expect(() => setCaptain(tactic, bench)).toThrow()
    expect(() => setTaker(tactic, 'penalty', 0, bench)).toThrow()
    expect(setCaptain(tactic, tactic.startingXI[3] as string).captainId).toBe(tactic.startingXI[3])
  })

  it('a lista de cobradores não repete jogador e respeita o tamanho máximo', () => {
    let t = tactic
    const xi = tactic.startingXI
    t = setTaker(t, 'penalty', 0, xi[10] as string)
    t = setTaker(t, 'penalty', 1, xi[9] as string)
    t = setTaker(t, 'penalty', 2, xi[8] as string)
    t = setTaker(t, 'penalty', 0, xi[8] as string)
    expect(t.penaltyTakerIds).toEqual([xi[8], xi[9], xi[10]])
    expect(t.penaltyTakerIds.length).toBeLessThanOrEqual(MAX_TAKERS.penalty)
    expect(() => setTaker(t, 'free-kick', 2, xi[1] as string)).toThrow()
    t = setTaker(t, 'free-kick', 0, xi[7] as string)
    t = setTaker(t, 'free-kick', 1, xi[7] as string)
    expect(new Set(t.freeKickTakerIds).size).toBe(t.freeKickTakerIds.length)
    valid(t)
  })
})

describe('campo desenhado', () => {
  for (const id of FORMATION_IDS) {
    it(`${id}: uma posição por vaga, dentro do campo e sem sobreposição`, () => {
      const points = pitchLayout(id)
      expect(points).toHaveLength(11)
      for (const p of points) {
        expect(p.x).toBeGreaterThan(0)
        expect(p.x).toBeLessThan(100)
        expect(p.y).toBeGreaterThanOrEqual(10)
        expect(p.y).toBeLessThanOrEqual(95)
      }
      for (let i = 0; i < 11; i++) {
        for (let j = i + 1; j < 11; j++) {
          const close = Math.abs((points[i]?.x ?? 0) - (points[j]?.x ?? 0)) < 12 && Math.abs((points[i]?.y ?? 0) - (points[j]?.y ?? 0)) < 10
          expect(close).toBe(false)
        }
      }
      expect(points[0]?.y).toBeGreaterThan(85)
    })
  }

  it('o lado direito do campo fica à direita da tela', () => {
    const slots = FORMATIONS['4-4-2']?.slots ?? []
    const points = pitchLayout('4-4-2')
    const rb = points[slots.findIndex((s) => s.position === 'RB')]
    const lb = points[slots.findIndex((s) => s.position === 'LB')]
    expect(rb?.x ?? 0).toBeGreaterThan(lb?.x ?? 100)
  })
})

describe('tela de tática', () => {
  const game = createGame(9, team.id)

  it('desenha os 11 titulares no campo e lista o banco e o restante do elenco', () => {
    const html = renderToStaticMarkup(createElement(Tactics, { game }))
    expect(html.match(/aria-label="[^"]*, (GOL|LD|LE|ZAG|VOL|MC|MEI|PD|PE|ATA)"/g)).toHaveLength(11)
    expect(html).toContain('Banco de reservas (7)')
    expect(html).toContain('Posse de bola')
    expect(html).toContain('Muito ofensiva')
    for (const id of FORMATION_IDS) expect(html).toContain(id)
  })

  it('a mudança de tática entra no jogo (formação, estilo, mentalidade e troca)', () => {
    const squadOfGame = game.season.players.filter((p) => p.teamId === team.id)
    let t = changeFormation(game.season.teams.find((x) => x.id === team.id)?.tactic as Tactic, squadOfGame, '4-3-3')
    t = { ...t, style: 'high-press', mentality: 2 }
    t = swapPlayers(t, t.startingXI[1] as string, t.bench[0] as string)
    const next = setUserTactic(game, t)
    expect(next.season.teams.find((x) => x.id === team.id)?.tactic).toEqual(t)
    const html = renderToStaticMarkup(createElement(Tactics, { game: next }))
    expect(html).toContain('Recupera a bola no campo do rival')
  })

  it('um titular lesionado aparece com aviso na tela', () => {
    const hurtId = tactic.startingXI[2] as string
    const hurt = { ...game, season: { ...game.season, players: game.season.players.map((p) => (p.id === hurtId ? { ...p, condition: { ...p.condition, injuryDaysLeft: 6 } } : p)) } }
    expect(renderToStaticMarkup(createElement(Tactics, { game: hurt }))).toContain('indisponível')
  })
})
