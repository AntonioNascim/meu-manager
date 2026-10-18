/**
 * A partida simplificada (ligas fora do foco do técnico) tem de parecer com o motor completo: as mesmas duplas de times, jogadas
 * pelos dois, dão médias de gols, vitórias do mandante, empates e vantagem do time mais forte parecidas, e os eventos dos jogadores
 * (gols, assistências, cartões, lesões, notas, condição) caem nas mesmas faixas. Os coeficientes saem de `npm run analyze:quick -- --fit`.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
import type { World } from '../../src/data/generateWorld'
import { playerOverall } from '../../src/engine/overall'
import { computeStandings, createSeason, simulateToSeasonEnd } from '../../src/engine/season'
import type { Player, Team } from '../../src/engine/types'
import { collectSamples, summarizeSamples } from '../../tools/quickMeasure'
import type { Sample, Summary } from '../../tools/quickMeasure'

const near = (a: number, b: number, tolerance: number, label: string) => {
  expect(Math.abs(a - b), `${label}: simplificado ${a.toFixed(3)} contra completo ${b.toFixed(3)} (tolerância ${tolerance})`).toBeLessThanOrEqual(tolerance)
}

describe('simplificado contra completo', () => {
  let samples: Sample[]
  let full: Summary
  let quick: Summary

  beforeAll(() => {
    const worlds = [31, 32, 33].map((seed) => generateWorld({ seed }))
    samples = collectSamples(worlds, 1500, 'quick-test')
    full = summarizeSamples(samples, 'full')
    quick = summarizeSamples(samples, 'quick')
  })

  it('gols por jogo, mandante, empates e visitante', () => {
    near(quick.goals, full.goals, 0.1, 'gols por jogo')
    near(quick.homeWin, full.homeWin, 0.03, 'vitória do mandante')
    near(quick.draw, full.draw, 0.025, 'empates')
    near(quick.awayWin, full.awayWin, 0.03, 'vitória do visitante')
    near(quick.goalsSd, full.goalsSd, 0.08, 'dispersão dos gols')
    // As metas do projeto valem para o simplificado também.
    expect(quick.goals).toBeGreaterThan(2.2)
    expect(quick.goals).toBeLessThan(2.6)
    expect(quick.draw).toBeGreaterThan(0.22)
    expect(quick.draw).toBeLessThan(0.3)
  })

  it('o time mais forte vence tanto quanto no motor completo, em cada faixa de diferença', () => {
    for (let band = 0; band < 3; band++) {
      near(quick.strongerWin[band] as number, full.strongerWin[band] as number, 0.06, `chance do mais forte, faixa ${band}`)
      near(quick.strongerPoints[band] as number, full.strongerPoints[band] as number, 0.12, `pontos do mais forte, faixa ${band}`)
    }
    // E a vantagem cresce com a diferença de força.
    expect(quick.strongerWin[2] as number).toBeGreaterThan(quick.strongerWin[0] as number + 0.1)
  })

  it('vale para cada série', () => {
    for (const tier of [1, 2, 3]) {
      const part = samples.filter((s) => s.home.tier === tier)
      const a = summarizeSamples(part, 'full')
      const b = summarizeSamples(part, 'quick')
      near(b.goals, a.goals, 0.17, `gols na série ${tier}`)
      near(b.homeWin, a.homeWin, 0.055, `mandante na série ${tier}`)
      near(b.draw, a.draw, 0.045, `empates na série ${tier}`)
    }
  })

  it('quem marca e quem dá o passe: parte por posição', () => {
    const striker = 9
    near(quick.goalShare[striker] as number, full.goalShare[striker] as number, 0.05, 'gols dos atacantes')
    near(quick.goalShare.slice(1, 5).reduce((a, b) => a + b, 0), full.goalShare.slice(1, 5).reduce((a, b) => a + b, 0), 0.03, 'gols da defesa e dos volantes')
    near(quick.goalShare[0] as number, 0, 0.0001, 'gols do goleiro')
    near(quick.assistPerGoal, full.assistPerGoal, 0.05, 'gols com assistência')
    near(quick.crossShare, full.crossShare, 0.06, 'assistências de cruzamento')
    for (const [i, name] of [[5, 'meias centrais'], [6, 'meias ofensivos']] as const) near(quick.assistShare[i] as number, full.assistShare[i] as number, 0.05, `assistências dos ${name}`)
  })

  it('cartões, lesões, trocas, condição e notas', () => {
    near(quick.yellows, full.yellows, 0.3, 'amarelos por jogo')
    near(quick.reds, full.reds, 0.06, 'vermelhos por jogo')
    near(quick.ownGoals, full.ownGoals, 0.04, 'gols contra por jogo')
    near(quick.injuriesPerMatch, full.injuriesPerMatch, 0.06, 'lesões por jogo')
    near(quick.injuryDays, full.injuryDays, 2, 'dias de lesão')
    near(quick.subsPerTeam, full.subsPerTeam, 0.3, 'trocas por time')
    near(quick.shots, full.shots, 0.8, 'finalizações por time')
    for (let g = 0; g < 3; g++) near(quick.fitnessDrop[g] as number, full.fitnessDrop[g] as number, 3, `condição perdida, faixa de resistência ${g}`)
    for (let g = 0; g < 4; g++) near(quick.ratingMean[g] as number, full.ratingMean[g] as number, 0.2, `nota média, linha ${g}`)
    // Quem é melhor tira nota melhor, como no completo (mas de leve).
    expect(quick.ratingByStrength[2] as number).toBeGreaterThan(quick.ratingByStrength[0] as number)
  })
})

describe('temporada inteira, simplificada contra completa', () => {
  interface SeasonMetrics {
    championPoints: number
    drawRate: number
    topScorer: number
    topAssists: number
    yellowsPerTeam: number
    strongestRank: number
    top4Rank: number
    correlation: number
    injuredPlayers: number
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

  function metrics(world: World, mode: 'full' | 'quick'): SeasonMetrics {
    const teams = world.teams.filter((t) => t.tier === 1)
    const start = createSeason({
      year: 2026,
      seed: `season-${mode}`,
      teams: world.teams.filter((t) => t.tier === 1),
      players: world.players.filter((p) => teams.some((t) => t.id === p.teamId)),
      academy: [],
      competitions: [{ id: 'serie-a', name: 'Série A', tier: 1, teams }],
      // Foco numa pirâmide que não existe: toda a competição é simplificada.
      ...(mode === 'quick' ? { focus: 'nenhuma' } : {}),
    })
    const end = simulateToSeasonEnd(start)
    const table = computeStandings(teams.map((t) => t.id), end.matches)
    const strength = new Map(teams.map((t) => [t.id, t.tactic.startingXI.reduce((s, id) => s + playerOverall(end.players.find((p) => p.id === id) as Player), 0) / 11]))
    const byStrength = [...teams].sort((a, b) => (strength.get(b.id) as number) - (strength.get(a.id) as number))
    const position = (id: string) => table.findIndex((r) => r.teamId === id) + 1
    const players = end.players
    const draws = end.matches.filter((m) => m.result && m.result.homeGoals === m.result.awayGoals).length
    return {
      championPoints: (table[0] as { points: number }).points,
      drawRate: draws / end.matches.length,
      topScorer: Math.max(...players.map((p) => p.seasonStats.goals)),
      topAssists: Math.max(...players.map((p) => p.seasonStats.assists)),
      yellowsPerTeam: players.reduce((n, p) => n + p.seasonStats.yellowCards, 0) / teams.length,
      strongestRank: position((byStrength[0] as Team).id),
      top4Rank: mean(byStrength.slice(0, 4).map((t) => position(t.id))),
      correlation: correlationOf(byStrength.map((t) => strength.get(t.id) as number), byStrength.map((t) => -position(t.id))),
      injuredPlayers: players.filter((p) => p.condition.injuryDaysLeft > 0).length,
    }
  }

  const correlationOf = (xs: number[], ys: number[]) => {
    const mx = mean(xs)
    const my = mean(ys)
    let num = 0
    let dx = 0
    let dy = 0
    xs.forEach((x, i) => {
      num += (x - mx) * ((ys[i] as number) - my)
      dx += (x - mx) ** 2
      dy += ((ys[i] as number) - my) ** 2
    })
    return num / Math.sqrt(dx * dy)
  }

  it('campeão, empates, artilharia, cartões e a vantagem do elenco mais forte ficam parecidos', () => {
    const worlds = [41, 42, 43, 44, 45, 46, 47, 48].map((seed) => generateWorld({ seed }))
    const full = worlds.map((w) => metrics(w, 'full'))
    const quick = worlds.map((w) => metrics(w, 'quick'))
    const avg = (rows: SeasonMetrics[], key: keyof SeasonMetrics) => mean(rows.map((r) => r[key]))
    const show = (key: keyof SeasonMetrics) => `${key}: completo ${avg(full, key).toFixed(2)}, simplificado ${avg(quick, key).toFixed(2)}`
    console.log(['', ...(Object.keys(full[0] as SeasonMetrics) as (keyof SeasonMetrics)[]).map(show)].join('\n'))

    near(avg(quick, 'championPoints'), avg(full, 'championPoints'), 5, 'pontos do campeão')
    near(avg(quick, 'drawRate'), avg(full, 'drawRate'), 0.03, 'empates na temporada')
    near(avg(quick, 'topScorer'), avg(full, 'topScorer'), 4, 'gols do artilheiro')
    near(avg(quick, 'topAssists'), avg(full, 'topAssists'), 4, 'assistências do líder')
    near(avg(quick, 'yellowsPerTeam'), avg(full, 'yellowsPerTeam'), 6, 'amarelos por time na temporada')
    near(avg(quick, 'top4Rank'), avg(full, 'top4Rank'), 1.5, 'colocação média dos quatro elencos mais fortes')
    near(avg(quick, 'correlation'), avg(full, 'correlation'), 0.12, 'correlação força × posição')
    // As metas do projeto valem para o simplificado também.
    expect(avg(quick, 'championPoints')).toBeGreaterThan(66)
    expect(avg(quick, 'championPoints')).toBeLessThan(86)
    expect(avg(quick, 'drawRate')).toBeGreaterThan(0.22)
    expect(avg(quick, 'drawRate')).toBeLessThan(0.3)
    expect(avg(quick, 'top4Rank')).toBeGreaterThan(3)
    expect(avg(quick, 'top4Rank')).toBeLessThan(8)
  })
})
