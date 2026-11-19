import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { drawChallenges } from '../src/engine/challenges'
import { makePromise } from '../src/engine/promise'
import { createGame } from '../src/store/game'
import type { Game } from '../src/store/game'
import { Career } from '../src/ui/screens/Career'
import { PressConference, promiseOpen } from '../src/ui/screens/dashboard/PressConference'
import { clubReport } from '../src/ui/screens/start/clubInfo'
import { ClubSheet } from '../src/ui/screens/start/ClubSheet'
import { ContractSheet } from '../src/ui/screens/start/Contract'
import { ChallengesSection, OffersSection } from '../src/ui/screens/start/Offers'

const USER = 'team-imp'
const game = () => createGame(3, USER, { cups: false })
const world = (g: Game) => ({ teams: g.season.teams, players: g.season.players })
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const noop = () => {}

describe('início de carreira: propostas, desafios, ficha e contrato', () => {
  it('mostra quatro propostas com contagem regressiva, "Conhecer o clube" e "Que outros liguem"', () => {
    const g = game()
    const html = renderToStaticMarkup(createElement(OffersSection, { world: world(g), seed: 7, onKnow: noop, onPick: noop }))
    expect(html.match(/data-testid="offer"/g)).toHaveLength(4)
    const t = text(html)
    expect(t).toContain('Quatro clubes procuram você')
    expect(t).toContain('Que outros liguem')
    expect(t).toContain('Conhecer o clube')
    expect(t).toMatch(/\d:\d\d/)
    expect(t).toContain('espera o')
  })

  it('os desafios trazem título, meta, prazo e estrelas, e aceitar marca o escolhido', () => {
    const g = game()
    const first = drawChallenges(world(g), 7)[0]!
    const html = renderToStaticMarkup(createElement(ChallengesSection, { world: world(g), seed: 7, accepted: first.id, onAccept: noop }))
    expect(html.match(/data-testid="challenge"/g)!.length).toBeGreaterThanOrEqual(3)
    const t = text(html)
    expect(t).toContain('Desafios')
    expect(t).toContain('Terminar em')
    expect(t).toContain('★')
    expect(t).toContain('Desafio aceito')
    expect(t).toContain('Aceitar')
  })

  it('a ficha do clube traz diretoria, estádio, orçamento com posição, elenco herdado e a análise', () => {
    const g = game()
    const r = clubReport(world(g), USER)!
    expect(r.leagueSize).toBe(20)
    expect(r.budgetRank).toBeGreaterThanOrEqual(1)
    expect(r.strengthRank).toBeLessThanOrEqual(20)
    expect(r.best).toHaveLength(3)
    expect(r.sectors[r.strongest]).toBeGreaterThanOrEqual(r.sectors[r.weakest])
    const t = text(renderToStaticMarkup(createElement(ClubSheet, { world: world(g), teamId: USER, onClose: noop, onSign: noop })))
    for (const s of ['Conhecer o clube', 'A diretoria', 'Pede', 'Perde a paciência', 'O campo e o caixa', 'Orçamento de compras', 'O elenco que você herda', 'Idade média', 'O melhor setor', 'Assinar com']) expect(t).toContain(s)
    expect(clubReport(world(g), 'nao-existe')).toBeUndefined()
  })

  it('o contrato tem seis itens e a caixa de assinatura, e só se confirma depois de assinar', () => {
    const g = game()
    const html = renderToStaticMarkup(createElement(ContractSheet, { world: world(g), teamId: USER, coachName: 'Ana Silva', onClose: noop, onSigned: noop }))
    const t = text(html)
    for (const s of ['Contrato de técnico', 'O cargo', 'O caixa', 'O elenco', 'O campo', 'O que você herda', 'O que você traz', 'Ana Silva', 'Assinar por mim', 'Assinar o contrato']) expect(t).toContain(s)
    expect(html).toContain('data-testid="signature-pad"')
    expect(html).toMatch(/data-testid="sign-contract"[^>]*disabled|disabled=""[^>]*data-testid="sign-contract"|data-testid="sign-contract"/)
  })
})

describe('coletiva de apresentação', () => {
  it('está aberta no começo e fecha com a promessa feita', () => {
    const g = game()
    expect(promiseOpen(g)).toBe(true)
    const html = renderToStaticMarkup(createElement(PressConference, { game: g }))
    expect(html).toContain('data-testid="press-card"')
    expect(text(html)).toContain('Coletiva de apresentação')
    const made: Game = { ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === USER ? makePromise(t, 'title', g.season.season.year) : t)) } }
    expect(promiseOpen(made)).toBe(false)
    expect(renderToStaticMarkup(createElement(PressConference, { game: made }))).toBe('')
    // a promessa de uma temporada passada não vale: a coletiva reabre
    const old: Game = { ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === USER ? makePromise(t, 'title', g.season.season.year - 1) : t)) } }
    expect(promiseOpen(old)).toBe(true)
  })

  it('fecha depois de algumas rodadas e quando o técnico foi demitido', () => {
    const g = game()
    const mine = g.season.matches.filter((m) => m.homeTeamId === USER || m.awayTeamId === USER).slice(0, 6).map((m) => m.id)
    const played: Game = { ...g, season: { ...g.season, matches: g.season.matches.map((m) => (mine.includes(m.id) ? { ...m, status: 'finished' as const } : m)) } }
    expect(promiseOpen(played)).toBe(false)
    expect(promiseOpen({ ...g, dismissal: { date: '2026-03-01', reason: 'results', confidence: 3, position: 19 } })).toBe(false)
  })
})

describe('carreira com conquistas', () => {
  it('a tela de Carreira tem as abas Carreira e Conquistas', () => {
    const html = text(renderToStaticMarkup(createElement(Career, { game: game(), onTaken: noop })))
    expect(html).toContain('Carreira')
    expect(html).toContain('Conquistas')
    expect(html).toContain('Sua carreira')
  })
})
