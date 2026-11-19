/**
 * Vestiário (estudo do concorrente, Parte 6): leitura do elenco do técnico. **Só informativo**: nada daqui entra em conta do motor de partida
 * nem muda moral, forma ou resultado (o efeito na moral fica como ideia para depois). Tudo derivado do que já existe e nunca guardado:
 *  - **peso no grupo** (hierarquia): força, idade e jogos do jogador no elenco → referência, respeitado, do grupo ou em teste;
 *  - **queixas**: ganha bem menos que o mercado paga a alguém do tamanho dele, ou está no banco com nível de titular;
 *  - **entrosamento**: quanto os titulares atuais já jogaram juntos nesta temporada;
 *  - **moral do grupo**: média da moral do elenco e quem está abaixo.
 * Funções puras.
 */
import { playerOverall } from './overall'
import { expectedSalary } from './market/value'
import type { Player, Team } from './types'

export type RoomRole = 'reference' | 'respected' | 'member' | 'trial'
export type RoomComplaint = 'salary' | 'minutes'
export type Chemistry = 'forming' | 'irregular' | 'building' | 'tight'

export const ROOM = {
  /** Quantos são referências e quantos respeitados (os de maior peso). */
  references: 5,
  respected: 10,
  /** Pesos da hierarquia: força, idade (de 18 a 36 anos) e participação nos jogos. */
  weight: { overall: 0.45, age: 0.25, games: 0.3 },
  /** Até esta idade (ou sem jogos) o jogador ainda está "em teste", se não é referência nem respeitado. */
  trialAge: 21,
  /** Reclama de salário quem ganha menos que esta parcela do que o mercado paga por alguém da força dele (referências e respeitados). */
  salaryShare: 0.85,
  /** Reclama de minutos o reserva com força até esta distância da do pior titular, depois de `minTeamGames` jogos do time. */
  minutesGap: 2,
  minTeamGames: 5,
  /** Entrosamento: parte dos jogos que os titulares jogaram; abaixo de `irregular` irregular, abaixo de `building` em construção. Antes de `formingGames` jogos, "formando". */
  irregular: 0.5,
  building: 0.75,
  formingGames: 3,
  /** Moral abaixo desta é "baixa". */
  lowMorale: 50,
} as const

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export interface RoomRow {
  playerId: string
  /** 0 a 100. */
  weight: number
  role: RoomRole
  morale: number
  captain: boolean
  starter: boolean
  complaint?: RoomComplaint
}

export interface SquadRoom {
  rows: RoomRow[]
  captainId: string
  /** Média da moral do elenco (0 a 100) e quantos estão abaixo de `ROOM.lowMorale`. */
  morale: number
  lowMorale: number
  chemistry: Chemistry
  /** Parte (0 a 1) dos jogos do time que os titulares atuais jogaram, em média; `null` antes de jogar. */
  togetherShare: number | null
  complaints: number
}

/** Jogos do time na temporada (quem mais jogou no elenco serve de régua, para quem chegou ou saiu no meio). */
const teamGames = (squad: readonly Player[]): number => squad.reduce((m, p) => Math.max(m, p.seasonStats.appearances), 0)

export function squadRoom(team: Team, squad: readonly Player[], club?: Parameters<typeof expectedSalary>[1]): SquadRoom {
  const games = teamGames(squad)
  const overalls = squad.map((p) => playerOverall(p))
  const lo = Math.min(...overalls, 100)
  const hi = Math.max(...overalls, 1)
  const weightOf = (p: Player): number => {
    const ov = hi === lo ? 0.5 : (playerOverall(p) - lo) / (hi - lo)
    const age = clamp((p.age - 18) / 18, 0, 1)
    const part = games === 0 ? 0.5 : clamp(p.seasonStats.appearances / games, 0, 1)
    return Math.round(100 * (ROOM.weight.overall * ov + ROOM.weight.age * age + ROOM.weight.games * part))
  }
  const ranked = [...squad].map((p) => ({ p, weight: weightOf(p) })).sort((a, b) => b.weight - a.weight || a.p.id.localeCompare(b.p.id))
  const starters = new Set(team.tactic.startingXI)
  const weakestStarter = Math.min(...squad.filter((p) => starters.has(p.id)).map((p) => playerOverall(p)), 100)
  const rows: RoomRow[] = ranked.map(({ p, weight }, i) => {
    const role: RoomRole = i < ROOM.references ? 'reference' : i < ROOM.references + ROOM.respected ? 'respected' : p.age <= ROOM.trialAge || p.seasonStats.appearances === 0 ? 'trial' : 'member'
    let complaint: RoomComplaint | undefined
    if ((role === 'reference' || role === 'respected') && p.contract.salary < expectedSalary(p, club) * ROOM.salaryShare) complaint = 'salary'
    else if (!starters.has(p.id) && games >= ROOM.minTeamGames && playerOverall(p) >= weakestStarter - ROOM.minutesGap && role !== 'trial') complaint = 'minutes'
    return { playerId: p.id, weight, role, morale: p.condition.morale, captain: p.id === team.tactic.captainId, starter: starters.has(p.id), ...(complaint ? { complaint } : {}) }
  })
  const xi = squad.filter((p) => starters.has(p.id))
  const together = games === 0 || xi.length === 0 ? null : xi.reduce((s, p) => s + clamp(p.seasonStats.appearances / games, 0, 1), 0) / xi.length
  const chemistry: Chemistry = together === null || games < ROOM.formingGames ? 'forming' : together < ROOM.irregular ? 'irregular' : together < ROOM.building ? 'building' : 'tight'
  const morale = squad.length ? squad.reduce((s, p) => s + p.condition.morale, 0) / squad.length : 0
  return {
    rows,
    captainId: team.tactic.captainId,
    morale: Math.round(morale * 10) / 10,
    lowMorale: squad.filter((p) => p.condition.morale < ROOM.lowMorale).length,
    chemistry,
    togetherShare: together,
    complaints: rows.filter((r) => r.complaint).length,
  }
}
