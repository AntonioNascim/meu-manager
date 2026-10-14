/**
 * Perfil de uma formação para o motor, a partir das vagas (papéis) que ela tem, não do nome. As formações prontas
 * têm o perfil calibrado em `MATCH.formation.profile`; uma grade livre herda o da pronta mais parecida (a que difere
 * em menos jogadores) com um imposto por jogador diferente, para que montar o time à mão nunca saia de graça.
 */
import { MATCH } from '../config'
import { FORMATION_IDS, getFormation } from '../formations'
import type { Formation } from '../types'

export interface FormationProfile {
  control: number
  attack: number
  /** Grade fora das formações prontas (os ganhos de controle e de progressão têm teto: o das prontas). */
  custom: boolean
}

const multiset = (f: Formation): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const s of f.slots) {
    const key = `${s.position}:${s.sector}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** Quantos jogadores teriam de mudar de papel para um time virar o outro. */
function distance(a: Map<string, number>, b: Map<string, number>): number {
  let diff = 0
  for (const key of new Set([...a.keys(), ...b.keys()])) diff += Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0))
  return diff / 2
}

/** Jogadores de `a` cujo papel não existe em `b` (com 11 contra 11 é o mesmo que `distance`; time reduzido não paga pelo que falta). */
function unmatched(a: Map<string, number>, b: Map<string, number>): number {
  let n = 0
  for (const [key, count] of a) n += Math.max(0, count - (b.get(key) ?? 0))
  return n
}

const READY = FORMATION_IDS.map((id) => ({ id, roles: multiset(getFormation(id)), profile: MATCH.formation.profile[id] as { control: number; attack: number } }))
const cache = new Map<string, FormationProfile>()

export function profileOf(formation: Formation): FormationProfile {
  const roles = multiset(formation)
  const key = [...roles.entries()].sort(([a], [b]) => a.localeCompare(b)).join('|')
  const known = cache.get(key)
  if (known) return known
  const short = formation.slots.length < 11
  const scored = READY.map((r) => ({ r, d: short ? unmatched(roles, r.roles) : distance(roles, r.roles) }))
  const nearest = Math.min(...scored.map((s) => s.d))
  const tied = scored.filter((s) => s.d === nearest)
  // Time reduzido (expulsão ou lesão sem troca): o custo de ficar sem gente já vem dos buracos e do jogador a menos;
  // reorganizar não paga imposto de papel, senão cobrir o setor vazio sairia mais caro que não mexer.
  const tax = short ? { control: 0, attack: 0 } : MATCH.grid.distanceTax
  const profile: FormationProfile = {
    custom: nearest > 0,
    control: tied.reduce((sum, s) => sum + s.r.profile.control, 0) / tied.length - tax.control * nearest,
    attack: tied.reduce((sum, s) => sum + s.r.profile.attack, 0) / tied.length - tax.attack * nearest,
  }
  cache.set(key, profile)
  return profile
}

export interface FormationGaps {
  /** Defensores que faltam para o mínimo (`MATCH.grid.minDefenders`). */
  defense: number
  /** Meio-campistas que faltam para o mínimo. */
  midfield: number
  /** Por faixa do ATACANTE (0 a 4): jogadores que faltam na cobertura da faixa que o enfrenta (a espelhada e as vizinhas). */
  flank: number[]
}

const gapsCache = new WeakMap<Formation, FormationGaps>()

/**
 * Buracos da formação, pelas vagas. Com menos de 11 em campo as vagas são as de quem sobrou (o lugar de quem saiu fica vazio).
 * As formações prontas não têm nenhum: só o posicionamento livre pode deixar linhas e faixas sem gente.
 */
export function gapsOf(formation: Formation): FormationGaps {
  const known = gapsCache.get(formation)
  if (known) return known
  const g = MATCH.grid
  const outfield = formation.slots.map((slot, i) => ({ slot, point: formation.grid[i] })).filter((v) => v.slot.position !== 'GK')
  const count = (sector: 'defense' | 'midfield') => outfield.filter((v) => v.slot.sector === sector).length
  const lanes = formation.grid.reduce((n, p) => Math.max(n, p.lane + 1), 5)
  const flank = Array.from({ length: Math.max(5, lanes) }, (_, attackerLane) => {
    const facing = 4 - attackerLane
    const cover = outfield.filter((v) => v.slot.sector !== 'attack' && v.point && Math.abs(v.point.lane - facing) <= 1).length
    return Math.max(0, g.flankCover - cover)
  })
  const gaps = { defense: Math.max(0, g.minDefenders - count('defense')), midfield: Math.max(0, g.minMidfielders - count('midfield')), flank }
  gapsCache.set(formation, gaps)
  return gaps
}

/**
 * Teto dos ganhos de uma grade livre: o maior que alguma formação pronta consegue (controle do meio e progressão a
 * favor), já somando os efeitos por jogador de cada setor. Sem ele, encher o meio de gente renderia mais que qualquer
 * formação calibrada.
 */
export const READY_CAPS = (() => {
  const f = MATCH.formation
  const nets = FORMATION_IDS.map((id) => {
    const formation = getFormation(id)
    const count = (sector: string) => formation.slots.filter((s) => s.sector === sector && s.position !== 'GK').length
    const profile = MATCH.formation.profile[id] as { control: number; attack: number }
    return { control: f.perMidfielder * (count('midfield') - f.referenceMidfielders) + profile.control, attack: f.perAttacker * (count('attack') - f.referenceAttackers) + profile.attack }
  })
  return { control: Math.max(...nets.map((n) => n.control)), attack: Math.max(...nets.map((n) => n.attack)) }
})()
