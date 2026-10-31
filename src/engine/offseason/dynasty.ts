/**
 * Freio geral contra dinastias (Fase 5D), válido para qualquer liga: o clube que ganha muitos títulos da primeira divisão em poucas
 * temporadas vê os rivais da liga levarem as maiores estrelas dele por um preço abaixo do pedido ("o jogador campeão quer sair").
 * É o que acontece na vida real (Dortmund levando os craques do Bayern, o Real Madrid contratando os melhores) sem proibir nada:
 * o domínio dura enquanto o clube repõe as estrelas, e quem domina por muito tempo perde força mais depressa.
 *
 * Roda na virada de temporada de cada país, antes da reputação e dos contratos. O time do jogador nunca é alvo nem comprador.
 */
import { DYNASTY, MARKET } from '../config'
import { monthlyPayroll } from '../finance'
import { needsOf } from '../market/ai'
import { executeTransfer } from '../market/transfer'
import { askingPrice, expectedSalary } from '../market/value'
import { playerOverall } from '../overall'
import { createRng } from '../rng'
import type { SeasonState } from '../season/calendar'
import { contractEndIn } from '../season/cycles'
import { pyramidOf } from '../season/fidelity'
import { computeStandings } from '../season/standings'
import { SQUAD_MAX } from '../types'
import type { Player, Team, TeamId } from '../types'

/** Títulos da primeira divisão nas últimas `window` temporadas fechadas, mais o desta (se `championNow`). */
export function titlesInWindow(team: Pick<Team, 'history'>, championNow: boolean, window = DYNASTY.window): number {
  const past = team.history.slice(-(window - 1)).filter((h) => h.tier === 1 && h.champion).length
  return past + (championNow ? 1 : 0)
}

export interface DynastyRaid {
  playerId: string
  fromTeamId: TeamId
  toTeamId: TeamId
  fee: number
}

/** Quantas estrelas um clube com `titles` títulos na janela perde: nenhuma abaixo do limiar, uma no limiar, mais a cada título além, até `maxRaids`. */
export const raidsFor = (titles: number): number => (titles < DYNASTY.threshold ? 0 : Math.min(DYNASTY.maxRaids, titles - DYNASTY.threshold + 1))

export function dynastyRaids(state: SeasonState, pyramid: string, userTeamId?: TeamId): { state: SeasonState; raids: DynastyRaid[] } {
  const raids: DynastyRaid[] = []
  const first = state.season.competitions.filter((c) => pyramidOf(c) === pyramid && c.tier === 1)
  if (first.length === 0) return { state, raids }
  const date = state.season.currentDate
  let current = state
  const rng = createRng(`${state.market.seed}:${date}:dynasty:${pyramid}`)
  for (const comp of first) {
    const champion = computeStandings(comp.teamIds, current.matches.filter((m) => m.competitionId === comp.id))[0]?.teamId
    if (!champion || champion === userTeamId) continue
    const owner = current.teams.find((t) => t.id === champion) as Team
    const count = raidsFor(titlesInWindow(owner, true))
    for (let k = 0; k < count; k++) {
      const raid = oneRaid(current, comp.teamIds, champion, userTeamId, rng.fork(`${champion}:${k}`).int(MARKET.ai.contractYears[0], MARKET.ai.contractYears[1]), date)
      if (!raid) break
      raids.push(raid.raid)
      current = raid.state
    }
  }
  return { state: current, raids }
}

/** Uma estrela do campeão vai para o rival que mais ganha com ela e pode pagar. */
function oneRaid(state: SeasonState, leagueIds: readonly TeamId[], sellerId: TeamId, userTeamId: TeamId | undefined, years: number, date: string): { state: SeasonState; raid: DynastyRaid } | undefined {
  const seller = state.teams.find((t) => t.id === sellerId) as Team
  const sellerSquad = state.players.filter((p) => p.teamId === sellerId)
  // Quem tem o contrato acabando agora sai de graça de qualquer jeito.
  const endsSoon = (p: Player) => p.contract.endDate <= date
  const stars = [...sellerSquad]
    .filter((p) => !p.contract.loanedFrom && p.age <= DYNASTY.maxAge && !endsSoon(p))
    .sort((a, b) => playerOverall(b) - playerOverall(a))
    .slice(0, DYNASTY.starPool)
  const squads = new Map<TeamId, Player[]>()
  for (const p of state.players) if (p.teamId) squads.set(p.teamId, [...(squads.get(p.teamId) ?? []), p])
  const rivals = state.teams.filter((t) => leagueIds.includes(t.id) && t.id !== sellerId && t.id !== userTeamId)
  for (const star of stars) {
    // O clube não fica sem cobertura da posição nem com elenco curto demais.
    if (sellerSquad.length - 1 < MARKET.minSquadAfterSale) return undefined
    if (sellerSquad.filter((p) => p.position === star.position).length - 1 < (MARKET.minByPosition[star.position] ?? 1)) continue
    const fee = Math.round((askingPrice(star, sellerSquad, date, seller) * DYNASTY.feeShare) / 10_000) * 10_000
    let best: { team: Team; gain: number; salary: number } | undefined
    for (const rival of rivals) {
      const squad = squads.get(rival.id) ?? []
      if (squad.length >= SQUAD_MAX) continue
      const need = needsOf(rival, squad).find((n) => n.position === star.position)
      if (!need) continue
      const gain = playerOverall(star) - need.weakest
      if (gain < DYNASTY.minGain) continue
      const salary = expectedSalary(star, rival)
      if (salary > rival.finances.salaryBudget - monthlyPayroll(squad)) continue
      if (fee > rival.finances.balance * DYNASTY.maxBalanceShare) continue
      if (!best || gain > best.gain || (gain === best.gain && rival.id < best.team.id)) best = { team: rival, gain, salary }
    }
    if (!best) continue
    const moved = executeTransfer(state, { playerId: star.id, toTeamId: best.team.id, fee, salary: best.salary, contractEnd: contractEndIn(state, best.team.id, years), kind: 'purchase', date })
    return { state: moved, raid: { playerId: star.id, fromTeamId: sellerId, toTeamId: best.team.id, fee } }
  }
  return undefined
}
