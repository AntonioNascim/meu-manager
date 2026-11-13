import { squadShirts } from '../engine/shirt'
import type { SeasonState } from '../engine/season'

/** Número de camisa de cada jogador do clube (escolhas do técnico + o da posição), como o campo e o cartão os mostram. */
export function teamNumbers(season: Pick<SeasonState, 'players' | 'shirts'>, teamId: string): Map<string, number> {
  return squadShirts(
    season.players.filter((p) => p.teamId === teamId),
    season.shirts?.[teamId] ?? {},
  )
}

/** Põe todos os números do clube no mapa de camisas do campo (chave `lado:id`): o campo e as Trocas mostram o mesmo número que o cartão. */
export function seedNumbers(map: Map<string, number>, season: Pick<SeasonState, 'players' | 'shirts'>, teamId: string, side: 'home' | 'away'): Map<string, number> {
  for (const [id, n] of teamNumbers(season, teamId)) map.set(`${side}:${id}`, n)
  return map
}
