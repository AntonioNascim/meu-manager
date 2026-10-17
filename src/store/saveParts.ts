/**
 * O jogo em partes: em vez de um objeto só, o save é um conjunto de pedaços pequenos (o resto do jogo, o calendário, o
 * mercado, o treino e, para as listas grandes, um pedaço por clube ou por grupo de rodadas). Cada pedaço traz as
 * referências dos objetos que o formam: como o motor é imutável, o que não mudou entre dois saves tem as mesmas
 * referências e não precisa ser serializado, comprimido nem gravado de novo. Puro: nada aqui toca o navegador.
 */
import type { Game } from './game'

/** Um pedaço do save: o nome, as referências para comparar com o save anterior e a função que monta o valor a gravar. */
export interface PartPlan {
  name: string
  refs: readonly unknown[]
  build: () => unknown
}

/** Rodadas de uma competição que ficam no mesmo pedaço das partidas. */
export const MATCH_ROUNDS_PER_PART = 6

const CORE = 'core'
const CALENDAR = 'calendar'
const MATCH_IDS = 'matchIds'
const MARKET = 'market'
const TRAINING = 'training'

/** Chave e valor, na ordem das chaves: serve para comparar dois objetos campo a campo por referência. */
function flat(object: object): unknown[] {
  const out: unknown[] = []
  for (const key of Object.keys(object).sort()) out.push(key, (object as Record<string, unknown>)[key])
  return out
}

interface Group {
  refs: unknown[]
  idx: number[]
  items: unknown[]
}

/** Divide uma lista em pedaços pelo grupo de cada item, guardando a posição de cada um para devolver a lista na mesma ordem. */
function chunked<T>(prefix: string, list: readonly T[], groupOf: (item: T) => string): PartPlan[] {
  const groups = new Map<string, Group>()
  list.forEach((item, i) => {
    const name = `${prefix}:${groupOf(item)}`
    let g = groups.get(name)
    if (!g) groups.set(name, (g = { refs: [], idx: [], items: [] }))
    g.refs.push(i, item)
    g.idx.push(i)
    g.items.push(item)
  })
  return [...groups].map(([name, g]) => ({ name, refs: g.refs, build: () => ({ idx: g.idx, items: g.items }) }))
}

/** Os pedaços do jogo. O jogo deve estar compactado (`compactGame`). */
export function planParts(game: Game): PartPlan[] {
  const { season, ...rest } = game
  const { season: calendarFull, matches, teams, players, academy, market, training, ...scalars } = season
  const { matchIds, ...calendar } = calendarFull
  const clubLeague = new Map<string, string>()
  for (const c of calendarFull.competitions) for (const id of c.teamIds) clubLeague.set(id, c.id)
  return [
    { name: CORE, refs: [...flat(rest), ...flat(scalars)], build: () => ({ game: rest, state: scalars }) },
    { name: CALENDAR, refs: flat(calendar), build: () => calendar },
    { name: MATCH_IDS, refs: [matchIds], build: () => matchIds },
    { name: MARKET, refs: [market], build: () => market },
    { name: TRAINING, refs: [training], build: () => training },
    ...chunked('m', matches, (m) => `${m.competitionId}:${Math.floor((m.round - 1) / MATCH_ROUNDS_PER_PART)}`),
    ...chunked('t', teams, (t) => clubLeague.get(t.id) ?? 'none'),
    ...chunked('p', players, (p) => p.teamId ?? 'free'),
    ...chunked('a', academy, (p) => p.teamId ?? 'free'),
  ]
}

/** `true` se as duas listas de referências são iguais, uma a uma. */
export function sameRefs(a: readonly unknown[] | undefined, b: readonly unknown[]): boolean {
  if (!a || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

interface Chunk {
  idx: number[]
  items: unknown[]
}

function join<T>(prefix: string, values: Map<string, unknown>): T[] {
  const out: T[] = []
  for (const [name, value] of values) {
    if (!name.startsWith(`${prefix}:`)) continue
    const chunk = value as Chunk
    chunk.idx.forEach((position, i) => {
      out[position] = chunk.items[i] as T
    })
  }
  for (let i = 0; i < out.length; i++) if (out[i] === undefined) throw new Error(`pedaço ausente (${prefix}, posição ${i})`)
  return out
}

/** Monta o jogo de volta a partir dos valores dos pedaços (nome → valor lido). Lança erro se faltar pedaço. */
export function joinParts(values: Map<string, unknown>): Game {
  for (const name of [CORE, CALENDAR, MATCH_IDS, MARKET, TRAINING]) if (!values.has(name)) throw new Error(`pedaço ausente (${name})`)
  const core = values.get(CORE) as { game: Omit<Game, 'season'>; state: Record<string, unknown> }
  const calendar = values.get(CALENDAR) as Record<string, unknown>
  return {
    ...core.game,
    season: {
      ...core.state,
      season: { ...calendar, matchIds: values.get(MATCH_IDS) },
      matches: join('m', values),
      teams: join('t', values),
      players: join('p', values),
      academy: join('a', values),
      market: values.get(MARKET),
      training: values.get(TRAINING),
    },
  } as Game
}
