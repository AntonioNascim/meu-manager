/// <reference lib="webworker" />
/**
 * Worker das operações pesadas: recebe o jogo, calcula (`runHeavyOp`) e devolve o jogo novo. Não guarda estado entre as
 * mensagens, então cada pedido é independente e o resultado é o mesmo que na thread principal.
 */
import { runHeavyOp } from './heavyOps'
import type { HeavyOp } from './heavyOps'
import type { Game } from './game'

export interface HeavyRequest {
  id: number
  op: HeavyOp
  game: Game
}

export type HeavyResponse = { id: number; game: Game } | { id: number; error: string }

/** Responde a um pedido (separado do `onmessage` para poder ser testado sem um worker de verdade). */
export function handleHeavyRequest(request: HeavyRequest): HeavyResponse {
  try {
    return { id: request.id, game: runHeavyOp(request.op, request.game) }
  } catch (e) {
    return { id: request.id, error: e instanceof Error ? e.message : String(e) }
  }
}

const scope = globalThis as unknown as { onmessage: ((event: { data: HeavyRequest }) => void) | null; postMessage: (message: HeavyResponse) => void }
if (typeof window === 'undefined' && typeof scope.postMessage === 'function') {
  scope.onmessage = (event) => scope.postMessage(handleHeavyRequest(event.data))
}
