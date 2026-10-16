/**
 * Aniversários: a idade do jogador aumenta no dia do aniversário dele, com o envelhecimento daquele ano
 * (declínio dos veteranos e ruído dos atributos), e não na virada da temporada. Assim quem muda de liga no meio do ano
 * não envelhece duas vezes e o trabalho se espalha pelo ano. O sorteio vem da semente do jogo, do jogador e da idade nova,
 * então não depende da ordem dos dias nem de quantos avanços foram feitos.
 */
import { growOlder } from '../offseason/evolution'
import { createRng, hashSeed } from '../rng'
import type { IsoDate, Player } from '../types'
import { birthdaysBetween } from './dates'

/** Aplica os aniversários que caem em (from, to]. Devolve a mesma lista quando ninguém faz anos. */
export function applyBirthdays(players: readonly Player[], from: IsoDate, to: IsoDate, seed: number | string): readonly Player[] {
  if (to <= from) return players
  let changed = false
  const next = players.map((p) => {
    if (birthdaysBetween(p.birthDate, from, to) === 0) return p
    changed = true
    return growOlder(createRng(hashSeed(`${seed}:birthday:${p.id}:${p.age + 1}`)), p)
  })
  return changed ? next : players
}
