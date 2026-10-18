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
  return { matchdays: spreadInDays(rng.shuffle(fixtures), matchesPerTeam, rng) }
}

/**
 * Distribui os jogos em datas, cada clube jogando uma vez por data, com o menor número de datas que der (a quantidade de jogos por clube,
 * ou uma a mais): coloração de arestas de um grafo, com troca de cores ao longo de caminhos alternados (cadeias de Kempe) quando não há cor
 * livre nos dois clubes. Sem isso a distribuição gulosa precisava de bem mais datas e a fase de liga se espalhava pela temporada inteira.
 */
export function spreadInDays(fixtures: readonly Fixture[], perTeam: number, rng: Rng): Fixture[][] {
  for (let colors = perTeam; colors <= perTeam + 6; colors++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const days = tryColoring(attempt === 0 ? fixtures : rng.shuffle(fixtures), colors, rng)
      if (days) return days
    }
  }
  // Último recurso: distribuição gulosa (sempre dá certo, só usa mais datas).
  const matchdays: Fixture[][] = []
  const busy: Set<TeamId>[] = []
  for (const f of fixtures) {
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
  return matchdays
}

function tryColoring(fixtures: readonly Fixture[], colors: number, rng: Rng): Fixture[][] | undefined {
  const at = new Map<TeamId, (number | undefined)[]>()
  const slots = (id: TeamId) => {
    let list = at.get(id)
    if (!list) at.set(id, (list = Array<number | undefined>(colors).fill(undefined)))
    return list
  }
  const color: number[] = Array(fixtures.length).fill(-1)
  const ends = (e: number): [TeamId, TeamId] => [(fixtures[e] as Fixture).homeTeamId, (fixtures[e] as Fixture).awayTeamId]
  const other = (e: number, id: TeamId): TeamId => (ends(e)[0] === id ? ends(e)[1] : ends(e)[0])
  const free = (id: TeamId) => slots(id).flatMap((x, c) => (x === undefined ? [c] : []))

  for (let e = 0; e < fixtures.length; e++) {
    const [u, v] = ends(e)
    const freeU = free(u)
    const freeV = free(v)
    let chosen = freeU.find((c) => freeV.includes(c))
    if (chosen === undefined) {
      // Troca de cores ao longo do caminho alternado que sai de v: libera a cor c1 em v sem tirá-la de u.
      for (const c1 of rng.shuffle(freeU)) {
        for (const c2 of rng.shuffle(freeV)) {
          const path: number[] = []
          let at_ = v
          let want = c1
          for (;;) {
            const edge = slots(at_)[want]
            if (edge === undefined) break
            path.push(edge)
            at_ = other(edge, at_)
            want = want === c1 ? c2 : c1
          }
          const touchesU = path.some((edge) => ends(edge).includes(u))
          if (touchesU) continue
          for (const edge of path) {
            const [a, b] = ends(edge)
            slots(a)[color[edge] as number] = undefined
            slots(b)[color[edge] as number] = undefined
          }
          for (const edge of path) {
            const swapped = color[edge] === c1 ? c2 : c1
            color[edge] = swapped
            const [a, b] = ends(edge)
            slots(a)[swapped] = edge
            slots(b)[swapped] = edge
          }
          chosen = c1
          break
        }
        if (chosen !== undefined) break
      }
    }
    if (chosen === undefined) return undefined
    color[e] = chosen
    slots(u)[chosen] = e
    slots(v)[chosen] = e
  }
  const days: Fixture[][] = Array.from({ length: colors }, () => [])
  fixtures.forEach((f, e) => days[color[e] as number]?.push(f))
  return days.filter((d) => d.length > 0)
}
