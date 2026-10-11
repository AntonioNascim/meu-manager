/**
 * Narração em texto (português: é a exceção à regra de valores em inglês no motor).
 * Usa um gerador próprio, então trocar frases nunca muda o resultado de uma partida.
 */
import type { ShotType } from '../config'
import type { Rng } from '../rng'

const GOAL_OPENERS = [
  (team: string) => `GOL do ${team}!`,
  (team: string) => `É GOL! Explode a torcida do ${team}!`,
  (team: string) => `Bola na rede! Gol do ${team}!`,
]

const SHOT_DESCRIPTION: Record<ShotType, readonly string[]> = {
  longShot: ['acerta um chutaço de fora da área', 'arrisca de longe e acerta o ângulo'],
  inBox: ['finaliza dentro da área', 'bate cruzado na saída do goleiro', 'completa para o fundo das redes'],
  header: ['sobe mais que todo mundo e testa firme', 'cabeceia no canto'],
  oneOnOne: ['fica cara a cara com o goleiro e não perdoa', 'sai na cara do gol e toca com categoria'],
  penalty: ['cobra o pênalti com segurança', 'bate o pênalti e converte'],
  freeKick: ['cobra a falta com perfeição', 'bate a falta por cima da barreira'],
}

export function goalText(rng: Rng, team: string, scorer: string, type: ShotType, assister?: string): string {
  const opener = rng.pick(GOAL_OPENERS)(team)
  const assist = assister ? ` Assistência de ${assister}.` : ''
  return `${opener} ${scorer} ${rng.pick(SHOT_DESCRIPTION[type])}.${assist}`
}

export const ownGoalText = (scorer: string, benefited: string) =>
  `Gol contra! ${scorer} desvia para o próprio gol e o ${benefited} marca.`

export const missedPenaltyText = (rng: Rng, taker: string, saved: boolean) =>
  saved
    ? rng.pick([`O goleiro defende o pênalti de ${taker}!`, `${taker} cobra e o goleiro pega!`])
    : rng.pick([`${taker} isola o pênalti!`, `${taker} manda o pênalti para fora!`])

export const yellowCardText = (player: string, team: string) => `Cartão amarelo para ${player} (${team}).`
export const secondYellowText = (player: string) => `Segundo amarelo para ${player}, que está expulso!`
export const redCardText = (player: string) => `Cartão vermelho direto! ${player} está expulso.`
export const injuryText = (player: string) => `${player} sente uma lesão e não tem condições de continuar.`
export const substitutionText = (team: string, out: string, inn: string) =>
  `Substituição no ${team}: sai ${out}, entra ${inn}.`
export const cornerText = (team: string) => `Escanteio para o ${team}.`
export const foulText = (player: string) => `Falta cometida por ${player}.`
