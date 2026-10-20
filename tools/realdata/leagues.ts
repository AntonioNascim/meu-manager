/**
 * As ligas da planilha inicial: as mesmas do mundo ampliado do jogo (`FULL_WORLD`: ids, número de times e escada de reputação), com o que
 * falta para achar os clubes reais: o artigo da temporada na Wikipedia (clubes da temporada atual) ou, nas ligas de elite da África, da
 * Ásia e da Oceania, a lista fixa de clubes (itens do Wikidata).
 */
import { COUNTRY_OF_PYRAMID, FULL_WORLD } from '../../src/diagnostics/scaleWorld'
import type { LeagueSpec } from '../../src/diagnostics/scaleWorld'
import type { Nationality } from '../../src/engine/types'

export interface RealLeague {
  spec: LeagueSpec
  id: string
  /** País da liga (nacionalidade usada quando a fonte não diz a do jogador). */
  country: Nationality
  /** Clubes que a liga tem no jogo. */
  expected: number
  /**
   * Modelos de título do artigo da temporada na Wikipedia: `{y}` = ano (2026) e `{s}` = temporada que atravessa o ano (2026–27).
   * Vazio nas ligas de elite, que usam `fixedClubs`.
   */
  seasonTitles: string[]
  /** Calendário: `year` (ano civil) ou `split` (agosto a maio). */
  season: 'year' | 'split'
  /** Ligas de elite: os itens do Wikidata dos clubes (os mais fortes do continente). */
  fixedClubs?: string[]
  /** Ordem de preferência dos idiomas dos nomes no Wikidata. */
  languages: string
}

const TITLES: Record<string, { season: 'year' | 'split'; titles: string[] }> = {
  'br-1': { season: 'year', titles: ['{y} Campeonato Brasileiro Série A'] },
  'br-2': { season: 'year', titles: ['{y} Campeonato Brasileiro Série B'] },
  'br-3': { season: 'year', titles: ['{y} Campeonato Brasileiro Série C'] },
  'ar-1': { season: 'year', titles: ['{y} Argentine Primera División', '{y} Liga Profesional de Fútbol', '{y} Campeonato de Primera División'] },
  'uy-1': { season: 'year', titles: ['{y} Liga AUF Uruguaya', '{y} Uruguayan Primera División'] },
  'py-1': { season: 'year', titles: ['{y} Copa de Primera', '{y} Paraguayan Primera División', '{y} División de Honor'] },
  'cl-1': { season: 'year', titles: ['{y} Liga de Primera', '{y} Chilean Primera División'] },
  'co-1': { season: 'year', titles: ['{y} Categoría Primera A season', '{y} Categoría Primera A'] },
  'ec-1': { season: 'year', titles: ['{y} LigaPro Serie A', '{y} Ecuadorian Serie A', '{y} Ecuador Serie A'] },
  'en-1': { season: 'split', titles: ['{s} Premier League'] },
  'es-1': { season: 'split', titles: ['{s} La Liga'] },
  'it-1': { season: 'split', titles: ['{s} Serie A'] },
  'de-1': { season: 'split', titles: ['{s} Bundesliga'] },
  'fr-1': { season: 'split', titles: ['{s} Ligue 1'] },
  'pt-1': { season: 'split', titles: ['{s} Primeira Liga'] },
  'nl-1': { season: 'split', titles: ['{s} Eredivisie'] },
  'mx-1': { season: 'split', titles: ['{s} Liga MX season', '{s} Liga MX', '{y} Liga MX season'] },
  'us-1': { season: 'year', titles: ['{y} Major League Soccer season'] },
}

/** Clubes das ligas de elite: Al Ahly, Zamalek, Wydad, Espérance, Sundowns, Mazembe, Raja e Pyramids; Al Hilal, Al Nassr, Urawa, Al Ittihad, Ulsan, Yokohama, Al Sadd e Al Ain; Auckland City, Sydney FC, Melbourne City e Wellington Phoenix. */
const FIXED: Record<string, string[]> = {
  'af-1': ['Q223566', 'Q286504', 'Q1139095', 'Q44897', 'Q784965', 'Q695340', 'Q1051514', 'Q18207291'],
  'as-1': ['Q73965', 'Q482764', 'Q218883', 'Q309480', 'Q129673', 'Q854932', 'Q283545', 'Q812720'],
  'oc-1': ['Q630544', 'Q330143', 'Q748725', 'Q815890'],
}

export const REAL_LEAGUES: RealLeague[] = FULL_WORLD.map((spec) => {
  const country = COUNTRY_OF_PYRAMID[spec.id.split('-')[0] as string] as Nationality
  const fixed = FIXED[spec.id]
  const titles = TITLES[spec.id]
  return {
    spec,
    id: spec.id,
    country,
    expected: spec.teams,
    seasonTitles: titles?.titles ?? [],
    season: titles?.season ?? 'split',
    ...(fixed ? { fixedClubs: fixed } : {}),
    languages: country === 'Brazil' ? 'pt,en' : 'en,pt',
  }
})

/** Ano da temporada em andamento na `date` para o calendário da liga (as europeias começam em julho). */
export function seasonYear(kind: 'year' | 'split', date: Date): number {
  return kind === 'year' ? date.getFullYear() : date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1
}

const twoDigits = (year: number): string => String((year + 1) % 100).padStart(2, '0')

/** Títulos candidatos do artigo da temporada: a atual primeiro e, se ela ainda não existir, a anterior. */
export function seasonTitleCandidates(league: RealLeague, date: Date): { title: string; previous: boolean }[] {
  const out: { title: string; previous: boolean }[] = []
  const year = seasonYear(league.season, date)
  for (const [y, previous] of [[year, false], [year - 1, true]] as const) {
    for (const template of league.seasonTitles) {
      out.push({ title: template.replace('{y}', String(y)).replace('{s}', `${y}–${twoDigits(y)}`), previous })
    }
  }
  return out
}
