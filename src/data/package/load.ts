import { FORMATION_TIE_TOLERANCE } from '../../engine/config'
import { defaultTicketPrice } from '../../engine/finance'
import { FORMATION_IDS, getFormation } from '../../engine/formations'
import { buildTactic, rankFormations } from '../../engine/lineup'
import { lineupForeign } from '../../engine/foreign'
import { createRng } from '../../engine/rng'
import { contractEndFor } from '../../engine/season/dates'
import { leagueRevenue } from '../../engine/economy'
import type { CompetitionSetup } from '../../engine/season'
import type { LeagueEconomy, Nationality, Player, Region, Team } from '../../engine/types'
import { createAcademy } from '../generateAcademy'
import { pickMentality, pickStyle } from '../generateTeam'
import { DEFAULT_START_YEAR } from '../generateWorld'
import type { World } from '../generateWorld'
import { classicLeagueId, normalizeCup } from './cups'
import { cupsForPackage } from './packageCups'
import { COUNTRY_DEFAULTS } from './leagueDefaults'
import { generateRealPlayer } from './realPlayer'
import type { DataPackage, PackageClub, PackageClubGame, PackageLeague } from './types'

export interface LoadOptions {
  /** Semente do jogo: gera a base dos clubes quando o pacote não traz uma. */
  seed: number | string
}

/**
 * Tática, finanças, torcida e meta da diretoria de um clube que o pacote não detalha, derivadas de forma estável
 * (o sorteio vem só do `id` do clube): a mesma lógica da geração do mundo fictício, a partir da reputação e da divisão.
 */
export function deriveClubGame(club: PackageClub, rank: number, players: readonly Player[], economy?: LeagueEconomy, rules: Pick<Team, 'country' | 'foreignLimit'> = {}): PackageClubGame {
  const rng = createRng(`club-game:${club.id}`)
  const ranking = rankFormations(players, FORMATION_IDS.map(getFormation))
  const best = ranking[0]?.score ?? 0
  const nearBest = ranking.filter((r) => r.score >= best * (1 - FORMATION_TIE_TOLERANCE))
  const formationId = rng.pick(nearBest).formationId
  const tactic = buildTactic(players, { formationId, style: pickStyle(rng, club.reputation), mentality: pickMentality(rng, club.reputation) }, { ...(lineupForeign(rules) ? { foreign: lineupForeign(rules) } : {}) })
  const monthlyPayroll = players.reduce((sum, p) => sum + p.contract.salary, 0)
  const balance = Math.round((club.reputation ** 2 * 400_000 * leagueRevenue({ economy }) * rng.float(0.85, 1.15)) / 10_000) * 10_000
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
    ticketPrice: defaultTicketPrice(club.reputation, { economy }),
    objective: { targetPosition: target, sackingPosition: Math.min(20, target + 6) },
  }
}

const numberOf = (id: string): number => {
  const m = /^player-(\d+)$/.exec(id)
  return m ? Number(m[1]) : 0
}

/** Economia, janelas e regras de uma liga: o que o pacote diz ou, se não diz, o padrão do país. */
export function leagueSetup(league: PackageLeague): { country: Nationality; economy?: LeagueEconomy; region: Region; split: boolean; start?: [number, number] } {
  const country = league.country as Nationality
  const defaults = COUNTRY_DEFAULTS[country]
  const economy = league.economy ?? defaults?.economy
  // País sem padrão calibrado: sem economia (vale a do Brasil) e janelas da Europa, a menos que o pacote diga (a validação avisa).
  const region = league.region ?? defaults?.region ?? 'EU'
  const start = league.start ? ([league.start[0], league.start[1]] as [number, number]) : defaults?.calendar.start
  return { country, ...(economy ? { economy } : {}), region, split: league.split ?? defaults?.calendar.split ?? region === 'EU', ...(start ? { start } : {}) }
}

/**
 * O pacote tem só o país padrão (Brasil, 2 ou 3 divisões de 20 times, 4 sobem e 4 caem, sem regras próprias)? Então o mundo
 * usa as séries padrão do jogo (ids `serie-a`...) e nada muda em relação ao mundo fictício de sempre.
 */
export function isClassicPackage(pkg: DataPackage): boolean {
  if (pkg.leagues.length < 2 || pkg.leagues.length > 3) return false
  return pkg.leagues.every((l) => l.country === 'Brazil' && l.teams === 20 && l.economy === undefined && l.rounds === undefined && l.region === undefined && l.foreignLimit === undefined && l.promotion === (l.level === 1 ? 0 : 4) && l.relegation === (l.level === pkg.leagues.length ? 0 : 4))
}

/**
 * Monta o mundo do jogo a partir de um pacote **já validado** (`validatePackage`). É o único caminho: o mundo fictício
 * padrão também passa por aqui (`defaultPackage`).
 */
export function worldFromPackage(pkg: DataPackage, options: LoadOptions): World {
  const startYear = pkg.startYear ?? DEFAULT_START_YEAR
  const leagueById = new Map(pkg.leagues.map((l) => [l.id, l]))
  const clubById = new Map(pkg.clubs.map((c) => [c.id, c]))
  const leagueOf = (clubId: string): PackageLeague => leagueById.get((clubById.get(clubId) as PackageClub).league) as PackageLeague
  const tierOfClub = (clubId: string): 1 | 2 | 3 => leagueOf(clubId).level as 1 | 2 | 3
  const economyOfClub = (clubId: string): LeagueEconomy | undefined => leagueSetup(leagueOf(clubId)).economy

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
      const economy = club ? economyOfClub(club.id) : undefined
      return generateRealPlayer(spec, spec.id ?? freshId(), club ? club.id : null, { startYear, tier, club, ...(economy ? { economy } : {}) })
    })
  // Contratos de clubes de temporada que atravessa o ano terminam em 30 de junho (o gerador usa 31 de dezembro).
  const splitClub = (clubId: string | null) => clubId !== null && leagueSetup(leagueOf(clubId)).split
  const localize = (p: Player): Player => {
    if (!splitClub(p.teamId) || !p.contract.endDate.endsWith('-12-31')) return p
    const year = Math.max(Number(p.contract.endDate.slice(0, 4)), startYear + 1)
    return { ...p, contract: { ...p.contract, endDate: contractEndFor(year - 1, true) } }
  }
  const players = build(pkg.players).map(localize)

  // Posição de cada clube na sua divisão por reputação (empate: ordem do pacote).
  const rankOf = new Map<string, number>()
  for (const league of pkg.leagues) {
    pkg.clubs
      .map((club, index) => ({ club, index }))
      .filter(({ club }) => club.league === league.id)
      .sort((a, b) => b.club.reputation - a.club.reputation || a.index - b.index)
      .forEach(({ club }, i) => rankOf.set(club.id, i + 1))
  }

  const squads = new Map<string, Player[]>()
  for (const p of players) if (p.teamId) squads.set(p.teamId, [...(squads.get(p.teamId) ?? []), p])
  const teams: Team[] = pkg.clubs.map((club) => {
    const league = leagueOf(club.id)
    const { country, economy } = leagueSetup(league)
    const squad = squads.get(club.id) ?? []
    const game = club.game ?? deriveClubGame(club, rankOf.get(club.id) ?? 20, squad, economy, { country, ...(league.foreignLimit ? { foreignLimit: league.foreignLimit } : {}) })
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
      tier: league.level,
      ...(economy ? { economy } : {}),
      ...(country !== 'Brazil' ? { country } : {}),
      ...(league.foreignLimit ? { foreignLimit: league.foreignLimit } : {}),
    }
  })

  const academy = pkg.academy
    ? build(pkg.academy).map(localize)
    : createAcademy({
        teams,
        seed: options.seed,
        year: startYear,
        firstNumber: Math.max(players.length, ...[...used].map(numberOf)) + 1,
        takenNames: players.map((p) => p.name),
      }).map(localize)

  const world: World = { seed: options.seed, startYear, teams, players, academy }
  // Copas: as ligas das vagas são ids do pacote; no mundo clássico a competição se chama `serie-a`, `serie-b`...
  const cupDefinitions = cupsForPackage(pkg).cups
  if (cupDefinitions.length > 0) world.cups = cupDefinitions.map((c) => normalizeCup(c, isClassicPackage(pkg) ? classicLeagueId : undefined))
  if (!isClassicPackage(pkg)) {
    const teamById = new Map(teams.map((t) => [t.id, t]))
    world.competitions = pkg.leagues.map((league): CompetitionSetup => {
      const { country, economy, region, split, start } = leagueSetup(league)
      const members = pkg.clubs.filter((c) => c.league === league.id)
      return {
        id: league.id,
        name: league.name,
        tier: league.level,
        teams: members.map((c) => teamById.get(c.id) as Team),
        region,
        ...(league.rounds ? { rounds: league.rounds } : {}),
        ...(start ? { start } : {}),
        ...(split ? { split: true } : {}),
        pyramid: league.country,
        ...(economy ? { economy } : {}),
        ...(country !== 'Brazil' ? { country } : {}),
        ...(league.foreignLimit ? { foreignLimit: league.foreignLimit } : {}),
        reputationMean: Math.round((members.reduce((sum, c) => sum + c.reputation, 0) / Math.max(1, members.length)) * 10) / 10,
        promotion: league.promotion,
        relegation: league.relegation,
      }
    })
  }
  return world
}
