import type { Formation } from './types'

/** Vagas na ordem: goleiro, defesa (da direita para a esquerda), depois meio e ataque. */
export const FORMATIONS: Record<string, Formation> = {
  '4-4-2': {
    id: '4-4-2',
    slots: [
      { position: 'GK', sector: 'defense' },
      { position: 'RB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'LB', sector: 'defense' },
      { position: 'RW', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'LW', sector: 'midfield' },
      { position: 'ST', sector: 'attack' },
      { position: 'ST', sector: 'attack' },
    ],
  },
  '4-3-3': {
    id: '4-3-3',
    slots: [
      { position: 'GK', sector: 'defense' },
      { position: 'RB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'LB', sector: 'defense' },
      { position: 'DM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'RW', sector: 'attack' },
      { position: 'ST', sector: 'attack' },
      { position: 'LW', sector: 'attack' },
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    slots: [
      { position: 'GK', sector: 'defense' },
      { position: 'RB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'LB', sector: 'defense' },
      { position: 'DM', sector: 'midfield' },
      { position: 'DM', sector: 'midfield' },
      { position: 'RW', sector: 'midfield' },
      { position: 'AM', sector: 'midfield' },
      { position: 'LW', sector: 'midfield' },
      { position: 'ST', sector: 'attack' },
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    slots: [
      { position: 'GK', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'CB', sector: 'defense' },
      { position: 'RB', sector: 'midfield' },
      { position: 'DM', sector: 'midfield' },
      { position: 'CM', sector: 'midfield' },
      { position: 'AM', sector: 'midfield' },
      { position: 'LB', sector: 'midfield' },
      { position: 'ST', sector: 'attack' },
      { position: 'ST', sector: 'attack' },
    ],
  },
}

export const FORMATION_IDS = Object.keys(FORMATIONS)
export const DEFAULT_FORMATION_ID = '4-4-2'

export function getFormation(id: string): Formation {
  const formation = FORMATIONS[id]
  if (!formation) throw new Error(`Formação desconhecida: ${id}`)
  return formation
}
