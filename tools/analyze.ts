/**
 * Ferramenta de análise do balanceamento (npm run analyze). Não faz parte do jogo nem dos testes:
 * simula mundos e temporadas e imprime tabelas para comparar com as metas do CLAUDE.md.
 *
 *   npm run analyze                      tudo, com os padrões
 *   npm run analyze -- bands --seasons 40
 *   npm run analyze -- styles --worlds 8
 *   npm run analyze -- home --matches 6000
 *
 * Seções: bands (posição e pontos por faixa de força), styles (estilos com elencos equivalentes),
 * home (vantagem de jogar em casa por série e por ocupação do estádio).
 * Opções: --seasons N (bands), --worlds N (styles e home), --matches N (home), --seed N (primeira semente).
 */
import { generateWorld } from '../src/data/generateWorld'
import type { World } from '../src/data/generateWorld'
import { buildTactic } from '../src/engine/lineup'
import { simulateMatch } from '../src/engine/match'
import { crowdFill } from '../src/engine/match/state'
import { createRng } from '../src/engine/rng'
import type { Player, PlayStyle, Team } from '../src/engine/types'
import { simulateSeasons } from '../tests/balance/helpers'
import type { SeasonSummary } from '../tests/balance/helpers'

const SECTIONS = ['bands', 'styles', 'home'] as const
type Section = (typeof SECTIONS)[number]

function parseArgs(argv: string[]) {
  const sections: Section[] = []
  const options: Record<string, number> = { seasons: 20, worlds: 5, matches: 4000, seed: 1 }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = Number(argv[++i])
      if (!(key in options) || !Number.isFinite(value)) throw new Error(`Opção inválida: ${arg} ${argv[i] ?? ''}`)
      options[key] = value
    } else if ((SECTIONS as readonly string[]).includes(arg)) {
      sections.push(arg as Section)
    } else {
      throw new Error(`Seção desconhecida: ${arg} (use ${SECTIONS.join(', ')})`)
    }
  }
  return { sections: sections.length ? sections : [...SECTIONS], options }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
const f = (x: number, digits = 1) => x.toFixed(digits)
const pct = (x: number) => `${(100 * x).toFixed(1)}%`

function squadsOf(world: World): Map<string, Player[]> {
  return new Map(world.teams.map((t) => [t.id, world.players.filter((p) => p.teamId === t.id)]))
}

/** Posição e pontos médios por faixa de força dos titulares (top 4, médios, fracos). */
function bands(seasons: SeasonSummary[]) {
  const rows = seasons.flatMap((season) => {
    const byStrength = [...season.table].sort((a, b) => b.strength - a.strength)
    return season.table.map((row, i) => ({ pos: i + 1, points: row.points, strengthRank: byStrength.indexOf(row) + 1 }))
  })
  const band = (from: number, to: number) => rows.filter((r) => r.strengthRank >= from && r.strengthRank <= to)
  const line = (label: string, g: typeof rows) =>
    `${label.padEnd(12)} ${f(mean(g.map((r) => r.pos))).padStart(5)}º ${f(mean(g.map((r) => r.points))).padStart(7)} pts`
  const titlesOutsideTop4 = 1 - band(1, 4).filter((r) => r.pos === 1).length / seasons.length
  const g4Outsiders = rows.filter((r) => r.pos <= 4 && r.strengthRank > 4).length / (seasons.length * 4)
  return [
    line('top 4', band(1, 4)),
    line('médios', band(5, 12)),
    line('fracos', band(13, 20)),
    line('o mais forte', rows.filter((r) => r.strengthRank === 1)),
    `títulos fora do top 4: ${pct(titlesOutsideTop4)} | G4 fora do top 4: ${pct(g4Outsiders)}`,
  ]
}

function runBands(seasonsCount: number, firstSeed: number) {
  const runs = Array.from({ length: seasonsCount }, (_, i) => {
    const seed = firstSeed + i
    return simulateSeasons(generateWorld({ seed }), `season-${seed}`)
  })
  for (const tier of [1, 2] as const) {
    const seasons = runs.map((r) => r[tier])
    const champion = mean(seasons.map((s) => s.table[0]?.points ?? 0))
    console.log(
      [
        `\nSérie ${tier === 1 ? 'A' : 'B'} por faixa de força (${seasonsCount} temporadas)`,
        ...bands(seasons),
        `campeão ${f(champion)} pts | gols/jogo ${f(mean(seasons.map((s) => s.goalsPerMatch)), 2)} | mandante ${pct(mean(seasons.map((s) => s.homeWinRate)))} | empates ${pct(mean(seasons.map((s) => s.drawRate)))}`,
      ].join('\n'),
    )
  }
}

const STYLES: PlayStyle[] = ['possession', 'counter-attack', 'high-press']

/** Cada time da Série A joga a liga com cada estilo (mesmo elenco, formação e mentalidade). */
function runStyles(worlds: number, firstSeed: number) {
  const points = new Map<PlayStyle, number[]>(STYLES.map((s) => [s, []]))
  const goalDiff = new Map<PlayStyle, number[]>(STYLES.map((s) => [s, []]))
  let n = 0
  for (let w = 0; w < worlds; w++) {
    const seed = firstSeed + w
    const world = generateWorld({ seed })
    const squads = squadsOf(world)
    const teams = world.teams.filter((t) => t.tier === 1)
    for (const team of teams) {
      for (const style of STYLES) {
        const tactic = buildTactic(squads.get(team.id) as Player[], { formationId: team.tactic.formationId, style, mentality: team.tactic.mentality })
        const tested: Team = { ...team, tactic }
        for (const opponent of teams) {
          if (opponent === team) continue
          for (const home of [true, false]) {
            const r = simulateMatch({
              home: { team: home ? tested : opponent, players: squads.get(home ? team.id : opponent.id) as Player[] },
              away: { team: home ? opponent : tested, players: squads.get(home ? opponent.id : team.id) as Player[] },
              seed: ++n + seed * 100_000,
            })
            const gf = home ? r.homeGoals : r.awayGoals
            const ga = home ? r.awayGoals : r.homeGoals
            points.get(style)?.push(gf > ga ? 3 : gf === ga ? 1 : 0)
            goalDiff.get(style)?.push(gf - ga)
          }
        }
      }
    }
  }
  console.log(
    [
      `\nEstilos com elencos equivalentes (${worlds} mundos, Série A)`,
      'estilo           pts/jogo   saldo/jogo',
      ...STYLES.map((s) => `${s.padEnd(16)} ${f(mean(points.get(s) ?? []), 3).padStart(7)}   ${f(mean(goalDiff.get(s) ?? []), 3).padStart(9)}`),
    ].join('\n'),
  )
}

/**
 * Vantagem do mandante por série: resultado com a ocupação estimada (padrão do motor), com estádio
 * cheio e com estádio vazio. Mostra também a ocupação estimada média e o tamanho dos estádios.
 */
function runHome(worlds: number, matches: number, firstSeed: number) {
  console.log(`\nVantagem do mandante (${worlds} mundos, ${matches} partidas por série e por cenário)`)
  console.log('série   ocupação  estádio   cenário           mandante  empate  visitante  saldo do mandante')
  for (const tier of [1, 2] as const) {
    const fills: number[] = []
    const capacities: number[] = []
    const scenarios = { 'estimada (padrão)': undefined, 'estádio cheio': 1, 'estádio vazio': 0 } as const
    for (const [label, ratio] of Object.entries(scenarios)) {
      const rng = createRng(`home-${tier}`)
      let home = 0
      let draw = 0
      let away = 0
      let diff = 0
      let total = 0
      for (let w = 0; w < worlds; w++) {
        const world = generateWorld({ seed: firstSeed + w })
        const squads = squadsOf(world)
        const teams = world.teams.filter((t) => t.tier === tier)
        const per = Math.round(matches / worlds)
        for (let i = 0; i < per; i++) {
          const h = rng.pick(teams)
          let a = rng.pick(teams)
          while (a === h) a = rng.pick(teams)
          if (ratio === undefined) {
            fills.push(crowdFill(h))
            capacities.push(h.stadium.capacity)
          }
          const r = simulateMatch({
            home: { team: h, players: squads.get(h.id) as Player[] },
            away: { team: a, players: squads.get(a.id) as Player[] },
            seed: rng.int(0, 2 ** 31 - 1),
            ...(ratio === undefined ? {} : { attendance: ratio * h.stadium.capacity }),
          })
          if (r.homeGoals > r.awayGoals) home++
          else if (r.homeGoals === r.awayGoals) draw++
          else away++
          diff += r.homeGoals - r.awayGoals
          total++
        }
      }
      console.log(
        [
          (tier === 1 ? 'A' : 'B').padEnd(7),
          (fills.length ? pct(mean(fills)) : '').padStart(8),
          (capacities.length ? f(mean(capacities) / 1000) + ' mil' : '').padStart(9),
          label.padEnd(17),
          pct(home / total).padStart(9),
          pct(draw / total).padStart(7),
          pct(away / total).padStart(10),
          f(diff / total, 3).padStart(11),
        ].join('  '),
      )
    }
  }
}

const { sections, options } = parseArgs(process.argv.slice(2))
const t0 = performance.now()
for (const section of sections) {
  if (section === 'bands') runBands(options.seasons as number, options.seed as number)
  if (section === 'styles') runStyles(options.worlds as number, options.seed as number)
  if (section === 'home') runHome(options.worlds as number, options.matches as number, options.seed as number)
}
console.log(`\n(${f((performance.now() - t0) / 1000)} s)`)
