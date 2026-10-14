import { FORMATION_TIE_TOLERANCE } from '../../engine/config'
import { defaultTicketPrice } from '../../engine/finance'
import { FORMATION_IDS, getFormation } from '../../engine/formations'
import { buildTactic, rankFormations } from '../../engine/lineup'
import { createRng } from '../../engine/rng'
import type { Player, Team } from '../../engine/types'
import { createAcademy } from '../generateAcademy'
import { pickMentality, pickStyle } from '../generateTeam'
import { DEFAULT_START_YEAR } from '../generateWorld'
import type { World } from '../generateWorld'
import { generateRealPlayer } from './realPlayer'
import type { DataPackage, PackageClub, PackageClubGame } from './types'

export interface LoadOptions {
  /** Semente do jogo: gera a base dos clubes quando o pacote não traz uma. */
  seed: number | string
}

/**
 * Tática, finanças, torcida e meta da diretoria de um clube que o pacote não detalha, derivadas de forma estável
 * (o sorteio vem só do `id` do clube): a mesma lógica da geração do mundo fictício, a partir da reputação e da divisão.
 */
export function deriveClubGame(club: PackageClub, rank: number, players: readonly Player[]): PackageClubGame {
  const rng = createRng(`club-game:${club.id}`)
  const ranking = rankFormations(players, FORMATION_IDS.map(getFormation))
  const best = ranking[0]?.score ?? 0
  const nearBest = ranking.filter((r) => r.score >= best * (1 - FORMATION_TIE_TOLERANCE))
  const formationId = rng.pick(nearBest).formationId
  const tactic = buildTactic(players, { formationId, style: pickStyle(rng, club.reputation), mentality: pickMentality(rng, club.reputation) })
  const monthlyPayroll = players.reduce((sum, p) => sum + p.contract.salary, 0)
  const balance = Math.round((club.reputation ** 2 * 400_000 * rng.float(0.85, 1.15)) / 10_000) * 10_000
  const target = Math.min(rank, 16)
  return {
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
    fanBase: Math.round((club.reputation ** 2.5 * 12_000 * rng.float(0.85, 1.15)) / 1_000) * 1_000,
    ticketPrice: defaultTicketPrice(club.reputation),
    objective: { targetPosition: target, sackingPosition: Math.min(20, target + 6) },
  }
}

const numberOf = (id: string): number => {
  const m = /^player-(\d+)$/.exec(id)
  return m ? Number(m[1]) : 0
}

/**
 * Monta o mundo do jogo a partir de um pacote **já validado** (`validatePackage`). É o único caminho: o mundo fictício
 * padrão também passa por aqui (`defaultPackage`).
 */
export function worldFromPackage(pkg: DataPackage, options: LoadOptions): World {
  const startYear = pkg.startYear ?? DEFAULT_START_YEAR
  const tierOfLeague = new Map(pkg.leagues.map((l) => [l.id, l.level as 1 | 2]))
  const clubById = new Map(pkg.clubs.map((c) => [c.id, c]))
  const tierOfClub = (clubId: string): 1 | 2 => tierOfLeague.get((clubById.get(clubId) as PackageClub).league) as 1 | 2

  // Ids dos jogadores: os do pacote valem; os que faltam recebem o próximo `player-N` livre.
  const used = new Set<string>([...pkg.players, ...(pkg.academy ?? [])].flatMap((p) => (p.id ? [p.id] : [])))
  let next = 1
  const freshId = () => {
    while (used.has(`player-${next}`)) next++
    const id = `player-${next++}`
    used.add(id)
    return id
  }

  const build = (list: readonly DataPackage['players'][number][]) =>
    list.map((spec) => {
      const club = spec.club ? (clubById.get(spec.club) as PackageClub) : null
      const tier = club ? tierOfClub(club.id) : 1
      return generateRealPlayer(spec, spec.id ?? freshId(), club ? club.id : null, { startYear, tier, club })
    })
  const players = build(pkg.players)

  // Posição de cada clube na sua divisão por reputação (empate: ordem do pacote).
  const rankOf = new Map<string, number>()
  for (const tier of [1, 2] as const) {
    pkg.clubs
      .map((club, index) => ({ club, index }))
      .filter(({ club }) => tierOfClub(club.id) === tier)
      .sort((a, b) => b.club.reputation - a.club.reputation || a.index - b.index)
      .forEach(({ club }, i) => rankOf.set(club.id, i + 1))
  }

  const teams: Team[] = pkg.clubs.map((club) => {
    const tier = tierOfClub(club.id)
    const squad = players.filter((p) => p.teamId === club.id)
    const game = club.game ?? deriveClubGame(club, rankOf.get(club.id) ?? 20, squad)
    return {
      id: club.id,
      name: club.name,
      abbreviation: club.abbreviation,
      city: club.city,
      state: club.state ?? '',
      colors: club.colors,
      stadium: { ...club.stadium },
      reputation: club.reputation,
      squad: squad.map((p) => p.id),
      tactic: game.tactic,
      finances: game.finances,
      fanBase: game.fanBase,
      ticketPrice: game.ticketPrice,
      objective: game.objective,
      history: [],
      tier,
    }
  })

  const academy = pkg.academy
    ? build(pkg.academy)
    : createAcademy({
        teams,
        seed: options.seed,
        year: startYear,
        firstNumber: Math.max(players.length, ...[...used].map(numberOf)) + 1,
        takenNames: players.map((p) => p.name),
      })
  return { seed: options.seed, startYear, teams, players, academy }
}
