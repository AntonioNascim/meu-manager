import type { TeamId } from './types'

/**
 * Quem o motor protege da IA: um clube (o do jogador, na carreira solo) ou um conjunto deles (os técnicos humanos de uma liga online, Fase 6, B6).
 * Com uma string, tudo se comporta exatamente como antes; um conjunto só aparece nas ligas online.
 */
export type TeamRef = TeamId | ReadonlySet<TeamId>

/** `true` se `id` é um dos clubes protegidos (sem `ref` ou sem `id`, nunca). */
export function isProtected(ref: TeamRef | undefined, id: TeamId | null | undefined): boolean {
  if (ref === undefined || id === undefined || id === null) return false
  return typeof ref === 'string' ? ref === id : ref.has(id)
}
