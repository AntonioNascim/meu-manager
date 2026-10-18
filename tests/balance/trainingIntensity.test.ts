/**
 * Intensidade do treino: times da IA que treinam sempre Leve, Normal ou Intensa durante várias temporadas, lado a lado
 * (distribuídos em zigue-zague por força). Nenhuma intensidade pode ser claramente a melhor: Intensa evolui mais os
 * jovens, mas o cansaço e as lesões custam pontos; Leve poupa o elenco, mas evolui menos.
 */
import { describe, expect, it } from 'vitest'
import { formatTraining, simulateTrainingExperiment } from '../../tools/trainingRun'
import type { IntensityStats } from '../../tools/trainingRun'

describe('intensidade do treino ao longo de várias temporadas', () => {
  const rows = simulateTrainingExperiment({ seeds: [3, 4, 5, 6], years: 5 })
  console.log(`\nIntensidade de treino (mundos 3 a 6, 5 temporadas)\n${formatTraining(rows)}`)
  const by = (id: IntensityStats['intensity']) => rows.find((r) => r.intensity === id) as IntensityStats
  const [light, normal, intense] = [by('light'), by('normal'), by('intense')]

  it('Intensa evolui mais os jovens e Leve evolui menos', () => {
    expect(intense.youngGrowth).toBeGreaterThan(normal.youngGrowth * 1.05)
    expect(light.youngGrowth).toBeLessThan(normal.youngGrowth * 0.98)
  })

  it('o custo da Intensa: mais lesões e menos condição; a Leve poupa o elenco', () => {
    expect(intense.injured).toBeGreaterThan(normal.injured)
    expect(normal.injured).toBeGreaterThan(light.injured)
    expect(intense.fitness).toBeLessThan(normal.fitness - 2)
    expect(light.fitness).toBeGreaterThan(normal.fitness + 0.5)
  })

  it('é uma troca: Intensa não vence mais jogos que Normal, e ninguém é melhor nos pontos e na evolução ao mesmo tempo', () => {
    const error = (r: IntensityStats) => r.pointsSd / Math.sqrt(r.teamSeasons)
    expect(intense.relativePoints).toBeLessThan(normal.relativePoints + 1.5 * error(normal))
    const bestPoints = [light, normal, intense].reduce((a, b) => (b.relativePoints > a.relativePoints ? b : a))
    const bestGrowth = [light, normal, intense].reduce((a, b) => (b.youngGrowth > a.youngGrowth ? b : a))
    expect(bestPoints.intensity).not.toBe(bestGrowth.intensity)
  })

  it('nenhuma intensidade abre uma distância enorme nos pontos da temporada', () => {
    const points = rows.map((r) => r.relativePoints)
    expect(Math.max(...points) - Math.min(...points)).toBeLessThan(6)
    expect(Math.abs(light.relativePoints - normal.relativePoints)).toBeLessThan(4)
    expect(Math.abs(intense.relativePoints - normal.relativePoints)).toBeLessThan(4)
  })
})
