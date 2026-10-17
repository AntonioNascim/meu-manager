/**
 * Limite de estrangeiros da liga (B7): estrangeiro é o jogador de nacionalidade diferente da do país da liga do clube
 * (`Team.country`, padrão Brasil). `Team.foreignLimit` pode limitar o elenco (o mercado não deixa passar) e/ou os 11 titulares
 * (a escalação não deixa passar). Sem limite, nada disso muda.
 */
import type { Nationality, Player, PlayerId, Tactic, Team } from './types'

export const homeCountry = (team: Pick<Team, 'country'>): Nationality => team.country ?? 'Brazil'

export const isForeign = (player: Pick<Player, 'nationality'>, team: Pick<Team, 'country'>): boolean => player.nationality !== homeCountry(team)

export const foreignCount = (players: readonly Pick<Player, 'nationality'>[], team: Pick<Team, 'country'>): number => players.filter((p) => isForeign(p, team)).length

/** A opção de escalação do clube: país e máximo de estrangeiros entre os titulares (ausente quando a liga não limita). */
export function lineupForeign(team: Pick<Team, 'country' | 'foreignLimit'>): { country: Nationality; max: number } | undefined {
  const max = team.foreignLimit?.lineup
  return max === undefined ? undefined : { country: homeCountry(team), max }
}

/** Contratar `player` estouraria o limite de estrangeiros do elenco? (`squad` é o elenco de hoje; vale para quem já está nele.) */
export function squadForeignBlocked(team: Pick<Team, 'country' | 'foreignLimit'>, squad: readonly Pick<Player, 'nationality' | 'id'>[], player: Pick<Player, 'nationality' | 'id'>, incoming: readonly Pick<Player, 'nationality'>[] = []): boolean {
  const max = team.foreignLimit?.squad
  if (max === undefined || !isForeign(player, team)) return false
  if (squad.some((p) => p.id === player.id)) return false
  return foreignCount(squad, team) + foreignCount(incoming, team) >= max
}

/** Estrangeiros entre os titulares da tática. */
export function lineupForeignCount(tactic: Pick<Tactic, 'startingXI'>, squad: readonly Pick<Player, 'id' | 'nationality'>[], team: Pick<Team, 'country'>): number {
  const byId = new Map(squad.map((p) => [p.id, p]))
  return tactic.startingXI.filter((id: PlayerId) => {
    const p = byId.get(id)
    return p !== undefined && isForeign(p, team)
  }).length
}
