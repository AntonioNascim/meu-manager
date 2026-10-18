/**
 * Pacote de exemplo com as 15 ligas, importado como o jogo importa e jogado por 3 temporadas com mercado e virada (só o Brasil
 * lance a lance): o limite de estrangeiros do elenco vale no mercado e na base, e ninguém fica no vermelho.
 */
import { describe, expect, it } from 'vitest'
import { createYouth } from '../../src/data/generateYouth'
import { loadWorld } from '../../src/data/package/defaultPackage'
import { validatePackage } from '../../src/data/package/validate'
import { buildScalePackage } from '../../src/diagnostics/scalePackage'
import { foreignCount } from '../../src/engine/foreign'
import { advanceSeason } from '../../src/engine/offseason'
import { advanceUntil, createSeason } from '../../src/engine/season'
import { createRng } from '../../src/engine/rng'
import { lowestBalance } from '../../tools/longRun'

describe('pacote de 15 ligas: 3 temporadas', () => {
  it('o limite de estrangeiros do elenco vale ano a ano e nenhum clube vai à falência', () => {
    const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(7))))
    expect(pkg).toBeDefined()
    const world = loadWorld(7, pkg)
    let state = createSeason({ year: world.startYear, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil' })
    // Cada país tem a sua temporada (Brasil e América do Sul no ano civil, Europa de agosto a maio): o mundo anda com o relógio único e os países
    // viram sozinhos no último dia de cada um. A cada 30 de junho todos já viraram a temporada do ano.
    const turn = (s: typeof state, pyramid: string) => advanceSeason(s, { createYouth, pyramid })
    for (let year = 0; year < 3; year++) {
      const ended = advanceUntil(state, `${world.startYear + year + 1}-06-30`, { market: true, turn }).state
      for (const team of ended.teams) {
        const max = team.foreignLimit?.squad
        if (max !== undefined) expect(foreignCount(ended.players.filter((p) => p.teamId === team.id), team), `${team.id} estrangeiros no elenco`).toBeLessThanOrEqual(max)
        expect(lowestBalance(team), `${team.id} no vermelho`).toBeGreaterThanOrEqual(0)
      }
      state = ended
    }
  })

  it('a base de cada país nasce com a nacionalidade dele', () => {
    const request = { teamId: 'x', tier: 1, reputation: 12, positions: Array(60).fill('CM') as 'CM'[], year: 2027, country: 'England' as const }
    const youth = createYouth(request, createRng('base-inglesa'), new Set())
    const home = youth.filter((p) => p.nationality === 'England').length
    expect(home).toBeGreaterThan(youth.length * 0.85)
    expect(home).toBeLessThan(youth.length)
    const brazil = createYouth({ ...request, country: undefined as never }, createRng('base-brasileira'), new Set())
    expect(brazil.filter((p) => p.nationality === 'Brazil').length).toBeGreaterThan(brazil.length * 0.85)
  })
})
