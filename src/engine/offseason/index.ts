/**
 * Virada de temporada, na ordem: acesso e rebaixamento, reputação, envelhecimento e evolução,
 * aposentadorias, fim de contratos, jovens da base, nova meta da diretoria e nova tabela de jogos.
 * Funções puras: recebem a temporada encerrada e devolvem a nova, mais um relatório do que aconteceu.
 */
import { FINANCE, MARKET, OFFSEASON } from '../config'
import { defaultTicketPrice, monthlyPayroll, summarizeLedger, sustainablePayroll } from '../finance'
import { buildTactic, repairTactic } from '../lineup'
import { playerOverall } from '../overall'
import { createRng } from '../rng'
import type { Rng } from '../rng'
import { createSeason } from '../season/calendar'
import type { SeasonState } from '../season/calendar'
import { makeDate } from '../season/dates'
import { computeStandings } from '../season/standings'
import { SQUAD_MAX, SQUAD_MIN } from '../types'
import type { DepartedPlayer, OffseasonReport, Player, PlayerId, Position, StandingRow, Team, TeamId, YouthRequest } from '../types'
import { expireContracts } from './contracts'
import { desiredSquadSize, positionDeficits, payrollCuts } from './squad'
import { evolvePlayer, retires } from './evolution'

export * from './contracts'
export * from './evolution'
export * from './renewal'
export * from './squad'

/** Quem gera os jovens (fica em `src/data`: o motor não cria jogadores). `taken` = nomes já usados. */
export type YouthFactory = (request: YouthRequest, rng: Rng, taken: ReadonlySet<string>) => Player[]

export interface OffseasonOptions {
  createYouth: YouthFactory
  /** O time do jogador: não tem elenco cortado nem tática refeita pela IA. */
  userTeamId?: TeamId
}

const EXTRA_POSITIONS: readonly Position[] = ['CB', 'CM', 'ST', 'AM', 'RW', 'LW', 'DM', 'RB', 'LB']

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const departed = (p: Player, teamId: TeamId | null = p.teamId): DepartedPlayer => ({ playerId: p.id, name: p.nickname ?? p.name, age: p.age, teamId })

/** Meta da diretoria pela posição do time na série (por reputação), como na geração do mundo. */
function objectiveFor(rank: number) {
  const target = Math.min(rank, 16)
  return { targetPosition: target, sackingPosition: Math.min(20, target + 6) }
}

export function advanceSeason(state: SeasonState, options: OffseasonOptions): { state: SeasonState; report: OffseasonReport } {
  if (state.season.phase !== 'end-of-season') throw new Error('A temporada ainda não acabou')
  const year = state.season.year
  const rng = createRng(`${state.market.seed}:${year}:offseason`)

  // 1) Acesso e rebaixamento; histórico de campeões e posições.
  const finalPositions: OffseasonReport['finalPositions'] = {}
  const champions: TeamId[] = []
  const promoted: TeamId[] = []
  const relegated: TeamId[] = []
  for (const competition of [...state.season.competitions].sort((a, b) => a.tier - b.tier)) {
    const rows: StandingRow[] = computeStandings(competition.teamIds, state.matches.filter((m) => m.competitionId === competition.id))
    rows.forEach((r, i) => (finalPositions[r.teamId] = { tier: competition.tier, position: i + 1 }))
    champions[competition.tier - 1] = (rows[0] as StandingRow).teamId
    if (competition.relegationSlots > 0) relegated.push(...rows.slice(rows.length - competition.relegationSlots).map((r) => r.teamId))
    if (competition.promotionSlots > 0) promoted.push(...rows.slice(0, competition.promotionSlots).map((r) => r.teamId))
  }

  // 2) Reputação (e os efeitos dela na torcida e no preço do ingresso da IA).
  const rankByReputation = new Map<TeamId, number>()
  for (const tier of new Set(state.teams.map((t) => t.tier))) {
    state.teams
      .filter((t) => t.tier === tier)
      .map((t, index) => ({ t, index }))
      .sort((a, b) => b.t.reputation - a.t.reputation || a.index - b.index)
      .forEach(({ t }, i) => rankByReputation.set(t.id, i + 1))
  }
  const reputationChanges: OffseasonReport['reputationChanges'] = {}
  const R = OFFSEASON.reputation
  const reputationRng = rng.fork('reputation')
  let teams: Team[] = state.teams.map((t) => {
    const finalPosition = finalPositions[t.id]?.position ?? 10
    const expected = rankByReputation.get(t.id) ?? 10
    let delta = clamp(Math.round((expected - finalPosition) / R.positionStep), -R.positionMax, R.positionMax)
    if (champions.includes(t.id)) delta += R.champion
    if (promoted.includes(t.id)) delta += R.promoted
    if (relegated.includes(t.id)) delta += R.relegated
    const tier = promoted.includes(t.id) ? 1 : relegated.includes(t.id) ? 2 : t.tier
    // A reputação também volta devagar para o patamar da divisão (sorteio na parte fracionária).
    const pulled = t.reputation + delta + R.tierPull * ((R.tierMean[tier] ?? t.reputation) - t.reputation)
    const reputation = clamp(Math.floor(pulled) + (reputationRng.chance(pulled - Math.floor(pulled)) ? 1 : 0), 1, 20)
    reputationChanges[t.id] = { from: t.reputation, to: reputation }
    const ai = t.id !== options.userTeamId
    return {
      ...t,
      tier,
      reputation,
      fanBase: Math.round((t.fanBase * (1 + 0.03 * delta)) / 1_000) * 1_000,
      ticketPrice: ai ? defaultTicketPrice(reputation) : t.ticketPrice,
      history: [...t.history, { year, tier: t.tier, finalPosition, champion: champions.includes(t.id) }],
    }
  })

  // 3) Envelhecimento e evolução; 4) aposentadorias. Quem ficou o ano inteiro sem clube sai do jogo.
  const retired: DepartedPlayer[] = []
  const gamesPossible = (state.season.competitions[0]?.roundCount ?? 38) * 90
  const evolveRng = rng.fork('evolution')
  const retireRng = rng.fork('retirement')
  let players: Player[] = []
  for (const p of state.players) {
    if (p.teamId === null) continue
    const next = evolvePlayer(evolveRng, p, p.seasonStats.minutes / gamesPossible)
    if (retires(retireRng, next)) retired.push(departed(next))
    else players.push(next)
  }

  // 5) Fim dos contratos (empréstimos voltam para casa; a IA renova o que faz sentido).
  const contracts = expireContracts({ players, teams, year, rng: rng.fork('contracts'), ...(options.userTeamId ? { userTeamId: options.userTeamId } : {}) })
  players = contracts.players
  const released = contracts.released

  // 6) Jovens da base e corte do excesso na IA.
  const youthRng = rng.fork('youth')
  const taken = new Set(players.map((p) => p.name))
  let counter = state.playerCounter
  const youth: OffseasonReport['youth'] = {}
  const nextYear = year + 1
  for (const team of teams) {
    const squad = players.filter((p) => p.teamId === team.id)
    const isUser = team.id === options.userTeamId
    const deficits = positionDeficits(squad)
    const target = isUser ? Math.max(OFFSEASON.youth.userMinSquad, desiredSquadSize(team.reputation)) : desiredSquadSize(team.reputation)
    let count = Math.max(deficits.length, Math.min(target - squad.length, isUser ? SQUAD_MAX : OFFSEASON.youth.maxFill), OFFSEASON.youth.minPerTeam)
    count = Math.min(count, SQUAD_MAX - squad.length)
    if (count <= 0) continue
    const positions = deficits.slice(0, count)
    while (positions.length < count) positions.push(youthRng.pick(EXTRA_POSITIONS))
    const made = options.createYouth({ teamId: team.id, tier: team.tier, reputation: team.reputation, positions, year: nextYear }, youthRng, taken)
    for (const p of made) {
      taken.add(p.name)
      players.push({ ...p, id: `player-${++counter}`, teamId: team.id })
    }
    youth[team.id] = made.length
  }
  const trimmed = new Set<PlayerId>()
  for (const team of teams) {
    if (team.id === options.userTeamId) continue
    const squad = players.filter((p) => p.teamId === team.id)
    for (const p of trimExcess(squad)) trimmed.add(p.id)
    const rest = squad.filter((p) => !trimmed.has(p.id))
    for (const p of payrollCuts(rest, sustainablePayroll(team), team.finances.balance)) trimmed.add(p.id)
  }
  if (trimmed.size > 0) {
    players = players.map((p) => (trimmed.has(p.id) ? { ...p, teamId: null, contract: { ...p.contract, endDate: makeDate(year, 12, 31) } } : p))
  }

  // 7) Nova meta da diretoria, finanças do ano e táticas refeitas.
  const newRank = new Map<TeamId, number>()
  for (const tier of new Set(teams.map((t) => t.tier))) {
    teams
      .filter((t) => t.tier === tier)
      .map((t, index) => ({ t, index }))
      .sort((a, b) => b.t.reputation - a.t.reputation || a.index - b.index)
      .forEach(({ t }, i) => newRank.set(t.id, i + 1))
  }
  teams = teams.map((t) => {
    const squad = players.filter((p) => p.teamId === t.id)
    const summary = summarizeLedger(t.finances.ledger)
    const payroll = monthlyPayroll(squad)
    const isUser = t.id === options.userTeamId
    const tactic = isUser ? repairTactic(t.tactic, squad) : buildTactic(squad, { formationId: t.tactic.formationId, style: t.tactic.style, mentality: t.tactic.mentality })
    return {
      ...t,
      squad: squad.map((p) => p.id),
      tactic,
      objective: objectiveFor(newRank.get(t.id) ?? 10),
      finances: {
        ...t.finances,
        ledger: [],
        pastSeasons: [...t.finances.pastSeasons, { year, income: summary.income, expenses: summary.expenses, endBalance: t.finances.balance }],
        salaryBudget: Math.round((isUser ? payroll * FINANCE.salaryBudgetMargin : Math.max(payroll, Math.min(payroll * 1.1, sustainablePayroll(t)))) / 1_000) * 1_000,
      },
    }
  })

  // 8) Nova tabela de jogos.
  const next = createSeason({ year: nextYear, seed: state.market.seed, teams, players })
  const report: OffseasonReport = {
    year,
    champions,
    promoted,
    relegated,
    finalPositions,
    retired,
    released,
    renewed: contracts.renewed,
    youth,
    reputationChanges,
  }
  return { state: { ...next, playerCounter: counter }, report }
}

/** Reservas que a IA corta para voltar ao tamanho máximo (os de menor valor, sem deixar posição descoberta). */
function trimExcess(squad: readonly Player[]): Player[] {
  const out: Player[] = []
  const remaining = [...squad]
  const keepScore = (p: Player) => playerOverall(p) + 0.5 * Math.max(0, p.hidden.potential - playerOverall(p)) + (p.age <= 21 ? 4 : 0)
  while (remaining.length > OFFSEASON.youth.aiMaxSquad && remaining.length > SQUAD_MIN) {
    const counts = new Map<Position, number>()
    for (const p of remaining) counts.set(p.position, (counts.get(p.position) ?? 0) + 1)
    const candidate = [...remaining]
      .filter((p) => (counts.get(p.position) ?? 0) > (MARKET.minByPosition[p.position] ?? 1) + 1)
      .sort((a, b) => keepScore(a) - keepScore(b))[0]
    if (!candidate) break
    out.push(candidate)
    remaining.splice(remaining.indexOf(candidate), 1)
  }
  return out
}
