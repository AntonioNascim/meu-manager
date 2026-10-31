/**
 * Metas da calibragem com o pacote real (Fase 5D), tiradas dos últimos 30 anos da vida real (1996 a 2025) e folgadas porque cada
 * temporada simulada varia por sorte. Os números reais (aproximados) de referência:
 *  - Inglaterra: Man United 11 títulos, Man City 8, Chelsea 5, Arsenal 3, Liverpool 2, Leicester 1 (6 campeões; maior fatia 37%).
 *  - Espanha: Barcelona 14, Real Madrid 10, Atlético 2, Valencia 2, Deportivo 1 (maior fatia 47%).
 *  - Itália: Juventus 14, Inter 6, Milan 4, Roma 1, Lazio 1, Napoli 2 (maior fatia 47%).
 *  - Alemanha: Bayern 22 de 30 (73%, a dinastia mais forte do mundo).
 *  - França: PSG 11, Lyon 7, Monaco 3, Lille 2 (maior fatia 37%).
 *  - Portugal: Porto 14, Benfica 9, Sporting 4 (maior fatia 47%). Países Baixos: Ajax 12, PSV 11 (maior fatia 40%).
 *  - Brasil: Corinthians 6 a 7, Palmeiras 5 a 6, Flamengo 4, ~13 campeões diferentes (maior fatia ~22%).
 *  - Champions: Espanha 13 (43%), Inglaterra 7, Itália 4, Alemanha 4, Portugal 1, França 1; Real Madrid 9 (30%).
 *  - Libertadores: Brasil 17 (57%), Argentina 9 (30%), outros 4; maior clube 4 títulos (13%).
 * As metas deixam o jogo ter dinastias (a vida real tem), mas não "um clube leva tudo por décadas": o freio geral contra dinastias
 * (`DYNASTY` em `config.ts`) existe para isso.
 */

export interface TitleRow {
  year: number
  club: string
  country: string
}

export interface LeagueReference {
  /** Maior fatia dos títulos de um só clube em 30 temporadas. */
  maxShare: number
  /** Campeões diferentes em 30 temporadas (no mínimo). */
  minDistinct: number
}

/** Metas por liga (a vida real está no comentário do arquivo). Ligas fora da lista usam `DEFAULT_LEAGUE_REFERENCE`. */
export const REAL_LEAGUE_REFERENCE: Record<string, LeagueReference> = {
  'en-1': { maxShare: 0.45, minDistinct: 5 },
  'es-1': { maxShare: 0.5, minDistinct: 4 },
  'it-1': { maxShare: 0.5, minDistinct: 5 },
  'de-1': { maxShare: 0.62, minDistinct: 4 },
  'fr-1': { maxShare: 0.5, minDistinct: 5 },
  'pt-1': { maxShare: 0.58, minDistinct: 3 },
  'nl-1': { maxShare: 0.5, minDistinct: 4 },
  'br-1': { maxShare: 0.3, minDistinct: 8 },
  'ar-1': { maxShare: 0.3, minDistinct: 8 },
  'mx-1': { maxShare: 0.3, minDistinct: 6 },
  'us-1': { maxShare: 0.25, minDistinct: 8 },
}
export const DEFAULT_LEAGUE_REFERENCE: LeagueReference = { maxShare: 0.6, minDistinct: 3 }

/** Maior sequência de títulos seguidos aceita em qualquer liga (a vida real chega a 9 a 11, com a Juventus e o Bayern). */
export const MAX_LEAGUE_STREAK = 8

export interface CupReference {
  /** Maior fatia de um clube. */
  maxClubShare: number
  /** País (pirâmide) com mais títulos: fatia máxima. */
  maxCountryShare?: number
  /** Fatias exigidas por país: [mínimo, máximo]. */
  countryShare?: Record<string, [number, number]>
  /** Países que juntos precisam ter pelo menos esta fatia. */
  groupShare?: { countries: string[]; min: number }
  minDistinctShare: number
}

export const REAL_CUP_REFERENCE: Record<string, CupReference> = {
  'cont-eu-1': { maxClubShare: 0.3, maxCountryShare: 0.5, groupShare: { countries: ['England', 'Spain', 'Italy', 'Germany'], min: 0.75 }, minDistinctShare: 0.4 },
  'cont-sa-1': { maxClubShare: 0.2, countryShare: { Brazil: [0.4, 0.75], Argentina: [0.15, 0.35] }, minDistinctShare: 0.4 },
  'cont-na-1': { maxClubShare: 0.25, countryShare: { Mexico: [0.7, 0.9] }, minDistinctShare: 0.3 },
}

export interface RealResults {
  leagues: Record<string, TitleRow[]>
  cups: Record<string, TitleRow[]>
  giants: Record<string, { first: number[]; last: number[]; inTopStr: number }>
  years: number
}

const shareOf = (rows: TitleRow[], key: (r: TitleRow) => string) => {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1)
  return counts
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

/** Confere os resultados contra as metas; devolve um texto por problema. Só vale a partir de 20 temporadas (antes a amostra é pequena demais). */
export function checkRealTargets(results: RealResults, only: readonly string[] = []): string[] {
  const out: string[] = []
  if (results.years < 20) return out
  const scale = results.years / 30
  for (const [id, rows] of Object.entries(results.leagues)) {
    if (only.length && !only.includes(id)) continue
    const ref = REAL_LEAGUE_REFERENCE[id] ?? DEFAULT_LEAGUE_REFERENCE
    const counts = shareOf(rows, (r) => r.club)
    const top = Math.max(...counts.values())
    if (top / rows.length > ref.maxShare) out.push(`${id}: um clube ganhou ${top} de ${rows.length} (${((100 * top) / rows.length).toFixed(0)}%), acima de ${Math.round(100 * ref.maxShare)}%`)
    if (counts.size < Math.round(ref.minDistinct * scale)) out.push(`${id}: só ${counts.size} campeões diferentes em ${rows.length} (mínimo ${Math.round(ref.minDistinct * scale)})`)
    let streak = 1
    let best = 1
    for (let i = 1; i < rows.length; i++) {
      streak = rows[i]!.club === rows[i - 1]!.club ? streak + 1 : 1
      best = Math.max(best, streak)
    }
    if (best > MAX_LEAGUE_STREAK) out.push(`${id}: ${best} títulos seguidos do mesmo clube (limite ${MAX_LEAGUE_STREAK})`)
  }
  for (const [id, rows] of Object.entries(results.cups)) {
    const ref = REAL_CUP_REFERENCE[id]
    if (!ref || rows.length < 10) continue
    const clubs = shareOf(rows, (r) => r.club)
    const countries = shareOf(rows, (r) => r.country)
    if (Math.max(...clubs.values()) / rows.length > ref.maxClubShare) out.push(`${id}: um clube ganhou ${Math.max(...clubs.values())} de ${rows.length}, acima de ${Math.round(100 * ref.maxClubShare)}%`)
    if (clubs.size / rows.length < ref.minDistinctShare) out.push(`${id}: ${clubs.size} campeões em ${rows.length} edições (mínimo ${Math.round(100 * ref.minDistinctShare)}%)`)
    if (ref.maxCountryShare !== undefined && Math.max(...countries.values()) / rows.length > ref.maxCountryShare) out.push(`${id}: um país ganhou ${Math.max(...countries.values())} de ${rows.length}, acima de ${Math.round(100 * ref.maxCountryShare)}%`)
    for (const [country, [lo, hi]] of Object.entries(ref.countryShare ?? {})) {
      const s = (countries.get(country) ?? 0) / rows.length
      if (s < lo || s > hi) out.push(`${id}: ${country} com ${(100 * s).toFixed(0)}% dos títulos (meta ${Math.round(100 * lo)}% a ${Math.round(100 * hi)}%)`)
    }
    if (ref.groupShare) {
      const s = ref.groupShare.countries.reduce((a, c) => a + (countries.get(c) ?? 0), 0) / rows.length
      if (s < ref.groupShare.min) out.push(`${id}: ${ref.groupShare.countries.join('+')} com ${(100 * s).toFixed(0)}% (mínimo ${Math.round(100 * ref.groupShare.min)}%)`)
    }
  }
  // Os gigantes reais continuam grandes por décadas: dois dos três maiores de 2026 ainda estão entre os oito maiores no fim, e a reputação média dos seis maiores não cai mais de 3 pontos (a escada é achatada no meio e os clubes do meio voltam à média da liga).
  for (const id of ['en-1', 'es-1', 'it-1', 'de-1', 'fr-1']) {
    const g = results.giants[id]
    if (!g || (only.length && !only.includes(id))) continue
    if (g.inTopStr < 2) out.push(`${id}: só ${g.inTopStr} dos 3 maiores clubes seguem entre os 8 maiores (mínimo 2)`)
    if (mean(g.first) - mean(g.last) > 3) out.push(`${id}: a reputação média dos gigantes caiu de ${mean(g.first).toFixed(1)} para ${mean(g.last).toFixed(1)} (limite 3)`)
  }
  return out
}
