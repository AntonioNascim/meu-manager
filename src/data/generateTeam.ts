import { buildTactic } from '../engine/lineup'
import { FORMATION_IDS } from '../engine/formations'
import type { Rng } from '../engine/rng'
import type { Mentality, Player, PlayStyle, Position, Team } from '../engine/types'
import { createGenerationContext, generatePlayer, pickAge } from './generatePlayer'
import type { GenerationContext } from './generatePlayer'
import type { TeamDefinition } from './teamDefinitions'

export { createGenerationContext }

type Role = 'starter' | 'backup'

/** 26 jogadores: cobre qualquer uma das formações com banco. */
const SQUAD_TEMPLATE: readonly { position: Position; role: Role }[] = [
  { position: 'GK', role: 'starter' }, { position: 'GK', role: 'backup' }, { position: 'GK', role: 'backup' },
  { position: 'RB', role: 'starter' }, { position: 'RB', role: 'backup' },
  { position: 'LB', role: 'starter' }, { position: 'LB', role: 'backup' },
  { position: 'CB', role: 'starter' }, { position: 'CB', role: 'starter' },
  { position: 'CB', role: 'backup' }, { position: 'CB', role: 'backup' },
  { position: 'DM', role: 'starter' }, { position: 'DM', role: 'starter' }, { position: 'DM', role: 'backup' },
  { position: 'CM', role: 'starter' }, { position: 'CM', role: 'starter' }, { position: 'CM', role: 'backup' },
  { position: 'AM', role: 'starter' }, { position: 'AM', role: 'backup' },
  { position: 'RW', role: 'starter' }, { position: 'RW', role: 'backup' },
  { position: 'LW', role: 'starter' }, { position: 'LW', role: 'backup' },
  { position: 'ST', role: 'starter' }, { position: 'ST', role: 'starter' }, { position: 'ST', role: 'backup' },
]

const MIN_VETERANS = 2
const MIN_PROSPECTS = 3
const VETERAN_AGE = 32
const PROSPECT_MAX_AGE = 20

/** Nível-base dos atributos a partir da reputação do time. */
export function qualityForReputation(reputation: number): number {
  return 5 + 0.58 * reputation
}

/** Idades de todo o elenco, garantindo veteranos e promessas em todo time. */
function assignAges(rng: Rng): number[] {
  const ages = SQUAD_TEMPLATE.map(() => pickAge(rng))
  const outfield = SQUAD_TEMPLATE.map((_, i) => i).filter((i) => SQUAD_TEMPLATE[i]?.position !== 'GK')

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

function pickStyle(rng: Rng, reputation: number): PlayStyle {
  const weights: Record<PlayStyle, number> =
    reputation >= 15
      ? { possession: 55, 'counter-attack': 25, 'high-press': 20 }
      : { possession: 25, 'counter-attack': 45, 'high-press': 30 }
  const styles = Object.keys(weights) as PlayStyle[]
  return rng.weighted(styles, (s) => weights[s])
}

function pickMentality(rng: Rng, reputation: number): Mentality {
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
  const teamLevel = qualityForReputation(def.reputation) + rng.normal(0, 0.35)
  const ages = assignAges(rng)

  const players = SQUAD_TEMPLATE.map((slot, i) => {
    const talent = rng.normal(0, 1.3)
    const roleBonus = slot.role === 'starter' ? 0.8 : -0.9
    return generatePlayer(rng, ctx, {
      position: slot.position,
      quality: teamLevel + talent + roleBonus,
      age: ages[i] ?? 25,
      teamId: id,
    })
  })

  const tactic = buildTactic(players, {
    formationId: rng.pick(FORMATION_IDS),
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
    },
    fanBase: Math.round((def.reputation ** 2.5 * 12_000 * rng.float(0.85, 1.15)) / 1_000) * 1_000,
    ticketPrice: Math.round(20 + def.reputation * 3),
    objective: { targetPosition: target, sackingPosition: Math.min(20, target + 6) },
    history: [],
    tier: def.tier,
  }

  return { team, players }
}
