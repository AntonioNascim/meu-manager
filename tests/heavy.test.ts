import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { createGame, playPendingAuto, advanceToMatchday } from '../src/store/game'
import type { Game } from '../src/store/game'
import { getGame, setGame } from '../src/store/gameStore'
import { isBusy, runHeavy, setWorkerFactory } from '../src/store/heavy'
import type { WorkerLike } from '../src/store/heavy'
import { handleHeavyRequest } from '../src/store/heavy.worker'
import type { HeavyRequest, HeavyResponse } from '../src/store/heavy.worker'
import { BIG_WORLD_CLUBS, heavyLabel, isHeavy, runHeavyOp } from '../src/store/heavyOps'
import { BusyOverlay } from '../src/ui/components/BusyOverlay'

const start = createGame(5, 'team-imp')
const midSeason = (): Game => {
  let g = start
  for (let i = 0; i < 12; i++) g = playPendingAuto(advanceToMatchday(g))
  return g
}

/** Um worker de mentira que faz o que o de verdade faz: copia a mensagem (como o navegador), calcula e responde copiando. */
function fakeWorker(log: { requests: number }, mode: 'ok' | 'error' | 'throw' = 'ok'): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    terminate: () => undefined,
    postMessage(message: HeavyRequest) {
      log.requests++
      if (mode === 'throw') throw new Error('sem memória')
      const copy = structuredClone(message)
      const response: HeavyResponse = mode === 'error' ? { id: copy.id, error: 'falhou' } : handleHeavyRequest(copy)
      setTimeout(() => w.onmessage?.({ data: structuredClone(response) }), 0)
    },
  }
  return w
}

afterEach(() => {
  setWorkerFactory(null)
  setGame(null)
})

describe('quando uma operação é pesada', () => {
  it('a pré-temporada, a virada e os mundos grandes são; um avanço comum num mundo pequeno não é', () => {
    expect(isHeavy('advance', start)).toBe(true)
    expect(isHeavy('nextSeason', start)).toBe(true)
    expect(isHeavy('advance', midSeason())).toBe(false)
    const big = { ...midSeason(), season: { ...midSeason().season, teams: Array.from({ length: BIG_WORLD_CLUBS }, () => start.season.teams[0]!) } }
    expect(isHeavy('advance', big)).toBe(true)
    expect(heavyLabel('advance', start)).toBe('Preparando a temporada…')
    expect(heavyLabel('nextSeason', start)).toContain('próxima temporada')
    expect(heavyLabel('advance', midSeason())).toBe('Simulando os jogos…')
  })
})

describe('Web Worker das operações pesadas', () => {
  it('o jogo copiado para o worker e de volta dá exatamente o mesmo resultado que calcular na hora', async () => {
    const direct = runHeavyOp('advance', start)
    const viaWorker = handleHeavyRequest(structuredClone({ id: 1, op: 'advance' as const, game: start }))
    expect('game' in viaWorker && JSON.stringify(structuredClone(viaWorker.game))).toBe(JSON.stringify(direct))
    // E várias vezes seguidas (decisões da IA e resultados não mudam).
    let a: Game = start
    let b: Game = start
    for (let i = 0; i < 4; i++) {
      a = runHeavyOp('advance', a)
      const r = handleHeavyRequest(structuredClone({ id: i, op: 'advance' as const, game: b }))
      b = (r as { game: Game }).game
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('a virada de temporada também dá o mesmo resultado pelo worker', () => {
    let g = start
    while (g.season.matches.some((m) => m.status === 'scheduled')) {
      g = playPendingAuto(advanceToMatchday(g))
      if (g.dismissal) break
    }
    g = { ...g, season: { ...g.season, season: { ...g.season.season, phase: 'end-of-season' } } }
    const direct = runHeavyOp('nextSeason', g)
    const r = handleHeavyRequest(structuredClone({ id: 1, op: 'nextSeason' as const, game: g }))
    expect(JSON.stringify((r as { game: Game }).game)).toBe(JSON.stringify(direct))
  }, 60_000)

  it('runHeavy mostra o aviso enquanto o worker calcula e depois põe o jogo novo', async () => {
    const log = { requests: 0 }
    setWorkerFactory(() => fakeWorker(log))
    setGame(start)
    const run = runHeavy('advance')
    await new Promise((r) => setTimeout(r, 0))
    expect(isBusy()).toBe(true)
    expect(await runHeavy('advance')).toBeUndefined() // uma por vez
    const next = await run
    expect(isBusy()).toBe(false)
    expect(log.requests).toBe(1)
    expect(getGame()).toBe(next)
    expect(JSON.stringify(next)).toBe(JSON.stringify(runHeavyOp('advance', start)))
  })

  it('se o worker responde com erro ou não aceita a mensagem, o cálculo roda na thread principal com o mesmo resultado', async () => {
    for (const mode of ['error', 'throw'] as const) {
      const log = { requests: 0 }
      setWorkerFactory(() => fakeWorker(log, mode))
      setGame(start)
      const next = await runHeavy('advance')
      expect(JSON.stringify(next)).toBe(JSON.stringify(runHeavyOp('advance', start)))
      expect(log.requests).toBe(1)
      // Depois de falhar, o worker não é mais usado.
      setGame(start)
      await runHeavy('advance')
      expect(log.requests).toBe(1)
    }
  })

  it('sem Worker (testes e navegadores antigos) calcula na hora; avanço leve não usa a tela de progresso', async () => {
    setGame(start)
    const next = await runHeavy('advance')
    expect(getGame()).toBe(next)
    const mid = midSeason()
    setGame(mid)
    const log = { requests: 0 }
    setWorkerFactory(() => fakeWorker(log))
    await runHeavy('advance')
    expect(log.requests).toBe(0)
  })

  it('se o jogador sai do jogo enquanto o worker calcula, o resultado é descartado', async () => {
    setWorkerFactory(() => fakeWorker({ requests: 0 }))
    setGame(start)
    const run = runHeavy('advance')
    await new Promise((r) => setTimeout(r, 0))
    setGame(null)
    expect(await run).toBeUndefined()
    expect(getGame()).toBeNull()
  })

  it('a tela de progresso mostra o texto', () => {
    const html = renderToStaticMarkup(createElement(BusyOverlay, { label: 'Preparando a temporada…' }))
    expect(html).toContain('Preparando a temporada…')
    expect(html).toContain('role="status"')
  })
})
