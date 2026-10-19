/**
 * Validação das copas do pacote (`cups`): campos, referências a ligas e a outras copas, datas, e a conta dos clubes: o número de
 * clubes que entra em cada fase precisa levar a uma final de dois.
 */
import { NATIONALITIES, REGIONS, continentOf } from '../../engine/types'
import type { CupSpec, Region } from '../../engine/types'
import { checkBracket, checkPreliminary, stageList } from '../../engine/cups/plan'
import type { PackageIssueCode } from './types'
import { TIEBREAKERS } from './types'
import type { PackageCup } from './types'
import { normalizeCup } from './cups'
import { countryRegion } from './continentalCups'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const FORMATS = ['knockout', 'groups-knockout', 'league-knockout']

export interface CupValidationContext {
  leagues: { id: string; country?: string; teams?: number; level?: number; region?: Region }[]
  countries: Set<string>
  error(code: PackageIssueCode, path: string, detail?: string | number, expected?: string | number): void
  warn(code: PackageIssueCode, path: string, detail?: string | number): void
}

const validMonthDay = (v: unknown): v is [number, number] => {
  if (!Array.isArray(v) || v.length !== 2 || !isInt(v[0]) || !isInt(v[1])) return false
  const [m, d] = v as [number, number]
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(2024, m, 0).getDate()
}

/** Quantos clubes uma vaga traz (para conferir o chaveamento antes de jogar). */
function sourceCount(source: Obj, ctx: CupValidationContext, raws: Map<string, Obj>): number {
  if (source.type === 'cup') return 1
  // Clubes mais fortes de um continente: o pedido, ou todos os de primeira divisão do continente se são menos.
  if (source.type === 'region') {
    const available = ctx.leagues.filter((l) => (l.level ?? 1) === 1 && l.country !== undefined && countryRegion(l.country, l.region) === source.region).reduce((n, l) => n + (l.teams ?? 0), 0)
    return Math.min(source.count as number, available)
  }
  // Um clube por grupo da outra copa.
  if (source.type === 'cup-group-place') {
    const groups = raws.get(source.cup as string)?.groups
    return isObj(groups) && isInt(groups.count) ? groups.count : 0
  }
  const league = ctx.leagues.find((l) => l.id === source.league)
  const positions = source.positions
  if (Array.isArray(positions) && positions.length === 2) return Math.max(0, (positions[1] as number) - (positions[0] as number) + 1)
  return league?.teams ?? 0
}

function checkSource(source: unknown, path: string, ctx: CupValidationContext, cupIds: Set<string>, selfId: string | undefined): boolean {
  if (!isObj(source)) {
    ctx.error('wrong-type', path, 'source')
    return false
  }
  if (source.type === 'league') {
    const league = ctx.leagues.find((l) => l.id === source.league)
    if (typeof source.league !== 'string' || !league) {
      ctx.error('unknown-reference', `${path}.league`, String(source.league))
      return false
    }
    if (source.positions !== undefined) {
      const p = source.positions
      if (!Array.isArray(p) || p.length !== 2 || !isInt(p[0]) || !isInt(p[1]) || p[0] < 1 || p[1] < p[0] || (league.teams !== undefined && p[1] > league.teams)) {
        ctx.error('out-of-range', `${path}.positions`, JSON.stringify(p), `[de, até] entre 1 e ${league.teams ?? '?'}`)
        return false
      }
    }
    return true
  }
  if (source.type === 'region') {
    if (typeof source.region !== 'string' || !(REGIONS as readonly string[]).includes(source.region) || continentOf(source.region as Region) !== source.region) {
      ctx.error('unknown-value', `${path}.region`, String(source.region))
      return false
    }
    if (!isInt(source.count) || source.count < 1 || source.count > 64) {
      ctx.error('out-of-range', `${path}.count`, String(source.count), '1 a 64')
      return false
    }
    if (source.cup !== undefined && (typeof source.cup !== 'string' || !cupIds.has(source.cup) || source.cup === selfId)) {
      ctx.error('unknown-reference', `${path}.cup`, String(source.cup))
      return false
    }
    if (source.last !== undefined && (!isInt(source.last) || source.last < 1 || source.last > 20)) {
      ctx.error('out-of-range', `${path}.last`, String(source.last), '1 a 20')
      return false
    }
    return true
  }
  if (source.type === 'cup') {
    if (typeof source.cup !== 'string' || !cupIds.has(source.cup) || source.cup === selfId) {
      ctx.error('unknown-reference', `${path}.cup`, String(source.cup))
      return false
    }
    if (source.latest !== undefined && typeof source.latest !== 'boolean') {
      ctx.error('wrong-type', `${path}.latest`, 'latest')
      return false
    }
    if (source.place !== 'winner' && source.place !== 'runner-up') {
      ctx.error('unknown-value', `${path}.place`, String(source.place))
      return false
    }
    return true
  }
  if (source.type === 'cup-group-place') {
    if (typeof source.cup !== 'string' || !cupIds.has(source.cup) || source.cup === selfId) {
      ctx.error('unknown-reference', `${path}.cup`, String(source.cup))
      return false
    }
    if (!isInt(source.place) || source.place < 1 || source.place > 8) {
      ctx.error('out-of-range', `${path}.place`, String(source.place), '1 a 8')
      return false
    }
    return true
  }
  ctx.error('unknown-value', `${path}.type`, String(source.type))
  return false
}

/** Valida `cups` (cada erro entra no relatório do pacote). */
export function validateCups(input: unknown, ctx: CupValidationContext): void {
  if (input === undefined) return
  if (!Array.isArray(input)) return ctx.error('wrong-type', 'cups', 'cups')
  const ids = new Set<string>()
  const cupIds = new Set(input.flatMap((c) => (isObj(c) && typeof c.id === 'string' ? [c.id] : [])))
  const raws = new Map(input.flatMap((c) => (isObj(c) && typeof c.id === 'string' ? [[c.id, c] as [string, Obj]] : [])))
  input.forEach((raw, i) => {
    const path = `cups[${i}]`
    if (!isObj(raw)) return ctx.error('wrong-type', path, 'cup')
    const before = { count: 0 }
    const err: CupValidationContext['error'] = (...args) => {
      before.count++
      ctx.error(...args)
    }
    const local: CupValidationContext = { ...ctx, error: err }
    const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : undefined
    if (id === undefined) err('missing-field', `${path}.id`, 'id')
    else if (ids.has(id) || ctx.leagues.some((l) => l.id === id)) err('duplicate-id', `${path}.id`, id)
    else ids.add(id)
    if (typeof raw.name !== 'string' || raw.name === '') err('missing-field', `${path}.name`, 'name')
    if (raw.kind !== undefined && raw.kind !== 'cup' && raw.kind !== 'supercup') err('unknown-value', `${path}.kind`, String(raw.kind))
    if (raw.country !== undefined && (typeof raw.country !== 'string' || !(NATIONALITIES as readonly string[]).includes(raw.country) || !ctx.countries.has(raw.country))) err('unknown-reference', `${path}.country`, String(raw.country))
    if (raw.region !== undefined && !(REGIONS as readonly string[]).includes(raw.region as string)) err('unknown-value', `${path}.region`, String(raw.region))
    if (raw.world !== undefined) {
      const w = raw.world
      if (!isObj(w) || !isInt(w.every) || w.every < 1 || w.every > 20 || !isInt(w.offset) || !validMonthDay(w.from)) err('out-of-range', `${path}.world`, JSON.stringify(w), '{ every: 1–20, offset: ano, from: [mês, dia] }')
      else if (raw.country !== undefined || raw.region !== undefined) err('wrong-type', `${path}.world`, 'world (sem country nem region)')
      else if (w.pause !== undefined && (!isObj(w.pause) || !validMonthDay(w.pause.from) || !validMonthDay(w.pause.to))) err('bad-date', `${path}.world.pause`, JSON.stringify(w.pause))
    }
    if (typeof raw.format !== 'string' || !FORMATS.includes(raw.format)) err(raw.format === undefined ? 'missing-field' : 'unknown-value', `${path}.format`, String(raw.format ?? 'format'))
    for (const key of ['seeding', 'homeOfSingleLeg'] as const) {
      const allowed = key === 'seeding' ? ['random', 'seeded', 'ranked'] : ['draw', 'lower-reputation', 'higher-reputation', 'lower-division', 'first-listed']
      if (raw[key] !== undefined && !allowed.includes(raw[key] as string)) err('unknown-value', `${path}.${key}`, String(raw[key]))
    }
    if (raw.weekday !== undefined && raw.weekday !== 2 && raw.weekday !== 3 && raw.weekday !== 4) err('out-of-range', `${path}.weekday`, String(raw.weekday), '2 (terça), 3 (quarta) ou 4 (quinta)')
    if (raw.excludeCups !== undefined && (!Array.isArray(raw.excludeCups) || raw.excludeCups.some((x) => typeof x !== 'string' || !cupIds.has(x) || x === id))) err('unknown-reference', `${path}.excludeCups`, 'excludeCups')
    if (raw.preliminary !== undefined && (!Array.isArray(raw.preliminary) || raw.format !== 'groups-knockout')) err('wrong-type', `${path}.preliminary`, 'preliminary (só em groups-knockout)')
    for (const key of ['awayGoals', 'extraTime', 'penalties'] as const) if (raw[key] !== undefined && typeof raw[key] !== 'boolean') err('wrong-type', `${path}.${key}`, key)
    if (raw.tiebreakers !== undefined) {
      if (!Array.isArray(raw.tiebreakers) || raw.tiebreakers.some((t) => !(TIEBREAKERS as readonly unknown[]).includes(t))) err('unknown-value', `${path}.tiebreakers`, 'tiebreakers')
      else if (raw.tiebreakers.join() !== TIEBREAKERS.join()) local.warn('tiebreakers-unsupported', `${path}.tiebreakers`)
    }

    // Vagas
    if (!Array.isArray(raw.entrants) || raw.entrants.length === 0) err('missing-field', `${path}.entrants`, 'entrants')
    // Fases
    if (!Array.isArray(raw.stages) || raw.stages.length === 0) err('missing-field', `${path}.stages`, 'stages')
    if (before.count > 0 || !Array.isArray(raw.entrants) || !Array.isArray(raw.stages)) return
    const entering: number[] = []
    raw.entrants.forEach((e, k) => {
      const p = `${path}.entrants[${k}]`
      if (!isObj(e)) return err('wrong-type', p, 'entrant')
      const ok = checkSource(e.source, `${p}.source`, local, cupIds, id)
      if (e.fallback !== undefined) checkSource(e.fallback, `${p}.fallback`, local, cupIds, id)
      if (e.stage !== undefined && (!isInt(e.stage) || e.stage < 0)) err('out-of-range', `${p}.stage`, String(e.stage), '0 ou mais')
      if (ok && isObj(e.source) && e.source.type === 'cup-group-place' && ((e.stage as number | undefined) ?? 0) < 1) err('out-of-range', `${p}.stage`, String(e.stage ?? 0), 'a vaga que depende dos grupos de outra copa entra a partir da fase 1')
      if (ok) entering[(e.stage as number | undefined) ?? 0] = (entering[(e.stage as number | undefined) ?? 0] ?? 0) + sourceCount(e.source as Obj, ctx, raws)
    })
    const stageLists: [string, unknown[]][] = [['stages', raw.stages], ['preliminary', Array.isArray(raw.preliminary) ? raw.preliminary : []]]
    for (const [listName, list] of stageLists) list.forEach((s, k) => {
      const p = `${path}.${listName}[${k}]`
      if (!isObj(s)) return err('wrong-type', p, 'stage')
      if (typeof s.name !== 'string' || s.name === '') err('missing-field', `${p}.name`, 'name')
      if (s.legs !== 1 && s.legs !== 2) err('out-of-range', `${p}.legs`, String(s.legs), '1 ou 2')
      if (!validMonthDay(s.date)) err('bad-date', `${p}.date`, JSON.stringify(s.date))
      if (s.legGap !== undefined && (!isInt(s.legGap) || s.legGap < 2 || s.legGap > 60)) err('out-of-range', `${p}.legGap`, String(s.legGap), '2–60')
    })
    if (raw.prize !== undefined) {
      const prize = raw.prize
      if (!isObj(prize)) err('wrong-type', `${path}.prize`, 'prize')
      else {
        if (prize.perStage !== undefined && (!Array.isArray(prize.perStage) || prize.perStage.some((v) => typeof v !== 'number' || v < 0))) err('out-of-range', `${path}.prize.perStage`, 'perStage', 'números de 0 em diante')
        for (const key of ['champion', 'runnerUp'] as const) if (prize[key] !== undefined && (typeof prize[key] !== 'number' || (prize[key] as number) < 0)) err('out-of-range', `${path}.prize.${key}`, String(prize[key]), '0 em diante')
      }
    }
    if (raw.discipline !== undefined) {
      const d = raw.discipline
      if (!isObj(d)) err('wrong-type', `${path}.discipline`, 'discipline')
      else {
        if (d.yellowsPerSuspension !== undefined && (!isInt(d.yellowsPerSuspension) || d.yellowsPerSuspension < 1 || d.yellowsPerSuspension > 10)) err('out-of-range', `${path}.discipline.yellowsPerSuspension`, String(d.yellowsPerSuspension), '1–10')
        if (d.redCardGames !== undefined && (!isInt(d.redCardGames) || d.redCardGames < 1 || d.redCardGames > 10)) err('out-of-range', `${path}.discipline.redCardGames`, String(d.redCardGames), '1–10')
      }
    }

    // Grupos e fase de liga
    const format = raw.format as string
    if (format === 'groups-knockout') {
      const g = raw.groups
      if (!isObj(g)) return err('missing-field', `${path}.groups`, 'groups')
      if (typeof g.name !== 'string' || g.name === '') err('missing-field', `${path}.groups.name`, 'name')
      if (!isInt(g.count) || g.count < 2 || g.count > 32) err('out-of-range', `${path}.groups.count`, String(g.count), '2–32')
      if (!isInt(g.advance) || g.advance < 1) err('out-of-range', `${path}.groups.advance`, String(g.advance), '1 ou mais')
      if (g.legs !== 1 && g.legs !== 2) err('out-of-range', `${path}.groups.legs`, String(g.legs), '1 ou 2')
      if (g.direct !== undefined && (!isInt(g.direct) || g.direct < 0 || (isInt(g.advance) && g.direct >= g.advance))) err('out-of-range', `${path}.groups.direct`, String(g.direct), 'de 0 até advance − 1')
      if (!validMonthDay(g.date)) err('bad-date', `${path}.groups.date`, JSON.stringify(g.date))
    } else if (format === 'league-knockout') {
      const lp = raw.leaguePhase
      if (!isObj(lp)) return err('missing-field', `${path}.leaguePhase`, 'leaguePhase')
      if (typeof lp.name !== 'string' || lp.name === '') err('missing-field', `${path}.leaguePhase.name`, 'name')
      for (const key of ['pots', 'matchesPerTeam', 'direct', 'playoff'] as const) if (!isInt(lp[key]) || (lp[key] as number) < 0) err('out-of-range', `${path}.leaguePhase.${key}`, String(lp[key]), '0 ou mais')
      if (!validMonthDay(lp.date)) err('bad-date', `${path}.leaguePhase.date`, JSON.stringify(lp.date))
    }
    if (before.count > 0) return

    // A conta dos clubes: cada fase de mata-mata junta os vencedores da anterior (e as folgas) aos que entram nela.
    const spec = normalizeCup(raw as unknown as PackageCup)
    const list = stageList(spec)
    const counts = list.map((_, k) => entering[k] ?? 0)
    if ((entering.length > list.length)) return err('out-of-range', `${path}.entrants`, 'stage', `0–${list.length - 1}`)
    if ((spec.prize.perStage.length > list.length)) return err('out-of-range', `${path}.prize.perStage`, String(spec.prize.perStage.length), `no máximo ${list.length} valores`)
    if (spec.discipline.clearYellowsAfterStage !== undefined && (!isInt(spec.discipline.clearYellowsAfterStage) || spec.discipline.clearYellowsAfterStage >= list.length)) return err('out-of-range', `${path}.discipline.clearYellowsAfterStage`, String(spec.discipline.clearYellowsAfterStage), `0–${list.length - 1}`)
    validateShape(spec, counts, path, local)
  })
}

function validateShape(spec: CupSpec, counts: number[], path: string, ctx: CupValidationContext): void {
  const err = (reason: string) => ctx.error('cup-bracket', path, reason)
  if (spec.format === 'knockout') {
    const r = checkBracket(spec, counts)
    if (!r.ok) err(r.reason)
    return
  }
  if (spec.format === 'groups-knockout') {
    const g = spec.groups as NonNullable<CupSpec['groups']>
    // Fases preliminares: os vencedores vão para os grupos, junto com quem entra neles.
    const prelim = checkPreliminary(spec, counts)
    if (!prelim.ok) return err(prelim.reason)
    const groupsAt = spec.preliminary?.length ?? 0
    const clubs = prelim.out + (counts[groupsAt] ?? 0)
    if (clubs % g.count !== 0) return ctx.error('cup-groups', `${path}.groups.count`, `${clubs} clubes não se repartem em ${g.count} grupos iguais`)
    const size = clubs / g.count
    if (size < 2 || size % 2 !== 0) return ctx.error('cup-groups', `${path}.groups.count`, `cada grupo precisa de um número par de clubes (tem ${size})`)
    if (g.advance >= size) return ctx.error('cup-groups', `${path}.groups.advance`, `passam ${g.advance} de ${size} clubes por grupo`)
    const direct = g.direct ?? 0
    const r = checkBracket(spec, counts, { first: g.count * (g.advance - direct), ...(direct > 0 ? { later: g.count * direct } : {}) })
    if (!r.ok) err(r.reason)
    return
  }
  const lp = spec.leaguePhase as NonNullable<CupSpec['leaguePhase']>
  const clubs = counts[0] ?? 0
  if (clubs % lp.pots !== 0 || lp.pots < 2) return ctx.error('cup-groups', `${path}.leaguePhase.pots`, `${clubs} clubes não se repartem em ${lp.pots} potes iguais`)
  const potSize = clubs / lp.pots
  if (lp.matchesPerTeam % (2 * lp.pots) !== 0) return ctx.error('cup-groups', `${path}.leaguePhase.matchesPerTeam`, `precisa ser múltiplo de ${2 * lp.pots} (jogos iguais contra cada pote, metade em casa)`)
  if (lp.matchesPerTeam / lp.pots >= potSize) return ctx.error('cup-groups', `${path}.leaguePhase.matchesPerTeam`, 'jogos demais contra cada pote')
  if (lp.direct + lp.playoff > clubs || lp.playoff % 2 !== 0) return ctx.error('cup-groups', `${path}.leaguePhase.playoff`, 'o playoff precisa ter número par de clubes e caber na tabela')
  const r = checkBracket(spec, counts, { first: lp.playoff, later: lp.direct })
  if (!r.ok) err(r.reason)
}

