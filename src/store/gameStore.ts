/** Guarda o jogo atual em memória e avisa a interface quando muda. O salvamento automático (`autosave.ts`) escuta daqui. */
import { useSyncExternalStore } from 'react'
import type { Game } from './game'

let current: Game | null = null
/** Espaço de save onde o jogo atual é gravado (null = não é gravado, ex.: atalhos de desenvolvimento). */
let activeSlot: number | null = null
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())

export function setGame(game: Game | null): void {
  current = game
  if (game === null) activeSlot = null
  notify()
}

/** Abre um jogo ligado a um espaço de save (novo jogo ou save carregado). */
export function openGame(game: Game, slot: number): void {
  current = game
  activeSlot = slot
  notify()
}

/** Atualiza o jogo com uma transição pura (`advanceGame`, `setUserTactic`...). */
export function updateGame(change: (game: Game) => Game): void {
  if (current) setGame(change(current))
}

export const getGame = (): Game | null => current
export const getActiveSlot = (): number | null => activeSlot

export function subscribeGame(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGame(): Game | null {
  return useSyncExternalStore(subscribeGame, () => current, () => current)
}
