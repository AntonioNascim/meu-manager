import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import type { Player, Team } from '../src/engine/types'
import { shortPlayerName } from '../src/ui/format'
import { liveSubstituteCandidates } from '../src/ui/screens/squad/SubstituteSheet'

const world = generateWorld({ seed: 11 })
const team = world.teams.find((t) => t.tier === 1) as Team
const squad = world.players.filter((p) => p.teamId === team.id)

describe('nome curto no campo do Elenco', () => {
  it('uma palavra só: o sobrenome, o último nome do apelido, e o anterior quando o último é Júnior ou Filho', () => {
    const p = (name: string, nickname?: string) => ({ name, ...(nickname ? { nickname } : {}) })
    expect(shortPlayerName(p('Maurício Paulo Castro Filho'))).toBe('Castro')
    expect(shortPlayerName(p('Eduardo Figueiredo'))).toBe('Figueiredo')
    expect(shortPlayerName(p('Alex Sandro Lima', 'Alex Sandro'))).toBe('Sandro')
    expect(shortPlayerName(p('Léo Pereira da Silva', 'Léo Pereira'))).toBe('Pereira')
    expect(shortPlayerName(p('Danilo Luiz da Silva', 'Danilo'))).toBe('Danilo')
    expect(shortPlayerName(p('Neymar da Silva Santos Júnior'))).toBe('Santos')
    expect(shortPlayerName(p('Pelé'))).toBe('Pelé')
  })
  it('todo jogador de todos os times da Série A tem um nome curto de uma palavra só, sem espaços', () => {
    for (const player of world.players.filter((x) => world.teams.find((t) => t.id === x.teamId)?.tier === 1)) expect(shortPlayerName(player)).not.toMatch(/\s/)
  })
})

describe('substituição na partida: só o banco, mesma posição primeiro', () => {
  const bench = squad.filter((p) => !team.tactic.startingXI.includes(p.id))
  it('reservas da mesma posição vêm antes, e os de outras posições têm força mais baixa que na própria posição', () => {
    for (const slot of ['CB', 'CM', 'ST', 'RW'] as const) {
      const r = liveSubstituteCandidates(slot, bench)
      expect(r.same.every((c) => c.player.position === slot)).toBe(true)
      expect(r.others.every((c) => c.player.position !== slot && c.player.position !== 'GK')).toBe(true)
      for (const c of r.others) expect(c.where.zone).toBe('bench')
      const sorted = (l: typeof r.same) => l.every((c, i) => i === 0 || l[i - 1]!.strength >= c.strength)
      expect(sorted(r.same) && sorted(r.others)).toBe(true)
    }
  })
  it('goleiro só entra no lugar de goleiro e não entra na linha', () => {
    const gk = liveSubstituteCandidates('GK', bench)
    expect([...gk.same, ...gk.others].every((c) => c.player.position === 'GK')).toBe(true)
    const line = liveSubstituteCandidates('CB', bench)
    expect([...line.same, ...line.others].some((c: { player: Player }) => c.player.position === 'GK')).toBe(false)
  })
})

describe('nome que cabe no campo: inteiro, depois "A. Sandro", por fim só o sobrenome', async () => {
  const { nameForms, abbreviatedName } = await import('../src/ui/theme/FitName')
  const p = (name: string, nickname?: string) => ({ name, ...(nickname ? { nickname } : {}) })
  it('o nome conhecido inteiro vem primeiro, e só o primeiro nome é abreviado', () => {
    expect(nameForms(p('Alex Sandro Lima', 'Alex Sandro'))).toEqual([
      { form: 'full', text: 'Alex Sandro' },
      { form: 'abbr', text: 'A. Sandro' },
      { form: 'surname', text: 'Sandro' },
    ])
    expect(nameForms(p('Léo Pereira da Silva', 'Léo Pereira'))[1]).toEqual({ form: 'abbr', text: 'L. Pereira' })
    expect(abbreviatedName(p('Maurício Paulo Castro Filho'))).toBe('M. Paulo Castro Filho')
  })
  it('apelido de uma palavra só e nome de uma palavra só não têm abreviação', () => {
    expect(nameForms(p('Danilo Luiz da Silva', 'Danilo'))).toEqual([{ form: 'full', text: 'Danilo' }])
    expect(nameForms(p('Pelé'))).toEqual([{ form: 'full', text: 'Pelé' }])
  })
})
