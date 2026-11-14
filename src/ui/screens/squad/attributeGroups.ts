/**
 * Os seis eixos do gráfico hexagonal da ficha do jogador, agrupando os atributos que o jogo já tem (o potencial oculto nunca entra):
 * - Finalização: finalização e cabeceio
 * - Passe: passe, visão e cruzamento
 * - Drible: drible e controle de bola
 * - Velocidade: velocidade
 * - Defesa: desarme e posicionamento (no goleiro: reflexos, saída do gol e posicionamento)
 * - Físico: resistência e força
 * Cada eixo é a média dos atributos dele (1 a 100).
 */
import type { AttributeName, Player } from '../../../engine/types'

export type HexAxis = 'finishing' | 'passing' | 'dribbling' | 'pace' | 'defense' | 'physical'

/** Na ordem do gráfico, a partir do topo e no sentido horário. */
export const HEX_AXES: { id: HexAxis; label: string; attributes: readonly AttributeName[] }[] = [
  { id: 'finishing', label: 'Finalização', attributes: ['finishing', 'heading'] },
  { id: 'passing', label: 'Passe', attributes: ['passing', 'vision', 'crossing'] },
  { id: 'dribbling', label: 'Drible', attributes: ['dribbling', 'ballControl'] },
  { id: 'pace', label: 'Velocidade', attributes: ['pace'] },
  { id: 'defense', label: 'Defesa', attributes: ['tackling', 'positioning'] },
  { id: 'physical', label: 'Físico', attributes: ['stamina', 'strength'] },
]

const GOALKEEPER_DEFENSE: readonly AttributeName[] = ['reflexes', 'rushingOut', 'positioning']

export interface HexValue {
  id: HexAxis
  label: string
  value: number
}

/** O valor de cada eixo (inteiro de 1 a 100) para o jogador. */
export function hexValues(player: Pick<Player, 'position' | 'attributes'>): HexValue[] {
  return HEX_AXES.map((axis) => {
    const names = axis.id === 'defense' && player.position === 'GK' ? GOALKEEPER_DEFENSE : axis.attributes
    const sum = names.reduce((total, name) => total + (player.attributes[name] ?? 0), 0)
    return { id: axis.id, label: axis.label, value: Math.round(sum / names.length) }
  })
}
