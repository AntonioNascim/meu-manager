/**
 * Sorteios das copas: mata-mata (com ou sem cabeças de chave e folgas), grupos e fase de liga. Tudo puro e com a semente dada,
 * então o mesmo sorteio sai sempre igual. A "força" de seed é a reputação do clube (empate: id).
 */
import type { Rng } from '../rng'
import { buildLeagueRounds } from '../season/schedule'
import type { Fixture } from '../season/schedule'
import type { CupLeaguePhaseSpec, TeamId } from '../types'
import { knockoutShape } from './plan'

export type Strength = (teamId: TeamId) => number

/** Do mais forte ao mais fraco (reputação; empate pelo id, para o resultado não depender da ordem da lista). */
export function seedOrder(teamIds: readonly TeamId[], strength: Strength): TeamId[] {
  return [...teamIds].sort((a, b) => strength(b) - strength(a) || a.localeCompare(b))
}

export interface DrawnTie {
  /** [primeiro sorteado, segundo]. Na ida e volta o primeiro joga em casa a ida; no jogo único, quem manda é a regra da copa. */
  teams: [TeamId, TeamId]
}

export interface KnockoutDraw {
  ties: DrawnTie[]
  /** Clubes que folgam (passam direto). */
  byes: TeamId[]
}

/**
 * Sorteio de uma fase de mata-mata. Com cabeças de chave (`seeded`), os melhores ficam com as folgas e cada confronto junta um
 * cabeça de chave (metade de cima) a um não cabeça. Sem elas, tudo é sorteado, folgas incluídas.
 */
export function drawKnockout(participants: readonly TeamId[], seeded: boolean, strength: Strength, rng: Rng): KnockoutDraw {
  const shape = knockoutShape(participants.length)
  const order = seeded ? seedOrder(participants, strength) : rng.shuffle(participants)
  const byes = order.slice(0, shape.byes)
  const playing = order.slice(shape.byes)
  const ties: DrawnTie[] = []
  if (seeded) {
    const half = playing.length / 2
    const top = playing.slice(0, half)
    const bottom = rng.shuffle(playing.slice(half))
    // O não cabeça de chave é o primeiro sorteado: faz a ida em casa e o cabeça de chave decide em casa.
    top.forEach((seed, i) => ties.push({ teams: [bottom[i] as TeamId, seed] }))
  } else {
    for (let i = 0; i + 1 < playing.length; i += 2) ties.push({ teams: [playing[i] as TeamId, playing[i + 1] as TeamId] })
  }
  return { ties: rng.shuffle(ties), byes }
}

/** Grupos: com cabeças de chave, os clubes são separados em potes pela força e cada grupo recebe um de cada pote; senão, tudo sorteado. */
export function drawGroups(teamIds: readonly TeamId[], count: number, seeded: boolean, strength: Strength, rng: Rng): TeamId[][] {
  const size = Math.floor(teamIds.length / count)
  const groups: TeamId[][] = Array.from({ length: count }, () => [])
  if (seeded) {
    const order = seedOrder(teamIds, strength)
    for (let pot = 0; pot < size; pot++) {
      const slice = rng.shuffle(order.slice(pot * count, pot * count + count))
      slice.forEach((id, g) => groups[g]?.push(id))
    }
  } else {
    rng.shuffle(teamIds).forEach((id, i) => groups[i % count]?.push(id))
  }
  return groups
}

/** Jogos de um grupo (ida, ou ida e volta), rodada a rodada. */
export function groupRounds(teamIds: readonly TeamId[], legs: 1 | 2, rng: Rng): Fixture[][] {
  return buildLeagueRounds(teamIds, rng, legs)
}

export interface LeaguePhaseDraw {
  /** Jogos já em datas (cada clube joga no máximo uma vez por data); `home` e `away` definem o mando. */
  matchdays: Fixture[][]
}

/**
 * Fase de liga: os clubes são separados em potes pela força e cada um enfrenta o mesmo tanto de rivais de cada pote (inclusive o
 * seu), metade em casa e metade fora quando dá. Cada par de potes é ligado por permutações deslocadas (cada clube recebe `k`
 * rivais diferentes do outro pote) e o próprio pote por ciclos deslocados. As partidas são distribuídas em datas sem repetir clube.
 */
export function drawLeaguePhase(teamIds: readonly TeamId[], spec: Pick<CupLeaguePhaseSpec, 'pots' | 'matchesPerTeam'>, strength: Strength, rng: Rng): LeaguePhaseDraw {
  const { pots: potCount, matchesPerTeam } = spec
  const order = seedOrder(teamIds, strength)
  const potSize = order.length / potCount
  const pots: TeamId[][] = Array.from({ length: potCount }, (_, p) => rng.shuffle(order.slice(p * potSize, (p + 1) * potSize)))
  const k = matchesPerTeam / potCount
  const fixtures: Fixture[] = []
  for (let a = 0; a < potCount; a++) {
    for (let b = a; b < potCount; b++) {
      const A = pots[a] as TeamId[]
      const B = pots[b] as TeamId[]
      if (a === b) {
        // Ciclos deslocados dentro do pote: k/2 ligações por clube, cada clube joga metade em casa e metade fora.
        for (let shift = 1; shift <= k / 2; shift++) A.forEach((id, i) => fixtures.push({ homeTeamId: id, awayTeamId: A[(i + shift) % A.length] as TeamId }))
      } else {
        const permutation = rng.shuffle(B)
        for (let j = 0; j < k; j++) {
          A.forEach((id, i) => {
            const other = permutation[(i + j) % permutation.length] as TeamId
            fixtures.push(j % 2 === 0 ? { homeTeamId: id, awayTeamId: other } : { homeTeamId: other, awayTeamId: id })
          })
        }
      }
    }
  }
  // Distribui em datas: cada clube joga uma vez por data.
  const matchdays: Fixture[][] = []
  const busy: Set<TeamId>[] = []
  for (const f of rng.shuffle(fixtures)) {
    let day = busy.findIndex((set) => !set.has(f.homeTeamId) && !set.has(f.awayTeamId))
    if (day < 0) {
      busy.push(new Set())
      matchdays.push([])
      day = busy.length - 1
    }
    busy[day]?.add(f.homeTeamId)
    busy[day]?.add(f.awayTeamId)
    matchdays[day]?.push(f)
  }
  return { matchdays }
}
