import type { PlayerId } from './common'
import type { Position } from './player'

export type PlayStyle = 'posse' | 'contra-ataque' | 'pressao-alta'

/** De muito defensiva (-2) a muito ofensiva (+2). */
export type Mentality = -2 | -1 | 0 | 1 | 2

export type Sector = 'defesa' | 'meio' | 'ataque'

export interface FormationSlot {
  position: Position
  sector: Sector
}

export interface Formation {
  /** Ex.: "4-4-2". */
  id: string
  /** 11 vagas: define quantos jogadores entram em cada setor/duelo. */
  slots: FormationSlot[]
}

export interface Tactic {
  formationId: string
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
