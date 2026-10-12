/** Guarda o jogo atual em memória e avisa a interface quando muda (sem salvar em disco ainda). */
import { useSyncExternalStore } from 'react'
import type { Game } from './game'

let current: Game | null = null
const listeners = new Set<() => void>()

export function setGame(game: Game | null): void {
  current = game
  listeners.forEach((listener) => listener())
}

/** Atualiza o jogo com uma transição pura (`advanceGame`, `setUserTactic`...). */
export function updateGame(change: (game: Game) => Game): void {
  if (current) setGame(change(current))
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGame(): Game | null {
  return useSyncExternalStore(subscribe, () => current)
}
