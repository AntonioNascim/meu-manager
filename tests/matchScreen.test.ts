import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { advanceToMatchday, createGame, finishPendingMatch, lastUserMatch, nextUserMatch } from '../src/store/game'
import type { Game } from '../src/store/game'
import { beginLive, clearLive, getLive } from '../src/store/liveMatch'
import { App } from '../src/ui/App'
import { Dashboard } from '../src/ui/screens/Dashboard'
import { MatchScreen, buildLog } from '../src/ui/screens/Match'
import { Tactics } from '../src/ui/screens/Tactics'

const USER = 'team-imp'

/** Avança até o dia da partida do time. */
function toMatchDay(seed = 3): Game {
  let game = createGame(seed, USER)
  while (!game.pendingUserMatch) game = advanceToMatchday(game)
  return game
}

afterEach(() => clearLive())

describe('partida do jogador: do avanço ao registro do resultado', () => {
  it('Avançar para na partida do time, sem simulá-la', () => {
    const game = toMatchDay()
    expect(game.pendingUserMatch?.status).toBe('scheduled')
    expect(nextUserMatch(game)?.id).toBe(game.pendingUserMatch?.id)
    expect(lastUserMatch(game)).toBeUndefined()
    expect(advanceToMatchday(game)).toBe(game)
  })

  it('jogada ao vivo e registrada, a partida entra na tabela e libera o próximo avanço', () => {
    let game = toMatchDay()
    const session = beginLive(game)
    expect(getLive(game.pendingUserMatch?.id as string)).toBe(session)
    session.match.playUntil(45)
    session.match.playUntil(90)
    const result = session.match.result()
    game = finishPendingMatch(game, result)
    expect(game.pendingUserMatch).toBeUndefined()
    expect(lastUserMatch(game)?.result).toEqual(result)
    const next = advanceToMatchday(game)
    expect(next.season.season.currentDate > game.season.season.currentDate).toBe(true)
  })

  it('o mesmo jogo sem mexer dá o mesmo resultado que a simulação direta com a IA fora do time', () => {
    const game = toMatchDay(5)
    const a = beginLive(game)
    a.match.playUntil(90)
    clearLive()
    const b = beginLive(game)
    b.match.playUntil(45)
    b.match.playUntil(90)
    expect(a.match.result()).toEqual(b.match.result())
  })
})

describe('narração ao vivo', () => {
  it('as linhas vão do mais recente para o mais antigo, com início, intervalo e fim', () => {
    const game = toMatchDay()
    const live = beginLive(game)
    live.match.playUntil(60)
    const half = buildLog(live.match.snapshot(), true)
    expect(half[half.length - 1]?.text).toContain('começa o jogo')
    expect(half.some((l) => l.text.includes('Fim do primeiro tempo'))).toBe(true)
    expect(half.every((l, i) => i === 0 || (half[i - 1]?.minute ?? 0) >= l.minute)).toBe(true)
    live.match.playUntil(90)
    const full = buildLog(live.match.snapshot(), true)
    expect(full[0]?.text).toContain('Fim de jogo')
  })

  it('as faltas podem ser escondidas', () => {
    const live = beginLive(toMatchDay())
    live.match.playUntil(90)
    const snap = live.match.snapshot()
    const withFouls = buildLog(snap, true, true)
    const without = buildLog(snap, true, false)
    expect(snap.events.some((e) => e.type === 'foul')).toBe(true)
    expect(without.length).toBeLessThan(withFouls.length)
    expect(without.some((l) => l.label === 'Falta')).toBe(false)
  })
})

describe('telas da partida (renderização)', () => {
  it('o painel manda ir para a partida quando ela está pendente', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { game: toMatchDay(), onNavigate: () => {} }))
    expect(html).toContain('Ir para a partida')
  })

  it('antes de começar mostra o confronto e as opções', () => {
    const html = renderToStaticMarkup(createElement(MatchScreen, { game: toMatchDay(), onNavigate: () => {} }))
    expect(html).toContain('Começar a partida')
    expect(html).toContain('Ajustar tática')
    expect(html).toContain('A IA não mexe no seu time')
  })

  it('com a partida em andamento mostra placar, velocidade e abas', () => {
    const game = toMatchDay()
    beginLive(game).match.playUntil(30)
    const html = renderToStaticMarkup(createElement(MatchScreen, { game, onNavigate: () => {} }))
    for (const text of ['Continuar', 'Velocidade', 'Lances', 'Dados', 'Tática', 'Trocas', 'Apita o árbitro']) expect(html).toContain(text)
    expect(html).toContain('30&#x27; · pausado')
  })

  it('no fim de jogo mostra o botão de concluir', () => {
    const game = toMatchDay()
    beginLive(game).match.playUntil(90)
    expect(renderToStaticMarkup(createElement(MatchScreen, { game, onNavigate: () => {} }))).toContain('Concluir partida')
  })

  it('sem partida pendente, a tela explica e volta ao painel', () => {
    const html = renderToStaticMarkup(createElement(MatchScreen, { game: createGame(3, USER), onNavigate: () => {} }))
    expect(html).toContain('Não há partida')
  })

  it('depois que a partida começa, a tela de tática avisa que a mudança é feita na partida', () => {
    const game = toMatchDay()
    expect(renderToStaticMarkup(createElement(Tactics, { game }))).toContain('Capitão')
    beginLive(game)
    expect(renderToStaticMarkup(createElement(Tactics, { game }))).toContain('A partida já começou')
  })

  it('o aplicativo começa no menu inicial, com Novo jogo e Carregar', () => {
    const html = renderToStaticMarkup(createElement(App))
    expect(html).toContain('Novo jogo')
    expect(html).toContain('Carregar')
    expect(html).toContain('Importar save de um arquivo')
  })
})
