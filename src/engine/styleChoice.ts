/**
 * A IA escolhe o estilo de jogo de cada clube (Fase 6D): na virada de temporada, e só para clubes sem técnico humano. Cada estilo recebe uma nota de ajuste ao
 * elenco (o que ele precisa de bom no time), medida **contra os outros clubes do grupo** (cada estilo tem uma escala própria; a nota é o desvio em relação à
 * média do grupo, então todo estilo tem clubes que o preferem), mais um peso pela reputação do clube, um bônus para o estilo que o clube já joga (não muda
 * toda temporada) e um desvio fixo por clube e temporada (hash do id), para clubes parecidos não escolherem todos igual. Determinístico: não usa gerador de
 * números aleatórios. O mundo novo continua nascendo com os três estilos de antes (`pickStyle`): os dois estilos novos entram por aqui.
 */
import type { Player, PlayStyle, Position, Team, TeamId } from './types'
import { PLAY_STYLES } from './types'

const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)

/** A média dos `n` melhores do grupo de posições pelo atributo composto. */
function topMean(squad: readonly Player[], slots: readonly Position[], n: number, score: (p: Player) => number): number {
  return avg(
    squad
      .filter((p) => slots.includes(p.position))
      .map(score)
      .sort((a, b) => b - a)
      .slice(0, n),
  )
}

/** Quanto o elenco serve ao estilo, em pontos de atributo (cada estilo tem a sua escala; compare sempre o mesmo estilo entre elencos). */
export function styleFit(squad: readonly Player[], style: PlayStyle): number {
  const a = (p: Player) => p.attributes
  switch (style) {
    // Atacantes altos, fortes ou rápidos.
    case 'direct':
      return topMean(squad, ['ST', 'RW', 'LW'], 3, (p) => (a(p).heading + a(p).strength + a(p).pace) / 3)
    // Laterais e pontas de cruzamento, drible e velocidade.
    case 'wings':
      return topMean(squad, ['RB', 'LB', 'RW', 'LW'], 4, (p) => (a(p).crossing + a(p).dribbling + a(p).pace) / 3)
    // Meio de passe, visão e controle.
    case 'possession':
      return topMean(squad, ['DM', 'CM', 'AM'], 4, (p) => (a(p).passing + a(p).vision + a(p).ballControl) / 3)
    // Fôlego e desarme de todo o time, e juventude (jovens aguentam mais).
    case 'high-press':
      return avg(squad.map((p) => (a(p).stamina * 2 + a(p).tackling) / 3)) - Math.max(0, avg(squad.map((p) => p.age)) - 27)
    // Atacantes rápidos e driblador, num time em que o meio não é o forte.
    case 'counter-attack':
      return topMean(squad, ['ST', 'RW', 'LW', 'AM'], 3, (p) => (a(p).pace * 2 + a(p).dribbling) / 3) - 0.25 * topMean(squad, ['DM', 'CM', 'AM'], 3, (p) => (a(p).passing + a(p).vision) / 2)
  }
}

/** Peso do estilo pela reputação do clube (1 a 20), em desvios: os grandes tendem a jogar com a bola, os pequenos a esperar o rival. */
function reputationWeight(style: PlayStyle, reputation: number): number {
  const big = Math.max(-1, Math.min(1, (reputation - 10) / 8))
  switch (style) {
    case 'possession':
      return 0.7 * big
    case 'high-press':
      return 0.3 * big
    case 'counter-attack':
      return -0.7 * big
    case 'direct':
      return -0.4 * big
    case 'wings':
      return 0.3 // o estilo mais raro pelo ajuste ao elenco: um pequeno empurrão para aparecer em proporção parecida com os outros
  }
}

/** Desvio fixo por clube, temporada e estilo: 0 a 1 (hash simples, FNV-1a). */
function jitter(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 4294967296
}

export interface StyleCandidate {
  team: Pick<Team, 'id' | 'reputation'>
  squad: readonly Player[]
  /** O estilo que o clube jogou até agora. */
  current: PlayStyle
}

/** Peso de continuar no estilo atual e do desvio fixo, em desvios do ajuste ao elenco. */
const STICKY = 0.5
const JITTER = 1.2

/**
 * O estilo de cada clube do grupo (uma liga, uma pirâmide ou o mundo todo): o ajuste ao elenco de cada estilo é medido contra a média e o desvio do grupo.
 * Grupo de um só clube: sem o que comparar, o ajuste vale zero e decidem a reputação, o hábito e o desvio fixo.
 */
export function chooseAiStyles(group: readonly StyleCandidate[], year: number): Map<TeamId, PlayStyle> {
  const fits = new Map<PlayStyle, number[]>(PLAY_STYLES.map((s) => [s, group.map((c) => styleFit(c.squad, s))]))
  const stats = new Map<PlayStyle, { mean: number; sd: number }>()
  for (const [style, values] of fits) {
    const mean = avg(values)
    const sd = Math.sqrt(avg(values.map((v) => (v - mean) ** 2)))
    stats.set(style, { mean, sd: sd > 0.01 ? sd : 1 })
  }
  const out = new Map<TeamId, PlayStyle>()
  group.forEach((c, i) => {
    let best = c.current
    let bestScore = -Infinity
    for (const style of PLAY_STYLES) {
      const s = stats.get(style) as { mean: number; sd: number }
      const z = group.length > 1 ? (((fits.get(style) as number[])[i] as number) - s.mean) / s.sd : 0
      const score = z + reputationWeight(style, c.team.reputation) + (style === c.current ? STICKY : 0) + jitter(`${c.team.id}:${year}:${style}`) * JITTER
      if (score > bestScore) {
        bestScore = score
        best = style
      }
    }
    out.set(c.team.id, best)
  })
  return out
}
