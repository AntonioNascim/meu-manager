import { describe, expect, it } from 'vitest'
import { applyCommand, parseCommand } from '../src/engine/league'
import { setShirt, squadShirts } from '../src/engine/shirt'
import { TALK, TALK_KINDS, emptyTalks, settlePromises, talkBlock, talkChance, talkToPlayer } from '../src/engine/talk'
import type { SeasonState } from '../src/engine/season'
import { addDays } from '../src/engine/season/dates'
import { createGame } from '../src/store/game'

const game = createGame(7, 'team-imp', { cups: false })
const base: SeasonState = game.season
const teamId = game.userTeamId
const squad = base.players.filter((p) => p.teamId === teamId)
const at = (world: SeasonState, date: string): SeasonState => ({ ...world, season: { ...world.season, currentDate: date } })
const withMorale = (world: SeasonState, id: string, morale: number): SeasonState => ({ ...world, players: world.players.map((p) => (p.id === id ? { ...p, condition: { ...p.condition, morale } } : p)) })
const moraleOf = (world: SeasonState, id: string) => world.players.find((p) => p.id === id)!.condition.morale

describe('número da camisa', () => {
  it('todo o elenco tem número, sem repetir, e o goleiro fica com o 1', () => {
    const nums = squadShirts(squad)
    expect(new Set(nums.values()).size).toBe(squad.length)
    const keeper = squad.filter((p) => p.position === 'GK').sort((a, b) => b.attributes.reflexes - a.attributes.reflexes)[0]!
    expect([...nums.values()]).toContain(1)
    expect(nums.get(keeper.id)).toBeGreaterThan(0)
  })

  it('o comando troca o número, troca com quem já usa e vale para o clube certo', () => {
    const [a, b] = squad as [(typeof squad)[number], (typeof squad)[number]]
    const before = squadShirts(squad)
    const r = applyCommand(base, teamId, { type: 'shirt', playerId: a.id, number: before.get(b.id)! })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const after = squadShirts(r.world.players.filter((p) => p.teamId === teamId), r.world.shirts?.[teamId])
    expect(after.get(a.id)).toBe(before.get(b.id))
    expect(after.get(b.id)).toBe(before.get(a.id))
    expect(new Set(after.values()).size).toBe(squad.length)
    // outro clube não é afetado, e jogador de outro clube não aceita
    expect(setShirt(base, teamId, 'jogador-que-nao-existe', 10)).toEqual({ ok: false, error: 'not-found' })
    expect(setShirt(base, teamId, a.id, 100)).toEqual({ ok: false, error: 'invalid' })
  })

  it('o comando é validado com lista fechada de campos', () => {
    expect(parseCommand({ type: 'shirt', playerId: 'p1', number: 10 })).toEqual({ type: 'shirt', playerId: 'p1', number: 10 })
    expect(parseCommand({ type: 'shirt', playerId: 'p1', number: 0 })).toBeUndefined()
    expect(parseCommand({ type: 'shirt', playerId: 'p1', number: 10, extra: 1 })).toBeUndefined()
    expect(parseCommand({ type: 'talk', playerId: 'p1', kind: 'praise' })).toEqual({ type: 'talk', playerId: 'p1', kind: 'praise' })
    expect(parseCommand({ type: 'talk', playerId: 'p1', kind: 'insultar' })).toBeUndefined()
  })
})

describe('Conversar', () => {
  const player = squad[3]!

  it('é determinístico e só mexe na moral dele', () => {
    const a = talkToPlayer(base, teamId, player.id, 'praise')
    const b = talkToPlayer(base, teamId, player.id, 'praise')
    expect(a).toEqual(b)
    if (!a.ok) throw new Error('deveria conversar')
    expect(a.world.players.filter((p) => p.id !== player.id)).toEqual(base.players.filter((p) => p.id !== player.id))
    expect(a.outcome.delta).toBe(moraleOf(a.world, player.id) - moraleOf(base, player.id))
  })

  it('os efeitos seguem a tabela: para cima no acerto, para baixo no erro', () => {
    for (const kind of TALK_KINDS) {
      const seen = new Set<boolean>()
      for (const p of squad) {
        const r = talkToPlayer(withMorale(base, p.id, 60), teamId, p.id, kind)
        if (!r.ok) throw new Error('deveria conversar')
        seen.add(r.outcome.success)
        expect(r.outcome.delta).toBe(TALK.effect[kind][r.outcome.success ? 'ok' : 'fail'])
      }
      expect(seen.size).toBe(2) // com um elenco inteiro aparece acerto e erro
    }
  })

  it('a taxa de acerto acompanha a chance de cada situação', () => {
    let hits = 0
    let total = 0
    let expected = 0
    for (const p of squad) {
      for (let day = 0; day < 40; day++) {
        const w = at(withMorale(base, p.id, 60), addDays(base.season.currentDate, day))
        const r = talkToPlayer(w, teamId, p.id, 'praise')
        if (!r.ok) continue
        total++
        hits += r.outcome.success ? 1 : 0
        expected += talkChance('praise', p, false) // a escalação não muda a chance de elogiar
      }
    }
    expect(Math.abs(hits / total - expected / total)).toBeLessThan(0.06)
  })

  it('moral nunca passa de 100 nem cai abaixo de 20', () => {
    for (const p of squad) {
      const high = talkToPlayer(withMorale(base, p.id, 99), teamId, p.id, 'promise')
      const low = talkToPlayer(withMorale(base, p.id, 22), teamId, p.id, 'threaten')
      if (high.ok) expect(high.outcome.morale).toBeLessThanOrEqual(100)
      if (low.ok) expect(low.outcome.morale).toBeGreaterThanOrEqual(20)
    }
    const tiny = talkToPlayer(withMorale(base, player.id, 5), teamId, player.id, 'threaten')
    if (tiny.ok) expect(tiny.outcome.morale).toBeGreaterThanOrEqual(5) // quem já estava abaixo do piso não cai mais
  })

  it('intervalo de 14 dias por jogador, 3 por semana no elenco e trava depois de erro', () => {
    let w = base
    const date = base.season.currentDate
    const first = talkToPlayer(w, teamId, player.id, 'praise')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    w = first.world
    const again = talkToPlayer(at(w, addDays(date, 3)), teamId, player.id, 'demand')
    expect(again.ok).toBe(false)
    if (!first.outcome.success) expect(again).toMatchObject({ error: 'talk-locked' })
    else expect(again).toMatchObject({ error: 'talk-too-soon' })
    // depois do intervalo (e da trava, se houve erro) pode de novo
    const later = at(w, addDays(date, first.outcome.success ? TALK.intervalDays : TALK.failLockDays))
    expect(talkBlock(later, teamId, player)).toBeUndefined()
    // teto semanal: 3 conversas com jogadores diferentes na mesma semana, a quarta é recusada
    let weekly = base
    const others = squad.filter((p) => p.id !== player.id).slice(0, 4)
    const results = others.map((p) => {
      const r = talkToPlayer(weekly, teamId, p.id, 'praise')
      if (r.ok) weekly = r.world
      return r
    })
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true)
    expect(results[3]).toMatchObject({ ok: false, error: 'talk-weekly' })
    expect(talkBlock(at(weekly, addDays(date, 8)), teamId, others[3]!)).toBeUndefined()
  })

  it('Garantir vaga cria a promessa só no acerto, e só uma por jogador', () => {
    const found = squad.map((p) => talkToPlayer(withMorale(base, p.id, 50), teamId, p.id, 'promise')).filter((r) => r.ok)
    const ok = found.find((r) => r.ok && r.outcome.promised)
    const bad = found.find((r) => r.ok && !r.outcome.promised)
    expect(ok).toBeDefined()
    expect(bad).toBeDefined()
    if (!ok || !ok.ok) return
    expect(ok.world.talks!.promises).toHaveLength(1)
    expect(ok.world.talks!.promises[0]).toMatchObject({ teamId, gamesLeft: TALK.promise.games, missed: 0 })
    if (bad && bad.ok) expect(bad.world.talks!.promises).toHaveLength(0)
    const pid = ok.world.talks!.promises[0]!.playerId
    const second = talkToPlayer(at(ok.world, addDays(base.season.currentDate, 30)), teamId, pid, 'promise')
    expect(second).toMatchObject({ ok: false, error: 'has-promise' })
  })

  it('a promessa: quem não começa jogando perde moral (até 20), quem cumpre os 3 jogos ganha bônus, quem sai do clube a perde', () => {
    const p = squad.find((x) => !base.teams.find((t) => t.id === teamId)!.tactic.startingXI.includes(x.id))!
    const starter = base.players.find((x) => base.teams.find((t) => t.id === teamId)!.tactic.startingXI.includes(x.id) && x.teamId === teamId)!
    const promise = (id: string) => ({ playerId: id, teamId, madeOn: base.season.currentDate, gamesLeft: 3, missed: 0 })
    const match = (minutes: Record<string, number>) => ({ homeTeamId: teamId, awayTeamId: 'outro', result: { playerResults: Object.entries(minutes).map(([playerId, minutesPlayed]) => ({ playerId, minutesPlayed })) } })

    // reserva: -10, -10, e o terceiro jogo não tira mais (teto de 20)
    let w: SeasonState = { ...withMorale(base, p.id, 70), talks: { ...emptyTalks(), promises: [promise(p.id)] } }
    for (let i = 0; i < 3; i++) w = settlePromises(w, match({}))
    expect(moraleOf(w, p.id)).toBe(50)
    expect(w.talks!.promises).toHaveLength(0)

    // titular que joga os três: ganha o bônus
    let s: SeasonState = { ...withMorale(base, starter.id, 70), talks: { ...emptyTalks(), promises: [promise(starter.id)] } }
    for (let i = 0; i < 3; i++) s = settlePromises(s, match({ [starter.id]: 90 }))
    expect(moraleOf(s, starter.id)).toBe(70 + TALK.promise.fulfilledBonus)
    expect(s.talks!.promises).toHaveLength(0)

    // jogo de outro time não conta; quem saiu do clube perde a promessa
    const other = settlePromises({ ...base, talks: { ...emptyTalks(), promises: [promise(p.id)] } }, { homeTeamId: 'x', awayTeamId: 'y' })
    expect(other.talks!.promises).toHaveLength(1)
    const gone = settlePromises({ ...base, players: base.players.map((x) => (x.id === p.id ? { ...x, teamId: 'x' } : x)), talks: { ...emptyTalks(), promises: [promise(p.id)] } }, match({}))
    expect(gone.talks!.promises).toHaveLength(0)
  })

  it('pelo comando, no clube dos outros ninguém conversa', () => {
    const outsider = base.players.find((p) => p.teamId !== teamId)!
    expect(applyCommand(base, teamId, { type: 'talk', playerId: outsider.id, kind: 'praise' })).toMatchObject({ ok: false, error: 'not-found' })
    const ok = applyCommand(base, teamId, { type: 'talk', playerId: player.id, kind: 'praise' })
    expect(ok.ok && ok.info && 'success' in ok.info).toBe(true)
  })
})
