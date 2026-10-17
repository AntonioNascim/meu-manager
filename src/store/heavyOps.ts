/**
 * Operações pesadas do jogo (avançar na pré-temporada, virar a temporada): a função pura que as calcula e a regra de quando
 * vale a pena fazê-las fora da tela (num Web Worker). Sem React nem DOM: o mesmo código roda na thread principal, no worker e
 * nos testes, então o resultado é o mesmo (as decisões da IA e os resultados dependem só do jogo e das sementes).
 */
import { advanceGame, startNextSeason } from './game'
import type { Game } from './game'

export type HeavyOp = 'advance' | 'nextSeason'

/** Executa a operação sobre o jogo e devolve o jogo novo. */
export function runHeavyOp(op: HeavyOp, game: Game): Game {
  return op === 'nextSeason' ? startNextSeason(game) : advanceGame(game)
}

/** Mundos com tantos clubes ou mais fazem qualquer avanço passar de uns décimos de segundo num celular simples. */
export const BIG_WORLD_CLUBS = 100

/** Antes da primeira rodada o avanço roda as negociações de todos os clubes; a virada de temporada refaz o mundo inteiro. */
export function isHeavy(op: HeavyOp, game: Game): boolean {
  if (op === 'nextSeason') return true
  const firstRound = game.season.matches[0]?.date
  const preSeason = game.season.season.phase === 'pre-season' || (firstRound !== undefined && game.season.season.currentDate < firstRound)
  return preSeason || game.season.teams.length >= BIG_WORLD_CLUBS
}

/** O texto da tela de progresso. */
export function heavyLabel(op: HeavyOp, game: Game): string {
  if (op === 'nextSeason') return 'Preparando a próxima temporada…'
  return game.season.season.phase === 'pre-season' ? 'Preparando a temporada…' : 'Simulando os jogos…'
}
