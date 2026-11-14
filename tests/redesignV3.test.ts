import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { startMatch } from '../src/engine/match'
import type { MatchInput } from '../src/engine/match'
import type { Player, Team } from '../src/engine/types'
import { availability } from '../src/ui/components/PlayerSheetParts'
import { HEX_AXES, hexValues } from '../src/ui/screens/squad/attributeGroups'
import { clockText, evolutionOf, goalsOf, periodText, teamRatings, timelineOf, visibleColor } from '../src/ui/screens/match/liveStats'

const world = generateWorld({ seed: 11 })
const teams = world.teams.filter((t) => t.tier === 1) as Team[]
const squad = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
const played = (i: number, until = 90) => {
  const home = teams[i % teams.length] as Team
  const away = teams[(i + 5) % teams.length] as Team
  const input: MatchInput = { home: { team: home, players: squad(home) }, away: { team: away, players: squad(away) }, seed: 900 + i * 17, attendance: 30_000 }
  const m = startMatch(input)
  m.playUntil(until)
  return m.snapshot()
}
const snaps = Array.from({ length: 24 }, (_, i) => played(i))

describe('gráfico hexagonal da ficha do jogador', () => {
  const player = squad(teams[0] as Team).find((p) => p.position === 'ST') as Player
  const keeper = squad(teams[0] as Team).find((p) => p.position === 'GK') as Player
  it('tem seis eixos, na ordem da referência, todos de 1 a 100', () => {
    const v = hexValues(player)
    expect(v.map((x) => x.label)).toEqual(['Finalização', 'Passe', 'Drible', 'Velocidade', 'Defesa', 'Físico'])
    for (const x of v) {
      expect(Number.isInteger(x.value)).toBe(true)
      expect(x.value).toBeGreaterThanOrEqual(1)
      expect(x.value).toBeLessThanOrEqual(100)
    }
  })
  it('cada eixo é a média dos atributos que o jogo já tem (e o potencial oculto nunca entra)', () => {
    const a = player.attributes
    const v = Object.fromEntries(hexValues(player).map((x) => [x.id, x.value]))
    expect(v.finishing).toBe(Math.round((a.finishing + a.heading) / 2))
    expect(v.passing).toBe(Math.round((a.passing + a.vision + a.crossing) / 3))
    expect(v.dribbling).toBe(Math.round((a.dribbling + a.ballControl) / 2))
    expect(v.pace).toBe(a.pace)
    expect(v.defense).toBe(Math.round((a.tackling + a.positioning) / 2))
    expect(v.physical).toBe(Math.round((a.stamina + a.strength) / 2))
    // mudar só o potencial (oculto) não muda nada
    const hidden = { ...player, hidden: { ...player.hidden, potential: 1 } } as Player
    expect(hexValues(hidden)).toEqual(hexValues(player))
    expect(HEX_AXES.flatMap((x) => x.attributes).every((n) => !/potential/i.test(n))).toBe(true)
  })
  it('a defesa do goleiro usa reflexos, saída do gol e posicionamento', () => {
    const a = keeper.attributes
    const d = hexValues(keeper).find((x) => x.id === 'defense')!
    expect(d.value).toBe(Math.round((a.reflexes + a.rushingOut + a.positioning) / 3))
  })
})

describe('selo de disponibilidade', () => {
  const base = squad(teams[0] as Team)[0] as Player
  const withCondition = (c: Partial<Player['condition']>): Player => ({ ...base, condition: { ...base.condition, injuryDaysLeft: 0, suspensionGames: 0, ...c } })
  it('disponível, lesionado (com os dias) ou suspenso (com os jogos); lesão vem primeiro', () => {
    expect(availability(withCondition({}))).toMatchObject({ ok: true, title: 'Disponível' })
    expect(availability(withCondition({ injuryDaysLeft: 12 }))).toEqual({ ok: false, title: 'Lesionado', detail: '12 dias' })
    expect(availability(withCondition({ suspensionGames: 1 }))).toEqual({ ok: false, title: 'Suspenso', detail: '1 jogo' })
    expect(availability(withCondition({ injuryDaysLeft: 1, suspensionGames: 2 })).title).toBe('Lesionado')
  })
})

describe('cartões da partida ao vivo (só leitura)', () => {
  it('a linha de gols e a linha do tempo batem com os eventos do motor, do mais recente ao mais antigo', () => {
    for (const s of snaps) {
      expect(goalsOf(s)).toHaveLength(s.events.filter((e) => e.type === 'goal' || e.type === 'own-goal').length)
      const t = timelineOf(s, 1000)
      for (let i = 1; i < t.length; i++) expect(t[i - 1]!.minute).toBeGreaterThanOrEqual(t[i]!.minute)
      expect(t.every((e) => ['goal', 'own-goal', 'yellow', 'red', 'sub', 'penalty-missed'].includes(e.kind))).toBe(true)
    }
    expect(snaps.some((s) => timelineOf(s).some((e) => e.kind === 'sub'))).toBe(true)
  })

  it('a nota de cada time fica entre 3 e 10, sobe com o saldo de gols e cai com expulsão', () => {
    for (const s of snaps) {
      const r = teamRatings(s)
      for (const v of [r.home, r.away]) {
        expect(v).toBeGreaterThanOrEqual(3)
        expect(v).toBeLessThanOrEqual(10)
      }
    }
    const s = snaps[0]!
    const better = teamRatings({ ...s, homeGoals: s.homeGoals + 2 })
    expect(better.home).toBeGreaterThan(teamRatings(s).home)
    expect(better.away).toBeLessThan(teamRatings(s).away)
    const red = teamRatings({ ...s, homeStats: { ...s.homeStats, redCards: s.homeStats.redCards + 1 } })
    expect(red.home).toBeLessThan(teamRatings(s).home)
  })

  it('a evolução da partida começa em 0, só sobe e nunca passa de 100', () => {
    for (const s of snaps) {
      const e = evolutionOf(s)
      expect(e[0]).toEqual({ minute: 0, home: expect.any(Number), away: expect.any(Number) })
      for (let i = 1; i < e.length; i++) {
        expect(e[i]!.home).toBeGreaterThanOrEqual(e[i - 1]!.home)
        expect(e[i]!.away).toBeGreaterThanOrEqual(e[i - 1]!.away)
      }
      for (const p of e) {
        expect(p.home).toBeLessThanOrEqual(100)
        expect(p.away).toBeLessThanOrEqual(100)
      }
      // o time que mais pressionou termina em 100
      const last = e[e.length - 1]!
      expect(Math.max(last.home, last.away)).toBeGreaterThan(95)
    }
  })

  it('relógio, tempo de jogo e cor visível sobre o fundo escuro', () => {
    expect(clockText(32)).toBe("32'")
    expect(periodText({ minute: 32, finished: false }, false)).toBe('1º tempo')
    expect(periodText({ minute: 60, finished: false }, false)).toBe('2º tempo')
    expect(periodText({ minute: 100, finished: false, extraTime: true }, false)).toBe('Prorrogação')
    expect(periodText({ minute: 45, finished: false }, true)).toBe('Intervalo')
    expect(periodText({ minute: 90, finished: true }, false)).toBe('Fim de jogo')
    expect(visibleColor('#111111', '#ffffff')).toBe('#ffffff')
    expect(visibleColor('#cc2222', '#ffffff')).toBe('#cc2222')
    expect(visibleColor('#000000', '#050505')).toBe('#e5e7eb')
  })
})
