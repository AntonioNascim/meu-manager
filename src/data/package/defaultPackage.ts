import type { CupSpec, Player } from '../../engine/types'
import { generateWorld } from '../generateWorld'
import type { World } from '../generateWorld'
import { worldFromPackage } from './load'
import { PACKAGE_FORMAT, PACKAGE_VERSION, TIEBREAKERS } from './types'
import type { DataPackage, PackageCup, PackagePlayer } from './types'

const FICTIONAL_LEAGUES = [
  { id: 'br-1', name: 'Série A', country: 'Brazil', level: 1, teams: 20, promotion: 0, relegation: 4, tiebreakers: [...TIEBREAKERS] },
  { id: 'br-2', name: 'Série B', country: 'Brazil', level: 2, teams: 20, promotion: 4, relegation: 4, tiebreakers: [...TIEBREAKERS] },
  { id: 'br-3', name: 'Série C', country: 'Brazil', level: 3, teams: 20, promotion: 4, relegation: 0, tiebreakers: [...TIEBREAKERS] },
]

function packagePlayer(p: Player): PackagePlayer {
  const out: PackagePlayer = {
    id: p.id,
    name: p.name,
    birthDate: p.birthDate,
    nationality: p.nationality,
    position: p.position,
    secondaryPositions: [...p.secondaryPositions],
    foot: p.foot,
    club: p.teamId,
    attributes: { ...p.attributes },
    potential: p.hidden.potential,
    hidden: { consistency: p.hidden.consistency, injuryProneness: p.hidden.injuryProneness, professionalism: p.hidden.professionalism },
    contract: { ...p.contract },
  }
  if (p.nickname) out.nickname = p.nickname
  return out
}

/**
 * Exporta um mundo como pacote de dados, com tudo o que o jogo precisa para recriá-lo idêntico (atributos, contratos,
 * táticas e finanças incluídos). `worldFromPackage(packageFromWorld(w), { seed })` devolve o mesmo mundo.
 */
export function packageFromWorld(world: World, name = 'Mundo fictício'): DataPackage {
  return {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    name,
    startYear: world.startYear,
    countries: [{ id: 'Brazil', name: 'Brasil' }],
    leagues: FICTIONAL_LEAGUES.map((l) => ({ ...l, tiebreakers: [...l.tiebreakers] })),
    clubs: world.teams.map((t) => ({
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      colors: [t.colors[0], t.colors[1]],
      city: t.city,
      state: t.state,
      stadium: { ...t.stadium },
      reputation: t.reputation,
      league: `br-${t.tier}`,
      game: { tactic: t.tactic, finances: t.finances, fanBase: t.fanBase, ticketPrice: t.ticketPrice, objective: t.objective },
    })),
    players: world.players.map((p) => packagePlayer(p)),
    academy: world.academy.map((p) => packagePlayer(p)),
    ...(world.cups && world.cups.length > 0 ? { cups: world.cups.map(cupToPackage) } : {}),
  }
}

/** `serie-a` -> `br-1`: o id da liga no pacote (o inverso de `classicLeagueId`). */
const packageLeagueId = (competitionId: string): string => {
  const letter = /^serie-([a-d])$/.exec(competitionId)?.[1]
  return letter ? `br-${'abcd'.indexOf(letter) + 1}` : competitionId
}

/** Uma copa do jogo no formato do pacote (a definição completa serve, só os ids das ligas voltam ao do pacote). */
function cupToPackage(spec: CupSpec): PackageCup {
  const source = (s: CupSpec['entrants'][number]['source']) => (s.type === 'league' ? { ...s, league: packageLeagueId(s.league) } : s)
  return { ...spec, entrants: spec.entrants.map((e) => ({ source: source(e.source), ...(e.fallback ? { fallback: source(e.fallback) } : {}), ...(e.stage !== undefined ? { stage: e.stage } : {}) })) }
}

/** O pacote padrão do jogo: o mundo fictício de uma semente. */
export function defaultPackage(seed: number | string): DataPackage {
  return packageFromWorld(generateWorld({ seed }))
}

/** Mundo do jogo a partir de um pacote (o padrão, se nenhum for dado): o único caminho de criação de mundo. */
export function loadWorld(seed: number | string, pkg: DataPackage = defaultPackage(seed)): World {
  return worldFromPackage(pkg, { seed })
}
