/**
 * Salvamento automático: toda mudança do jogo (avanço de dia, partida jogada, tática, mercado...) é gravada
 * no espaço ativo, com um pequeno atraso para juntar mudanças seguidas. Falha ao gravar (disco cheio, modo
 * privado) aparece no status, sem derrubar o jogo.
 */
import { useSyncExternalStore } from 'react'
import { getActiveSlot, getGame, subscribeGame } from './gameStore'
import type { Game } from './game'
import { saveDetailed } from './saves'
import type { SaveStats } from './saves'

export type SaveStatus = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; at: string; stats: SaveStats } | { state: 'error'; message: string }

let status: SaveStatus = { state: 'idle' }
const statusListeners = new Set<() => void>()
function setStatus(next: SaveStatus) {
  status = next
  statusListeners.forEach((l) => l())
}

/** Teto da espera extra entre duas gravações (o tempo de cada uma entra na espera da seguinte). */
const MAX_DELAY_MS = 4000
/** Quantas vezes o tempo da última gravação o jogo espera antes da próxima: gravação lenta (celular simples, mundo grande) não pode ocupar o aparelho a cada toque. */
const DUTY = 3

let lastSaveMs = 0

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
    .then(() => saveDetailed(slot, game))
    .then(({ summary, stats }) => {
      lastSaveMs = stats.ms
      setStatus({ state: 'saved', at: summary.savedAt, stats })
    })
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
    timer = setTimeout(() => void writeNow(), Math.max(delayMs, Math.min(MAX_DELAY_MS, Math.round(lastSaveMs * DUTY))))
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
