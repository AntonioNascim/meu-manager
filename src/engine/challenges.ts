/**
 * Desafios do início de carreira (estudo do concorrente, Parte 5): sugestões de clube com meta e estrelas. O jogador aceita um ao começar; ao
 * fim de cada temporada o desafio é conferido pela posição final e, se foi cumprido, vira uma conquista guardada (com as estrelas, sem prêmio).
 * Também sorteia as quatro propostas de clubes da tela inicial. Funções puras: tudo sai da semente e do mundo, sem `Math.random`.
 */
import { hashSeed } from './rng'
import { playerOverall } from './overall'
import type { Player, Team, TeamId } from './types'

export const CHALLENGE_KINDS = ['survive', 'continental', 'title', 'humble'] as const
export type ChallengeKind = (typeof CHALLENGE_KINDS)[number]

export interface Challenge {
  id: string
  kind: ChallengeKind
  teamId: TeamId
  /** Posição final da liga que cumpre o desafio (ou melhor). */
  targetPosition: number
  /** Em quantas temporadas (1 ou 2) e quantas estrelas vale (1 a 5). */
  seasons: 1 | 2
  stars: 1 | 2 | 3 | 4 | 5
  /** Divisão em que a meta vale (1 = a primeira). */
  tier: number
}

/** O desafio aceito: segue enquanto o técnico está no clube, até acabar o prazo. */
export interface ActiveChallenge extends Challenge {
  startYear: number
  seasonsPlayed: number
}

export interface Conquest {
  id: string
  kind: ChallengeKind
  teamId: TeamId
  teamName: string
  stars: number
  year: number
  /** Em quantas temporadas foi cumprido. */
  seasonsTaken: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const rngOf = (seed: number | string) => {
  let a = hashSeed(String(seed)) || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T>(list: readonly T[], r: () => number): T | undefined => list[Math.floor(r() * list.length)]

export interface WorldLike {
  teams: readonly Team[]
  players: readonly Player[]
}

interface Ranked {
  team: Team
  strength: number
  budget: number
}

/** Os clubes de cada liga (país e divisão), com a força dos onze e o orçamento, do mais forte ao mais fraco. */
function leagues(world: WorldLike): Map<string, Ranked[]> {
  const byId = new Map(world.players.map((p) => [p.id, p]))
  const out = new Map<string, Ranked[]>()
  for (const team of world.teams) {
    const xi = team.tactic.startingXI.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined)
    const strength = xi.reduce((s, p) => s + playerOverall(p), 0) / Math.max(1, xi.length)
    const key = `${team.country ?? 'Brazil'}:${team.tier}`
    out.set(key, [...(out.get(key) ?? []), { team, strength, budget: team.finances.transferBudget }])
  }
  for (const list of out.values()) list.sort((a, b) => b.strength - a.strength || a.team.id.localeCompare(b.team.id))
  return out
}

/** Estrelas: quanto a meta está longe da força do clube (de 1 a 5), uma a menos se o prazo é de duas temporadas. */
export function starsOf(rank: number, target: number, size: number, seasons: 1 | 2): 1 | 2 | 3 | 4 | 5 {
  const d = size <= target ? 0 : (rank - target) / (size - target)
  return clamp(Math.round(1 + 4 * clamp(d, 0, 1)) - (seasons === 2 ? 1 : 0), 1, 5) as 1 | 2 | 3 | 4 | 5
}

/** Quatro desafios, um de cada tipo quando o mundo permite, sorteados pela semente (a mesma semente dá os mesmos). */
export function drawChallenges(world: WorldLike, seed: number | string, round = 0): Challenge[] {
  const r = rngOf(`${seed}:challenges:${round}`)
  const firsts = [...leagues(world).entries()].filter(([key, list]) => key.endsWith(':1') && list.length >= 12)
  if (firsts.length === 0) return []
  const out: Challenge[] = []
  const used = new Set<TeamId>()
  const add = (kind: ChallengeKind, list: Ranked[], rank: number, target: number, seasons: 1 | 2) => {
    const row = list[rank]
    if (!row || used.has(row.team.id)) return
    used.add(row.team.id)
    out.push({ id: `${kind}:${row.team.id}`, kind, teamId: row.team.id, targetPosition: target, seasons, stars: starsOf(rank + 1, target, list.length, seasons), tier: 1 })
  }
  const league = () => (pick(firsts, r) as (typeof firsts)[number])[1]
  // Salvar do rebaixamento: um dos quatro mais fracos; a meta é ficar fora dos últimos 4.
  {
    const l = league()
    add('survive', l, l.length - 1 - Math.floor(r() * 4), l.length - 4, 1)
  }
  // Vaga continental: do 7º ao 12º mais forte, a meta é o 6º ou melhor.
  {
    const l = league()
    add('continental', l, 6 + Math.floor(r() * Math.min(6, l.length - 7)), 6, 1)
  }
  // Título: um dos três mais fortes, em até duas temporadas.
  {
    const l = league()
    add('title', l, Math.floor(r() * 3), 1, 2)
  }
  // Humildes: o menor orçamento da liga, meio da tabela em até duas temporadas.
  {
    const l = [...league()].sort((a, b) => a.budget - b.budget || a.team.id.localeCompare(b.team.id))
    const row = l[0]
    if (row && !used.has(row.team.id)) {
      const byStrength = leagues(world).get(`${row.team.country ?? 'Brazil'}:${row.team.tier}`) ?? l
      used.add(row.team.id)
      const target = Math.ceil(byStrength.length / 2)
      out.push({ id: `humble:${row.team.id}`, kind: 'humble', teamId: row.team.id, targetPosition: target, seasons: 2, stars: starsOf(byStrength.findIndex((x) => x.team.id === row.team.id) + 1, target, byStrength.length, 2), tier: 1 })
    }
  }
  return out
}

/** Começa o desafio aceito. */
export const startChallenge = (c: Challenge, year: number): ActiveChallenge => ({ ...c, startYear: year, seasonsPlayed: 0 })

/**
 * Confere o desafio no fim de uma temporada. Cumprido: vira conquista. Prazo esgotado, ou o técnico saiu do clube ou da divisão: acaba sem
 * registro. Senão segue para a próxima temporada.
 */
export function evaluateChallenge(
  active: ActiveChallenge | undefined,
  summary: { year: number; userTeamId: TeamId; userTier: number; userPosition: number },
  teamName: string,
): { active?: ActiveChallenge; conquest?: Conquest } {
  if (!active) return {}
  if (summary.userTeamId !== active.teamId) return {}
  const played = active.seasonsPlayed + 1
  if (summary.userTier === active.tier && summary.userPosition <= active.targetPosition) {
    return { conquest: { id: active.id, kind: active.kind, teamId: active.teamId, teamName, stars: active.stars, year: summary.year, seasonsTaken: played } }
  }
  return played >= active.seasons ? {} : { active: { ...active, seasonsPlayed: played } }
}

// ---------------------------------------------------------------------------
// Propostas de clubes
// ---------------------------------------------------------------------------

export type OfferKind = 'title-hopeful' | 'continental' | 'mid-table' | 'avoid-relegation' | 'lower-division'

export interface ClubOffer {
  teamId: TeamId
  kind: OfferKind
  /** A posição final que a diretoria espera (da meta do clube). */
  expectedPosition: number
  /** Contagem regressiva visual, em segundos. */
  seconds: number
}

/** Quatro propostas: de clubes diferentes (um forte, dois médios, um pequeno), de países e divisões variados, sorteadas pela semente e pela rodada. */
export function drawOffers(world: WorldLike, seed: number | string, round = 0, n = 4): ClubOffer[] {
  const r = rngOf(`${seed}:offers:${round}`)
  const all = [...leagues(world).entries()].filter(([, list]) => list.length >= 8)
  if (all.length === 0) return []
  const out: ClubOffer[] = []
  const used = new Set<TeamId>()
  const bands: [number, number][] = [
    [0, 0.2],
    [0.25, 0.55],
    [0.4, 0.75],
    [0.7, 1],
  ]
  for (let i = 0; i < n; i++) {
    const [lo, hi] = bands[i % bands.length] as [number, number]
    for (let attempt = 0; attempt < 12; attempt++) {
      // A primeira proposta é de um clube forte: vem sempre de uma primeira divisão.
      const pool = i === 0 ? all.filter(([key]) => key.endsWith(':1')) : all
      const [, list] = pick(pool.length > 0 ? pool : all, r) as (typeof all)[number]
      const rank = clamp(Math.floor((lo + (hi - lo) * r()) * list.length), 0, list.length - 1)
      const row = list[rank] as Ranked
      if (used.has(row.team.id)) continue
      used.add(row.team.id)
      const share = rank / list.length
      const kind: OfferKind = row.team.tier > 1 ? 'lower-division' : share < 0.2 ? 'title-hopeful' : share < 0.45 ? 'continental' : share < 0.75 ? 'mid-table' : 'avoid-relegation'
      out.push({ teamId: row.team.id, kind, expectedPosition: row.team.objective.targetPosition, seconds: 60 + Math.floor(r() * 61) })
      break
    }
  }
  return out
}
