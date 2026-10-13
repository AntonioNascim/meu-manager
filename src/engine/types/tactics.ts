import type { PlayerId } from './common'
import type { Position } from './player'

export type PlayStyle = 'possession' | 'counter-attack' | 'high-press'

/** De muito defensiva (-2) a muito ofensiva (+2). */
export type Mentality = -2 | -1 | 0 | 1 | 2

export type Sector = 'defense' | 'midfield' | 'attack'

export interface FormationSlot {
  position: Position
  sector: Sector
}

/** Ponto da grade de posicionamento (ver `engine/grid.ts`). */
export interface GridPoint {
  /** 0 = goleiro, 1 = defesa, 2 = volância, 3 = meio, 4 = meia ofensiva, 5 = ataque. */
  row: number
  /** 0 = esquerda, 1 = centro-esquerda, 2 = centro, 3 = centro-direita, 4 = direita (do ponto de vista do time). */
  lane: number
}

export interface Formation {
  /** Ex.: "4-4-2"; "custom" para a grade montada pelo jogador. */
  id: string
  /** 11 vagas: define quantos jogadores entram em cada setor/duelo (vêm do ponto da grade de cada uma). */
  slots: FormationSlot[]
  /** Ponto da grade de cada vaga (mesma ordem de `slots`). */
  grid: GridPoint[]
}

export interface Tactic {
  /** Rótulo da formação: uma das prontas (atalhos) ou "custom" quando o jogador posicionou à mão. */
  formationId: string
  /**
   * Ponto da grade de cada titular (mesma ordem de `startingXI`). É daqui que vem o papel de cada um no jogo; sem
   * ele (saves e táticas antigas) vale a grade da formação pronta.
   */
  grid?: GridPoint[]
  style: PlayStyle
  mentality: Mentality
  /** 11 titulares, na ordem das vagas da formação. */
  startingXI: PlayerId[]
  /** Banco de reservas. */
  bench: PlayerId[]
  captainId: PlayerId
  penaltyTakerIds: PlayerId[]
  freeKickTakerIds: PlayerId[]
}

/** Escalação guardada pelo jogador: nome, formação, estilo e os 11 titulares (na ordem das vagas). */
export interface SavedLineup {
  name: string
  formationId: string
  style: PlayStyle
  startingXI: PlayerId[]
  /** Ponto da grade de cada titular (sem ele, a grade da formação pronta). */
  grid?: GridPoint[]
}
