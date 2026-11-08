/**
 * Calendário comum da liga online (Fase 6D). A liga online não segue as datas do futebol real: o mundo inteiro tem **uma temporada só** (ano civil
 * virtual), a rodada N de toda liga cai na mesma data, a rodada de meio de semana é a mesma e as copas ocupam as mesmas quartas-feiras
 * (uma grade de quartas-feiras, `pickCupDay`). Assim todas as partidas dos técnicos humanos caem nos mesmos eventos, de qualquer país. Ligas com menos rodadas
 * terminam antes e esperam a virada. O jogo solo nunca usa isto.
 */
import type { CupSpec } from '../types'
import type { CompetitionSetup } from './calendar'

/** Primeiro sábado da temporada virtual: 24 de janeiro (como a Série A brasileira de hoje). */
export const SHARED_START: [number, number] = [1, 24]

/** As ligas no calendário comum: ano civil, mesma data de início, sem pausas de calendário e com `shared` (as janelas de transferência também são únicas). */
export function sharedSetups(setups: readonly CompetitionSetup[]): CompetitionSetup[] {
  return setups.map((s) => ({ ...s, split: false, start: SHARED_START, gapEvery: 0, shared: true }))
}

/** Seis meses adiante (ago a dez vira fev a jun; jan a jun vira jul a dez): a temporada europeia, de agosto a maio, cabe no ano civil virtual na mesma ordem. */
const shift = (date: [number, number]): [number, number] => [((date[0] + 5) % 12) + 1, Math.min(date[1], 28)]

/**
 * As copas no calendário comum: sem as copas mundiais (o Mundial de Clubes e a Intercontinental ficam fora da primeira versão da liga online) e, nas copas
 * de países e continentes que jogam de agosto a maio, as datas de referência das fases deslocadas seis meses para caber no ano civil virtual.
 */
export function sharedCupSpecs(specs: readonly CupSpec[], original: readonly CompetitionSetup[]): CupSpec[] {
  const splitCountry = new Set(original.filter((s) => s.tier === 1 && s.split === true && s.country).map((s) => s.country))
  const splitRegion = new Set(['EU', 'AF', 'AS', 'OC'])
  return specs
    .filter((c) => c.world === undefined)
    .map((c) => {
      const split = c.country !== undefined ? splitCountry.has(c.country) : c.region !== undefined && splitRegion.has(c.region)
      if (!split) return c
      return {
        ...c,
        stages: c.stages.map((s) => ({ ...s, date: shift(s.date) })),
        ...(c.preliminary ? { preliminary: c.preliminary.map((s) => ({ ...s, date: shift(s.date) })) } : {}),
        ...(c.groups ? { groups: { ...c.groups, date: shift(c.groups.date) } } : {}),
        ...(c.leaguePhase ? { leaguePhase: { ...c.leaguePhase, date: shift(c.leaguePhase.date) } } : {}),
      }
    })
}
