/**
 * A partida simplificada (ligas fora do foco do técnico) tem de parecer com o motor completo: as mesmas duplas de times, jogadas
 * pelos dois, dão médias de gols, vitórias do mandante, empates e vantagem do time mais forte parecidas, e os eventos dos jogadores
 * (gols, assistências, cartões, lesões, notas, condição) caem nas mesmas faixas. Os coeficientes saem de `npm run analyze:quick -- --fit`.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/data/generateWorld'
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
