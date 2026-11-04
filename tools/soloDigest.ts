/**
 * Impressão digital da carreira solo (Fase 6, B6). Joga carreiras solo com sementes fixas pelo caminho real do jogo (`advanceToMatchday`,
 * `playPendingAuto`, `startNextSeason`) e devolve um resumo (SHA-256 do estado com as chaves em ordem) em vários pontos da carreira.
 *
 * Serve para provar que mexer no motor para a liga online **não muda o jogo solo**: o arquivo `tests/fixtures/solo-digest.json` foi gerado na `main`
 * ANTES da B6 e `tests/soloUnchanged.test.ts` compara o código atual com ele. Para comparar duas versões do código lado a lado (a `main` e uma
 * branch, cada uma numa pasta), rode `node tools/run.mjs soloDigest` em cada uma e compare as saídas (inclusive com `PACOTE_REAL=1`).
 *
 * Uso: node tools/run.mjs soloDigest [--out arquivo.json] [--real]    (--real = mundo real, mais lento)
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { loadWorld } from '../src/data/package/defaultPackage'
import { advanceToMatchday, createGame, playPendingAuto, startNextSeason } from '../src/store/game'
import type { Game } from '../src/store/game'
import { measurementPackage } from './worldPackage'

/** Texto com as chaves em ordem: dois estados iguais dão o mesmo texto. */
export function stable(value: unknown): string {
  return JSON.stringify(JSON.parse(JSON.stringify(value)), (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  )
}

export const digestOf = (value: unknown): string => createHash('sha256').update(stable(value)).digest('hex').slice(0, 24)

export interface SoloScenario {
  name: string
  seed: number
  team: string
  cups: boolean
  /** Dias de jogos até o primeiro ponto, depois até o fim da temporada e mais dias na seguinte. */
  days: number
  nextDays: number
  real?: boolean
}

export const SCENARIOS: SoloScenario[] = [
  { name: 'ficticio-ligas', seed: 6, team: 'top', cups: false, days: 14, nextDays: 6 },
  { name: 'ficticio-ligas-b', seed: 21, team: 'top', cups: false, days: 40, nextDays: 4 },
  { name: 'ficticio-copas', seed: 9, team: 'top', cups: true, days: 30, nextDays: 5 },
]

/** O roteiro joga no piloto automático e não quer parar na demissão: descarta-a e segue (só o roteiro; o motor não sabe disso). */
const forgive = (g: Game): Game => {
  if (!g.dismissal) return g
  const { dismissal: _dismissed, ...rest } = g
  return rest
}

const play = (game: Game, days: number): Game => {
  let g = game
  for (let i = 0; i < days; i++) g = forgive(playPendingAuto(advanceToMatchday(g)))
  return g
}

/** Joga o cenário e devolve os resumos: depois de `days`, no fim da temporada (virada) e `nextDays` na seguinte. */
export function runScenario(s: SoloScenario): Record<string, string> {
  let game: Game
  if (s.real) {
    const raw = measurementPackage(s.seed)
    const world = loadWorld(s.seed, raw)
    game = createGame(s.seed, s.team === 'first' ? world.teams[0]!.id : s.team, { world, dataPackage: raw, dataPackageId: 'mundo-real', cups: s.cups })
  } else {
    const topTeam = [...loadWorld(s.seed).teams].sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))[0]!.id
    game = createGame(s.seed, s.team === 'top' ? topTeam : s.team, { cups: s.cups })
  }
  const out: Record<string, string> = {}
  out.start = digestOf(game)
  game = play(game, s.days)
  out.afterDays = digestOf(game)
  // Até o fim da temporada do técnico (com limite, para nunca travar).
  for (let i = 0; i < 400 && game.season.season.phase !== 'end-of-season'; i++) game = forgive(playPendingAuto(advanceToMatchday(game)))
  out.endOfSeason = digestOf(game)
  {
    game = startNextSeason(game)
    out.afterTurn = digestOf(game)
    game = play(game, s.nextDays)
    out.nextSeason = digestOf(game)
  }
  return out
}

export function runAll(scenarios: SoloScenario[] = SCENARIOS): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const s of scenarios) out[s.name] = runScenario(s)
  return out
}

// Execução direta (ferramenta de linha de comando).
if (process.argv[1] && /soloDigest/.test(process.argv[1])) {
  const real = process.argv.includes('--real')
  const scenarios = real ? [{ name: 'real-copas', seed: 7, team: 'first', cups: true, days: 25, nextDays: 5, real: true } satisfies SoloScenario] : SCENARIOS
  const result = runAll(scenarios)
  const i = process.argv.indexOf('--out')
  if (i !== -1) writeFileSync(process.argv[i + 1]!, JSON.stringify(result, null, 2) + '\n')
  else console.log(JSON.stringify(result, null, 2))
}
