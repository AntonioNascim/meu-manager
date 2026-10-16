/**
 * Tamanho do save ao longo de várias temporadas jogadas pelo store (time do jogador sempre no automático).
 * Usado por `npm run analyze -- save` e pelos testes de balanceamento.
 */
import { gzipSync } from 'node:zlib'
import { advanceToMatchday, createGame, nextEventOf, playPendingAuto, startNextSeason } from '../src/store/game'
import type { Game } from '../src/store/game'
import { makeEnvelope } from '../src/store/saveFormat'

export interface SizeRow {
  year: number
  /** Save (JSON) no começo da temporada, no fim dela e o jogo sem compactar no fim. */
  startBytes: number
  endBytes: number
  /** O mesmo save comprimido (gzip): é o que a meta de 3 MB mede. */
  endGzipBytes: number
  rawEndBytes: number
  archiveBytes: number
  /** Soma dos arquivos de resultados das temporadas passadas. */
  seasonsArchived: number
}

const bytes = (value: unknown) => JSON.stringify(value).length

export function playSeason(game: Game): Game {
  let g = game
  for (let i = 0; i < 500 && nextEventOf(g).type !== 'season-end'; i++) g = playPendingAuto(advanceToMatchday(g))
  return advanceToMatchday(g)
}

export function measureSaveSizes(years: number, seed = 12, teamId = 'team-imp'): SizeRow[] {
  let game = createGame(seed, teamId)
  // A diretoria não demite: o objetivo aqui é medir o save, não o desempenho do time.
  const lenient = (g: Game): Game => ({ ...g, season: { ...g.season, teams: g.season.teams.map((t) => (t.id === teamId ? { ...t, objective: { targetPosition: 20, sackingPosition: 20 } } : t)) } })
  game = lenient(game)
  const rows: SizeRow[] = []
  for (let i = 0; i < years; i++) {
    const start = bytes(makeEnvelope(game, 'x'))
    game = playSeason(game)
    rows.push({
      year: game.season.season.year,
      startBytes: start,
      endBytes: bytes(makeEnvelope(game, 'x')),
      endGzipBytes: gzipSync(JSON.stringify(makeEnvelope(game, 'x'))).length,
      rawEndBytes: bytes(game),
      archiveBytes: bytes(game.archive),
      seasonsArchived: game.archive.length,
    })
    if (game.dismissal) break
    game = lenient(startNextSeason(game))
  }
  return rows
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`

export function formatSizes(rows: SizeRow[]): string {
  return [
    'ano   início     fim   (sem compactar)  resumos das temporadas passadas',
    ...rows.map((r) => `${r.year}  ${kb(r.startBytes).padStart(7)} ${kb(r.endBytes).padStart(7)} ${kb(r.endGzipBytes).padStart(10)}  ${kb(r.rawEndBytes).padStart(14)}  ${kb(r.archiveBytes).padStart(10)} (${r.seasonsArchived})`),
  ].join('\n')
}
