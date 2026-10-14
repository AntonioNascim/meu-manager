import { FORMATION_TIE_TOLERANCE } from '../engine/config'
import { defaultTicketPrice } from '../engine/finance'
import { buildTactic, rankFormations } from '../engine/lineup'
import { FORMATION_IDS, getFormation } from '../engine/formations'
import type { Rng } from '../engine/rng'
import type { Mentality, Player, PlayStyle, Position, Team } from '../engine/types'
import { createGenerationContext, generatePlayer, pickAge } from './generatePlayer'
import type { GenerationContext } from './generatePlayer'
import { GENERATION } from './generationConfig'
import type { TeamDefinition } from './teamDefinitions'

export { createGenerationContext }

type Role = 'starter' | 'backup'

type SquadSlot = { position: Position; role: Role }

/** 24 jogadores: o mínimo que cobre qualquer uma das formações com banco. */
const CORE_TEMPLATE: readonly SquadSlot[] = [
  { position: 'GK', role: 'starter' }, { position: 'GK', role: 'backup' },
  { position: 'RB', role: 'starter' }, { position: 'RB', role: 'backup' },
  { position: 'LB', role: 'starter' }, { position: 'LB', role: 'backup' },
  { position: 'CB', role: 'starter' }, { position: 'CB', role: 'starter' }, { position: 'CB', role: 'backup' },
  { position: 'DM', role: 'starter' }, { position: 'DM', role: 'starter' }, { position: 'DM', role: 'backup' },
  { position: 'CM', role: 'starter' }, { position: 'CM', role: 'starter' }, { position: 'CM', role: 'backup' },
  { position: 'AM', role: 'starter' }, { position: 'AM', role: 'backup' },
  { position: 'RW', role: 'starter' }, { position: 'RW', role: 'backup' },
  { position: 'LW', role: 'starter' }, { position: 'LW', role: 'backup' },
  { position: 'ST', role: 'starter' }, { position: 'ST', role: 'starter' }, { position: 'ST', role: 'backup' },
]

/** Reservas de profundidade, na ordem em que entram conforme o elenco cresce (até 30). */
const DEPTH_TEMPLATE: readonly SquadSlot[] = [
  { position: 'CB', role: 'backup' },
  { position: 'GK', role: 'backup' },
  { position: 'CM', role: 'backup' },
  { position: 'ST', role: 'backup' },
  { position: 'AM', role: 'backup' },
  { position: 'RW', role: 'backup' },
]

const SQUAD_SIZE_MIN = CORE_TEMPLATE.length
const SQUAD_SIZE_MAX = CORE_TEMPLATE.length + DEPTH_TEMPLATE.length

/** Entre 24 e 30 jogadores; times de maior reputação tendem a ter elencos maiores. */
export function squadSizeForReputation(rng: Rng, reputation: number): number {
  const expected = SQUAD_SIZE_MIN + ((reputation - 3) / 16) * (SQUAD_SIZE_MAX - SQUAD_SIZE_MIN)
  return Math.min(SQUAD_SIZE_MAX, Math.max(SQUAD_SIZE_MIN, Math.round(expected + rng.normal(0, 0.9))))
}

const MIN_VETERANS = 2
const MIN_PROSPECTS = 3
const VETERAN_AGE = 32
const PROSPECT_MAX_AGE = 20

/** Força média esperada dos 11 titulares, a partir da série e da reputação (1 a 20) do time. */
export function teamLevelFor(def: Pick<TeamDefinition, 'tier' | 'reputation'>): number {
  const { base, referenceReputation, perReputation } = GENERATION.teamLevel[def.tier]
  return base + (def.reputation - referenceReputation) * perReputation
}

/** Chance de cada titular ser um craque: zero fora da Série A, cresce com a reputação. */
export function starChance(def: Pick<TeamDefinition, 'tier' | 'reputation'>): number {
  const { minReputation, maxChance } = GENERATION.star
  if (def.tier !== 1 || def.reputation < minReputation) return 0
  return (maxChance * (def.reputation - (minReputation - 1))) / (19 - (minReputation - 1))
}

/** Idades de todo o elenco, garantindo veteranos e promessas em todo time. */
function assignAges(rng: Rng, template: readonly SquadSlot[]): number[] {
  const ages = template.map(() => pickAge(rng))
  const outfield = template.map((_, i) => i).filter((i) => template[i]?.position !== 'GK')

  const isVeteran = (i: number) => (ages[i] ?? 0) >= VETERAN_AGE
  const isProspect = (i: number) => (ages[i] ?? 99) <= PROSPECT_MAX_AGE

  while (outfield.filter(isVeteran).length < MIN_VETERANS) {
    const candidates = outfield.filter((i) => !isVeteran(i) && !isProspect(i))
    ages[rng.pick(candidates)] = rng.int(VETERAN_AGE, 36)
  }
  while (outfield.filter(isProspect).length < MIN_PROSPECTS) {
    const candidates = outfield.filter((i) => !isVeteran(i) && !isProspect(i))
    ages[rng.pick(candidates)] = rng.int(17, PROSPECT_MAX_AGE)
  }
  return ages
}

export function pickStyle(rng: Rng, reputation: number): PlayStyle {
  const weights: Record<PlayStyle, number> =
    reputation >= 15
      ? { possession: 55, 'counter-attack': 25, 'high-press': 20 }
      : { possession: 25, 'counter-attack': 45, 'high-press': 30 }
  const styles = Object.keys(weights) as PlayStyle[]
  return rng.weighted(styles, (s) => weights[s])
}

export function pickMentality(rng: Rng, reputation: number): Mentality {
  if (reputation >= 16) return rng.chance(0.6) ? 1 : 0
  if (reputation <= 8) return rng.chance(0.4) ? -1 : 0
  return 0
}

export interface GeneratedTeam {
  team: Team
  players: Player[]
}

/**
 * Gera um time completo (elenco, tática, finanças, meta da diretoria).
 * `rank` é a posição do time na sua série por reputação (1 = mais forte).
 */
export function generateTeam(rng: Rng, ctx: GenerationContext, def: TeamDefinition, rank: number): GeneratedTeam {
  const id = `team-${def.abbreviation.toLowerCase()}`
  const teamLevel = teamLevelFor(def) + rng.normal(0, GENERATION.teamLevelSd)
  const squadSize = squadSizeForReputation(rng, def.reputation)
  const template = [...CORE_TEMPLATE, ...DEPTH_TEMPLATE].slice(0, squadSize)
  const ages = assignAges(rng, template)

  const players = template.map((slot, i) => {
    const isStarter = slot.role === 'starter'
    let quality = teamLevel + rng.normal(0, GENERATION.talentSd) - (isStarter ? 0 : GENERATION.backupPenalty)
    // Craque raro: só entre os titulares de times grandes da Série A.
    if (isStarter && rng.chance(starChance(def))) {
      quality += rng.float(GENERATION.star.bonusMin, GENERATION.star.bonusMax)
    }
    return generatePlayer(rng, ctx, { position: slot.position, quality, age: ages[i] ?? 25, teamId: id })
  })

  // A formação é a que melhor encaixa os melhores jogadores (sorteia entre as quase empatadas).
  const ranking = rankFormations(players, FORMATION_IDS.map(getFormation))
  const best = ranking[0]?.score ?? 0
  const nearBest = ranking.filter((r) => r.score >= best * (1 - FORMATION_TIE_TOLERANCE))
  const formationId = rng.pick(nearBest).formationId

  const tactic = buildTactic(players, {
    formationId,
    style: pickStyle(rng, def.reputation),
    mentality: pickMentality(rng, def.reputation),
  })

  const monthlyPayroll = players.reduce((sum, p) => sum + p.contract.salary, 0)
  const balance = Math.round((def.reputation ** 2 * 400_000 * rng.float(0.85, 1.15)) / 10_000) * 10_000
  const target = Math.min(rank, 16)

  const team: Team = {
    id,
    name: def.name,
    abbreviation: def.abbreviation,
    city: def.city,
    state: def.state,
    colors: def.colors,
    stadium: {
      name: def.tier === 1 && def.reputation >= 11 ? `Arena ${def.name.split(' ')[0]}` : `Estádio Municipal de ${def.city}`,
      capacity: Math.round((9_000 + def.reputation * 3_600 + rng.int(-1_500, 1_500)) / 500) * 500,
    },
    reputation: def.reputation,
    squad: players.map((p) => p.id),
    tactic,
    finances: {
      balance,
      salaryBudget: Math.round((monthlyPayroll * 1.1) / 1_000) * 1_000,
      transferBudget: Math.round((balance * 0.25) / 10_000) * 10_000,
      ledger: [],
      pastSeasons: [],
      budgetShift: 0,
      purchaseBonus: 0,
      fundsRequests: [],
    },
    fanBase: Math.round((def.reputation ** 2.5 * 12_000 * rng.float(0.85, 1.15)) / 1_000) * 1_000,
    ticketPrice: defaultTicketPrice(def.reputation),
    objective: { targetPosition: target, sackingPosition: Math.min(20, target + 6) },
    history: [],
    tier: def.tier,
  }

  return { team, players }
}
