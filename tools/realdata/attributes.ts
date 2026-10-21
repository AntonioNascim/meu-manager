/**
 * Fase 5C: atributos dos jogadores reais. O nível de cada jogador parte do nível do clube (o mesmo do jogo: reputação, divisão e economia da
 * liga, `clubLevel`) e se afasta dele por dois sinais de qualidade que a Wikipedia dá:
 *
 * - **a fama dentro do clube** (páginas do Wikidata em outras línguas): os mais famosos do elenco, por grupo (goleiros e jogadores de linha),
 *   ficam com as vagas de titular e os menos famosos com as de reserva; a ordem tem um ruído, porque fama não é qualidade;
 * - **a fama absoluta**: a partir de ~20 páginas a fama diz a qualidade do jogador por si (`qualityCurve`) e pesa cada vez mais na
 *   força-alvo (`fameWeight`, até 85%) no lugar do clube: um craque num clube fraco continua craque e um craque num clube grande não vira
 *   super-craque por somar os dois. A fama é de carreira, então o jogador com mais de 31 anos perde parte dela (`fameAge`).
 *
 * A fama de carreira é misturada com as **visualizações recentes** da página do jogador na Wikipedia (`blendFame`): quem está em alta agora
 * sobe e quem só vive da carreira desce.
 *
 * A força-alvo sai daí e `generateAttributes` (a mesma geração do jogo) é repetida, com o mesmo sorteio, até a força na posição bater no alvo.
 * Tudo é determinístico: o sorteio vem do id do jogador, então rodar de novo dá os mesmos atributos. Uma força ou um potencial corrigidos
 * à mão (`overrides`) trocam o alvo. Funções puras.
 */
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from '../../src/engine/config'
import { overallForPosition } from '../../src/engine/overall'
import { createRng } from '../../src/engine/rng'
import { ageOn } from '../../src/engine/season/dates'
import type { Attributes, LeagueEconomy, Nationality, Position } from '../../src/engine/types'
import { generateAttributes, hiddenAttribute, softCap } from '../../src/data/generatePlayer'
import { GENERATION } from '../../src/data/generationConfig'
import { clubLevel } from '../../src/data/package/realPlayer'

/** Calibragem (ajustada olhando a distribuição do mundo inteiro: `npm run dados:finalizar` imprime as contagens por faixa). */
export const REAL_ATTRIBUTES = {
  /** Titulares de linha por clube (os 10 mais famosos) e de gol (o mais famoso). */
  starters: { outfield: 10, goalkeeper: 1 },
  /** Os titulares ficam em volta do nível do clube, de +spread (o mais famoso) a -spread (o menos). */
  starterSpread: 2.5,
  /** Reserva = nível do clube menos isto (o jogo usa `GENERATION.backupPenalty`), mais um pouco de ordem entre eles. */
  benchSpread: 1.5,
  /** Ruído da ordem por fama (em log2 de páginas): fama não é qualidade, e os titulares nem sempre são os mais famosos. */
  rankNoise: 0.6,
  /** Ruído individual da força (pontos): o mesmo desvio do talento no jogo. */
  talentNoise: GENERATION.talentSd,
  /** Jogadores da base: mais fracos que os do elenco (o jogo também gera a base abaixo dos profissionais). */
  academyPenalty: 5,
  /** Quem ainda cresce vale menos que o nome sugere, e quem passou dos 34 já perdeu parte do que tinha. */
  youth: { untilAge: 21, perYear: 1.2 },
  old: { fromAge: 31, perYear: 1.0 },
  /** Teto da força-alvo (acima disso só por correção à mão). */
  maxTarget: 94,
  /**
   * Qualidade que a fama sozinha indica: (páginas no Wikidata, força geral), interpolado linearmente. Poucos jogadores passam de 60 páginas
   * no mundo inteiro, e esses são os craques.
   */
  qualityCurve: [[20, 66], [35, 77], [50, 83], [70, 87], [100, 91], [150, 93], [230, 95]] as readonly (readonly [number, number])[],
  /** Peso da fama absoluta na força-alvo: 0 até `from` páginas, sobe até `max` em `to` páginas (o resto é o clube e a ordem no elenco). */
  fameWeight: { from: 20, to: 70, max: 0.9 },
  /** A fama é de carreira: depois dos `fromAge` anos a qualidade que ela indica cai `perYear` por ano. */
  fameAge: { fromAge: 31, perYear: 3 },
  /** Peso das visualizações recentes na fama (0 = só a carreira, 1 = só o momento), na escala logarítmica. */
  viewsBlend: 0.5,
  /** Quem joga num clube mais fraco que `level` está, em média, abaixo da fama que tem (já passou do auge, ou nunca chegou lá): a qualidade da fama cai `perPoint` por ponto de diferença. */
  weakClub: { level: 74, perPoint: 0.35 },
  /**
   * Ajuste por liga sobre o nível que o jogo dá ao clube (reputação, divisão e economia): o jogo calibrou a economia para o mundo
   * fictício, e no mundo real os clubes grandes da Inglaterra, Alemanha e França ficam no mesmo patamar dos da Espanha.
   */
  leagueAdjust: { 'es-1': -1.5, 'en-1': 1, 'de-1': 1.5, 'fr-1': 2.5 } as Readonly<Record<string, number>>,
}

function interpolate(curve: readonly (readonly [number, number])[], x: number): number {
  const first = curve[0] as readonly [number, number]
  const last = curve[curve.length - 1] as readonly [number, number]
  if (x <= first[0]) return first[1]
  if (x >= last[0]) return last[1]
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i] as readonly [number, number]
    const [x0, y0] = curve[i - 1] as readonly [number, number]
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  return last[1]
}

/** Qualidade que a fama indica para um jogador dessa idade (já descontado o peso da carreira nos mais velhos). */
export function fameQuality(fame: number, age: number): number {
  return interpolate(REAL_ATTRIBUTES.qualityCurve, fame) - Math.max(0, age - REAL_ATTRIBUTES.fameAge.fromAge) * REAL_ATTRIBUTES.fameAge.perYear
}

/** Quanto da força-alvo vem da fama absoluta (0 a `max`). */
export function fameWeight(fame: number): number {
  const { from, to, max } = REAL_ATTRIBUTES.fameWeight
  return clamp((fame - from) / (to - from), 0, 1) * max
}

/**
 * Fama de agora: mistura, na escala logarítmica, a fama de carreira (páginas do Wikidata) com a fama que a visibilidade recente da página
 * costuma indicar. A segunda sai de uma regressão (nos jogadores que têm as duas medidas) da fama de carreira sobre as visualizações
 * dos últimos meses, então um jogador com muito mais visualizações do que a carreira prevê sobe, e com muito menos desce. Quem não tem
 * visualizações consultadas fica com a fama de carreira.
 */
export function blendFame(fame: Readonly<Record<string, number>>, views: Readonly<Record<string, number>> | undefined, blend: number = REAL_ATTRIBUTES.viewsBlend): { fame: Record<string, number>; fit?: { intercept: number; slope: number; n: number; r: number } } {
  if (!views) return { fame: { ...fame } }
  const ids = Object.keys(views).filter((id) => (fame[id] ?? 0) >= 5)
  const xs = ids.map((id) => Math.log2(1 + (views[id] as number)))
  const ys = ids.map((id) => Math.log2(1 + (fame[id] as number)))
  const n = ids.length
  if (n < 30) return { fame: { ...fame } }
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += ((xs[i] as number) - mx) * ((ys[i] as number) - my)
    sxx += ((xs[i] as number) - mx) ** 2
    syy += ((ys[i] as number) - my) ** 2
  }
  const slope = sxy / sxx
  const intercept = my - slope * mx
  const out: Record<string, number> = { ...fame }
  for (const id of Object.keys(views)) {
    const career = Math.log2(1 + (fame[id] ?? 0))
    if ((fame[id] ?? 0) < 5) continue
    const moment = Math.max(0, intercept + slope * Math.log2(1 + (views[id] as number)))
    out[id] = Math.max(0, 2 ** ((1 - blend) * career + blend * moment) - 1)
  }
  return { fame: out, fit: { intercept, slope, n, r: sxy / Math.sqrt(sxx * syy) } }
}

export interface RosterPlayer {
  id: string
  name: string
  birthDate: string
  nationality: Nationality
  position: Position
  /** `null` = livre no mercado. */
  clubId: string | null
  /** Jogador da base do clube. */
  academy: boolean
}

export interface RosterClub {
  id: string
  reputation: number
}

export interface LeagueLevel {
  id: string
  tier: 1 | 2 | 3
  economy?: LeagueEconomy
  /** Reputação do clube mais fraco da liga (o nível de quem está livre no mercado). */
  repBottom: number
}

export interface Override {
  overall?: number
  potential?: number
}

export interface GeneratedPlayer {
  id: string
  attributes: Attributes
  potential: number
  hidden: { consistency: number; injuryProneness: number; professionalism: number }
  /** Força geral na posição principal (decimal). */
  overall: number
  /** Força que a calibragem queria (antes de arredondar os atributos). */
  target: number
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/** Atributos com a força na posição o mais perto possível de `target`, sempre com o mesmo sorteio. */
export function solveAttributes(seed: string, position: Position, age: number, target: number): { attributes: Attributes; overall: number } {
  let quality = target
  let best = { attributes: generateAttributes(createRng(seed), position, quality, age, 1), overall: 0 }
  for (let i = 0; i < 8; i++) {
    const attributes = generateAttributes(createRng(seed), position, quality, age, 1)
    const overall = overallForPosition(attributes, position)
    best = { attributes, overall }
    if (Math.abs(overall - target) < 0.3) break
    quality += target - overall
  }
  return best
}

/** Atributos de todos os jogadores de uma liga (elenco, base e livres). `fame` = páginas do Wikidata por id. */
export function generateLeagueAttributes(league: LeagueLevel, clubs: readonly RosterClub[], players: readonly RosterPlayer[], options: { startYear: number; fame: Readonly<Record<string, number>>; overrides?: ReadonlyMap<string, Override> }): Map<string, GeneratedPlayer> {
  const cfg = REAL_ATTRIBUTES
  const clubById = new Map(clubs.map((c) => [c.id, c]))
  const fameOf = (p: RosterPlayer): number => options.fame[p.id] ?? 0
  const targets = new Map<string, number>()

  const levelOf = (clubId: string | null): number => {
    const club = clubId ? clubById.get(clubId) : undefined
    return clubLevel(club ?? { id: `free:${league.id}`, reputation: league.repBottom }, league.tier, league.economy) + (cfg.leagueAdjust[league.id] ?? 0)
  }

  // Ordem por fama dentro de cada clube, goleiros e jogadores de linha em separado (a fama do goleiro é menor, mas o titular é o mais famoso deles).
  const byClub = new Map<string, RosterPlayer[]>()
  for (const p of players) if (!p.academy && p.clubId) (byClub.get(p.clubId) ?? byClub.set(p.clubId, []).get(p.clubId) ?? []).push(p)
  const rankOf = new Map<string, { rank: number; size: number; starters: number }>()
  for (const list of byClub.values()) {
    for (const goalkeepers of [true, false]) {
      const group = list.filter((p) => (p.position === 'GK') === goalkeepers)
      const scored = group.map((p) => ({ p, score: Math.log2(1 + fameOf(p)) + createRng(`real-rank:${p.id}`).normal(0, cfg.rankNoise) })).sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
      scored.forEach(({ p }, rank) => rankOf.set(p.id, { rank, size: group.length, starters: goalkeepers ? cfg.starters.goalkeeper : cfg.starters.outfield }))
    }
  }

  for (const p of players) {
    const fame = fameOf(p)
    const level = levelOf(p.clubId)
    const place = rankOf.get(p.id)
    let delta: number
    if (p.academy) delta = -GENERATION.backupPenalty - cfg.academyPenalty
    else if (!place) delta = -GENERATION.backupPenalty
    else if (place.rank < place.starters) delta = place.starters === 1 ? 0 : cfg.starterSpread * (1 - (2 * place.rank) / (place.starters - 1))
    else {
      const benchSize = Math.max(1, place.size - place.starters - 1)
      delta = -GENERATION.backupPenalty + cfg.benchSpread * (1 - (2 * (place.rank - place.starters)) / benchSize)
    }
    const age = ageOn(p.birthDate, `${options.startYear}-01-01`)
    const ageAdjust = -Math.max(0, cfg.youth.untilAge - age) * cfg.youth.perYear - Math.max(0, age - cfg.old.fromAge) * cfg.old.perYear
    const noise = createRng(`real-talent:${p.id}`).normal(0, cfg.talentNoise)
    // Clube e ordem no elenco de um lado, a fama de carreira do outro.
    const byClub = level + delta + noise + ageAdjust
    const weight = fameWeight(fame) * (p.academy ? 0.6 : 1)
    const weakClub = Math.max(0, cfg.weakClub.level - level) * cfg.weakClub.perPoint
    targets.set(p.id, clamp((1 - weight) * byClub + weight * (fameQuality(fame, age) - weakClub), ATTRIBUTE_MIN, cfg.maxTarget))
  }

  const out = new Map<string, GeneratedPlayer>()
  for (const p of players) {
    const override = options.overrides?.get(p.id)
    const target = override?.overall !== undefined ? override.overall : (targets.get(p.id) as number)
    const age = ageOn(p.birthDate, `${options.startYear}-01-01`)
    const { attributes, overall } = solveAttributes(`real-attrs:${p.id}`, p.position, age, target)

    const rng = createRng(`real-hidden:${p.id}`)
    const g = GENERATION.growth
    const growth = Math.max(0, g.untilAge - age) * rng.float(g.perYearMin, g.perYearMax) + rng.float(0, g.randomMax)
    // Os jovens muito famosos têm teto mais alto.
    const promise = age < 24 ? fameWeight(options.fame[p.id] ?? 0) * 8 : 0
    const potential = (override?.potential !== undefined ? Math.max(override.potential, Math.round(overall)) : undefined) ?? clamp(Math.round(Math.max(overall, softCap(overall + growth + promise))), Math.round(overall), ATTRIBUTE_MAX)
    const hidden = {
      consistency: hiddenAttribute(rng, GENERATION.hidden.consistency),
      injuryProneness: hiddenAttribute(rng, GENERATION.hidden.injuryProneness),
      professionalism: hiddenAttribute(rng, GENERATION.hidden.professionalism),
    }
    out.set(p.id, { id: p.id, attributes, potential: clamp(potential, ATTRIBUTE_MIN, ATTRIBUTE_MAX), hidden, overall, target })
  }
  return out
}
