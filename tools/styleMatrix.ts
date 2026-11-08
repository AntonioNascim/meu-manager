/**
 * Matriz dos estilos de jogo (Fase 6D): cada estilo contra cada estilo, com elencos equivalentes (os mesmos times jogam com os dois estilos, em casa e
 * fora), em pontos por jogo do estilo da linha. Mostra também a média de cada estilo (contra todos), o saldo de gols e a dependência do elenco
 * (o estilo com o melhor e o pior elenco para ele).
 *   node tools/run.mjs styleMatrix [--mundos 3] [--pares 40]
 */
import { generateWorld } from '../src/data/generateWorld'
import { buildTactic } from '../src/engine/lineup'
import { simulateMatch } from '../src/engine/match'
import { PLAY_STYLES } from '../src/engine/types'
import type { Player, PlayStyle, Team } from '../src/engine/types'

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1] ?? fallback) : fallback
}
const WORLDS = arg('mundos', 3)
const PAIRS = arg('pares', 40)

const pts = new Map<string, number[]>()
const gd = new Map<string, number[]>()
const push = (m: Map<string, number[]>, k: string, v: number) => m.set(k, [...(m.get(k) ?? []), v])
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
// Dependência do elenco: pontos do estilo contra os outros, por tercil do "perfil" do elenco para ele.
const fit = new Map<string, any[]>()

const strength = (squad: Player[], style: PlayStyle): number => {
  const by = (slots: string[]) => squad.filter((p) => slots.includes(p.position))
  const m = (ps: Player[], f: (p: Player) => number) => (ps.length ? ps.reduce((a, p) => a + f(p), 0) / ps.length : 0)
  if (style === 'direct') return m(by(['ST']), (p) => (p.attributes.heading + p.attributes.strength + p.attributes.pace) / 3)
  if (style === 'wings') return m(by(['RB', 'LB', 'RW', 'LW']), (p) => (p.attributes.crossing + p.attributes.dribbling + p.attributes.pace) / 3)
  if (style === 'possession') return m(by(['DM', 'CM', 'AM']), (p) => (p.attributes.passing + p.attributes.vision + p.attributes.ballControl) / 3)
  if (style === 'high-press') return m(squad, (p) => p.attributes.stamina)
  return m(by(['ST', 'RW', 'LW']), (p) => p.attributes.pace)
}

for (let w = 0; w < WORLDS; w++) {
  const seed = 201 + w
  const world = generateWorld({ seed })
  const squads = new Map<string, Player[]>(world.teams.map((t) => [t.id, world.players.filter((p) => p.teamId === t.id)]))
  const teams = world.teams.filter((t) => t.tier === 1)
  let n = 0
  for (let k = 0; k < PAIRS; k++) {
    const x = teams[(k * 7) % teams.length] as Team
    const y = teams[(k * 7 + 3 + (k % 5)) % teams.length] as Team
    if (x === y) continue
    for (const a of PLAY_STYLES) {
      for (const b of PLAY_STYLES) {
        const tx = { ...x, tactic: buildTactic(squads.get(x.id) as Player[], { formationId: x.tactic.formationId, style: a, mentality: 0 }) }
        const ty = { ...y, tactic: buildTactic(squads.get(y.id) as Player[], { formationId: y.tactic.formationId, style: b, mentality: 0 }) }
        for (const home of [true, false]) {
          const r = simulateMatch({
            home: { team: home ? tx : ty, players: squads.get(home ? x.id : y.id) as Player[] },
            away: { team: home ? ty : tx, players: squads.get(home ? y.id : x.id) as Player[] },
            seed: ++n + seed * 100_000,
          })
          const gf = home ? r.homeGoals : r.awayGoals
          const ga = home ? r.awayGoals : r.homeGoals
          const p = gf > ga ? 3 : gf === ga ? 1 : 0
          push(pts, `${a}|${b}`, p)
          push(gd, `${a}|${b}`, gf - ga)
          // O mesmo jogo visto pelo outro time (estilo b contra a).
          push(pts, `${b}|${a}`, gf > ga ? 0 : gf === ga ? 1 : 3)
          push(gd, `${b}|${a}`, ga - gf)
          // Pontos relativos à força: o mesmo time x com o estilo a contra o estilo b do time y.
          fit.set(a, [...(fit.get(a) ?? []), { fit: strength(squads.get(x.id) as Player[], a), points: p }])
        }
      }
    }
  }
}

const short: Record<string, string> = { possession: 'toque', 'counter-attack': 'contra', 'high-press': 'pressão', direct: 'direto', wings: 'pontas' }
console.log(`\nPontos por jogo do estilo da LINHA contra o da COLUNA (${WORLDS} mundos, ${PAIRS} pares por mundo)\n`)
console.log(['            ', ...PLAY_STYLES.map((s) => short[s]!.padStart(8)), '   média   saldo'].join(' '))
for (const a of PLAY_STYLES) {
  const row = PLAY_STYLES.map((b) => mean(pts.get(`${a}|${b}`) ?? []))
  const g = mean(PLAY_STYLES.flatMap((b) => gd.get(`${a}|${b}`) ?? []))
  console.log([short[a]!.padEnd(12), ...row.map((v) => v.toFixed(2).padStart(8)), mean(row).toFixed(3).padStart(8), g.toFixed(3).padStart(7)].join(' '))
}
const means = PLAY_STYLES.map((a) => mean(PLAY_STYLES.flatMap((b) => pts.get(`${a}|${b}`) ?? [])))
console.log(`\namplitude das médias: ${(Math.max(...means) - Math.min(...means)).toFixed(3)} pontos por jogo (meta: até ~0,06)`)
let worst = 0
for (const a of PLAY_STYLES) {
  for (const b of PLAY_STYLES) {
    if (a === b) continue
    const v = mean(pts.get(`${a}|${b}`) ?? [])
    worst = Math.max(worst, Math.abs(v - 1.4))
  }
}
console.log(`maior desvio de um confronto em relação ao equilíbrio (1,4 pt/jogo): ${worst.toFixed(2)}`)
// Elenco certo x errado: terço de cima e de baixo do perfil do estilo.
for (const a of PLAY_STYLES) {
  const list = (fit.get(a) ?? []) as { fit: number; points: number }[]
  const sorted = [...list].sort((p, q) => p.fit - q.fit)
  const third = Math.floor(sorted.length / 3)
  const low = mean(sorted.slice(0, third).map((e) => e.points))
  const high = mean(sorted.slice(-third).map((e) => e.points))
  console.log(`${short[a]!.padEnd(8)} elenco fraco p/ o estilo: ${low.toFixed(2)} | elenco forte p/ o estilo: ${high.toFixed(2)} (diferença ${(high - low).toFixed(2)})`)
}
