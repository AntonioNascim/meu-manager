/**
 * O save não cresce sem limite: depois de 10 temporadas jogadas pelo store continua do mesmo tamanho
 * (as temporadas passadas viram só um resumo de poucos KB). Imprime a tabela (npm run test:balance).
 */
import { describe, expect, it } from 'vitest'
import { formatSizes, measureSaveSizes } from '../../tools/saveSize'

describe('tamanho do save', () => {
  const rows = measureSaveSizes(10)
  console.log(`\nTamanho do save (10 temporadas)\n${formatSizes(rows)}`)
  const first = rows[0]!
  const last = rows[rows.length - 1]!

  it('joga as 10 temporadas e arquiva cada uma', () => {
    expect(rows).toHaveLength(10)
    expect(last.seasonsArchived).toBe(9)
  })

  it('depois de 10 temporadas o save tem praticamente o mesmo tamanho (e fica abaixo de 3 MB)', () => {
    // Nos primeiros anos o save cresce um pouco porque as bases dos clubes se enchem (de ~9 para ~13 jovens); daí em diante fica plano.
    expect(last.endBytes).toBeLessThan(first.endBytes * 1.25)
    expect(last.endBytes).toBeLessThan(3 * 1024 * 1024)
    const settled = rows[5]!
    expect(last.endBytes).toBeLessThan(settled.endBytes * 1.05)
    expect(last.startBytes).toBeLessThan(settled.startBytes * 1.05)
  })

  it('cada temporada passada guardada pesa poucos KB', () => {
    expect(last.archiveBytes / last.seasonsArchived).toBeLessThan(5 * 1024)
  })

  it('a compactação tira a maior parte do peso do jogo no fim da temporada', () => {
    expect(first.endBytes).toBeLessThan(first.rawEndBytes * 0.3)
  })
})
