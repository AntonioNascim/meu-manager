import type { IsoDate, PlayerId, TeamId } from './common'

export type OfferKind = 'purchase' | 'loan'

/** Por que uma proposta não foi aceita (rótulos em `labels.ts`). */
export type OfferReason =
  | 'fee'
  | 'squad-size'
  | 'position-cover'
  | 'key-player'
  | 'salary'
  | 'club-reputation'
  | 'playing-time'
  | 'unavailable'
  | 'budget'
  | 'salary-budget'
  | 'squad-full'
  | 'window-closed'
  | 'own-player'
  | 'duplicate'
  | 'invalid'
  | 'no-interest'
  | 'not-eligible'
  | 'foreign-limit'

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired'

/** `outgoing`: o time do jogador faz a proposta; `incoming`: um clube da IA quer um jogador dele. */
export type OfferDirection = 'outgoing' | 'incoming'

export interface TransferOffer {
  id: string
  direction: OfferDirection
  kind: OfferKind
  playerId: PlayerId
  /** Clube que quer o jogador. */
  buyerId: TeamId
  /** Clube dono do jogador; `null` = jogador livre (contratação sem valor de transferência). */
  sellerId: TeamId | null
  /** Valor da compra, ou taxa do empréstimo. Zero para jogador livre. */
  fee: number
  /** Salário mensal oferecido ao jogador. */
  salary: number
  /** Fim do contrato (compra/livre) ou do empréstimo. */
  contractEnd: IsoDate
  createdOn: IsoDate
  /** Dia em que a resposta chega (propostas do jogador) ou em que a proposta recebida vence. */
  dueOn: IsoDate
  status: OfferStatus
  reason?: OfferReason
  /** Quando a proposta foi recusada por salário ou valor: o mínimo que seria aceito (dica de negociação). */
  counter?: number
  decidedOn?: IsoDate
}

export interface TransferRecord {
  date: IsoDate
  playerId: PlayerId
  fromTeamId: TeamId | null
  toTeamId: TeamId
  kind: OfferKind
  fee: number
}

/** Tipo de anúncio: venda (transferência) ou empréstimo. */
export type ListingKind = 'transfer' | 'loan'

/** Jogador à venda ou para empréstimo, com o preço anunciado (menor que o valor de mercado). */
export interface Listing {
  playerId: PlayerId
  teamId: TeamId
  kind: ListingKind
  price: number
  listedOn: IsoDate
  /** Quem anunciou: um clube da IA ou o jogador. */
  by: 'ai' | 'user'
}

/** Pré-contrato: o jogador, no último ano de contrato, combinou com outro clube e chega de graça na virada. */
export interface PreContract {
  playerId: PlayerId
  fromTeamId: TeamId
  toTeamId: TeamId
  salary: number
  /** Anos do contrato novo, contados a partir da virada. */
  years: number
  signedOn: IsoDate
}

export interface MarketState {
  /** Semente dos sorteios da IA (junto com a data). */
  seed: number | string
  offers: TransferOffer[]
  history: TransferRecord[]
  /** Jogadores anunciados (à venda ou para empréstimo). */
  listings: Listing[]
  /** Pré-contratos assinados nesta temporada (valem na virada). */
  preContracts: PreContract[]
  /** Eventos do mercado até esta data (inclusive) já foram processados. */
  handled: IsoDate
  /** Contador para os ids das propostas. */
  counter: number
}

export type WindowName = 'pre-season' | 'mid-year'

export interface TransferWindow {
  name: WindowName
  start: IsoDate
  end: IsoDate
}

/** Avisos do mercado para o jogador ao avançar o calendário. */
export type MarketNotice =
  | { type: 'window-opened'; window: WindowName }
  | { type: 'window-last-day'; window: WindowName }
  | { type: 'offer-answered'; offerId: string }
  | { type: 'offer-received'; offerId: string }
  /** Um jogador do time do jogador assinou pré-contrato com outro clube. */
  | { type: 'pre-contract-lost'; playerId: PlayerId; teamId: TeamId }
  /** O contrato de um jogador do time do jogador acabou no dia da data dele: ele já é jogador livre. */
  | { type: 'contract-ended'; playerId: PlayerId }
