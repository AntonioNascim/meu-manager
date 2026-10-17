/**
 * Roda as operações pesadas (`heavyOps.ts`) fora da tela, num Web Worker, enquanto a interface mostra "Preparando a
 * temporada…". Sem Worker (testes, navegadores antigos) ou se ele falhar, o cálculo roda na thread principal com o mesmo
 * resultado. Só uma operação por vez.
 */
import { useSyncExternalStore } from 'react'
import { getGame, setGame } from './gameStore'
import type { Game } from './game'
import type { HeavyRequest, HeavyResponse } from './heavy.worker'
import { heavyLabel, isHeavy, runHeavyOp } from './heavyOps'
import type { HeavyOp } from './heavyOps'

/** Parte de um `Worker` de que o código precisa (permite trocar por um falso nos testes). */
export interface WorkerLike {
  postMessage(message: HeavyRequest): void
  terminate(): void
  onmessage: ((event: { data: HeavyResponse }) => void) | null
  onerror: ((event: unknown) => void) | null
}

let factory: (() => WorkerLike) | null = null
let worker: WorkerLike | null = null
let workerBroken = false
let nextId = 1

/** Os testes trocam a criação do worker; `null` volta ao padrão do navegador. */
export function setWorkerFactory(create: (() => WorkerLike) | null): void {
  worker?.terminate()
  worker = null
  workerBroken = false
  factory = create
}

function getWorker(): WorkerLike | null {
  if (workerBroken) return null
  if (worker) return worker
  try {
    if (factory) worker = factory()
    else if (typeof Worker !== 'undefined') worker = new Worker(new URL('./heavy.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike
  } catch {
    workerBroken = true
  }
  return worker
}

// ---------------------------------------------------------------------------
// Estado "ocupado" para a tela de progresso
// ---------------------------------------------------------------------------

let busy: string | null = null
const listeners = new Set<() => void>()
const setBusy = (label: string | null) => {
  busy = label
  listeners.forEach((l) => l())
}

/** O texto da tela de progresso enquanto uma operação pesada roda; `null` quando não há nenhuma. */
export function useBusy(): string | null {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => busy, () => busy)
}

export const isBusy = (): boolean => busy !== null

/** Calcula no worker; se ele não existe ou falha, calcula aqui. */
function compute(op: HeavyOp, game: Game): Promise<Game> {
  const w = getWorker()
  if (!w) return Promise.resolve(runHeavyOp(op, game))
  return new Promise<Game>((resolve) => {
    const id = nextId++
    const fallback = () => {
      workerBroken = true
      w.terminate()
      worker = null
      resolve(runHeavyOp(op, game))
    }
    w.onmessage = (event) => {
      if (event.data.id !== id) return
      if ('error' in event.data) return fallback()
      resolve(event.data.game)
    }
    w.onerror = fallback
    try {
      w.postMessage({ id, op, game })
    } catch {
      fallback()
    }
  })
}

/**
 * Aplica a operação ao jogo atual. Pesada: roda no worker com a tela de progresso (o jogo só muda quando termina, e se o
 * jogador saiu do jogo nesse meio tempo o resultado é descartado). Leve: roda na hora. Devolve o jogo novo, ou `undefined`
 * se não havia jogo, já havia uma operação rodando ou o jogo mudou no meio.
 */
export async function runHeavy(op: HeavyOp): Promise<Game | undefined> {
  const game = getGame()
  if (!game || busy !== null) return undefined
  if (!isHeavy(op, game)) {
    const next = runHeavyOp(op, game)
    setGame(next)
    return next
  }
  setBusy(heavyLabel(op, game))
  try {
    // Dá uma vez à tela para desenhar o aviso antes de começar o trabalho.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const next = await compute(op, game)
    if (getGame() !== game) return undefined
    setGame(next)
    return next
  } finally {
    setBusy(null)
  }
}
