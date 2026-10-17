/**
 * Virada de temporada, na ordem: acesso e rebaixamento, reputação, envelhecimento e evolução,
 * aposentadorias, fim de contratos, jovens da base, nova meta da diretoria e nova tabela de jogos.
 * Funções puras: recebem a temporada encerrada e devolvem a nova, mais um relatório do que aconteceu.
 */
import { ACADEMY, FINANCE, MARKET, OFFSEASON } from '../config'
import { defaultTicketPrice, monthlyPayroll, summarizeLedger, sustainablePayroll } from '../finance'
import { buildTactic, repairTactic } from '../lineup'
import { playerOverall } from '../overall'
import { createRng } from '../rng'
import type { Rng } from '../rng'
import { createSeason } from '../season/calendar'
import type { CompetitionSetup } from '../season/calendar'
import { pyramidOf } from '../season/fidelity'
import type { SeasonState } from '../season/calendar'
import { applyBirthdays } from '../season/birthdays'
import { contractEndOn, makeDate } from '../season/dates'
import { computeStandings } from '../season/standings'
import { SQUAD_MAX, SQUAD_MIN } from '../types'
import type { Competition, CompetitionId, DepartedPlayer, OffseasonReport, Player, PlayerId, Position, StandingRow, Team, TeamId, YouthRequest } from '../types'
import { turnAcademy } from '../academy/turn'
import { applyPreContracts } from '../market/precontract'
import { expireContracts } from './contracts'
import { CORE_COUNTS, desiredSquadSize, positionDeficits, payrollCuts } from './squad'
import { retires, startNewSeason } from './evolution'

export * from './contracts'
export * from './dueContracts'
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
  // Cada pirâmide (um país) tem as suas divisões: quem sobe ou cai vai para a divisão vizinha da MESMA pirâmide. Os campeões do relatório (índice = série − 1) são os da pirâmide do técnico.
  const competitions = [...state.season.competitions].sort((a, b) => a.tier - b.tier)
  const reportPyramid = state.focus ?? pyramidOf(competitions[0] as Competition)
  const championsByCompetition: Record<string, TeamId> = {}
  const destination = new Map<TeamId, CompetitionId>()
  const neighbour = (c: Competition, step: number) => competitions.find((o) => pyramidOf(o) === pyramidOf(c) && o.tier === c.tier + step)
  for (const competition of competitions) {
    const rows: StandingRow[] = computeStandings(competition.teamIds, state.matches.filter((m) => m.competitionId === competition.id))
    rows.forEach((r, i) => (finalPositions[r.teamId] = { tier: competition.tier, position: i + 1 }))
    championsByCompetition[competition.id] = (rows[0] as StandingRow).teamId
    if (pyramidOf(competition) === reportPyramid) champions[competition.tier - 1] = (rows[0] as StandingRow).teamId
    const below = neighbour(competition, 1)
    const above = neighbour(competition, -1)
    if (competition.relegationSlots > 0 && below) {
      const out = rows.slice(rows.length - competition.relegationSlots).map((r) => r.teamId)
      relegated.push(...out)
      for (const id of out) destination.set(id, below.id)
    }
    if (competition.promotionSlots > 0 && above) {
      const up = rows.slice(0, competition.promotionSlots).map((r) => r.teamId)
      promoted.push(...up)
      for (const id of up) destination.set(id, above.id)
    }
  }
  const competitionOf = new Map<TeamId, Competition>()
  for (const c of competitions) for (const id of c.teamIds) competitionOf.set(id, c)
  const nextCompetition = (id: TeamId): Competition | undefined => {
    const to = destination.get(id)
    return to ? competitions.find((c) => c.id === to) : competitionOf.get(id)
  }

  // 2) Reputação (e os efeitos dela na torcida e no preço do ingresso da IA).
  const rankByReputation = new Map<TeamId, number>()
  for (const c of competitions) {
    state.teams
      .filter((t) => competitionOf.get(t.id) === c)
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
    // Na pirâmide, quem sobe vai uma divisão acima e quem cai, uma abaixo.
    const landing = nextCompetition(t.id)
    const tier = landing ? landing.tier : t.tier
    // A reputação também volta devagar para o patamar da divisão (sorteio na parte fracionária).
    const mean = landing?.reputationMean ?? R.tierMean[tier] ?? t.reputation
    const pull = tier === 1 && t.tier === 1 && t.reputation > mean ? R.tierPullAbove : R.tierPull
    const pulled = t.reputation + delta + pull * (mean - t.reputation)
    const reputation = clamp(Math.floor(pulled) + (reputationRng.chance(pulled - Math.floor(pulled)) ? 1 : 0), 1, 20)
    reputationChanges[t.id] = { from: t.reputation, to: reputation }
    const ai = t.id !== options.userTeamId
    return {
      ...t,
      tier,
      ...(landing?.economy ? { economy: landing.economy } : {}),
      reputation,
      fanBase: Math.round((t.fanBase * (1 + 0.03 * delta)) / 1_000) * 1_000,
      ticketPrice: ai ? defaultTicketPrice(reputation, { economy: landing?.economy ?? t.economy }) : t.ticketPrice,
      history: [...t.history, { year, tier: t.tier, finalPosition, champion: champions.includes(t.id) }],
    }
  })

  // 3) Envelhecimento: a idade já aumentou no aniversário de cada um durante o ano; aqui entram só os aniversários que faltam até o
  // começo da temporada nova e a condição e as estatísticas voltam ao zero. 4) Aposentadorias. Quem ficou o ano inteiro sem clube sai do jogo.
  const retired: DepartedPlayer[] = []
  const retireRng = rng.fork('retirement')
  let players: Player[] = []
  for (const p of applyBirthdays(state.players, state.season.currentDate, makeDate(year + 1, 1, 1), state.market.seed)) {
    if (p.teamId === null) continue
    const next = startNewSeason(p)
    if (retires(retireRng, next)) retired.push(departed(next))
    else players.push(next)
  }

  // Pré-contratos assinados na temporada: quem combinou com outro clube muda de clube de graça.
  const preContracts = applyPreContracts(players, state.market.preContracts, year)
  players = preContracts.players

  // 5) Fim dos contratos (empréstimos voltam para casa; a IA renova o que faz sentido).
  const contracts = expireContracts({ players, teams, year, rng: rng.fork('contracts'), ...(options.userTeamId ? { userTeamId: options.userTeamId } : {}) })
  players = contracts.players
  const released = contracts.released

  // 6) Corte de folha da IA (um clube rebaixado para uma série mais pobre libera quem a receita nova não sustenta), categorias de base
  // (evolução, decisões dos 20 anos, chegada de jovens) e depois a reposição de posições descobertas e o corte do excesso na IA.
  // O corte vem antes da reposição: os jovens que chegam cobrem as posições que o corte deixou descobertas.
  const payrollCut = new Set<PlayerId>()
  for (const team of teams) {
    if (team.id === options.userTeamId) continue
    for (const p of payrollCuts(players.filter((x) => x.teamId === team.id), sustainablePayroll(team), team.finances.balance)) payrollCut.add(p.id)
  }
  if (payrollCut.size > 0) players = players.map((p) => (payrollCut.has(p.id) ? { ...p, teamId: null, contract: { ...p.contract, endDate: contractEndOn(year) } } : p))
  const youthRng = rng.fork('youth')
  const taken = new Set([...players, ...state.academy].map((p) => p.name))
  const academyTurn = turnAcademy({ teams, players, academy: state.academy, rng: rng.fork('academy'), year, ...(options.userTeamId ? { userTeamId: options.userTeamId } : {}), createYouth: options.createYouth, taken, counter: state.playerCounter })
  players = academyTurn.players
  const academy = academyTurn.academy
  let counter = academyTurn.counter
  const youth: OffseasonReport['youth'] = {}
  const nextYear = year + 1
  for (const team of teams) {
    let squad = players.filter((p) => p.teamId === team.id)
    const isUser = team.id === options.userTeamId
    const deficits = positionDeficits(squad)
    // Elenco cheio com posição descoberta (a base promoveu gente demais): a IA libera os sobrantes mais fracos para abrir as vagas.
    if (!isUser && deficits.length > SQUAD_MAX - squad.length) {
      const out = new Set(makeRoom(squad, deficits.length - (SQUAD_MAX - squad.length)).map((p) => p.id))
      players = players.map((p) => (out.has(p.id) ? { ...p, teamId: null, contract: { ...p.contract, endDate: contractEndOn(year) } } : p))
      squad = squad.filter((p) => !out.has(p.id))
    }
    const target = isUser ? Math.max(OFFSEASON.youth.userMinSquad, desiredSquadSize(team.reputation)) : desiredSquadSize(team.reputation)
    let count = Math.max(deficits.length, Math.min(target - squad.length, isUser ? SQUAD_MAX : OFFSEASON.youth.maxFill), OFFSEASON.youth.minPerTeam)
    count = Math.min(count, SQUAD_MAX - squad.length)
    if (count <= 0) continue
    const positions = deficits.slice(0, count)
    while (positions.length < count) positions.push(youthRng.pick(EXTRA_POSITIONS))
    const made = options.createYouth({ teamId: team.id, tier: team.tier, reputation: team.reputation, ...(team.economy ? { economy: team.economy } : {}), positions, year: nextYear }, youthRng, taken)
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
  }
  if (trimmed.size > 0) {
    players = players.map((p) => (trimmed.has(p.id) ? { ...p, teamId: null, contract: { ...p.contract, endDate: contractEndOn(year) } } : p))
  }

  // 7) Nova meta da diretoria, finanças do ano e táticas refeitas.
  const newRank = new Map<TeamId, number>()
  for (const c of competitions) {
    teams
      .filter((t) => nextCompetition(t.id) === c)
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
        budgetShift: 0,
        purchaseBonus: 0,
        fundsRequests: [],
        pastSeasons: [...t.finances.pastSeasons, { year, income: summary.income, expenses: summary.expenses, endBalance: t.finances.balance, byCategory: summary.byCategory }],
        salaryBudget: Math.round((isUser ? payroll * FINANCE.salaryBudgetMargin : Math.max(payroll, Math.min(payroll * 1.1, sustainablePayroll(t)))) / 1_000) * 1_000,
      },
    }
  })

  // 8) Nova tabela de jogos.
  const setups: CompetitionSetup[] = state.season.competitions.map((c) => ({
    id: c.id,
    name: c.name,
    tier: c.tier,
    teams: teams.filter((t) => nextCompetition(t.id) === c),
    ...(c.region ? { region: c.region } : {}),
    ...(c.start ? { start: c.start } : {}),
    ...(c.rounds ? { rounds: c.rounds } : {}),
    ...(c.pyramid ? { pyramid: c.pyramid } : {}),
    ...(c.economy ? { economy: c.economy } : {}),
    ...(c.country ? { country: c.country } : {}),
    ...(c.foreignLimit ? { foreignLimit: c.foreignLimit } : {}),
    promotion: c.promotionSlots,
    relegation: c.relegationSlots,
    ...(c.reputationMean !== undefined ? { reputationMean: c.reputationMean } : {}),
  }))
  const next = createSeason({ year: nextYear, seed: state.market.seed, teams, players, competitions: setups, ...(state.focus !== undefined ? { focus: state.focus } : {}) })
  const report: OffseasonReport = {
    year,
    champions,
    championsByCompetition,
    promoted,
    relegated,
    finalPositions,
    retired,
    released,
    renewed: contracts.renewed,
    youth,
    academyArrivals: academyTurn.arrivals,
    academyPromoted: academyTurn.promoted,
    academyReleased: academyTurn.released,
    academyPending: academy.filter((p) => p.teamId === options.userTeamId && p.age >= ACADEMY.graduationAge).map((p) => p.id),
    reputationChanges,
    preContracts: preContracts.applied,
  }
  const squadIds = new Set(players.filter((p) => p.teamId === options.userTeamId).map((p) => p.id))
  const training = {
    ...state.training,
    individual: Object.fromEntries(Object.entries(state.training.individual).filter(([teamId, slot]) => players.some((p) => p.id === slot.playerId && p.teamId === teamId))),
    history: Object.fromEntries(Object.entries(state.training.history).filter(([id]) => squadIds.has(id))),
  }
  // Os anúncios da IA já nascem com a temporada; o time do jogador não anuncia nada sozinho.
  const arrived = preContracts.applied.map((a) => ({ date: next.season.currentDate, playerId: a.playerId, fromTeamId: a.fromTeamId, toTeamId: a.toTeamId, kind: 'purchase' as const, fee: 0 }))
  const market = { ...next.market, history: [...next.market.history, ...arrived], listings: next.market.listings.filter((l) => l.teamId !== options.userTeamId) }
  return { state: { ...next, academy, playerCounter: counter, training, market }, report }
}

/** Reservas que a IA corta para voltar ao tamanho máximo (os de menor valor, sem deixar posição descoberta). */
/** Os n sobrantes mais fracos: só de posições com mais jogadores do que o núcleo pede, para não abrir outro buraco. */
function makeRoom(squad: readonly Player[], n: number): Player[] {
  const out: Player[] = []
  const remaining = [...squad]
  const keepScore = (p: Player) => playerOverall(p) + 0.5 * Math.max(0, p.hidden.potential - playerOverall(p)) + (p.age <= 21 ? 4 : 0)
  while (out.length < n) {
    const counts = new Map<Position, number>()
    for (const p of remaining) counts.set(p.position, (counts.get(p.position) ?? 0) + 1)
    const candidate = remaining.filter((p) => (counts.get(p.position) ?? 0) > CORE_COUNTS[p.position]).sort((a, b) => keepScore(a) - keepScore(b))[0]
    if (!candidate) break
    out.push(candidate)
    remaining.splice(remaining.indexOf(candidate), 1)
  }
  return out
}

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
