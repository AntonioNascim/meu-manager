/**
 * Salvamento automático: toda mudança do jogo (avanço de dia, partida jogada, tática, mercado...) é gravada
 * no espaço ativo, com um pequeno atraso para juntar mudanças seguidas. Falha ao gravar (disco cheio, modo
 * privado) aparece no status, sem derrubar o jogo.
 */
import { useSyncExternalStore } from 'react'
import { getActiveSlot, getGame, subscribeGame } from './gameStore'
import type { Game } from './game'
import { saveToSlot } from './saves'

export type SaveStatus = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; at: string } | { state: 'error'; message: string }

let status: SaveStatus = { state: 'idle' }
const statusListeners = new Set<() => void>()
function setStatus(next: SaveStatus) {
  status = next
  statusListeners.forEach((l) => l())
}

let timer: ReturnType<typeof setTimeout> | undefined
let lastSaved: Game | null = null
let inFlight: Promise<void> = Promise.resolve()

function writeNow(): Promise<void> {
  timer = undefined
  const game = getGame()
  const slot = getActiveSlot()
  if (!game || slot === null || game === lastSaved) return inFlight
  lastSaved = game
  setStatus({ state: 'saving' })
  inFlight = inFlight
    .then(() => saveToSlot(slot, game))
    .then((summary) => setStatus({ state: 'saved', at: summary.savedAt }))
    .catch((error: unknown) => {
      lastSaved = null
      setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Não foi possível salvar.' })
    })
  return inFlight
}

/** Liga o salvamento automático. Devolve a função que desliga. */
export function startAutosave(delayMs = 300): () => void {
  const off = subscribeGame(() => {
    const game = getGame()
    if (!game || getActiveSlot() === null || game === lastSaved) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => void writeNow(), delayMs)
  })
  return () => {
    off()
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
}

/** Grava já o que estiver pendente e espera terminar (usado antes de voltar ao menu). */
export async function flushAutosave(): Promise<void> {
  if (timer !== undefined) clearTimeout(timer)
  await writeNow()
  await inFlight
}

/** Marca este jogo como já gravado (logo depois de carregar um save, para não regravar à toa). */
export function markSaved(game: Game): void {
  lastSaved = game
}

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    () => status,
    () => status,
  )
}
