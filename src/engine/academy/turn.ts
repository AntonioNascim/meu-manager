/** Virada de temporada da base: evolução, decisões dos 20 anos, promoções da IA e chegada dos jovens novos. */
import { ACADEMY } from '../config'
import { ageOneYear } from '../offseason/evolution'
import { CORE_COUNTS, desiredSquadSize, positionDeficits } from '../offseason/squad'
import type { Rng } from '../rng'
import { contractEndOn } from '../season/dates'
import { SQUAD_MAX } from '../types'
import type { Player, Position, Team, TeamId, YouthRequest } from '../types'
import { toProfessional, worthPromoting, youthValue } from './index'

type YouthFactory = (request: YouthRequest, rng: Rng, taken: ReadonlySet<string>) => Player[]

export interface AcademyTurnInput {
  teams: readonly Team[]
  /** Elencos profissionais já com os contratos da virada resolvidos. */
  players: readonly Player[]
  academy: readonly Player[]
  rng: Rng
  /** Ano da temporada que acabou. */
  year: number
  userTeamId?: TeamId
  createYouth: YouthFactory
  taken: Set<string>
  counter: number
}

export interface AcademyTurn {
  players: Player[]
  academy: Player[]
  counter: number
  arrivals: Record<TeamId, number>
  promoted: Record<TeamId, number>
  released: Record<TeamId, number>
}

const POSITION_BAG: Position[] = (Object.keys(CORE_COUNTS) as Position[]).flatMap((p) => Array<Position>(CORE_COUNTS[p]).fill(p))

/** O jovem da base não tem salário até ser promovido. */
const asAcademy = (p: Player, year: number): Player => ({ ...p, contract: { salary: 0, endDate: contractEndOn(year), releaseClause: 0 } })

export function turnAcademy(input: AcademyTurnInput): AcademyTurn {
  const nextYear = input.year + 1
  const evolveRng = input.rng.fork('academy-evolution')
  const arrivalRng = input.rng.fork('academy-arrivals')
  const players = [...input.players]
  const academy: Player[] = []
  let counter = input.counter
  const arrivals: Record<TeamId, number> = {}
  const promoted: Record<TeamId, number> = {}
  const released: Record<TeamId, number> = {}

  for (const team of input.teams) {
    const isUser = team.id === input.userTeamId
    const squad = players.filter((p) => p.teamId === team.id)
    const count = (map: Record<TeamId, number>) => (map[team.id] = (map[team.id] ?? 0) + 1)
    const promote = (p: Player) => {
      const pro = toProfessional(p, nextYear)
      players.push(pro)
      squad.push(pro)
      count(promoted)
    }
    const release = (_p: Player) => count(released)
    /** A IA (e o jogador que deixou passar o prazo) decide: promove quem vale e tem vaga; senão, dispensa quem já fez 20 anos. Devolve true se o jovem saiu da base. */
    const aiDecides = (p: Player, mustDecide: boolean): boolean => {
      const needed = positionDeficits(squad).includes(p.position)
      const room = squad.length < SQUAD_MAX && (needed || squad.length < desiredSquadSize(team.reputation))
      if (room && (needed || (p.age >= ACADEMY.ai.minAge && worthPromoting(p, squad)))) {
        promote(p)
        return true
      }
      if (mustDecide) {
        release(p)
        return true
      }
      return false
    }

    let youths = input.academy.filter((p) => p.teamId === team.id)
    // 1) Quem já tinha 20 anos e o jogador deixou sem decisão: a regra da IA decide.
    if (isUser) youths = youths.filter((p) => p.age < ACADEMY.graduationAge || !aiDecides(p, true))
    // 2) Um ano a mais para todos (evoluem um pouco mais devagar que quem joga).
    youths = youths.map((p) => asAcademy(ageOneYear(evolveRng, p, 0), nextYear))
    // 3) A IA decide sobre os de 20 anos e promove os que já valem a pena, do mais valioso para o menos.
    if (!isUser) youths = [...youths].sort((a, b) => youthValue(b) - youthValue(a)).filter((p) => !aiDecides(p, p.age >= ACADEMY.graduationAge))
    // 4) Chegam de 3 a 5 jovens. Base cheia: a IA dispensa os de menor valor; o jogador fica sem as vagas que faltam.
    const wanted = arrivalRng.int(ACADEMY.arrivals[0], ACADEMY.arrivals[1])
    let room = ACADEMY.maxSize - youths.length
    if (!isUser && room < wanted) {
      const weakest = [...youths].sort((a, b) => youthValue(a) - youthValue(b)).slice(0, wanted - room)
      for (const p of weakest) release(p)
      youths = youths.filter((p) => !weakest.includes(p))
      room = ACADEMY.maxSize - youths.length
    }
    const n = Math.min(wanted, Math.max(0, room))
    if (n > 0) {
      const positions = Array.from({ length: n }, () => arrivalRng.pick(POSITION_BAG))
      const ages = positions.map(() => arrivalRng.int(ACADEMY.arrivalAge[0], ACADEMY.arrivalAge[1]))
      const made = input.createYouth({ teamId: team.id, tier: team.tier, reputation: team.reputation, positions, ages, academy: true, year: nextYear }, arrivalRng, input.taken)
      for (const p of made) {
        input.taken.add(p.name)
        youths.push(asAcademy({ ...p, id: `player-${++counter}`, teamId: team.id }, nextYear))
      }
      arrivals[team.id] = made.length
    }
    academy.push(...youths)
  }
  return { players, academy, counter, arrivals, promoted, released }
}
