/**
 * Virada de temporada, na ordem: acesso e rebaixamento, reputação, envelhecimento e evolução,
 * aposentadorias, fim de contratos, jovens da base, nova meta da diretoria e nova tabela de jogos.
 * Funções puras: recebem a temporada encerrada e devolvem a nova, mais um relatório do que aconteceu.
 */
import { ACADEMY, FINANCE, MARKET, OFFSEASON } from '../config'
import { lineupForeign } from '../foreign'
import { defaultTicketPrice, monthlyPayroll, summarizeLedger, sustainablePayroll } from '../finance'
import { buildTactic, repairTactic } from '../lineup'
import { playerOverall } from '../overall'
import { createRng } from '../rng'
import type { Rng } from '../rng'
import { buildPyramid } from '../season/calendar'
import type { CompetitionSetup } from '../season/calendar'
import { competitionsOf, cycleOfPyramid, cycleOfTeam, focusPyramid, nextCycle, phaseOfPyramid, pyramidFinished, seasonLabel } from '../season/cycles'
import { pyramidOf } from '../season/fidelity'
import type { SeasonState } from '../season/calendar'
import { applyBirthdays } from '../season/birthdays'
import { daysBetween } from '../season/dates'
import { createCups, isContinental } from '../cups'
import { computeStandings } from '../season/standings'
import { SQUAD_MAX, SQUAD_MIN } from '../types'
import type { Competition, CompetitionId, Cup, CupSpec, DepartedPlayer, OffseasonReport, Player, PlayerId, Position, StandingRow, Team, TeamId, YouthRequest } from '../types'
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
  /**
   * Copas padrão do mundo para um jogo de antes das copas (`SeasonState.cupSpecs` ausente): entram na temporada que começa. Quem escolheu
   * jogar sem copas tem `cupSpecs: []` e não ganha nenhuma.
   */
  defaultCupSpecs?: (competitions: readonly Competition[]) => CupSpec[]
  /** Vira só a temporada desta pirâmide (um país); sem ela, vira todas. */
  pyramid?: string
}

const EXTRA_POSITIONS: readonly Position[] = ['CB', 'CM', 'ST', 'AM', 'RW', 'LW', 'DM', 'RB', 'LB']

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const departed = (p: Player, teamId: TeamId | null = p.teamId): DepartedPlayer => ({ playerId: p.id, name: p.nickname ?? p.name, age: p.age, teamId })

/** Meta da diretoria pela posição do time na série (por reputação), como na geração do mundo. */
function objectiveFor(rank: number) {
  const target = Math.min(rank, 16)
  return { targetPosition: target, sackingPosition: Math.min(20, target + 6) }
}

/**
 * Vira a temporada de uma pirâmide (um país): acesso e rebaixamento, reputação, aposentadorias, contratos, base, metas, finanças e
 * tabela nova. Só mexe nos clubes, jogadores e jogos dela; o relógio do mundo e as outras pirâmides seguem como estão. Sem `pyramid`,
 * vira todas as pirâmides (uma depois da outra) e o relatório devolvido é o da pirâmide do foco.
 */
export function advanceSeason(state: SeasonState, options: OffseasonOptions): { state: SeasonState; report: OffseasonReport } {
  if (options.pyramid !== undefined) return turnPyramid(state, options.pyramid, options)
  const pyramids: string[] = []
  for (const c of state.season.competitions) if (!pyramids.includes(pyramidOf(c))) pyramids.push(pyramidOf(c))
  const focus = focusPyramid(state)
  let current = state
  const reports: OffseasonReport[] = []
  for (const pyramid of pyramids) {
    const turned = turnPyramid(current, pyramid, options, pyramids.length > 1)
    current = turned.state
    reports.push(turned.report)
  }
  return { state: current, report: mergeReports(reports, focus) }
}

/** O relatório de várias pirâmides num só: os campeões por série e o ano são os da pirâmide do foco, o resto soma tudo. */
function mergeReports(reports: readonly OffseasonReport[], focus: string): OffseasonReport {
  const main = reports.find((r) => r.pyramid === focus) ?? (reports[0] as OffseasonReport)
  if (reports.length === 1) return main
  const merged: OffseasonReport = { ...main, championsByCompetition: {}, promoted: [], relegated: [], finalPositions: {}, retired: [], released: [], renewed: 0, youth: {}, academyArrivals: {}, academyPromoted: {}, academyReleased: {}, academyPending: [], reputationChanges: {}, preContracts: [] }
  for (const r of reports) {
    Object.assign(merged.championsByCompetition as Record<string, TeamId>, r.championsByCompetition)
    merged.promoted.push(...r.promoted)
    merged.relegated.push(...r.relegated)
    Object.assign(merged.finalPositions, r.finalPositions)
    merged.retired.push(...r.retired)
    merged.released.push(...r.released)
    merged.renewed += r.renewed
    Object.assign(merged.youth, r.youth)
    Object.assign(merged.academyArrivals, r.academyArrivals)
    Object.assign(merged.academyPromoted, r.academyPromoted)
    Object.assign(merged.academyReleased, r.academyReleased)
    merged.academyPending.push(...r.academyPending)
    Object.assign(merged.reputationChanges, r.reputationChanges)
    merged.preContracts.push(...r.preContracts)
  }
  return merged
}

function turnPyramid(state: SeasonState, pyramid: string, options: OffseasonOptions, multi = false): { state: SeasonState; report: OffseasonReport } {
  // `season.phase` é a fase da pirâmide do foco: declarada `end-of-season`, ela vale como encerrada.
  if (!pyramidFinished(state, pyramid) && !(pyramid === focusPyramid(state) && state.season.phase === 'end-of-season')) throw new Error('A temporada ainda não acabou')
  const cycle = cycleOfPyramid(state, pyramid)
  const year = cycle.year
  const split = cycle.split
  const isMulti = multi || new Set(state.season.competitions.map((c) => pyramidOf(c))).size > 1
  const rng = createRng(`${state.market.seed}:${year}:offseason${isMulti ? `:${pyramid}` : ''}`)
  // O relógio do mundo vai (no mínimo) até o último dia da temporada do país; quem chamou pelo avanço do jogo já está lá.
  const turnDate = state.season.currentDate >= cycle.end ? state.season.currentDate : cycle.end

  // 1) Acesso e rebaixamento; histórico de campeões e posições.
  const finalPositions: OffseasonReport['finalPositions'] = {}
  const champions: TeamId[] = []
  const promoted: TeamId[] = []
  const relegated: TeamId[] = []
  // As divisões do país: quem sobe ou cai vai para a divisão vizinha da MESMA pirâmide. Os campeões do relatório são índice = série − 1.
  const competitions = competitionsOf(state, pyramid).sort((a, b) => a.tier - b.tier)
  const scope = new Set<TeamId>(competitions.flatMap((c) => c.teamIds))
  const championsByCompetition: Record<string, TeamId> = {}
  const destination = new Map<TeamId, CompetitionId>()
  const neighbour = (c: Competition, step: number) => competitions.find((o) => o.tier === c.tier + step)
  for (const competition of competitions) {
    const rows: StandingRow[] = computeStandings(competition.teamIds, state.matches.filter((m) => m.competitionId === competition.id))
    rows.forEach((r, i) => (finalPositions[r.teamId] = { tier: competition.tier, position: i + 1 }))
    championsByCompetition[competition.id] = (rows[0] as StandingRow).teamId
    champions[competition.tier - 1] = (rows[0] as StandingRow).teamId
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
  // O título (e a final) de uma copa continental da temporada dá reputação ao clube.
  const continental = new Map<TeamId, number>()
  for (const cup of state.cups ?? []) {
    if (cup.pyramid !== undefined || cup.winnerId === undefined || cup.year !== year) continue
    continental.set(cup.winnerId, (continental.get(cup.winnerId) ?? 0) + OFFSEASON.reputation.continentalChampion)
    if (cup.runnerUpId) continental.set(cup.runnerUpId, (continental.get(cup.runnerUpId) ?? 0) + OFFSEASON.reputation.continentalFinalist)
  }
  const R = OFFSEASON.reputation
  const reputationRng = rng.fork('reputation')
  let teams: Team[] = state.teams.map((t) => {
    if (!scope.has(t.id)) return t
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
    const pulled = t.reputation + delta + pull * (mean - t.reputation) + (continental.get(t.id) ?? 0)
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
  const scopeTeams = () => teams.filter((t) => scope.has(t.id))

  // 3) Envelhecimento: a idade já aumentou no aniversário de cada um durante a temporada; aqui entram só os aniversários que faltam até o
  // fim dela e a condição e as estatísticas voltam ao zero. 4) Aposentadorias. Jogador livre há um ano ou mais sai do jogo.
  const retired: DepartedPlayer[] = []
  const retireRng = rng.fork('retirement')
  let players: Player[] = []
  for (const p of applyBirthdays(state.players, state.season.currentDate, turnDate, state.market.seed)) {
    if (p.teamId === null) {
      // Jogador livre há muito tempo sai do jogo; os outros começam a temporada novos (e podem se aposentar).
      if (daysBetween(p.contract.endDate, turnDate) >= OFFSEASON.freeAgentDays) continue
      const next = startNewSeason(p)
      if (retires(retireRng, next)) retired.push(departed(next))
      else players.push(next)
      continue
    }
    if (!scope.has(p.teamId)) {
      players.push(p)
      continue
    }
    const next = startNewSeason(p)
    if (retires(retireRng, next)) retired.push(departed(next))
    else players.push(next)
  }

  // Pré-contratos assinados por quem vence com a temporada do país: mudam de clube de graça.
  const endsNow = (p: Player) => p.teamId !== null && scope.has(p.teamId) && p.contract.endDate <= cycle.end
  const preContracts = applyPreContracts(players, state.market.preContracts, year, endsNow, (id) => cycleOfTeam(state, id))
  players = preContracts.players

  // 5) Fim dos contratos (empréstimos voltam para casa; a IA renova o que faz sentido).
  const contracts = expireContracts({ players, teams, year, split, scope, rng: rng.fork('contracts'), ...(options.userTeamId ? { userTeamId: options.userTeamId } : {}) })
  players = contracts.players
  const released = contracts.released

  // 6) Corte de folha da IA (um clube rebaixado para uma série mais pobre libera quem a receita nova não sustenta), categorias de base
  // (evolução, decisões dos 20 anos, chegada de jovens) e depois a reposição de posições descobertas e o corte do excesso na IA.
  // O corte vem antes da reposição: os jovens que chegam cobrem as posições que o corte deixou descobertas.
  const payrollCut = new Set<PlayerId>()
  for (const team of scopeTeams()) {
    if (team.id === options.userTeamId) continue
    for (const p of payrollCuts(players.filter((x) => x.teamId === team.id), sustainablePayroll(team), team.finances.balance)) payrollCut.add(p.id)
  }
  const release = (ids: ReadonlySet<PlayerId>) => (players = players.map((p) => (ids.has(p.id) ? { ...p, teamId: null, contract: { ...p.contract, endDate: cycle.end } } : p)))
  if (payrollCut.size > 0) release(payrollCut)
  const youthRng = rng.fork('youth')
  const taken = new Set([...players, ...state.academy].map((p) => p.name))
  const academyTurn = turnAcademy({ teams: scopeTeams(), players, academy: state.academy.filter((p) => p.teamId !== null && scope.has(p.teamId)), rng: rng.fork('academy'), year, split, ...(options.userTeamId ? { userTeamId: options.userTeamId } : {}), createYouth: options.createYouth, taken, counter: state.playerCounter })
  players = academyTurn.players
  const academy = [...state.academy.filter((p) => p.teamId === null || !scope.has(p.teamId)), ...academyTurn.academy]
  let counter = academyTurn.counter
  const youth: OffseasonReport['youth'] = {}
  const nextYear = year + 1
  for (const team of scopeTeams()) {
    let squad = players.filter((p) => p.teamId === team.id)
    const isUser = team.id === options.userTeamId
    const deficits = positionDeficits(squad)
    // Elenco cheio com posição descoberta (a base promoveu gente demais): a IA libera os sobrantes mais fracos para abrir as vagas.
    if (!isUser && deficits.length > SQUAD_MAX - squad.length) {
      const out = new Set(makeRoom(squad, deficits.length - (SQUAD_MAX - squad.length)).map((p) => p.id))
      release(out)
      squad = squad.filter((p) => !out.has(p.id))
    }
    const target = isUser ? Math.max(OFFSEASON.youth.userMinSquad, desiredSquadSize(team.reputation)) : desiredSquadSize(team.reputation)
    let count = Math.max(deficits.length, Math.min(target - squad.length, isUser ? SQUAD_MAX : OFFSEASON.youth.maxFill), OFFSEASON.youth.minPerTeam)
    count = Math.min(count, SQUAD_MAX - squad.length)
    if (count <= 0) continue
    const positions = deficits.slice(0, count)
    while (positions.length < count) positions.push(youthRng.pick(EXTRA_POSITIONS))
    const made = options.createYouth({ teamId: team.id, tier: team.tier, reputation: team.reputation, ...(team.economy ? { economy: team.economy } : {}), ...(team.country ? { country: team.country } : {}), positions, year: nextYear, ...(split ? { split } : {}) }, youthRng, taken)
    for (const p of made) {
      taken.add(p.name)
      players.push({ ...p, id: `player-${++counter}`, teamId: team.id })
    }
    youth[team.id] = made.length
  }
  const trimmed = new Set<PlayerId>()
  for (const team of scopeTeams()) {
    if (team.id === options.userTeamId) continue
    const squad = players.filter((p) => p.teamId === team.id)
    for (const p of trimExcess(squad)) trimmed.add(p.id)
  }
  if (trimmed.size > 0) release(trimmed)

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
    if (!scope.has(t.id)) return t
    const squad = players.filter((p) => p.teamId === t.id)
    const summary = summarizeLedger(t.finances.ledger)
    const payroll = monthlyPayroll(squad)
    const isUser = t.id === options.userTeamId
    const tactic = isUser ? repairTactic(t.tactic, squad, lineupForeign(t)) : buildTactic(squad, { formationId: t.tactic.formationId, style: t.tactic.style, mentality: t.tactic.mentality }, { ...(lineupForeign(t) ? { foreign: lineupForeign(t) } : {}) })
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

  // 8) Nova tabela de jogos do país, na temporada seguinte dele.
  const setups: CompetitionSetup[] = competitions.map((c) => ({
    id: c.id,
    name: c.name,
    tier: c.tier,
    teams: teams.filter((t) => nextCompetition(t.id) === c),
    ...(c.region ? { region: c.region } : {}),
    ...(c.start ? { start: c.start } : {}),
    ...(c.rounds ? { rounds: c.rounds } : {}),
    ...(c.split ? { split: true } : {}),
    ...(c.gapEvery ? { gapEvery: c.gapEvery } : {}),
    ...(c.pyramid ? { pyramid: c.pyramid } : {}),
    ...(c.economy ? { economy: c.economy } : {}),
    ...(c.country ? { country: c.country } : {}),
    ...(c.foreignLimit ? { foreignLimit: c.foreignLimit } : {}),
    promotion: c.promotionSlots,
    relegation: c.relegationSlots,
    ...(c.reputationMean !== undefined ? { reputationMean: c.reputationMean } : {}),
  }))
  const upcoming = nextCycle(cycle)
  const built = buildPyramid({ seed: state.market.seed, cycle: upcoming, setups, rng: createRng(`${state.market.seed}:${upcoming.year}:calendar${isMulti ? `:${pyramid}` : ''}`) })
  const replaced = new Map(built.competitions.map((c) => [c.id, c]))
  const oldIds = new Set(competitions.map((c) => c.id))
  for (const cup of state.cups ?? []) if (cup.pyramid === pyramid) oldIds.add(cup.id)
  const matches = [...state.matches.filter((m) => !oldIds.has(m.competitionId)), ...built.matches].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const gone = new Set(scope)
  const market = {
    ...state.market,
    // Propostas, anúncios e pré-contratos dos clubes que viraram a temporada acabam com ela; os dos outros países seguem.
    offers: state.market.offers.filter((o) => !gone.has(o.buyerId) && !gone.has(o.sellerId as TeamId)),
    listings: state.market.listings.filter((l) => !gone.has(l.teamId) && l.teamId !== options.userTeamId),
    preContracts: state.market.preContracts.filter((c) => !gone.has(c.fromTeamId)),
    history: [
      ...state.market.history.filter((h) => daysBetween(h.date, turnDate) <= OFFSEASON.historyDays),
      ...preContracts.applied.map((a) => ({ date: turnDate, playerId: a.playerId, fromTeamId: a.fromTeamId, toTeamId: a.toTeamId, kind: 'purchase' as const, fee: 0 })),
    ],
  }
  const squadIds = new Set(players.filter((p) => p.teamId === options.userTeamId).map((p) => p.id))
  const training = {
    ...state.training,
    individual: Object.fromEntries(Object.entries(state.training.individual).filter(([teamId, slot]) => players.some((p) => p.id === slot.playerId && p.teamId === teamId))),
    history: Object.fromEntries(Object.entries(state.training.history).filter(([id]) => squadIds.has(id))),
  }
  const cycles = { ...state.cycles, [pyramid]: upcoming }
  let next: SeasonState = {
    ...state,
    season: { ...state.season, currentDate: turnDate, competitions: state.season.competitions.map((c) => replaced.get(c.id) ?? c), matchIds: matches.map((m) => m.id) },
    cycles,
    matches,
    cups: (state.cups ?? []).filter((c) => c.pyramid !== pyramid),
    teams,
    players,
    academy,
    market,
    training,
    playerCounter: counter,
  }
  // As copas voltam em cada temporada com as vagas da que acabou (o campeão de cada edição fica no histórico).
  const defaults = options.defaultCupSpecs?.(state.season.competitions)
  let specs = state.cupSpecs ?? defaults
  // Um save de antes das copas continentais ganha as padrão (se o mundo tem copas e nenhuma é continental): elas nascem quando todos os países abrem a temporada.
  if (state.cupSpecs && state.cupSpecs.length > 0 && defaults && !state.cupSpecs.some(isContinental)) specs = [...state.cupSpecs, ...defaults.filter(isContinental)]
  if (specs) next = specs.length > 0 ? createCups(next, specs, pyramid) : { ...next, cupSpecs: [] }
  if (state.cups === undefined && next.cups?.length === 0) delete (next as { cups?: Cup[] }).cups
  const focus = focusPyramid(next)
  next = { ...next, season: { ...next.season, year: cycleOfPyramid(next, focus).year, phase: phaseOfPyramid(next, focus) } }
  const report: OffseasonReport = {
    year,
    pyramid,
    label: seasonLabel(cycle),
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
  return { state: next, report }
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
