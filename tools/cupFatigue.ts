/**
 * Cansaço das copas: nos jogos de liga, compara os times que jogaram uma partida de copa nos 4 dias anteriores com os que não
 * jogaram: condição dos titulares na hora de entrar em campo (já com a recuperação dos dias de descanso), e quantos titulares a
 * IA precisa trocar em relação ao melhor time (o rodízio por cansaço). Também conta quantos jogos de copa vão à prorrogação.
 * Uso: node tools/run.mjs cupFatigue [--seasons 3]
 */
import { generateWorld } from '../src/data/generateWorld'
import { defaultCupSpecs } from '../src/data/package/cups'
import { buildTactic } from '../src/engine/lineup'
import { addDays, daysBetween } from '../src/engine/season/dates'
import { advanceToNextEvent, aiTactic, createSeason, nextEvent, progressDays } from '../src/engine/season'
import { fitnessProfile } from '../src/engine/training'
import type { Player } from '../src/engine/types'

const args = process.argv.slice(2)
const seasons = Number(args[args.indexOf('--seasons') + 1] || 3)
const world = generateWorld({ seed: 5 })

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
interface Sample {
  fitness: number
  rotated: number
}
const after: Sample[] = []
const normal: Sample[] = []
let cupGames = 0
let extraGames = 0
let penaltyGames = 0

for (let s = 0; s < seasons; s++) {
  let state = createSeason({ year: 2026, seed: s + 1, teams: world.teams, players: world.players, academy: world.academy, cupSpecs: defaultCupSpecs() })
  const lastCup = new Map<string, string>()
  while (nextEvent(state).type === 'matchday') {
    const event = nextEvent(state)
    if (event.type !== 'matchday') break
    const date = event.date
    const days = daysBetween(state.season.currentDate, date)
    const projected = progressDays(state.players, days, (teamId) => fitnessProfile(state.training, teamId, days))
    const squads = new Map<string, Player[]>()
    for (const p of projected) if (p.teamId) squads.set(p.teamId, [...(squads.get(p.teamId) ?? []), p])
    for (const m of state.matches) {
      if (m.status !== 'scheduled' || m.date !== date || m.cup) continue
      for (const id of [m.homeTeamId, m.awayTeamId]) {
        const team = state.teams.find((t) => t.id === id)!
        const squad = squads.get(id) ?? []
        const rested = aiTactic(team, squad)
        const best = buildTactic(squad, { formationId: team.tactic.formationId, style: team.tactic.style, mentality: team.tactic.mentality }, { rested: false })
        const byId = new Map(squad.map((p) => [p.id, p]))
        const sample = { fitness: mean(rested.startingXI.map((pid) => byId.get(pid)!.condition.fitness)), rotated: rested.startingXI.filter((pid) => !best.startingXI.includes(pid)).length }
        const cupDate = lastCup.get(id)
        ;(cupDate !== undefined && cupDate >= addDays(date, -4) ? after : normal).push(sample)
      }
    }
    const step = advanceToNextEvent(state)
    state = step.state
    for (const m of step.played) {
      if (!m.cup) continue
      lastCup.set(m.homeTeamId, m.date)
      lastCup.set(m.awayTeamId, m.date)
      cupGames++
      if (m.result?.extraTime) extraGames++
      if (m.result?.penalties) penaltyGames++
    }
  }
}

const show = (name: string, xs: Sample[]) => console.log(`${name}: ${xs.length} jogos de time | condição dos titulares ao entrar ${mean(xs.map((x) => x.fitness)).toFixed(1)} | titulares trocados por cansaço ${mean(xs.map((x) => x.rotated)).toFixed(2)} de 11`)
show('Liga até 4 dias depois de um jogo de copa', after)
show('Liga normal', normal)
console.log(`Jogos de copa: ${cupGames}; com prorrogação ${extraGames} (${((100 * extraGames) / Math.max(1, cupGames)).toFixed(0)}%); nos pênaltis ${penaltyGames} (${((100 * penaltyGames) / Math.max(1, cupGames)).toFixed(0)}%)`)
