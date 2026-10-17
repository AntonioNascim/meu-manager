/**
 * Save em partes no mundo do Brasil (60 clubes): uma temporada inteira gravada a cada avanço, como o salvamento automático.
 * O mundo de 282 clubes é medido por `node tools/run.mjs saveWorld` (veja a seção da B4 em docs/fase2-proposta.md).
 */
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { BRAZIL_ONLY, buildScaleGame } from '../../src/diagnostics/scaleWorld'
import { advanceToMatchday, nextEventOf, playPendingAuto } from '../../src/store/game'
import type { Game } from '../../src/store/game'
import { compactGame } from '../../src/store/saveFormat'
import { SaveStore } from '../../src/store/saves'
import type { SaveStats } from '../../src/store/saves'

describe('save em partes: temporada inteira do Brasil (60 clubes)', () => {
  it('fica abaixo de 3 MB comprimidos do começo ao fim, grava só parte dos pedaços e abre igual', async () => {
    const store = new SaveStore('meu-manager-balance-partes')
    try {
      let game: Game = buildScaleGame(BRAZIL_ONLY, 7).game
      const stats: SaveStats[] = [(await store.saveDetailed(1, game)).stats]
      for (let i = 0; i < 600 && nextEventOf(game).type !== 'season-end'; i++) {
        game = playPendingAuto(advanceToMatchday(game))
        stats.push((await store.saveDetailed(1, game)).stats)
        if (game.dismissal) break
      }
      const first = stats[0]!
      const rest = stats.slice(1)
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
      console.log(`\nSave em partes, Brasil: início ${(first.totalBytes / 1024).toFixed(0)} KB, fim ${(stats[stats.length - 1]!.totalBytes / 1024).toFixed(0)} KB, ${first.parts} pedaços; mediana ${median(rest.map((s) => s.ms)).toFixed(0)} ms por save, ${median(rest.map((s) => s.written))} pedaços e ${(median(rest.map((s) => s.writtenBytes)) / 1024).toFixed(0)} KB por save`)
      expect(rest.length).toBeGreaterThan(30)
      for (const s of stats) expect(s.totalBytes).toBeLessThan(3 * 1024 * 1024)
      // O JSON gravado pesa pelo menos 4 vezes o gravado (a compressão vale a pena).
      expect(first.jsonBytes).toBeGreaterThan(first.totalBytes * 4)
      // Cada save regrava só parte do jogo (as ligas que não jogaram naquele dia e o que não mudou ficam como estão).
      expect(median(rest.map((s) => s.written))).toBeLessThan(first.parts)
      expect(median(rest.map((s) => s.ms))).toBeLessThan(1000)
      store.close()
      expect(await store.loadSlot(1)).toEqual(JSON.parse(JSON.stringify(compactGame(game))))
    } finally {
      await store.destroy()
    }
  })
})
