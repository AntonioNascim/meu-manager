/**
 * Copas (Fase 3): criação das copas da temporada a partir das definições do pacote, sorteio de cada fase, calendário, premiação e
 * campeão. Nada aqui guarda o chaveamento: as partidas (`Match.cup`) e o registro das fases sorteadas (`Cup.log`) bastam, e confrontos,
 * grupos e vencedores saem delas (`tie.ts`). `progressCups` roda depois de cada dia de jogos e sorteia a fase seguinte quando a
 * anterior termina.
 */
import { CUP } from '../config'
import { leagueRevenue } from '../economy'
import { recordEntry } from '../finance'
import { createRng, hashSeed } from '../rng'
import type { SeasonState } from '../season/calendar'
import { cycleOfPyramid, focusPyramid } from '../season/cycles'
import { pyramidOf } from '../season/fidelity'
import { WEDNESDAY, addDays, makeDate, onOrAfterWeekday } from '../season/dates'
import type { Competition, Cup, CupSpec, IsoDate, Match, MatchCupInfo, StandingRow, Team, TeamId } from '../types'
import { drawGroups, drawKnockout, drawLeaguePhase, groupRounds } from './draw'
import { resolveEntrants } from './entrants'
import { stageList } from './plan'
import { cupMatches, groupTables, leaguePhaseTable, tiesOfStage } from './tie'

export * from './plan'
export * from './tie'
export { resolveEntrants } from './entrants'

/** A disciplina própria da copa (amarelos que suspendem e jogos por vermelho), para `applyMatchToPlayers`. */
export const cupScopeOf = (cup: Pick<Cup, 'id' | 'spec'>) => ({ cupId: cup.id, yellowsPerSuspension: cup.spec.discipline.yellowsPerSuspension, redCardGames: cup.spec.discipline.redCardGames })

const sortMatches = (matches: Match[]): Match[] => matches.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

/** Dias em que cada clube já joga (liga e outras copas). */
function busyDays(matches: readonly Match[], teamIds: ReadonlySet<TeamId>): Map<TeamId, Set<IsoDate>> {
  const busy = new Map<TeamId, Set<IsoDate>>()
  for (const m of matches) {
    for (const id of [m.homeTeamId, m.awayTeamId]) {
      if (!teamIds.has(id)) continue
      const set = busy.get(id)
      if (set) set.add(m.date)
      else busy.set(id, new Set([m.date]))
    }
  }
  return busy
}

/**
 * Primeiro dia de jogo da copa: a quarta-feira a partir de `notBefore` em que nenhum dos clubes joga (nem na véspera nem no dia
 * seguinte), então os jogos da copa nunca batem com a liga.
 */
export function pickCupDay(notBefore: IsoDate, teamIds: Iterable<TeamId>, busy: ReadonlyMap<TeamId, ReadonlySet<IsoDate>>): IsoDate {
  const ids = [...teamIds]
  let day = onOrAfterWeekday(notBefore, WEDNESDAY)
  for (let i = 0; i < 80; i++, day = addDays(day, 7)) {
    const free = ids.every((id) => {
      const days = busy.get(id)
      return !days || (!days.has(day) && !days.has(addDays(day, -1)) && !days.has(addDays(day, 1)))
    })
    if (free) return day
  }
  return day
}

/** Dia de referência de uma fase: na temporada que atravessa o ano, janeiro a junho já são do ano seguinte ao da edição. */
const stageAnchor = (cup: Pick<Cup, 'year'>, split: boolean, monthDay: readonly [number, number]): IsoDate => makeDate(cup.year + (split && monthDay[0] < 7 ? 1 : 0), monthDay[0], monthDay[1])

interface Ctx {
  state: SeasonState
  cup: Cup
  teams: Map<TeamId, Team>
  matches: Match[]
}

const strengthOf = (ctx: Ctx) => (id: TeamId) => ctx.teams.get(id)?.reputation ?? 0

function mkMatch(ctx: Ctx, suffix: string, home: TeamId, away: TeamId, date: IsoDate, round: number, info: MatchCupInfo): Match {
  const id = `${ctx.cup.id}-${suffix}`
  return { id, competitionId: ctx.cup.id, round, date, homeTeamId: home, awayTeamId: away, status: 'scheduled', seed: hashSeed(`${ctx.state.market.seed}:${ctx.cup.year}:${id}`), cup: info }
}

/** Vencedores (e folgas) de uma fase já jogada. */
function advancingFrom(ctx: Ctx, stage: number): TeamId[] {
  const log = ctx.cup.log[stage] as Cup['log'][number]
  const matches = cupMatches(ctx.state.matches, ctx.cup.id)
  if (log.kind === 'knockout') {
    const winners = tiesOfStage(matches, ctx.cup.spec, stage).map((t) => t.winnerId as TeamId)
    return [...log.byes, ...winners]
  }
  if (log.kind === 'groups') {
    const advance = ctx.cup.spec.groups?.advance ?? 1
    const tables = groupTables(matches, stage)
    // Primeiros colocados de todos os grupos, depois segundos...: a ordem ajuda o sorteio com cabeças de chave.
    return Array.from({ length: advance }, (_, place) => tables.flatMap((t) => (t.rows[place] ? [t.rows[place].teamId] : []))).flat()
  }
  return leaguePhaseTable(matches, stage).map((r) => r.teamId)
}

/** Quem joga a fase `stage` da lista de fases. */
function participantsOf(ctx: Ctx, stage: number): TeamId[] {
  const spec = ctx.cup.spec
  const list = stageList(spec)
  const entering = ctx.cup.entrants.filter((e) => e.stage === stage).map((e) => e.teamId)
  if (stage === 0) return entering
  const previous = list[stage - 1] as (typeof list)[number]
  const base = advancingFrom(ctx, stage - 1)
  if (previous.kind === 'league') {
    // Fase de liga: do `direct`+1º ao `direct`+`playoff`º jogam a primeira fase de mata-mata.
    const lp = spec.leaguePhase as NonNullable<CupSpec['leaguePhase']>
    return [...base.slice(lp.direct, lp.direct + lp.playoff), ...entering]
  }
  if (previous.kind === 'knockout' && list[stage - 2]?.kind === 'league') {
    // A fase seguinte à de playoff recebe também os melhores da fase de liga, que pularam o playoff.
    const lp = spec.leaguePhase as NonNullable<CupSpec['leaguePhase']>
    return [...advancingFrom(ctx, stage - 2).slice(0, lp.direct), ...base, ...entering]
  }
  return [...base, ...entering]
}

function payStage(ctx: Ctx, stage: number, teamIds: readonly TeamId[], date: IsoDate): void {
  const amount = ctx.cup.spec.prize.perStage[stage] ?? 0
  if (amount <= 0) return
  const name = (stageList(ctx.cup.spec)[stage] as { name: string }).name
  for (const id of teamIds) {
    const team = ctx.teams.get(id)
    if (team) ctx.teams.set(id, recordEntry(team, date, 'cup-prize', Math.round((amount * leagueRevenue(team)) / 1_000) * 1_000, `${ctx.cup.name}: ${name}`))
  }
}

/** Sorteia e marca os jogos da fase `stage`. */
function generateStage(ctx: Ctx, stage: number, notBefore: IsoDate): Match[] {
  const { cup, state } = ctx
  const spec = cup.spec
  const split = (cup.pyramid !== undefined && state.cycles[cup.pyramid]?.split) === true
  const descriptor = stageList(spec)[stage] as ReturnType<typeof stageList>[number]
  const participants = participantsOf(ctx, stage)
  const rng = createRng(`${state.market.seed}:${cup.year}:${cup.id}:draw:${stage}`)
  const seeded = spec.seeding === 'seeded'
  const strength = strengthOf(ctx)
  const busy = busyDays(ctx.matches, new Set(participants))
  const created: Match[] = []
  const round = (cupMatches(ctx.matches, cup.id).reduce((max, m) => Math.max(max, m.round), 0)) + 1

  if (descriptor.kind === 'knockout') {
    const knockoutIndex = stage - (stageList(spec).findIndex((s) => s.kind === 'knockout'))
    const stageSpec = spec.stages[knockoutIndex] as NonNullable<(typeof spec.stages)[number]>
    const draw = drawKnockout(participants, seeded, strength, rng)
    const first = pickCupDay(maxDate(stageAnchor(cup, split, stageSpec.date), notBefore), draw.ties.flatMap((t) => t.teams), busy)
    const second = stageSpec.legs === 2 ? pickCupDay(addDays(first, stageSpec.legGap ?? CUP.legGapDays), draw.ties.flatMap((t) => t.teams), busy) : undefined
    draw.ties.forEach((tie, i) => {
      let [x, y] = tie.teams
      if (stageSpec.legs === 1) {
        // Jogo único: quem manda vem da regra da copa; sem regra que decida, vale o sorteio (com cabeças de chave, o cabeça de chave).
        const tier = (id: TeamId) => ctx.teams.get(id)?.tier ?? 1
        const home = spec.homeOfSingleLeg
        if (home === 'lower-reputation') [x, y] = strength(x) <= strength(y) ? [x, y] : [y, x]
        else if (home === 'higher-reputation') [x, y] = strength(x) >= strength(y) ? [x, y] : [y, x]
        else if (home === 'first-listed') [x, y] = participants.indexOf(x) <= participants.indexOf(y) ? [x, y] : [y, x]
        else if (home === 'lower-division' && tier(x) !== tier(y)) [x, y] = tier(x) >= tier(y) ? [x, y] : [y, x]
        else if (seeded) [x, y] = [y, x]
        created.push(mkMatch(ctx, `s${stage}-t${i + 1}`, x, y, first, round, { stage, kind: 'knockout', tie: i + 1, leg: 1, ...(stageSpec.neutral ? { neutral: true } : {}) }))
      } else {
        created.push(mkMatch(ctx, `s${stage}-t${i + 1}-l1`, x, y, first, round, { stage, kind: 'knockout', tie: i + 1, leg: 1 }))
        created.push(mkMatch(ctx, `s${stage}-t${i + 1}-l2`, y, x, second as IsoDate, round + 1, { stage, kind: 'knockout', tie: i + 1, leg: 2 }))
      }
    })
    cup.log.push({ stage, kind: 'knockout', name: descriptor.name, teams: [...participants], byes: draw.byes })
    payStage(ctx, stage, participants.filter((id) => !draw.byes.includes(id)), state.season.currentDate)
  } else if (descriptor.kind === 'groups') {
    const g = spec.groups as NonNullable<CupSpec['groups']>
    const groups = drawGroups(participants, g.count, seeded, strength, rng)
    const gap = g.gapDays ?? CUP.groupGapDays
    const perGroup = groups.map((teams, gi) => groupRounds(teams, g.legs, rng.fork(`g${gi}`)))
    const days = Math.max(...perGroup.map((r) => r.length))
    let notYet = maxDate(stageAnchor(cup, split, g.date), notBefore)
    for (let d = 0; d < days; d++) {
      const day = pickCupDay(notYet, participants, busy)
      notYet = addDays(day, gap)
      perGroup.forEach((rounds, gi) => (rounds[d] ?? []).forEach((f, i) => created.push(mkMatch(ctx, `s${stage}-g${gi + 1}-r${d + 1}-${i + 1}`, f.homeTeamId, f.awayTeamId, day, round + d, { stage, kind: 'group', group: gi + 1 }))))
    }
    cup.log.push({ stage, kind: 'groups', name: descriptor.name, teams: [...participants], byes: [] })
    payStage(ctx, stage, participants, state.season.currentDate)
  } else {
    const lp = spec.leaguePhase as NonNullable<CupSpec['leaguePhase']>
    const draw = drawLeaguePhase(participants, lp, strength, rng)
    const gap = lp.gapDays ?? CUP.groupGapDays
    let notYet = maxDate(stageAnchor(cup, split, lp.date), notBefore)
    draw.matchdays.forEach((fixtures, d) => {
      const day = pickCupDay(notYet, participants, busy)
      notYet = addDays(day, gap)
      fixtures.forEach((f, i) => created.push(mkMatch(ctx, `s${stage}-r${d + 1}-${i + 1}`, f.homeTeamId, f.awayTeamId, day, round + d, { stage, kind: 'league' })))
    })
    cup.log.push({ stage, kind: 'league', name: descriptor.name, teams: [...participants], byes: [] })
    payStage(ctx, stage, participants, state.season.currentDate)
  }
  return created
}

const maxDate = (a: IsoDate, b: IsoDate): IsoDate => (a >= b ? a : b)

/** Premia o campeão e o vice (conforme `prize`). */
function payFinal(ctx: Ctx, winnerId: TeamId, runnerUpId: TeamId | undefined, date: IsoDate): void {
  const prize = ctx.cup.spec.prize
  const pay = (id: TeamId | undefined, amount: number | undefined, label: string) => {
    const team = id ? ctx.teams.get(id) : undefined
    if (id && team && amount) ctx.teams.set(id, recordEntry(team, date, 'cup-prize', Math.round((amount * leagueRevenue(team)) / 1_000) * 1_000, `${ctx.cup.name}: ${label}`))
  }
  pay(winnerId, prize.champion, 'campeão')
  pay(runnerUpId, prize.runnerUp, 'vice-campeão')
}

/**
 * Cria as copas da temporada: quem joga cada uma (as vagas do pacote contra a temporada passada) e o sorteio da primeira fase.
 * Copa com menos de dois clubes não é criada. Use depois de montar as ligas.
 */
export function createCups(state: SeasonState, specs: readonly CupSpec[], only?: string): SeasonState {
  if (specs.length === 0) return state
  const cups: Cup[] = (state.cups ?? []).filter((c) => only === undefined || c.pyramid !== only)
  for (const spec of specs) {
    const pyramid = pyramidOfCupSpec(spec, state.season.competitions) ?? focusPyramid(state)
    if (only !== undefined && pyramid !== only) continue
    // A copa é da temporada do país dela: o ano da edição e as vagas (colocações da temporada passada) seguem a pirâmide.
    const year = cycleOfPyramid(state, pyramid).year
    const entrants = resolveEntrants(spec, { year, teams: state.teams, competitions: state.season.competitions, cupHistory: state.cupHistory ?? {}, specs })
    if (entrants.length < 2) continue
    cups.push({ id: spec.id, name: spec.name, year, pyramid, spec, entrants, log: [] })
  }
  return progressCups({ ...state, cups, cupSpecs: [...specs] })
}

/** A pirâmide (país) de uma copa: a da primeira liga que dá vaga a ela. */
export function pyramidOfCupSpec(spec: CupSpec, competitions: readonly Pick<Competition, 'id' | 'pyramid'>[]): string | undefined {
  for (const rule of spec.entrants) {
    for (const source of [rule.source, rule.fallback]) {
      if (source?.type !== 'league') continue
      const c = competitions.find((x) => x.id === source.league)
      if (c) return pyramidOf(c)
    }
  }
  return undefined
}

/**
 * Anda com as copas: sorteia a primeira fase de quem ainda não começou, e sempre que uma fase termina sorteia a seguinte (ou
 * encerra a copa e premia o campeão). Pode ser chamada a qualquer momento; sem nada a fazer devolve o mesmo estado.
 */
export function progressCups(state: SeasonState): SeasonState {
  if (!state.cups || state.cups.length === 0) return state
  const teams = new Map(state.teams.map((t) => [t.id, t]))
  let matches = state.matches
  let history = state.cupHistory ?? {}
  let changed = false
  /** Copas em que os amarelos acumulados zeram agora (depois da fase marcada em `clearYellowsAfterStage`). */
  const clearYellows = new Set<string>()
  const cups = state.cups.map((original) => {
    let cup = original
    for (let guard = 0; guard < 20 && cup.winnerId === undefined; guard++) {
      const list = stageList(cup.spec)
      const ctx: Ctx = { state: { ...state, matches }, cup: { ...cup, log: [...cup.log] }, teams, matches }
      if (cup.log.length === 0) {
        const created = generateStage(ctx, 0, state.season.currentDate)
        matches = sortMatches([...matches, ...created])
        cup = ctx.cup
        changed = true
        continue
      }
      const last = cup.log.length - 1
      const stageMatches = matches.filter((m) => m.competitionId === cup.id && m.cup?.stage === last)
      if (stageMatches.some((m) => m.status !== 'finished')) break
      if (last === list.length - 1) {
        // A final acabou.
        const tie = tiesOfStage(stageMatches, cup.spec, last)[0]
        if (!tie?.winnerId) break
        const runnerUpId = tie.teams.find((id) => id !== tie.winnerId)
        payFinal(ctx, tie.winnerId, runnerUpId, state.season.currentDate)
        history = { ...history, [cup.id]: [...(history[cup.id] ?? []).filter((h) => h.year !== cup.year), { year: cup.year, winnerId: tie.winnerId, ...(runnerUpId ? { runnerUpId } : {}) }] }
        cup = { ...cup, winnerId: tie.winnerId, ...(runnerUpId ? { runnerUpId } : {}) }
        changed = true
        break
      }
      if (cup.spec.discipline.clearYellowsAfterStage === last) clearYellows.add(cup.id)
      const lastDate = stageMatches.reduce((d, m) => (m.date > d ? m.date : d), state.season.currentDate)
      const created = generateStage(ctx, last + 1, addDays(lastDate, CUP.minRestDays))
      matches = sortMatches([...matches, ...created])
      cup = ctx.cup
      changed = true
    }
    return cup
  })
  if (!changed) return state
  const players =
    clearYellows.size === 0
      ? state.players
      : state.players.map((p) => {
          const own = p.condition.cups
          if (!own || ![...clearYellows].some((id) => own[id]?.yellowCards)) return p
          const cleared = { ...own }
          for (const id of clearYellows) if (cleared[id]) cleared[id] = { ...(cleared[id] as { yellowCards: number; suspensionGames: number }), yellowCards: 0 }
          return { ...p, condition: { ...p.condition, cups: cleared } }
        })
  return {
    ...state,
    matches,
    players,
    teams: state.teams.map((t) => teams.get(t.id) ?? t),
    cups,
    cupHistory: history,
    season: { ...state.season, matchIds: matches.map((m) => m.id) },
  }
}

/** Estado de um clube numa copa: jogando, eliminado (e em que fase), campeão ou fora dela. */
export function cupStatus(state: Pick<SeasonState, 'matches'>, cup: Cup, teamId: TeamId): { state: 'out' | 'playing' | 'eliminated' | 'champion' | 'runner-up'; stage?: number; stageName?: string } {
  const list = stageList(cup.spec)
  if (cup.winnerId === teamId) return { state: 'champion' }
  if (cup.runnerUpId === teamId) return { state: 'runner-up' }
  if (!cup.entrants.some((e) => e.teamId === teamId)) return { state: 'out' }
  const matches = cupMatches(state.matches, cup.id)
  let lastStage: number | undefined
  for (const m of matches) if ((m.homeTeamId === teamId || m.awayTeamId === teamId) && (lastStage === undefined || (m.cup?.stage ?? 0) > lastStage)) lastStage = m.cup?.stage
  const log = lastStage === undefined ? undefined : cup.log[lastStage]
  if (lastStage === undefined) {
    // Ainda não estreou: entra numa fase futura (ou a copa ainda não sorteou).
    const entry = cup.entrants.find((e) => e.teamId === teamId)?.stage ?? 0
    return { state: 'playing', stage: entry, stageName: list[entry]?.name ?? '' }
  }
  const mine = matches.filter((m) => m.cup?.stage === lastStage && (m.homeTeamId === teamId || m.awayTeamId === teamId))
  const pending = mine.some((m) => m.status !== 'finished')
  if (pending) return { state: 'playing', stage: lastStage, stageName: log?.name ?? '' }
  const kind = log?.kind
  if (kind === 'knockout') {
    const tie = tiesOfStage(matches, cup.spec, lastStage).find((t) => t.teams.includes(teamId))
    if (tie?.winnerId && tie.winnerId !== teamId) return { state: 'eliminated', stage: lastStage, stageName: log?.name ?? '' }
  } else {
    // Grupos ou fase de liga: passou se está entre os que seguem para a fase seguinte.
    const next = cup.log[lastStage + 1]
    if (next && !next.teams.includes(teamId) && !(cup.spec.format === 'league-knockout' && lastStage === 0 && (cup.spec.leaguePhase?.direct ?? 0) > 0 && rankInLeague(matches, teamId) <= (cup.spec.leaguePhase?.direct ?? 0))) return { state: 'eliminated', stage: lastStage, stageName: log?.name ?? '' }
    if (!next && lastStage + 1 < list.length) return { state: 'playing', stage: lastStage, stageName: log?.name ?? '' }
  }
  return { state: 'playing', stage: Math.min(list.length - 1, lastStage + 1), stageName: list[lastStage + 1]?.name ?? '' }
}

function rankInLeague(matches: readonly Match[], teamId: TeamId): number {
  const table: StandingRow[] = leaguePhaseTable(matches, 0)
  return table.findIndex((r) => r.teamId === teamId) + 1
}


/** Nome da competição e a fase ou rodada de um jogo, para mostrar nas telas ("Copa Nacional", "Quartas de final · volta"). */
export function matchLabel(state: Pick<SeasonState, 'cups' | 'season'>, match: Pick<Match, 'competitionId' | 'round' | 'cup'>): { competition: string; detail: string } {
  if (match.cup) {
    const cup = state.cups?.find((c) => c.id === match.competitionId)
    const stage = cup ? stageList(cup.spec)[match.cup.stage]?.name : undefined
    const leg = match.cup.leg === 2 ? ' · volta' : match.cup.leg === 1 && cup?.spec.stages.some((s) => s.name === stage && s.legs === 2) ? ' · ida' : ''
    const group = match.cup.kind === 'group' ? ` · Grupo ${String.fromCharCode(64 + (match.cup.group ?? 1))}` : ''
    return { competition: cup?.name ?? match.competitionId, detail: `${stage ?? ''}${group}${leg}` }
  }
  return { competition: state.season.competitions.find((c) => c.id === match.competitionId)?.name ?? '', detail: `Rodada ${match.round}` }
}
