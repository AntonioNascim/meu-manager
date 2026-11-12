import { BRAZILIAN_FIRST_NAMES, BRAZILIAN_SECOND_NAMES, BRAZILIAN_SURNAMES } from '../data/names'
import type { Game } from '../store/game'

/** Nome sorteado pela semente do jogo (sempre o mesmo): sugestão do Novo jogo e nome de saves antigos, que não guardaram um. */
export function drawnCoachName(seed: number): string {
  let a = (seed ^ 0x9e3779b9) >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const first = BRAZILIAN_FIRST_NAMES[Math.floor(next() * BRAZILIAN_FIRST_NAMES.length)]
  const second = BRAZILIAN_SECOND_NAMES[Math.floor(next() * BRAZILIAN_SECOND_NAMES.length)]
  const surname = BRAZILIAN_SURNAMES[Math.floor(next() * BRAZILIAN_SURNAMES.length)]
  return `${first} ${second} ${surname}`
}

/** Nome do técnico: o que a pessoa escolheu; na liga online, o apelido da conta; em saves antigos, o sorteado. */
export function coachName(game: Pick<Game, 'seed' | 'coach' | 'online'>, nickname?: string): string {
  if (game.online) return nickname ?? game.coach?.name ?? drawnCoachName(game.seed)
  return game.coach?.name ?? drawnCoachName(game.seed)
}

/** Identificador do rosto do técnico (muda com o jogo, não com o clube). */
export const coachFaceId = (game: Pick<Game, 'seed'>): string => `coach-${game.seed}`
