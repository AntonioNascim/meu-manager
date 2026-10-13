/** Efeitos de uma transferência no estado da temporada: jogador, elencos, caixa e histórico. */
import { repairTactic } from '../lineup'
import { recordEntry } from '../finance'
import type { SeasonState } from '../season/calendar'
import type { IsoDate, OfferKind, Player, PlayerId, Team, TeamId } from '../types'

export interface TransferSpec {
  playerId: PlayerId
  toTeamId: TeamId
  fee: number
  salary: number
  /** Fim do contrato novo (compra/livre) ou do empréstimo. */
  contractEnd: IsoDate
  kind: OfferKind
  date: IsoDate
}

export const playersOf = (state: Pick<SeasonState, 'players'>, teamId: TeamId): Player[] => state.players.filter((p) => p.teamId === teamId)

const roundClause = (salary: number) => Math.round((salary * 36) / 1000) * 1000

/** Tira o jogador do elenco do time e conserta a tática dele (quem saiu era titular, reserva ou capitão). */
function withoutPlayer(team: Team, squadAfter: readonly Player[], playerId: PlayerId): Team {
  const squad = team.squad.filter((id) => id !== playerId)
  const ids = new Set(squad)
  const tactic = repairTactic(team.tactic, squadAfter.filter((p) => ids.has(p.id)))
  return { ...team, squad, tactic }
}

/** Faz a transferência: o jogador muda de clube, o dinheiro troca de mãos e as propostas pendentes dele caem. */
export function executeTransfer(state: SeasonState, spec: TransferSpec): SeasonState {
  const player = state.players.find((p) => p.id === spec.playerId)
  if (!player) throw new Error(`Jogador não encontrado: ${spec.playerId}`)
  const fromId = player.teamId
  const description = spec.kind === 'loan' ? 'Empréstimo' : 'Transferência'

  const contract: Player['contract'] =
    spec.kind === 'loan'
      ? {
          salary: spec.salary,
          endDate: spec.contractEnd,
          releaseClause: player.contract.releaseClause,
          ...(fromId ? { loanedFrom: fromId } : {}),
          loanOriginal: player.contract.loanOriginal ?? { salary: player.contract.salary, endDate: player.contract.endDate, releaseClause: player.contract.releaseClause },
        }
      : { salary: spec.salary, endDate: spec.contractEnd, releaseClause: roundClause(spec.salary) }
  const moved: Player = { ...player, teamId: spec.toTeamId, contract }
  const players = state.players.map((p) => (p.id === moved.id ? moved : p))

  const teams = state.teams.map((t) => {
    if (t.id === spec.toTeamId) {
      let next: Team = { ...t, squad: [...t.squad, moved.id] }
      next = recordEntry(next, spec.date, 'player-purchases', -spec.fee, `${description}: ${player.nickname ?? player.name}`)
      return { ...next, finances: { ...next.finances, transferBudget: Math.max(0, next.finances.transferBudget - spec.fee) } }
    }
    if (t.id === fromId) {
      let next = withoutPlayer(t, players.filter((p) => p.teamId === t.id), moved.id)
      next = recordEntry(next, spec.date, 'player-sales', spec.fee, `${description}: ${player.nickname ?? player.name}`)
      return { ...next, finances: { ...next.finances, transferBudget: next.finances.transferBudget + spec.fee } }
    }
    return t
  })

  const offers = state.market.offers.map((o) =>
    o.status === 'pending' && o.playerId === spec.playerId ? { ...o, status: 'withdrawn' as const, reason: 'unavailable' as const, decidedOn: spec.date } : o,
  )
  return {
    ...state,
    players,
    teams,
    market: { ...state.market, offers, listings: state.market.listings.filter((l) => l.playerId !== spec.playerId), history: [...state.market.history, { date: spec.date, playerId: spec.playerId, fromTeamId: fromId, toTeamId: spec.toTeamId, kind: spec.kind, fee: spec.fee }] },
  }
}

/** O clube libera o jogador: vira jogador livre, sem dinheiro envolvido. */
export function releasePlayer(state: SeasonState, playerId: PlayerId, date: IsoDate): SeasonState {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || !player.teamId) return state
  const fromId = player.teamId
  const players = state.players.map((p) => (p.id === playerId ? { ...p, teamId: null, contract: { salary: p.contract.salary, endDate: date, releaseClause: p.contract.releaseClause } } : p))
  const teams = state.teams.map((t) => (t.id === fromId ? withoutPlayer(t, players.filter((p) => p.teamId === t.id), playerId) : t))
  return { ...state, players, teams, market: { ...state.market, listings: state.market.listings.filter((l) => l.playerId !== playerId) } }
}
