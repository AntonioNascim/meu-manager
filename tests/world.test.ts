import { beforeAll, describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import type { World } from '../src/data/generateWorld'
import { TEAM_DEFINITIONS } from '../src/data/teamDefinitions'
import { FORMATION_IDS, FORMATIONS, getFormation } from '../src/engine/formations'
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN, FORMATION_TIE_TOLERANCE } from '../src/engine/config'
import { rankFormations } from '../src/engine/lineup'
import { overallAt, playerOverall } from '../src/engine/overall'
import { ATTRIBUTE_NAMES, NATIONALITIES, SQUAD_MAX, SQUAD_MIN } from '../src/engine/types'
import type { Player, Team } from '../src/engine/types'

let world: World
let playersById: Map<string, Player>

beforeAll(() => {
  world = generateWorld({ seed: 12345 })
  playersById = new Map(world.players.map((p) => [p.id, p]))
})

const squadOf = (team: Team) => team.squad.map((id) => playersById.get(id) as Player)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const startersStrength = (team: Team) =>
  mean(team.tactic.startingXI.map((id) => playerOverall(playersById.get(id) as Player)))

function correlation(xs: number[], ys: number[]): number {
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i++) {
    const a = (xs[i] as number) - mx
    const b = (ys[i] as number) - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  return num / Math.sqrt(dx * dy)
}

describe('determinismo', () => {
  it('mesma semente gera exatamente o mesmo mundo', () => {
    const again = generateWorld({ seed: 12345 })
    expect(JSON.stringify(again)).toBe(JSON.stringify(world))
  })

  it('semente em texto também é determinística', () => {
    const a = generateWorld({ seed: 'meu-manager' })
    const b = generateWorld({ seed: 'meu-manager' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('sementes diferentes geram mundos diferentes', () => {
    const other = generateWorld({ seed: 54321 })
    expect(other.players.map((p) => p.name)).not.toEqual(world.players.map((p) => p.name))
  })
})

describe('robustez entre sementes', () => {
  it('qualquer semente gera mundo válido', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const w = generateWorld({ seed })
      const byId = new Map(w.players.map((p) => [p.id, p]))
      expect(w.teams).toHaveLength(40)
      expect(new Set(w.players.map((p) => p.name)).size).toBe(w.players.length)
      for (const t of w.teams) {
        const formation = FORMATIONS[t.tactic.formationId]
        const xi = t.tactic.startingXI.map((id) => byId.get(id) as Player)
        expect(new Set(t.tactic.startingXI).size).toBe(11)
        // Quem joga fora da posição principal deve ser exceção, e quase sempre numa posição secundária.
        const slotOf = (i: number) => formation?.slots[i]?.position
        expect(xi.filter((p, i) => p.position === slotOf(i)).length).toBeGreaterThanOrEqual(8)
        expect(
          xi.filter((p, i) => p.position === slotOf(i) || p.secondaryPositions.includes(slotOf(i) as Player['position'])).length,
        ).toBeGreaterThanOrEqual(9)
        const ages = t.squad.map((id) => (byId.get(id) as Player).age)
        expect(ages.filter((a) => a >= 32).length).toBeGreaterThanOrEqual(2)
        expect(ages.filter((a) => a <= 20).length).toBeGreaterThanOrEqual(3)
      }
    }
  }, 30_000)
})

describe('times', () => {
  it('tem 20 times na Série A e 20 na Série B', () => {
    expect(world.teams.filter((t) => t.tier === 1)).toHaveLength(20)
    expect(world.teams.filter((t) => t.tier === 2)).toHaveLength(20)
  })

  it('ids, nomes e abreviações são únicos; abreviação tem 3 letras maiúsculas', () => {
    expect(new Set(world.teams.map((t) => t.id)).size).toBe(40)
    expect(new Set(world.teams.map((t) => t.name)).size).toBe(40)
    expect(new Set(world.teams.map((t) => t.abbreviation)).size).toBe(40)
    for (const t of world.teams) expect(t.abbreviation).toMatch(/^[A-Z]{3}$/)
  })

  it('usa cidades reais de vários estados', () => {
    const states = new Set(TEAM_DEFINITIONS.map((d) => d.state))
    expect(states.size).toBeGreaterThanOrEqual(20)
    for (const t of world.teams) {
      expect(t.state).toMatch(/^[A-Z]{2}$/)
      expect(t.colors).toHaveLength(2)
      for (const c of t.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('Série A segue as faixas de reputação: 4 grandes, 8 médios, 8 pequenos', () => {
    const rep = world.teams.filter((t) => t.tier === 1).map((t) => t.reputation)
    expect(rep.filter((r) => r >= 16)).toHaveLength(4)
    expect(rep.filter((r) => r >= 11 && r <= 15)).toHaveLength(8)
    expect(rep.filter((r) => r >= 7 && r <= 10)).toHaveLength(8)
  })

  it('Série B tem reputação menor que a Série A', () => {
    const a = world.teams.filter((t) => t.tier === 1).map((t) => t.reputation)
    const b = world.teams.filter((t) => t.tier === 2).map((t) => t.reputation)
    expect(mean(b)).toBeLessThan(mean(a) - 3)
    expect(Math.max(...b)).toBeLessThanOrEqual(8)
    for (const r of [...a, ...b]) {
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(20)
    }
  })

  it('finanças, torcida e meta da diretoria são coerentes', () => {
    for (const t of world.teams) {
      expect(t.finances.balance).toBeGreaterThan(0)
      expect(t.finances.salaryBudget).toBeGreaterThan(0)
      expect(t.stadium.capacity).toBeGreaterThan(10_000)
      expect(t.objective.targetPosition).toBeGreaterThanOrEqual(1)
      expect(t.objective.sackingPosition).toBeGreaterThan(t.objective.targetPosition)
      expect(t.objective.sackingPosition).toBeLessThanOrEqual(20)
    }
    const a = world.teams.filter((t) => t.tier === 1)
    const strongest = a.reduce((x, y) => (x.reputation > y.reputation ? x : y))
    const weakest = a.reduce((x, y) => (x.reputation < y.reputation ? x : y))
    expect(strongest.objective.targetPosition).toBe(1)
    expect(strongest.finances.balance).toBeGreaterThan(weakest.finances.balance)
    expect(strongest.fanBase).toBeGreaterThan(weakest.fanBase)
  })

  it('força do time acompanha a reputação', () => {
    const reps = world.teams.map((t) => t.reputation)
    const strengths = world.teams.map(startersStrength)
    // A Série A é equilibrada de propósito (campeonato disputado), então a correlação não é perfeita.
    expect(correlation(reps, strengths)).toBeGreaterThan(0.85)
    const avg = (tier: number) => mean(world.teams.filter((t) => t.tier === tier).map(startersStrength))
    expect(avg(1)).toBeGreaterThan(avg(2) + 8)
    // Mesmo assim, grandes > médios > pequenos na Série A.
    const serieA = world.teams.filter((t) => t.tier === 1)
    const band = (min: number, max: number) =>
      mean(serieA.filter((t) => t.reputation >= min && t.reputation <= max).map(startersStrength))
    expect(band(16, 20)).toBeGreaterThan(band(11, 15) + 1)
    expect(band(11, 15)).toBeGreaterThan(band(1, 10) + 1)
  })
})

describe('elencos', () => {
  it('cada elenco respeita os limites e está ligado ao time', () => {
    for (const t of world.teams) {
      expect(t.squad.length).toBeGreaterThanOrEqual(SQUAD_MIN)
      expect(t.squad.length).toBeLessThanOrEqual(SQUAD_MAX)
      for (const p of squadOf(t)) expect(p.teamId).toBe(t.id)
    }
    expect(world.players).toHaveLength(world.teams.reduce((n, t) => n + t.squad.length, 0))
  })

  it('elencos têm entre 24 e 30 jogadores e os de maior reputação tendem a ser maiores', () => {
    const sizes = world.teams.map((t) => t.squad.length)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(24)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(30)
    expect(new Set(sizes).size).toBeGreaterThanOrEqual(5)
    expect(correlation(world.teams.map((t) => t.reputation), sizes)).toBeGreaterThan(0.6)
    const topFive = [...world.teams].sort((a, b) => b.reputation - a.reputation).slice(0, 5)
    const bottomFive = [...world.teams].sort((a, b) => a.reputation - b.reputation).slice(0, 5)
    expect(mean(topFive.map((t) => t.squad.length))).toBeGreaterThan(mean(bottomFive.map((t) => t.squad.length)) + 3)
  })

  it('cada time tem ao menos 2 goleiros e cobertura de todas as posições', () => {
    for (const t of world.teams) {
      const count = (pos: string) => squadOf(t).filter((p) => p.position === pos).length
      expect(count('GK')).toBeGreaterThanOrEqual(2)
      for (const pos of ['RB', 'LB', 'CB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST']) {
        expect(count(pos)).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('todo time tem veteranos e promessas', () => {
    for (const t of world.teams) {
      const ages = squadOf(t).map((p) => p.age)
      expect(ages.filter((a) => a >= 32).length).toBeGreaterThanOrEqual(2)
      expect(ages.filter((a) => a <= 20).length).toBeGreaterThanOrEqual(3)
      expect(Math.min(...ages)).toBeGreaterThanOrEqual(17)
      expect(Math.max(...ages)).toBeLessThanOrEqual(38)
    }
  })
})

describe('jogadores', () => {
  it('ids e nomes são únicos no mundo todo', () => {
    expect(new Set(world.players.map((p) => p.id)).size).toBe(world.players.length)
    expect(new Set(world.players.map((p) => p.name)).size).toBe(world.players.length)
  })

  it('atributos são inteiros de 1 a 100 e o potencial nunca fica abaixo do nível atual', () => {
    for (const p of world.players) {
      for (const name of ATTRIBUTE_NAMES) {
        const v = p.attributes[name]
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(ATTRIBUTE_MIN)
        expect(v).toBeLessThanOrEqual(ATTRIBUTE_MAX)
      }
      for (const v of Object.values(p.hidden)) {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(ATTRIBUTE_MIN)
        expect(v).toBeLessThanOrEqual(ATTRIBUTE_MAX)
      }
      expect(p.hidden.potential).toBeGreaterThanOrEqual(Math.round(playerOverall(p)))
    }
  })

  it('posições secundárias: no máximo 2, sem repetir a principal', () => {
    for (const p of world.players) {
      expect(p.secondaryPositions.length).toBeLessThanOrEqual(2)
      expect(p.secondaryPositions).not.toContain(p.position)
      expect(new Set(p.secondaryPositions).size).toBe(p.secondaryPositions.length)
    }
  })

  it('atributos são coerentes com a posição', () => {
    const avgAttr = (pos: string, attr: (p: Player) => number) =>
      mean(world.players.filter((p) => p.position === pos).map(attr))

    expect(avgAttr('ST', (p) => p.attributes.finishing)).toBeGreaterThan(avgAttr('CB', (p) => p.attributes.finishing) + 15)
    expect(avgAttr('CB', (p) => p.attributes.tackling)).toBeGreaterThan(avgAttr('ST', (p) => p.attributes.tackling) + 15)
    expect(avgAttr('CB', (p) => p.attributes.heading)).toBeGreaterThan(avgAttr('RW', (p) => p.attributes.heading) + 10)
    expect(avgAttr('RW', (p) => p.attributes.crossing)).toBeGreaterThan(avgAttr('CB', (p) => p.attributes.crossing) + 15)
    expect(avgAttr('CM', (p) => p.attributes.passing)).toBeGreaterThan(avgAttr('ST', (p) => p.attributes.passing) + 5)
    expect(avgAttr('DM', (p) => p.attributes.tackling)).toBeGreaterThan(avgAttr('AM', (p) => p.attributes.tackling) + 10)
    expect(avgAttr('ST', (p) => p.attributes.pace)).toBeGreaterThan(avgAttr('CB', (p) => p.attributes.pace) + 5)

    const keepers = world.players.filter((p) => p.position === 'GK')
    const others = world.players.filter((p) => p.position !== 'GK')
    expect(mean(keepers.map((p) => p.attributes.reflexes))).toBeGreaterThan(mean(others.map((p) => p.attributes.reflexes)) + 30)
    expect(mean(keepers.map((p) => p.attributes.rushingOut))).toBeGreaterThan(mean(others.map((p) => p.attributes.rushingOut)) + 30)
    for (const p of others) {
      expect(p.attributes.reflexes).toBeLessThanOrEqual(15)
      expect(p.attributes.rushingOut).toBeLessThanOrEqual(15)
    }
  })

  it('veteranos perdem velocidade e jovens ainda têm potencial para crescer', () => {
    const young = world.players.filter((p) => p.age <= 20)
    const old = world.players.filter((p) => p.age >= 34)
    expect(mean(old.map((p) => p.attributes.pace))).toBeLessThan(mean(young.map((p) => p.attributes.pace)) + 5)
    const gap = (p: Player) => p.hidden.potential - playerOverall(p)
    expect(mean(young.map(gap))).toBeGreaterThan(mean(old.map(gap)) + 7.5)
  })

  it('nomes têm cara brasileira, com apelidos e uns poucos sul-americanos', () => {
    const total = world.players.length
    const foreigners = world.players.filter((p) => p.nationality !== 'Brazil')
    expect(foreigners.length / total).toBeGreaterThan(0.02)
    expect(foreigners.length / total).toBeLessThan(0.12)
    for (const p of world.players) expect(NATIONALITIES).toContain(p.nationality)

    const nicknamed = world.players.filter((p) => p.nickname)
    expect(nicknamed.length / total).toBeGreaterThan(0.08)
    expect(nicknamed.length / total).toBeLessThan(0.3)
    expect(foreigners.every((p) => !p.nickname)).toBe(true)

    for (const p of world.players) expect(p.name.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
  })

  it('contratos e estado inicial são válidos', () => {
    for (const p of world.players) {
      expect(p.contract.salary).toBeGreaterThan(0)
      expect(p.contract.releaseClause).toBeGreaterThan(p.contract.salary)
      expect(p.contract.endDate).toMatch(/^\d{4}-12-31$/)
      expect(Number(p.contract.endDate.slice(0, 4))).toBeGreaterThanOrEqual(world.startYear)
      expect(p.condition.fitness).toBe(100)
      expect(p.condition.injuryDaysLeft).toBe(0)
    }
    const salaryOf = (tier: number) =>
      mean(world.players.filter((p) => world.teams.find((t) => t.id === p.teamId)?.tier === tier).map((p) => p.contract.salary))
    expect(salaryOf(1)).toBeGreaterThan(salaryOf(2))
  })
})

const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))] as number

describe('escala de força de 1 a 100', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]
  const worlds = SEEDS.map((seed) => generateWorld({ seed }))

  /** Força de todos os titulares das equipes da série, juntando todos os mundos. */
  const starters = (tier: number) =>
    worlds.flatMap((w) => {
      const byId = new Map(w.players.map((p) => [p.id, p]))
      return w.teams
        .filter((t) => t.tier === tier)
        .flatMap((t) => t.tactic.startingXI.map((id) => playerOverall(byId.get(id) as Player)))
    })

  it('titulares da Série A ficam entre ~55 e ~85', () => {
    const xs = starters(1)
    expect(percentile(xs, 0.05)).toBeGreaterThanOrEqual(53)
    expect(percentile(xs, 0.95)).toBeLessThanOrEqual(84)
    expect(percentile(xs, 0.5)).toBeGreaterThan(62)
    expect(percentile(xs, 0.5)).toBeLessThan(75)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(45)
    expect(Math.max(...xs)).toBeLessThanOrEqual(95)
  })

  it('titulares da Série B ficam entre ~40 e ~65', () => {
    const xs = starters(2)
    expect(percentile(xs, 0.05)).toBeGreaterThanOrEqual(40)
    expect(percentile(xs, 0.95)).toBeLessThanOrEqual(65)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(33)
    expect(Math.max(...xs)).toBeLessThanOrEqual(76)
  })

  it('craques são poucos no campeonato inteiro e atributos acima de 90 são raros', () => {
    for (const w of worlds) {
      const overalls = w.players.map(playerOverall)
      expect(overalls.filter((o) => o >= 85).length).toBeLessThanOrEqual(12)
      expect(overalls.filter((o) => o >= 92).length).toBeLessThanOrEqual(2)

      const values = w.players.flatMap((p) => ATTRIBUTE_NAMES.map((n) => p.attributes[n]))
      expect(values.filter((v) => v > 90).length / values.length).toBeLessThan(0.005)
      expect(values.filter((v) => v > 95).length / values.length).toBeLessThan(0.0005)
    }
  })

  it('craques só aparecem na Série A', () => {
    for (const w of worlds) {
      const tierOf = new Map(w.teams.map((t) => [t.id, t.tier]))
      for (const p of w.players) {
        if (tierOf.get(p.teamId as string) === 2) expect(playerOverall(p)).toBeLessThan(80)
      }
    }
  })

  it('força mínima de um profissional é razoável', () => {
    for (const w of worlds) expect(Math.min(...w.players.map(playerOverall))).toBeGreaterThanOrEqual(30)
  })
})

describe('escalação automática prioriza os melhores', () => {
  it('o melhor jogador de cada time joga, ou há alguém praticamente igual na vaga dele', () => {
    for (const seed of [12345, 1, 2, 3, 4, 5, 6, 7]) {
      const w = generateWorld({ seed })
      for (const t of w.teams) {
        const squad = w.players.filter((p) => p.teamId === t.id)
        const top = [...squad].sort((a, b) => playerOverall(b) - playerOverall(a))[0] as Player
        if (t.tactic.startingXI.includes(top.id)) continue

        // Fora do XI só vale se, em toda vaga que ele cobriria, o titular rende quase o mesmo.
        const formation = FORMATIONS[t.tactic.formationId]!
        const xi = t.tactic.startingXI.map((id) => squad.find((p) => p.id === id) as Player)
        const covers = formation.slots
          .map((slot, i) => ({ slot, starter: xi[i] as Player }))
          .filter(({ slot }) => slot.position === top.position || top.secondaryPositions.includes(slot.position))
        for (const { slot, starter } of covers) {
          expect(overallAt(starter, slot.position)).toBeGreaterThanOrEqual(overallAt(top, slot.position) - 3)
        }
      }
    }
  })

  it('a formação escolhida está entre as que melhor encaixam o elenco', () => {
    const squadOfTeam = (t: Team) => world.players.filter((p) => p.teamId === t.id)
    for (const t of world.teams) {
      const ranking = rankFormations(squadOfTeam(t), FORMATION_IDS.map(getFormation))
      const best = ranking[0]!.score
      const chosen = ranking.find((r) => r.formationId === t.tactic.formationId)!
      expect(chosen.score).toBeGreaterThanOrEqual(best * (1 - FORMATION_TIE_TOLERANCE) - 1e-9)
    }
  })
})

describe('tática inicial', () => {
  it('cada time tem escalação válida para a sua formação', () => {
    for (const t of world.teams) {
      const formation = FORMATIONS[t.tactic.formationId]
      expect(formation).toBeDefined()
      const { startingXI, bench } = t.tactic
      expect(startingXI).toHaveLength(11)
      expect(new Set(startingXI).size).toBe(11)
      expect(bench).toHaveLength(7)
      expect(new Set([...startingXI, ...bench]).size).toBe(18)
      for (const id of [...startingXI, ...bench]) expect(t.squad).toContain(id)

      const xi = startingXI.map((id) => playersById.get(id) as Player)
      expect(xi[0]?.position).toBe('GK')
      const natural = xi.filter((p, i) => p.position === formation?.slots[i]?.position).length
      expect(natural).toBeGreaterThanOrEqual(9)
      expect(bench.some((id) => playersById.get(id)?.position === 'GK')).toBe(true)

      expect(startingXI).toContain(t.tactic.captainId)
      expect(t.tactic.penaltyTakerIds.length).toBeGreaterThan(0)
      expect(t.tactic.freeKickTakerIds.length).toBeGreaterThan(0)
      for (const id of [...t.tactic.penaltyTakerIds, ...t.tactic.freeKickTakerIds]) {
        expect(playersById.get(id)?.position).not.toBe('GK')
      }
    }
  })
})
